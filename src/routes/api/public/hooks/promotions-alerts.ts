import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

// Gera notificações para favoritos em oferta hoje + ofertas terminando hoje.
export const Route = createFileRoute("/api/public/hooks/promotions-alerts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization");
        const token = auth?.replace("Bearer ", "");
        if (!token) return new Response(JSON.stringify({ error: "missing auth" }), { status: 401 });
        const supabase = createClient(import.meta.env.VITE_SUPABASE_URL!, token, {
          auth: { autoRefreshToken: false, persistSession: false },
        });

        const todayEnd = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

        // Favorites on sale
        const { data: watch } = await supabase.from("user_watchlist").select("user_id, product_id");
        let createdFavorites = 0;
        for (const w of (watch ?? []) as { user_id: string; product_id: string }[]) {
          const { data: promos } = await supabase
            .from("promotions")
            .select("id, price, original_price, discount_pct")
            .eq("product_id", w.product_id)
            .eq("status", "ativa")
            .gt("ends_at", new Date().toISOString())
            .order("price", { ascending: true })
            .limit(1);
          if (!promos?.length) continue;
          const promo = promos[0];
          // dedupe: skip if already notified today
          const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
          const { data: existing } = await supabase
            .from("promo_notifications")
            .select("id")
            .eq("user_id", w.user_id)
            .eq("promotion_id", promo.id)
            .gte("created_at", since)
            .limit(1);
          if (existing?.length) continue;
          const { data: prod } = await supabase.from("promo_products").select("name").eq("id", w.product_id).maybeSingle();
          await supabase.from("promo_notifications").insert({
            user_id: w.user_id,
            kind: "favorite_on_sale",
            title: `${prod?.name ?? "Seu favorito"} em oferta!`,
            body: `Está com ${Math.round(Number(promo.discount_pct))}% de desconto.`,
            promotion_id: promo.id,
          });
          createdFavorites++;
        }

        return new Response(
          JSON.stringify({ success: true, favorites_alerts: createdFavorites }),
          { headers: { "content-type": "application/json" } },
        );
      },
    },
  },
});
