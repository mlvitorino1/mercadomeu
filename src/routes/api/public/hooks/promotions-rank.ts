import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

// Marca top 30 promoções com maior desconto como "is_featured"
export const Route = createFileRoute("/api/public/hooks/promotions-rank")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization");
        const token = auth?.replace("Bearer ", "");
        if (!token) return new Response(JSON.stringify({ error: "missing auth" }), { status: 401 });
        const supabase = createClient(import.meta.env.VITE_SUPABASE_URL!, token, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
        // reset
        await supabase.from("promotions").update({ is_featured: false }).eq("is_featured", true);
        // top 30 by discount
        const { data: top } = await supabase
          .from("promotions")
          .select("id")
          .eq("status", "ativa")
          .gt("ends_at", new Date().toISOString())
          .order("discount_pct", { ascending: false })
          .limit(30);
        const ids = (top ?? []).map((t: { id: string }) => t.id);
        if (ids.length) await supabase.from("promotions").update({ is_featured: true }).in("id", ids);
        return new Response(JSON.stringify({ success: true, featured: ids.length }), { headers: { "content-type": "application/json" } });
      },
    },
  },
});
