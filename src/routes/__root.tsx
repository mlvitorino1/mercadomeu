import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/hooks/use-auth";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Página não encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          A página que você procura não existe.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Voltar para o início
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#10b88a" },
      { title: "CuponizAI — Leitura inteligente de cupom fiscal" },
      { name: "description", content: "Tire foto do seu cupom fiscal e organize seus gastos automaticamente com IA." },
      { property: "og:title", content: "CuponizAI — Leitura inteligente de cupom fiscal" },
      { property: "og:description", content: "Tire foto do seu cupom fiscal e organize seus gastos automaticamente com IA." },
      { property: "og:type", content: "website" },
      { name: "twitter:title", content: "CuponizAI — Leitura inteligente de cupom fiscal" },
      { name: "twitter:description", content: "Tire foto do seu cupom fiscal e organize seus gastos automaticamente com IA." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/09685320-e6e7-4dcf-93dc-50c41031ec74/id-preview-efa421dc--cc7ea5a4-6306-4151-8435-175b40b88518.lovable.app-1776890006803.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/09685320-e6e7-4dcf-93dc-50c41031ec74/id-preview-efa421dc--cc7ea5a4-6306-4151-8435-175b40b88518.lovable.app-1776890006803.png" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return (
    <AuthProvider>
      <Outlet />
      <Toaster richColors position="top-center" />
    </AuthProvider>
  );
}
