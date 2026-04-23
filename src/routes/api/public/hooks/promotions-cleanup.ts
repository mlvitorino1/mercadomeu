import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

// Marca promoções expiradas (acaba após ends_at < now())
export const Route = createFileRoute("/api/public/hooks/promotions-cleanup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization");
        const token = auth?.replace("Bearer ", "");
        if (!token) {
          return new Response(JSON.stringify({ error: "missing auth" }), { status: 401, headers: { "content-type": "application/json" } });
        }
        const supabase = createClient(import.meta.env.VITE_SUPABASE_URL!, token, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
        const { data, error } = await supabase
          .from("promotions")
          .update({ status: "expirada" })
          .lt("ends_at", new Date().toISOString())
          .eq("status", "ativa")
          .select("id");
        if (error) {
          return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "content-type": "application/json" } });
        }
        return new Response(JSON.stringify({ success: true, expired: data?.length ?? 0 }), { headers: { "content-type": "application/json" } });
      },
    },
  },
});
