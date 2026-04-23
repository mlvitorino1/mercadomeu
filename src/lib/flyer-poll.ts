import { supabase } from "@/integrations/supabase/client";

export type FlyerPollResult = {
  status: "pending" | "processing" | "ready" | "failed";
  extracted_count: number;
  error_message: string | null;
  store_id: string | null;
};

export async function pollFlyer(
  flyerId: string,
  onUpdate: (r: FlyerPollResult) => void,
  opts: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<FlyerPollResult> {
  const interval = opts.intervalMs ?? 2000;
  const timeout = opts.timeoutMs ?? 120_000;
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const { data } = await supabase
      .from("promo_flyers")
      .select("status, extracted_count, error_message, store_id")
      .eq("id", flyerId)
      .maybeSingle();
    if (data) {
      const r = data as FlyerPollResult;
      onUpdate(r);
      if (r.status === "ready" || r.status === "failed") return r;
    }
    await new Promise((res) => setTimeout(res, interval));
  }
  return { status: "failed", extracted_count: 0, error_message: "Tempo esgotado", store_id: null };
}
