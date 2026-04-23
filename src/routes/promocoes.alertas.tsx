import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { AppLayout } from "@/components/AppLayout";
import { PromoHeader } from "@/components/promocoes/PromoHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Bell, Tag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/promocoes/alertas")({
  head: () => ({ meta: [{ title: "Alertas — Promoções CuponizAI" }] }),
  component: AlertasPage,
});

type Notif = {
  id: string;
  kind: string;
  title: string;
  body: string;
  promotion_id: string | null;
  read_at: string | null;
  created_at: string;
};

function AlertasPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [promoToProduct, setPromoToProduct] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/auth" });
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("promo_notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100);
      const list = (data ?? []) as Notif[];
      setNotifs(list);
      const ids = list.map((n) => n.promotion_id).filter((x): x is string => !!x);
      if (ids.length) {
        const { data: prods } = await supabase.from("promotions").select("id, product_id").in("id", ids);
        const m = new Map<string, string>();
        for (const p of (prods ?? []) as { id: string; product_id: string }[]) m.set(p.id, p.product_id);
        setPromoToProduct(m);
      }
      setLoading(false);
    })();
  }, [user]);

  const markRead = async (id: string) => {
    if (!user) return;
    await supabase.from("promo_notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
    setNotifs((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)));
  };

  const markAllRead = async () => {
    if (!user) return;
    await supabase.from("promo_notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).is("read_at", null);
    setNotifs((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
  };

  const unread = notifs.filter((n) => !n.read_at);
  const all = notifs;

  return (
    <AppLayout>
      <PromoHeader
        title="Alertas"
        right={unread.length > 0 ? <Button size="sm" variant="ghost" onClick={markAllRead}>Marcar todas</Button> : undefined}
      />
      <div className="px-4 py-4">
        <Tabs defaultValue="unread">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="unread">Não lidos ({unread.length})</TabsTrigger>
            <TabsTrigger value="all">Todos ({all.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="unread" className="mt-4 space-y-2">
            {loading ? (
              <Skeleton className="h-20 w-full rounded-2xl" />
            ) : unread.length === 0 ? (
              <Empty />
            ) : (
              unread.map((n) => <NotifCard key={n.id} n={n} productId={n.promotion_id ? promoToProduct.get(n.promotion_id) ?? null : null} onRead={() => markRead(n.id)} />)
            )}
          </TabsContent>
          <TabsContent value="all" className="mt-4 space-y-2">
            {loading ? <Skeleton className="h-20 w-full rounded-2xl" /> : all.length === 0 ? <Empty /> : all.map((n) => <NotifCard key={n.id} n={n} productId={n.promotion_id ? promoToProduct.get(n.promotion_id) ?? null : null} onRead={() => markRead(n.id)} />)}
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

const KIND_META: Record<string, { emoji: string; color: string }> = {
  price_drop: { emoji: "📉", color: "bg-success/10" },
  ending_today: { emoji: "⏰", color: "bg-[var(--promo-hot)]/10" },
  favorite_on_sale: { emoji: "❤️", color: "bg-primary/10" },
  basket_match: { emoji: "🛒", color: "bg-accent/40" },
};

function NotifCard({ n, productId, onRead }: { n: Notif; productId: string | null; onRead: () => void }) {
  const meta = KIND_META[n.kind] ?? { emoji: "🔔", color: "bg-muted" };
  return (
    <Card className={cn("rounded-2xl p-4", !n.read_at && "border-primary/40 shadow-card")}>
      <div className="flex gap-3">
        <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-full text-lg", meta.color)}>
          {meta.emoji}
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold">{n.title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p>
          <div className="mt-2 flex gap-2">
            {productId && (
              <Link
                to="/promocoes/produto/$id"
                params={{ id: productId }}
                onClick={onRead}
                className="text-xs font-medium text-primary"
              >
                Ver oferta →
              </Link>
            )}
            {!n.read_at && (
              <button onClick={onRead} className="text-xs text-muted-foreground hover:text-foreground">
                Marcar como lido
              </button>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

function Empty() {
  return (
    <Card className="rounded-2xl p-8 text-center">
      <Bell className="mx-auto size-10 text-muted-foreground" />
      <p className="mt-2 text-sm font-medium">Sem alertas</p>
      <p className="mt-1 text-xs text-muted-foreground">Adicione produtos aos favoritos para receber notificações.</p>
    </Card>
  );
}
