import { Card } from "@/components/ui/card";
import { FlyerStatusChip, type FlyerStatus } from "./FlyerStatusChip";
import { Trash2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export type FlyerHistoryRow = {
  id: string;
  status: FlyerStatus;
  source_kind: string;
  store_name: string | null;
  extracted_count: number;
  created_at: string;
  error_message: string | null;
};

export function FlyerHistoryItem({
  flyer,
  onDelete,
  onReprocess,
}: {
  flyer: FlyerHistoryRow;
  onDelete: (id: string) => void;
  onReprocess: (id: string) => void;
}) {
  const sourceLabel: Record<string, string> = {
    html_url: "Link do site",
    file_url: "Link de arquivo",
    upload_pdf: "PDF enviado",
    upload_image: "Foto enviada",
  };
  return (
    <Card className="rounded-xl border-border/60 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold">{flyer.store_name ?? "Mercado não identificado"}</p>
            <FlyerStatusChip status={flyer.status} />
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {sourceLabel[flyer.source_kind] ?? flyer.source_kind} ·{" "}
            {formatDistanceToNow(new Date(flyer.created_at), { addSuffix: true, locale: ptBR })}
          </p>
          {flyer.status === "ready" && (
            <p className="mt-1 text-xs font-medium text-primary">{flyer.extracted_count} promoções</p>
          )}
          {flyer.status === "failed" && flyer.error_message && (
            <p className="mt-1 line-clamp-2 text-[11px] text-destructive">{flyer.error_message}</p>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          {(flyer.status === "failed" || flyer.status === "processing" || flyer.status === "pending") && (
            <Button size="icon" variant="ghost" className="size-7" onClick={() => onReprocess(flyer.id)} title="Reprocessar">
              <RefreshCw className="size-3.5" />
            </Button>
          )}
          <Button size="icon" variant="ghost" className="size-7 text-destructive" onClick={() => onDelete(flyer.id)}>
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
