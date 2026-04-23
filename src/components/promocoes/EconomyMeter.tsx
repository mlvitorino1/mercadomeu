import { useEffect, useState } from "react";
import { formatBRL } from "@/lib/format";

export function EconomyMeter({ value, label }: { value: number; label?: string }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const target = Math.max(0, value);
    const duration = 800;
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(target * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return (
    <div className="flex flex-col items-start gap-1 text-gray-950">
      <span className="text-xs font-medium uppercase tracking-wide text-gray-950">
        {label ?? "Você pode economizar hoje"}
      </span>
      <span className="text-4xl font-bold tabular-nums text-gray-900">
        {formatBRL(display)}
      </span>
    </div>
  );
}
