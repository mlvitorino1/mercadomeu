// Helpers de score determinístico para ranking de promoções

export type ScoreInput = {
  // contexto produto
  productId: string;
  brand: string | null;
  // contexto promoção
  discountPct: number;
  endsAt: string;
  storeLat: number | null;
  storeLng: number | null;
  // contexto usuário
  purchaseFrequency: number; // 0..1 já normalizado
  userLat: number | null;
  userLng: number | null;
  radiusKm: number;
  favoriteBrands: string[];
  clickHistory: number; // 0..1 normalizado (CTR)
};

export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function urgencyScore(endsAt: string): number {
  const ms = new Date(endsAt).getTime() - Date.now();
  const hours = ms / (1000 * 60 * 60);
  if (hours <= 0) return 0;
  if (hours <= 6) return 1;
  if (hours <= 24) return 0.85;
  if (hours <= 48) return 0.6;
  if (hours <= 72) return 0.4;
  if (hours <= 168) return 0.2;
  return 0.05;
}

export function proximityScore(
  storeLat: number | null,
  storeLng: number | null,
  userLat: number | null,
  userLng: number | null,
  radiusKm: number,
): { score: number; distanceKm: number | null } {
  if (
    storeLat == null ||
    storeLng == null ||
    userLat == null ||
    userLng == null
  ) {
    return { score: 0.5, distanceKm: null };
  }
  const d = haversineKm(userLat, userLng, storeLat, storeLng);
  const score = Math.max(0, Math.min(1, 1 - d / Math.max(radiusKm, 1)));
  return { score, distanceKm: d };
}

export function brandPreferenceScore(
  brand: string | null,
  favoriteBrands: string[],
): number {
  if (!brand) return 0;
  const b = brand.toLowerCase();
  return favoriteBrands.some((f) => f.toLowerCase() === b) ? 1 : 0;
}

export function computeScore(input: ScoreInput): number {
  const freq = Math.max(0, Math.min(1, input.purchaseFrequency));
  const disc = Math.max(0, Math.min(1, input.discountPct / 100));
  const { score: prox } = proximityScore(
    input.storeLat,
    input.storeLng,
    input.userLat,
    input.userLng,
    input.radiusKm,
  );
  const brand = brandPreferenceScore(input.brand, input.favoriteBrands);
  const urg = urgencyScore(input.endsAt);
  const ctr = Math.max(0, Math.min(1, input.clickHistory));

  return (
    0.30 * freq +
    0.25 * disc +
    0.15 * prox +
    0.10 * brand +
    0.10 * urg +
    0.10 * ctr
  );
}

export function formatDistance(km: number | null): string | null {
  if (km == null) return null;
  if (km < 1) return `${Math.round(km * 1000)}m`;
  return `${km.toFixed(1)}km`;
}

export function formatTimeLeft(endsAt: string): {
  text: string;
  urgent: boolean;
} {
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) return { text: "expirada", urgent: true };
  const hours = ms / (1000 * 60 * 60);
  if (hours < 1) return { text: `${Math.round(ms / 60000)}min`, urgent: true };
  if (hours < 6) return { text: `acaba em ${Math.round(hours)}h`, urgent: true };
  if (hours < 24) return { text: `acaba em ${Math.round(hours)}h`, urgent: false };
  const days = Math.round(hours / 24);
  return { text: `${days}d restantes`, urgent: false };
}
