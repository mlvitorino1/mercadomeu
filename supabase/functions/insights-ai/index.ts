// Edge function: receives a summary of the user's purchasing history and uses
// Lovable AI to forecast next month spend and produce personalized money-saving tips.
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Você é um analista financeiro pessoal especializado em consumo doméstico brasileiro.
Receberá um resumo de gastos do usuário (mês atual, meses anteriores, top produtos, top lojas, alertas de aumento).
Sua missão:
1) Estimar quanto a pessoa deve gastar no FIM do mês atual com base no ritmo dos dias decorridos e histórico.
2) Gerar 3 dicas curtas, específicas e acionáveis em pt-BR, no máximo 110 caracteres cada.
   - Use nomes reais de produtos/lojas que aparecem nos dados.
   - Foque em economia real (trocar de mercado, evitar item caro, comprar volume etc.).
   - Tom amigável, sem jargão financeiro.`;

const TOOL_SCHEMA = {
  type: "function",
  function: {
    name: "generate_insights",
    description: "Gera previsão de gasto do mês e dicas personalizadas de economia",
    parameters: {
      type: "object",
      properties: {
        forecast_month_total: {
          type: "number",
          description: "Estimativa de gasto total ao final do mês atual em reais",
        },
        forecast_confidence: {
          type: "string",
          enum: ["baixa", "média", "alta"],
          description: "Confiança da previsão dada a quantidade de dados",
        },
        forecast_explanation: {
          type: "string",
          description: "Frase curta (≤120 chars) explicando a previsão em pt-BR",
        },
        tips: {
          type: "array",
          minItems: 3,
          maxItems: 3,
          items: {
            type: "object",
            properties: {
              title: { type: "string", description: "Título curto (≤32 chars)" },
              body: { type: "string", description: "Dica acionável (≤110 chars)" },
              icon: {
                type: "string",
                enum: ["swap", "alert", "save", "bulk", "schedule"],
                description: "Ícone temático",
              },
            },
            required: ["title", "body", "icon"],
            additionalProperties: false,
          },
        },
      },
      required: ["forecast_month_total", "forecast_confidence", "forecast_explanation", "tips"],
      additionalProperties: false,
    },
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { summary } = await req.json();
    if (!summary) {
      return new Response(JSON.stringify({ error: "summary é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurada");

    const userPrompt = `Resumo do usuário (JSON):\n\n${JSON.stringify(summary, null, 2)}\n\nGere a previsão e as 3 dicas chamando a função generate_insights.`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        tools: [TOOL_SCHEMA],
        tool_choice: { type: "function", function: { name: "generate_insights" } },
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error("AI gateway error:", resp.status, text);
      if (resp.status === 429) {
        return new Response(JSON.stringify({ error: "Muitas requisições. Tente em instantes." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (resp.status === 402) {
        return new Response(JSON.stringify({ error: "Sem créditos na Lovable AI. Adicione créditos no workspace." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "Falha ao gerar insights" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      console.error("Sem tool_call na resposta:", JSON.stringify(data).slice(0, 500));
      return new Response(JSON.stringify({ error: "Resposta inválida da IA" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const parsed = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("insights-ai error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
