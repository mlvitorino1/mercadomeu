import { cn } from "@/lib/utils";

export function DiscountBadge({
  pct,
  className,
  size = "md",
}: {
  pct: number;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const rounded = Math.round(pct);
  const hot = rounded >= 30;
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full font-bold text-white shadow-sm",
        hot
          ? "bg-[var(--promo-hot)]"
          : "bg-primary",
        size === "sm" && "px-2 py-0.5 text-[10px]",
        size === "md" && "px-2.5 py-1 text-xs",
        size === "lg" && "px-3 py-1.5 text-sm",
        className,
      )}
    >
      −{rounded}%
    </span>
  );
}
