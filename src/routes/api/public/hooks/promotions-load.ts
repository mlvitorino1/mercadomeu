import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

// Estende validade de promoções próximas do fim e gera novas demo (simula scraping diário).
export const Route = createFileRoute("/api/public/hooks/promotions-load")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization");
        const token = auth?.replace("Bearer ", "");
        if (!token) return new Response(JSON.stringify({ error: "missing auth" }), { status: 401 });
        const supabase = createClient(import.meta.env.VITE_SUPABASE_URL!, token, {
          auth: { autoRefreshToken: false, persistSession: false },
        });

        // estende promoções que expiraram nas últimas 24h
        const past24h = new Date(Date.now() - 86400000).toISOString();
        const newEnd = new Date(Date.now() + 7 * 86400000).toISOString();
        const { data: refreshed } = await supabase
          .from("promotions")
          .update({ status: "ativa", ends_at: newEnd })
          .lt("ends_at", new Date().toISOString())
          .gte("ends_at", past24h)
          .select("id");

        return new Response(
          JSON.stringify({ success: true, refreshed: refreshed?.length ?? 0, ts: new Date().toISOString() }),
          { headers: { "content-type": "application/json" } },
        );
      },
    },
  },
});
