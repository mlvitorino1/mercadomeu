// Edge function: receives a receipt image (base64 data URL) and returns
// structured data extracted by Lovable AI Gateway (Gemini multimodal).
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Você é um especialista em extração de dados de cupons fiscais brasileiros (NFC-e, SAT, cupom não-fiscal).
Receberá uma imagem de cupom e deve extrair os dados estruturados.

REGRAS:
- Retorne SEMPRE em português brasileiro.
- Valores monetários como números (use ponto como separador decimal).
- Datas no formato ISO 8601 (YYYY-MM-DDTHH:mm:ss). Se hora não estiver visível, use 12:00:00.
- Normalize nomes de produtos: expanda abreviações comuns (ex.: "COCA 2L" -> "Coca-Cola 2L", "ARR T1 5KG" -> "Arroz Tipo 1 5kg").
- Categorize cada item em UMA de: alimentos, bebidas, limpeza, higiene, padaria, hortifruti, carnes, laticinios, outros.
- Padronize o nome do estabelecimento de forma limpa (ex.: "SUPERMERCADO XYZ LTDA" -> "Supermercado XYZ").
- Se algum campo estiver ilegível, omita-o (mas faça o melhor esforço).
- Se a quantidade não estiver clara, assuma 1.`;

const TOOL_SCHEMA = {
  type: "function",
  function: {
    name: "extract_receipt_data",
    description: "Extrai dados estruturados de um cupom fiscal brasileiro",
    parameters: {
      type: "object",
      properties: {
        store_name: { type: "string", description: "Nome padronizado do estabelecimento" },
        store_cnpj: { type: "string", description: "CNPJ do estabelecimento (apenas números) se visível" },
        purchased_at: { type: "string", description: "Data e hora da compra em formato ISO 8601" },
        total_amount: { type: "number", description: "Valor total da compra em reais" },
        payment_method: { type: "string", description: "Forma de pagamento (Dinheiro, Crédito, Débito, Pix, etc.)" },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              description: { type: "string", description: "Descrição original do item no cupom" },
              canonical_name: { type: "string", description: "Nome normalizado/expandido do produto" },
              category: {
                type: "string",
                enum: ["alimentos", "bebidas", "limpeza", "higiene", "padaria", "hortifruti", "carnes", "laticinios", "outros"],
              },
              quantity: { type: "number" },
              unit_price: { type: "number" },
              total_price: { type: "number" },
            },
            required: ["description", "canonical_name", "category", "quantity", "unit_price", "total_price"],
            additionalProperties: false,
          },
        },
      },
      required: ["store_name", "purchased_at", "total_amount", "items"],
      additionalProperties: false,
    },
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { imageBase64 } = await req.json();
    if (!imageBase64) {
      return new Response(JSON.stringify({ error: "imageBase64 é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY não configurada" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extraia os dados deste cupom fiscal e chame a função extract_receipt_data com o resultado.",
              },
              { type: "image_url", image_url: { url: imageBase64 } },
            ],
          },
        ],
        tools: [TOOL_SCHEMA],
        tool_choice: { type: "function", function: { name: "extract_receipt_data" } },
      }),
    });

    if (!response.ok) {
      const txt = await response.text();
      console.error("AI gateway error:", response.status, txt);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Muitas requisições. Tente novamente em instantes." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos de IA esgotados. Adicione créditos em Configurações > Workspace > Uso." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ error: "Erro na IA: " + txt }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      console.error("No tool call in response:", JSON.stringify(data));
      return new Response(JSON.stringify({ error: "A IA não conseguiu extrair dados. Tente uma foto mais nítida." }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const extracted = JSON.parse(toolCall.function.arguments);
    return new Response(JSON.stringify({ data: extracted }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("extract-receipt error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
