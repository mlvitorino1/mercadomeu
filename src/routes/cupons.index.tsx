import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { formatBRL, formatDate } from "@/lib/format";
import { Receipt as ReceiptIcon, ChevronRight } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type Receipt = Database["public"]["Tables"]["receipts"]["Row"] & { item_count: number };

export const Route = createFileRoute("/cupons/")({
  head: () => ({
    meta: [
      { title: "Cupons — CuponizAI" },
      { name: "description", content: "Lista cronológica de todos os seus cupons." },
    ],
  }),
  component: ReceiptsListPage,
});

function ReceiptsListPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/auth" });
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("receipts")
        .select("*, receipt_items(count)")
        .order("purchased_at", { ascending: false });
      const list = (data ?? []).map((r) => {
        const ri = r.receipt_items as unknown as { count: number }[] | null;
        return { ...r, item_count: ri?.[0]?.count ?? 0 };
      }) as Receipt[];
      setReceipts(list);
      setLoading(false);
    })();
  }, [user]);

  return (
    <AppLayout>
      <header className="bg-gradient-primary px-5 pb-6 pt-10 text-primary-foreground rounded-b-3xl shadow-elevated">
        <h1 className="text-2xl font-bold">Meus cupons</h1>
        <p className="mt-1 text-sm opacity-90">{receipts.length} {receipts.length === 1 ? "cupom" : "cupons"} no histórico</p>
      </header>

      <div className="space-y-3 px-4 py-5">
        {loading ? (
          <>
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </>
        ) : receipts.length === 0 ? (
          <Card className="p-8 text-center shadow-card">
            <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-muted">
              <ReceiptIcon className="size-7 text-muted-foreground" />
            </div>
            <h2 className="text-base font-semibold">Nenhum cupom ainda</h2>
            <p className="mt-1 text-sm text-muted-foreground">Tire a foto do seu primeiro cupom!</p>
            <Button onClick={() => navigate({ to: "/adicionar" })} className="mt-4 bg-gradient-primary">
              Adicionar cupom
            </Button>
          </Card>
        ) : (
          receipts.map((r) => (
            <Link key={r.id} to="/cupons/$id" params={{ id: r.id }}>
              <Card className="flex items-center justify-between gap-3 p-4 shadow-card transition-transform active:scale-[0.99] hover:shadow-elevated">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{r.store_name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatDate(r.purchased_at)} · {r.item_count} {r.item_count === 1 ? "item" : "itens"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold tabular-nums text-foreground">{formatBRL(Number(r.total_amount))}</p>
                </div>
                <ChevronRight className="size-4 text-muted-foreground" />
              </Card>
            </Link>
          ))
        )}
      </div>
    </AppLayout>
  );
}
