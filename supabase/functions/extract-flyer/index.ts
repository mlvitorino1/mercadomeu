// Edge function: receives a flyer (URL or uploaded file) and extracts promotions
// using Firecrawl (for HTML pages) and Lovable AI Gateway (multimodal).
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY") ?? "";

const SYSTEM_PROMPT = `Você é um especialista em extração de promoções de panfletos/encartes de supermercados brasileiros.
Receberá conteúdo (texto, imagem ou PDF) de um panfleto e deve extrair TODAS as promoções visíveis.

REGRAS:
- Retorne SEMPRE em português brasileiro.
- Valores monetários como números (ponto como separador decimal).
- Datas no formato ISO 8601. Se não houver validade explícita, deixe ends_at vazio.
- Normalize nomes: expanda abreviações ("COCA 2L" -> "Coca-Cola 2L", "ARR T1 5KG" -> "Arroz Tipo 1 5kg").
- Categorize em UMA destas slugs (use exatamente): alimentos, bebidas, limpeza, higiene, padaria, hortifruti, carnes, laticinios, congelados, outros.
- Unidade: un, kg, g, l, ml, pct, cx.
- original_price só se mostrado o preço "de/por". Caso contrário, deixe igual ao price.
- Se não tiver certeza de um item, OMITA. Qualidade > quantidade.`;

const EXTRACT_TOOL = {
  type: "function",
  function: {
    name: "extract_flyer_items",
    description: "Extrai promoções estruturadas de um panfleto",
    parameters: {
      type: "object",
      properties: {
        valid_until: { type: "string", description: "Data fim do panfleto em ISO 8601, se visível" },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              product_name: { type: "string" },
              brand: { type: "string", description: "Marca; vazio se não houver" },
              category_slug: {
                type: "string",
                enum: ["alimentos", "bebidas", "limpeza", "higiene", "padaria", "hortifruti", "carnes", "laticinios", "congelados", "outros"],
              },
              unit: { type: "string", enum: ["un", "kg", "g", "l", "ml", "pct", "cx"] },
              price: { type: "number" },
              original_price: { type: "number" },
              ends_at: { type: "string", description: "Data fim ISO 8601 ou vazio" },
            },
            required: ["product_name", "category_slug", "unit", "price", "original_price"],
            additionalProperties: false,
          },
        },
      },
      required: ["items"],
      additionalProperties: false,
    },
  },
};

const DETECT_STORE_TOOL = {
  type: "function",
  function: {
    name: "detect_store",
    description: "Identifica o mercado/rede a partir de pistas (URL, título, conteúdo)",
    parameters: {
      type: "object",
      properties: {
        chain: { type: "string", description: "Nome da rede (ex.: Carrefour, Pão de Açúcar, Atacadão)" },
        name: { type: "string", description: "Nome da loja específica" },
        brand_color: { type: "string", description: "Cor primária em hex (ex.: #ff0000)" },
        logo_emoji: { type: "string", description: "Um emoji que represente o mercado" },
      },
      required: ["chain", "name", "brand_color", "logo_emoji"],
      additionalProperties: false,
    },
  },
};

type Flyer = {
  id: string;
  user_id: string;
  source_kind: "html_url" | "file_url" | "upload_pdf" | "upload_image";
  source_url: string | null;
  storage_path: string | null;
  storage_paths: string[] | null;
  store_id: string | null;
  store_name_guess: string | null;
};

async function setStatus(sb: ReturnType<typeof createClient>, id: string, status: string, fields: Record<string, unknown> = {}) {
  await sb.from("promo_flyers").update({ status, ...fields }).eq("id", id);
}

async function callAI(messages: unknown[], tool: unknown, toolName: string) {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages,
      tools: [tool],
      tool_choice: { type: "function", function: { name: toolName } },
      temperature: 0,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AI gateway ${res.status}: ${text}`);
  }
  const data = await res.json();
  const call = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!call) throw new Error("AI did not return tool call");
  return JSON.parse(call.function.arguments);
}

async function fetchHtmlMarkdown(url: string): Promise<{ markdown: string; title: string; screenshot?: string }> {
  if (!FIRECRAWL_API_KEY) {
    // fallback: basic fetch
    const r = await fetch(url);
    const html = await r.text();
    return { markdown: html.slice(0, 50000), title: url };
  }
  const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: { Authorization: `Bearer ${FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url, formats: ["markdown", "screenshot"], onlyMainContent: true }),
  });
  if (!res.ok) throw new Error(`Firecrawl ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const data = json.data ?? json;
  return {
    markdown: data.markdown ?? "",
    title: data.metadata?.title ?? url,
    screenshot: data.screenshot ?? undefined,
  };
}

async function fileUrlToDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch file ${res.status}`);
  const ct = res.headers.get("content-type") ?? "application/octet-stream";
  const buf = new Uint8Array(await res.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  const b64 = btoa(bin);
  return `data:${ct};base64,${b64}`;
}

