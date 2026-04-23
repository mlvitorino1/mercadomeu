// Cache local simples (10min) para dados de promoções
const TTL_MS = 10 * 60 * 1000;

type Entry<T> = { v: T; t: number };

export function readPromoCache<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(`cuponizei:promo:${key}`);
    if (!raw) return null;
    const e = JSON.parse(raw) as Entry<T>;
    if (Date.now() - e.t > TTL_MS) return null;
    return e.v;
  } catch {
    return null;
  }
}

export function writePromoCache<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      `cuponizei:promo:${key}`,
      JSON.stringify({ v: value, t: Date.now() } satisfies Entry<T>),
    );
  } catch {
    /* ignore quota */
  }
}

export function clearPromoCache() {
  if (typeof window === "undefined") return;
  Object.keys(localStorage)
    .filter((k) => k.startsWith("cuponizei:promo:"))
    .forEach((k) => localStorage.removeItem(k));
}
