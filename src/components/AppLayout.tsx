import { Link, useLocation } from "@tanstack/react-router";
import { Home, Receipt, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function AppLayout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const path = location.pathname;

  const navItem = (to: string, Icon: typeof Home, label: string, active: boolean) => (
    <Link
      to={to}
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-1 py-2 text-xs font-medium transition-colors",
        active ? "text-primary" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className={cn("size-5", active && "stroke-[2.5]")} />
      <span>{label}</span>
    </Link>
  );

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-gradient-soft pb-20">
      <main className="flex-1">{children}</main>

      <nav className="fixed bottom-0 left-1/2 z-50 flex w-full max-w-md -translate-x-1/2 items-stretch border-t border-border bg-card/95 backdrop-blur-md shadow-elevated">
        {navItem("/", Home, "Início", path === "/")}
        <Link
          to="/adicionar"
          className="relative -mt-6 flex flex-1 items-start justify-center"
        >
          <div
            className={cn(
              "flex size-14 items-center justify-center rounded-full bg-gradient-primary text-primary-foreground shadow-elevated transition-transform",
              path === "/adicionar" ? "scale-105" : "hover:scale-105",
            )}
          >
            <Plus className="size-7 stroke-[2.5]" />
          </div>
        </Link>
        {navItem("/cupons", Receipt, "Cupons", path.startsWith("/cupons"))}
      </nav>
    </div>
  );
}
