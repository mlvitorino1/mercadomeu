import { ResponsiveContainer, LineChart, Line, Tooltip, YAxis } from "recharts";
import { formatBRL } from "@/lib/format";

export function PriceSparkline({
  data,
  height = 50,
}: {
  data: { date: string; price: number }[];
  height?: number;
}) {
  if (!data.length) {
    return (
      <div
        className="flex items-center justify-center rounded-md bg-muted text-[10px] text-muted-foreground"
        style={{ height }}
      >
        sem histórico
      </div>
    );
  }
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 4, bottom: 4, left: 0, right: 0 }}>
          <YAxis hide domain={["dataMin - 1", "dataMax + 1"]} />
          <Tooltip
            cursor={false}
            contentStyle={{
              fontSize: 11,
              padding: "4px 8px",
              borderRadius: 8,
              border: "1px solid var(--border)",
            }}
            formatter={(v: number) => [formatBRL(v), "Preço"]}
            labelFormatter={(l) => l}
          />
          <Line
            type="monotone"
            dataKey="price"
            stroke="var(--primary)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
