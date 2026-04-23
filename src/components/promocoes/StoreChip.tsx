import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export type StoreChipData = {
  id: string;
  name: string;
  chain: string;
  logo_emoji: string;
  brand_color: string;
};

export function StoreChip({
  store,
  className,
  asLink = true,
}: {
  store: StoreChipData;
  className?: string;
  asLink?: boolean;
}) {
  const content = (
    <>
      <span
        className="flex size-6 items-center justify-center rounded-full text-sm"
        style={{ backgroundColor: store.brand_color + "20" }}
      >
        {store.logo_emoji}
      </span>
      <span className="truncate">{store.chain}</span>
    </>
  );
  const cls = cn(
    "inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted",
    className,
  );
  if (!asLink) return <span className={cls}>{content}</span>;
  return (
    <Link to="/promocoes/mercado/$id" params={{ id: store.id }} className={cls}>
      {content}
    </Link>
  );
}
