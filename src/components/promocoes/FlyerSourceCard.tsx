import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import type { ComponentType, ReactNode } from "react";

export type SourceKind = "html_url" | "file_url" | "upload_pdf" | "upload_image";

export function FlyerSourceCard({
  icon: Icon,
  title,
  description,
  hint,
  selected,
  onClick,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
  hint?: ReactNode;
  selected?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="block w-full text-left">
      <Card
        className={cn(
          "rounded-2xl border p-4 transition-all",
          selected
            ? "border-primary bg-primary/5 shadow-elevated"
            : "border-border/60 hover:border-primary/40 hover:shadow-card",
        )}
      >
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "flex size-11 shrink-0 items-center justify-center rounded-xl",
              selected ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
            )}
          >
            <Icon className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">{title}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
            {hint && <div className="mt-2 text-[11px] leading-relaxed text-muted-foreground/90">{hint}</div>}
          </div>
          <ChevronRight className={cn("size-4 shrink-0", selected ? "text-primary" : "text-muted-foreground")} />
        </div>
      </Card>
    </button>
  );
}
