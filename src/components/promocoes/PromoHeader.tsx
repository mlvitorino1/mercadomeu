import { Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";

export function PromoHeader({
  title,
  back = "/promocoes",
  right,
}: {
  title: string;
  back?: string;
  right?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-border bg-card/95 px-3 py-3 backdrop-blur-md">
      <Link
        to={back}
        className="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <ChevronLeft className="size-5" />
      </Link>
      <h1 className="flex-1 truncate text-base font-semibold">{title}</h1>
      {right}
    </header>
  );
}
