import { cn } from "@/lib/utils";
import { CheckCircle2, Loader2, AlertTriangle, Clock } from "lucide-react";

export type FlyerStatus = "pending" | "processing" | "ready" | "failed";

export function FlyerStatusChip({ status, className }: { status: FlyerStatus; className?: string }) {
  const map = {
    pending: { Icon: Clock, label: "Aguardando", cls: "bg-muted text-muted-foreground" },
    processing: { Icon: Loader2, label: "Processando", cls: "bg-primary/10 text-primary", spin: true },
    ready: { Icon: CheckCircle2, label: "Pronto", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
    failed: { Icon: AlertTriangle, label: "Falhou", cls: "bg-destructive/10 text-destructive" },
  } as const;
  const { Icon, label, cls } = map[status];
  const spin = status === "processing";
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold", cls, className)}>
      <Icon className={cn("size-3", spin && "animate-spin")} />
      {label}
    </span>
  );
}
