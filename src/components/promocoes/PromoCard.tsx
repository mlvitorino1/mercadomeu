import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { DiscountBadge } from "./DiscountBadge";
import { formatBRL } from "@/lib/format";
import { formatDistance, formatTimeLeft } from "@/lib/promo-score";
import { MapPin, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export type PromoCardData = {
  id: string;
  product_id: string;
  price: number;
  original_price: number;
  discount_pct: number;
  ends_at: string;
  product_name: string;
  product_emoji: string;
  product_brand: string | null;
  product_unit: string;
  store_name: string;
  store_chain: string;
  store_emoji: string;
  store_color: string;
  store_id: string;
  distance_km: number | null;
};

export function PromoCard({ promo, compact = false }: { promo: PromoCardData; compact?: boolean }) {
  const time = formatTimeLeft(promo.ends_at);
  const dist = formatDistance(promo.distance_km);
  const hot = promo.discount_pct >= 30;

  return (
    <Link to="/promocoes/produto/$id" params={{ id: promo.product_id }} className="block">
      <Card
        className={cn(
          "relative overflow-hidden rounded-2xl border-border/60 transition-all hover:shadow-elevated active:scale-[0.99]",
          compact ? "p-3" : "p-4",
        )}
      >
        {hot && (
          <div className="absolute -right-9 top-3 z-10 rotate-45 bg-[var(--promo-hot)] px-10 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow">
            Oferta quente
          </div>
        )}

        <div
          className="absolute inset-x-0 top-0 h-1"
          style={{ backgroundColor: promo.store_color }}
        />

        <div className="flex gap-3">
          <div
            className="flex size-14 shrink-0 items-center justify-center rounded-xl text-3xl"
            style={{ backgroundColor: promo.store_color + "15" }}
          >
            {promo.product_emoji}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="line-clamp-2 text-sm font-semibold leading-tight text-foreground">
                  {promo.product_name}
                </p>
                {promo.product_brand && (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {promo.product_brand}
                  </p>
                )}
              </div>
              <DiscountBadge pct={promo.discount_pct} size="sm" />
            </div>

            <div className="mt-1.5 flex items-baseline gap-2">
              <span className="text-lg font-bold text-primary tabular-nums">
                {formatBRL(promo.price)}
              </span>
              <span className="text-xs text-muted-foreground line-through tabular-nums">
                {formatBRL(promo.original_price)}
              </span>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <span>{promo.store_emoji}</span>
                <span className="font-medium">{promo.store_chain}</span>
              </span>
              {dist && (
                <span className="inline-flex items-center gap-0.5">
                  <MapPin className="size-3" />
                  {dist}
                </span>
              )}
              <span
                className={cn(
                  "inline-flex items-center gap-0.5",
                  time.urgent && "font-medium text-destructive",
                )}
              >
                <Clock className="size-3" />
                {time.text}
              </span>
            </div>
          </div>
        </div>
      </Card>
    </Link>
  );
}
