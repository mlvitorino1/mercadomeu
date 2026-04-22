import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { formatBRL, formatDateTime, CATEGORY_LABELS } from "@/lib/format";
import { ArrowLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type Receipt = Database["public"]["Tables"]["receipts"]["Row"];
type Item = Database["public"]["Tables"]["receipt_items"]["Row"];

export const Route = createFileRoute("/cupons/$id")({
  head: () => ({
    meta: [{ title: "Detalhes do cupom — Cuponizei" }],
  }),
  component: ReceiptDetailPage,
});

function ReceiptDetailPage() {
  const { id } = Route.useParams();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/auth" });
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { data: r } = await supabase.from("receipts").select("*").eq("id", id).maybeSingle();
      const { data: i } = await supabase.from("receipt_items").select("*").eq("receipt_id", id);
      setReceipt(r);
      setItems(i ?? []);
      if (r?.image_path) {
        const { data: signed } = await supabase.storage.from("receipts").createSignedUrl(r.image_path, 3600);
        setImageUrl(signed?.signedUrl ?? null);
      }
      setLoading(false);
    })();
  }, [user, id]);

  async function handleDelete() {
    if (!confirm("Excluir este cupom? Esta ação não pode ser desfeita.")) return;
    const { error } = await supabase.from("receipts").delete().eq("id", id);
    if (error) {
      toast.error("Erro ao excluir");
      return;
    }
    if (receipt?.image_path) {
      await supabase.storage.from("receipts").remove([receipt.image_path]);
    }
    toast.success("Cupom excluído");
    navigate({ to: "/cupons" });
  }

  return (
    <AppLayout>
      <header className="flex items-center gap-3 px-4 pt-6 pb-3">
        <Link to="/cupons">
          <Button variant="ghost" size="icon"><ArrowLeft className="size-5" /></Button>
        </Link>
        <h1 className="flex-1 text-lg font-bold">Detalhes do cupom</h1>
        <Button variant="ghost" size="icon" onClick={handleDelete}>
          <Trash2 className="size-5 text-destructive" />
        </Button>
      </header>

      <div className="space-y-3 px-4 pb-6">
        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : !receipt ? (
          <Card className="p-6 text-center">Cupom não encontrado</Card>
        ) : (
          <>
            <Card className="p-5 shadow-card">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Estabelecimento</p>
              <h2 className="mt-1 text-lg font-bold">{receipt.store_name}</h2>
              {receipt.store_cnpj && <p className="mt-0.5 text-xs text-muted-foreground">CNPJ {receipt.store_cnpj}</p>}
              <div className="mt-4 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Data</p>
                  <p className="mt-0.5 text-sm font-medium">{formatDateTime(receipt.purchased_at)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Pagamento</p>
                  <p className="mt-0.5 text-sm font-medium">{receipt.payment_method ?? "—"}</p>
                </div>
              </div>
              <div className="mt-4 border-t border-border pt-4">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-muted-foreground">Total</span>
                  <span className="text-2xl font-bold tabular-nums text-primary">{formatBRL(Number(receipt.total_amount))}</span>
                </div>
              </div>
            </Card>

            <Card className="p-5 shadow-card">
              <h3 className="mb-3 text-sm font-semibold">Itens ({items.length})</h3>
              <div className="space-y-3">
                {items.map((it) => (
                  <div key={it.id} className="flex items-start justify-between gap-3 border-b border-border pb-3 last:border-0 last:pb-0">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{it.canonical_name || it.description}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {Number(it.quantity)} × {formatBRL(Number(it.unit_price))} · {CATEGORY_LABELS[it.category] ?? it.category}
                      </p>
                    </div>
                    <p className="text-sm font-semibold tabular-nums">{formatBRL(Number(it.total_price))}</p>
                  </div>
                ))}
              </div>
            </Card>

            {imageUrl && (
              <Card className="overflow-hidden shadow-card">
                <p className="px-5 pb-2 pt-4 text-sm font-semibold">Foto original</p>
                <img src={imageUrl} alt="Cupom fiscal" className="w-full" />
              </Card>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
