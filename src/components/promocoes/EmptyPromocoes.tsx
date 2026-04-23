import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Tag } from "lucide-react";

export function EmptyPromocoes() {
  return (
    <Card className="rounded-3xl border-dashed border-2 border-primary/30 bg-gradient-soft p-8 text-center">
      <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Tag className="size-8" />
      </div>
      <h3 className="mt-4 text-base font-bold">Cadastre seu primeiro panfleto</h3>
      <p className="mx-auto mt-1.5 max-w-xs text-xs text-muted-foreground">
        Adicione o link do encarte ou envie a foto/PDF do panfleto do seu mercado favorito. Nossa IA extrai e organiza as promoções automaticamente.
      </p>
      <Link to="/promocoes/cadastrar">
        <Button className="mt-4 gap-2">
          <Plus className="size-4" /> Cadastrar panfleto
        </Button>
      </Link>
    </Card>
  );
}