async function storageToDataUrl(sb: ReturnType<typeof createClient>, path: string): Promise<string> {
  const { data, error } = await sb.storage.from("flyers").download(path);
  if (error || !data) throw new Error(`storage download: ${error?.message}`);
  const ct = data.type || (path.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg");
  const buf = new Uint8Array(await data.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  return `data:${ct};base64,${btoa(bin)}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    const { flyer_id } = await req.json();
    if (!flyer_id) {
      return new Response(JSON.stringify({ error: "flyer_id obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: flyer, error: fErr } = await sb
      .from("promo_flyers").select("*").eq("id", flyer_id).maybeSingle();
    if (fErr || !flyer) throw new Error(`flyer not found: ${fErr?.message}`);
    const f = flyer as Flyer;

    await setStatus(sb, f.id, "processing");

    // 1) Collect content
    let textContext = "";
    let imageDataUrls: string[] = [];
    let detectedTitle = "";

    if (f.source_kind === "html_url" && f.source_url) {
      const { markdown, title, screenshot } = await fetchHtmlMarkdown(f.source_url);
      textContext = markdown.slice(0, 60000);
      detectedTitle = title;
      if (screenshot) imageDataUrls.push(screenshot);
    } else if (f.source_kind === "file_url" && f.source_url) {
      const dataUrl = await fileUrlToDataUrl(f.source_url);
      imageDataUrls.push(dataUrl);
      detectedTitle = f.source_url;
    } else if (f.source_kind === "upload_pdf" || f.source_kind === "upload_image") {
      const paths = (f.storage_paths && f.storage_paths.length > 0)
        ? f.storage_paths
        : (f.storage_path ? [f.storage_path] : []);
      if (paths.length === 0) throw new Error("nenhum arquivo");
      for (const p of paths) {
        const dataUrl = await storageToDataUrl(sb, p);
        imageDataUrls.push(dataUrl);
      }
    } else {
      throw new Error("source inválida");
    }

    // 2) Detect store
    const detectMsgs = [
      { role: "system", content: "Identifique o mercado a partir das pistas. Responda em PT-BR." },
      {
        role: "user",
        content: [
          { type: "text", text: `URL/Título: ${f.source_url ?? detectedTitle ?? "(upload)"}\n\nConteúdo:\n${textContext.slice(0, 4000)}` },
          ...imageDataUrls.slice(0, 1).map((u) => ({ type: "image_url", image_url: { url: u } })),
        ],
      },
    ];
    let store: { chain: string; name: string; brand_color: string; logo_emoji: string };
    try {
      store = await callAI(detectMsgs, DETECT_STORE_TOOL, "detect_store");
    } catch (_e) {
      store = { chain: "Mercado", name: f.store_name_guess ?? "Mercado", brand_color: "#16a34a", logo_emoji: "🛒" };
    }

    // upsert store: try public match by chain (case-insensitive) first
    let storeId = f.store_id;
    if (!storeId) {
      const { data: pub } = await sb.from("promo_stores")
        .select("id").is("user_id", null).ilike("chain", store.chain).limit(1).maybeSingle();
      if (pub?.id) {
        storeId = pub.id as string;
      } else {
        const { data: ins, error: insErr } = await sb.from("promo_stores").insert({
          chain: store.chain, name: store.name, brand_color: store.brand_color,
          logo_emoji: store.logo_emoji, user_id: f.user_id,
        }).select("id").single();
        if (insErr) throw new Error(`insert store: ${insErr.message}`);
        storeId = ins.id as string;
      }
    }

    // 3) Extract items
    const extractContent: unknown[] = [
      { type: "text", text: textContext ? `Conteúdo do panfleto:\n${textContext}` : "Extraia todas as promoções visíveis na imagem/PDF do panfleto." },
      ...imageDataUrls.map((u) => ({ type: "image_url", image_url: { url: u } })),
    ];
    const extractMsgs = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: extractContent },
    ];
    const result = await callAI(extractMsgs, EXTRACT_TOOL, "extract_flyer_items");
    const items = (result.items ?? []) as Array<{
      product_name: string; brand?: string; category_slug: string; unit: string;
      price: number; original_price: number; ends_at?: string;
    }>;

    // 4) Categories map
    const { data: cats } = await sb.from("promo_categories").select("id, slug");
    const catMap = new Map<string, string>();
    for (const c of (cats ?? []) as Array<{ id: string; slug: string }>) catMap.set(c.slug, c.id);

    // 5) Default ends_at — end of today if AI didn't return a valid future date
    function endOfToday(): string {
      const d = new Date();
      d.setHours(23, 59, 59, 999);
      return d.toISOString();
    }
    let defaultEnds = endOfToday();
    if (result.valid_until && typeof result.valid_until === "string") {
      const raw = result.valid_until;
      const parsed = new Date(raw.length === 10 ? `${raw}T23:59:59Z` : raw);
      if (!isNaN(parsed.getTime()) && parsed.getTime() > Date.now()) {
        defaultEnds = parsed.toISOString();
      }
    }

    let inserted = 0;
    let insertErrors = 0;
    let lastInsertError: string | null = null;
    for (const it of items) {
      if (!it.product_name || !it.price) continue;
      const categoryId = catMap.get(it.category_slug) ?? null;

      // upsert product (own first, then public by name+brand)
      let productId: string | null = null;
      const { data: ownProd } = await sb.from("promo_products")
        .select("id").eq("user_id", f.user_id).ilike("name", it.product_name).limit(1).maybeSingle();
      if (ownProd?.id) productId = ownProd.id as string;
      if (!productId) {
        const { data: pubProd } = await sb.from("promo_products")
          .select("id").is("user_id", null).ilike("name", it.product_name).limit(1).maybeSingle();
        if (pubProd?.id) productId = pubProd.id as string;
      }
      if (!productId) {
        const { data: newProd, error: pErr } = await sb.from("promo_products").insert({
          name: it.product_name, brand: it.brand ?? null, category_id: categoryId,
          unit: it.unit ?? "un", image_emoji: "🏷️", user_id: f.user_id,
        }).select("id").single();
        if (pErr) { console.error("product insert error:", pErr.message); continue; }
        productId = newProd.id as string;
        // alias
        await sb.from("promo_product_aliases").insert({
          product_id: productId, alias: it.product_name.toLowerCase(),
        });
      }

      const price = Number(it.price);
      const original = Number(it.original_price ?? it.price);

      // Normalize ends_at: must be a valid future timestamp; if AI returned a bare date or past date, use defaultEnds.
      let endsAtIso = defaultEnds;
      if (it.ends_at && it.ends_at.length > 0) {
        const parsed = new Date(it.ends_at.length === 10 ? `${it.ends_at}T23:59:59Z` : it.ends_at);
        if (!isNaN(parsed.getTime()) && parsed.getTime() > Date.now()) {
          endsAtIso = parsed.toISOString();
        }
      }

      // discount_pct is a GENERATED column — do not insert it.
      const { error: promErr } = await sb.from("promotions").insert({
        product_id: productId,
        store_id: storeId,
        price, original_price: original,
        ends_at: endsAtIso,
        starts_at: new Date().toISOString(),
        status: "ativa", source: "scraper", stock_level: "alto",
        user_id: f.user_id, flyer_id: f.id,
      });
      if (!promErr) {
        inserted++;
      } else {
        insertErrors++;
        lastInsertError = promErr.message;
        console.error("promotion insert error:", promErr.message, { product_id: productId, store_id: storeId, price, ends_at: endsAtIso });
      }
    }
    console.log(`extract-flyer: items=${items.length} inserted=${inserted} errors=${insertErrors} lastError=${lastInsertError}`);

    await setStatus(sb, f.id, "ready", {
      extracted_count: inserted,
      processed_at: new Date().toISOString(),
      store_id: storeId,
      valid_until: defaultEnds,
      raw_extraction: result,
    });

    return new Response(JSON.stringify({ ok: true, inserted, store: store.name }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("extract-flyer error:", err);
    const msg = err instanceof Error ? err.message : String(err);
    try {
      const { flyer_id } = await req.clone().json().catch(() => ({}));
      if (flyer_id) await setStatus(sb, flyer_id, "failed", { error_message: msg });
    } catch (_) { /* ignore */ }
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
