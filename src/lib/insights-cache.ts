// Cache helper para insights de IA: hash determinístico + leitura/gravação na tabela ai_insights.
import { supabase } from "@/integrations/supabase/client";

export type InsightKind = "forecast" | "stock";

/** Stringify estável: ordena chaves recursivamente. */
function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`).join(",")}}`;
}

/** SHA-256 do JSON canônico, truncado para 16 hex chars. */
export async function hashInputs(input: unknown): Promise<string> {
  const canonical = canonicalize(input);
  const bytes = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex.slice(0, 16);
}

export type CachedInsight<T> = {
  payload: T;
  generatedAt: string;
  inputHash: string;
};

/** Lê o cache atual do usuário para um tipo. Retorna null se não houver ou se o hash não bater. */
export async function readCache<T>(
  userId: string,
  kind: InsightKind,
  inputHash: string,
): Promise<CachedInsight<T> | null> {
  const { data, error } = await supabase
    .from("ai_insights")
    .select("payload, generated_at, input_hash")
    .eq("user_id", userId)
    .eq("kind", kind)
    .maybeSingle();

  if (error || !data) return null;
  if (data.input_hash !== inputHash) return null;
  return {
    payload: data.payload as T,
    generatedAt: data.generated_at,
    inputHash: data.input_hash,
  };
}

/** Lê o cache atual ignorando o hash — útil para mostrar o último resultado conhecido. */
export async function readLatestCache<T>(
  userId: string,
  kind: InsightKind,
): Promise<CachedInsight<T> | null> {
  const { data, error } = await supabase
    .from("ai_insights")
    .select("payload, generated_at, input_hash")
    .eq("user_id", userId)
    .eq("kind", kind)
    .maybeSingle();

  if (error || !data) return null;
  return {
    payload: data.payload as T,
    generatedAt: data.generated_at,
    inputHash: data.input_hash,
  };
}

/** Upsert no cache (chave única por user_id+kind). */
export async function writeCache<T>(
  userId: string,
  kind: InsightKind,
  inputHash: string,
  payload: T,
): Promise<void> {
  await supabase
    .from("ai_insights")
    .upsert(
      [
        {
          user_id: userId,
          kind,
          input_hash: inputHash,
          payload: payload as unknown as Record<string, unknown>,
          generated_at: new Date().toISOString(),
        },
      ],
      { onConflict: "user_id,kind" },
    );
}

/** Apaga o cache de um tipo (ex.: usuário pediu refresh manual). */
export async function clearCache(userId: string, kind: InsightKind): Promise<void> {
  await supabase.from("ai_insights").delete().eq("user_id", userId).eq("kind", kind);
}

/** Formata "há Xmin" / "há Xh" / "há Xd" em pt-BR. */
export function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = Math.max(0, now - then);
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "agora há pouco";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return `há ${d}d`;
}

/** Slug determinístico para nomes de produto. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
