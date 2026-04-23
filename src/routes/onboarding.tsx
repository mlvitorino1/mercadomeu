import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowRight, ArrowLeft, Check, Users, Wallet, Heart, ShoppingCart, Sparkles, MapPin } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "Personalize sua experiência — CuponizAI" },
      { name: "description", content: "Conte sobre você e sua casa para receber insights sob medida." },
    ],
  }),
  component: OnboardingPage,
});

type FormState = {
  adults: number;
  children: number;
  pets: number;
  income_range: string;
  monthly_grocery_budget: string;
  restrictions: string[];
  favorite_stores: string;
  shopping_frequency: string;
  preferred_payment_method: string;
  city_id: string;
  radius_km: number;
};

type City = { id: string; name: string; state: string };

const RESTRICTIONS = [
  { id: "vegetariano", label: "Vegetariano" },
  { id: "vegano", label: "Vegano" },
  { id: "sem_lactose", label: "Sem lactose" },
  { id: "sem_gluten", label: "Sem glúten" },
  { id: "low_carb", label: "Low carb" },
  { id: "diabetico", label: "Diabético" },
];

const STEPS = [
  { id: 0, icon: Users, title: "Sua casa", subtitle: "Quem mora com você?" },
  { id: 1, icon: Wallet, title: "Orçamento", subtitle: "Quanto investe por mês?" },
  { id: 2, icon: Heart, title: "Preferências", subtitle: "Restrições e mercados favoritos" },
  { id: 3, icon: ShoppingCart, title: "Hábitos", subtitle: "Como você costuma comprar?" },
  { id: 4, icon: MapPin, title: "Sua região", subtitle: "Onde encontrar promoções perto de você" },
];

function OnboardingPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [form, setForm] = useState<FormState>({
    adults: 2,
    children: 0,
    pets: 0,
    income_range: "",
    monthly_grocery_budget: "",
    restrictions: [],
    favorite_stores: "",
    shopping_frequency: "",
    preferred_payment_method: "",
    city_id: "",
    radius_km: 5,
  });
  const [cities, setCities] = useState<City[]>([]);

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/auth" });
  }, [user, authLoading, navigate]);

  // Carrega cidades e valores prévios
  useEffect(() => {
    if (!user) return;
    (async () => {
      const [profileRes, locationRes, citiesRes] = await Promise.all([
        supabase.from("household_profile").select("*").eq("user_id", user.id).maybeSingle(),
        supabase.from("user_location").select("*").eq("user_id", user.id).maybeSingle(),
        supabase.from("cities").select("id, name, state").order("name"),
      ]);
      if (citiesRes.data) setCities(citiesRes.data);
      const data = profileRes.data;
      const loc = locationRes.data;
      setForm((s) => ({
        ...s,
        adults: data?.adults ?? s.adults,
        children: data?.children ?? s.children,
        pets: data?.pets ?? s.pets,
        income_range: data?.income_range ?? "",
        monthly_grocery_budget: data?.monthly_grocery_budget?.toString() ?? "",
        restrictions: data?.restrictions ?? [],
        favorite_stores: (data?.favorite_stores ?? []).join(", "),
        shopping_frequency: data?.shopping_frequency ?? "",
        preferred_payment_method: data?.preferred_payment_method ?? "",
        city_id: loc?.city_id ?? "",
        radius_km: loc?.radius_km ?? 5,
      }));
      setLoadingProfile(false);
    })();
  }, [user]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((s) => ({ ...s, [key]: value }));
  }

  function toggleRestriction(id: string) {
    setForm((s) => ({
      ...s,
      restrictions: s.restrictions.includes(id)
        ? s.restrictions.filter((r) => r !== id)
        : [...s.restrictions, id],
    }));
  }

  async function persist(completed: boolean) {
    if (!user) return false;
    const payload = {
      user_id: user.id,
      adults: form.adults,
      children: form.children,
      pets: form.pets,
      income_range: form.income_range || null,
      monthly_grocery_budget: form.monthly_grocery_budget ? Number(form.monthly_grocery_budget) : null,
      restrictions: form.restrictions,
      favorite_stores: form.favorite_stores
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      shopping_frequency: form.shopping_frequency || null,
      preferred_payment_method: form.preferred_payment_method || null,
      onboarding_completed_at: completed ? new Date().toISOString() : null,
    };
    const { error } = await supabase
      .from("household_profile")
      .upsert(payload, { onConflict: "user_id" });
    if (error) {
      toast.error("Não consegui salvar agora. Tente de novo.");
      return false;
    }
    return true;
  }

  async function handleNext() {
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
      return;
    }
    setSaving(true);
    const ok = await persist(true);
    setSaving(false);
    if (ok) {
      toast.success("Tudo pronto! Personalizando seus insights…");
      navigate({ to: "/home" });
    }
  }

  async function handleSkip() {
    setSaving(true);
    await persist(true); // marca como completo mesmo se pular para não recair em loop
    setSaving(false);
    navigate({ to: "/home" });
  }

  if (authLoading || !user || loadingProfile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-soft">
        <Skeleton className="h-32 w-72" />
      </div>
    );
  }

  const Step = STEPS[step];
  const Icon = Step.icon;
  const progress = ((step + 1) / STEPS.length) * 100;

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-gradient-soft">
      {/* Header com progresso */}
      <header className="px-6 pt-12">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-primary text-primary-foreground">
              <Sparkles className="size-4" />
            </div>
            <span className="text-sm font-semibold">CuponizAI</span>
          </div>
          <button
            onClick={handleSkip}
            className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Pular por agora
          </button>
        </div>

        <div className="mt-6 h-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-gradient-primary transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>Etapa {step + 1} de {STEPS.length}</span>
          <span>{Math.round(progress)}%</span>
        </div>
      </header>

      {/* Conteúdo */}
      <main className="flex flex-1 flex-col px-6 pt-10">
        <div className="mb-8">
          <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Icon className="size-7" />
          </div>
          <h1 className="text-2xl font-bold leading-tight">{Step.title}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">{Step.subtitle}</p>
        </div>

        <div className="flex-1 space-y-5">
          {step === 0 && (
            <>
              <CounterField label="Adultos" hint="13 anos ou mais" value={form.adults} onChange={(v) => update("adults", v)} min={1} max={15} />
              <CounterField label="Crianças" hint="Até 12 anos" value={form.children} onChange={(v) => update("children", v)} min={0} max={15} />
              <CounterField label="Pets" hint="Cachorros, gatos…" value={form.pets} onChange={(v) => update("pets", v)} min={0} max={15} />
            </>
          )}

          {step === 1 && (
            <>
              <div className="space-y-2">
                <Label>Faixa de renda mensal</Label>
                <Select value={form.income_range} onValueChange={(v) => update("income_range", v)}>
                  <SelectTrigger className="h-12">
                    <SelectValue placeholder="Selecione (opcional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ate_2k">Até R$ 2.000</SelectItem>
                    <SelectItem value="2k_5k">R$ 2.000 – R$ 5.000</SelectItem>
                    <SelectItem value="5k_10k">R$ 5.000 – R$ 10.000</SelectItem>
                    <SelectItem value="10k_20k">R$ 10.000 – R$ 20.000</SelectItem>
                    <SelectItem value="20k_mais">Acima de R$ 20.000</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="budget">Meta de gasto com mercado (R$/mês)</Label>
                <Input
                  id="budget"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="50"
                  placeholder="Ex: 1500"
                  value={form.monthly_grocery_budget}
                  onChange={(e) => update("monthly_grocery_budget", e.target.value)}
                  className="h-12 text-base"
                />
                <p className="text-[11px] text-muted-foreground">Vamos comparar com seus gastos reais.</p>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="space-y-2">
                <Label>Restrições alimentares</Label>
                <div className="grid grid-cols-2 gap-2">
                  {RESTRICTIONS.map((r) => {
                    const on = form.restrictions.includes(r.id);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => toggleRestriction(r.id)}
                        className={cn(
                          "flex items-center justify-between rounded-xl border px-3 py-2.5 text-sm font-medium transition-all",
                          on
                            ? "border-primary bg-primary/5 text-foreground shadow-sm"
                            : "border-border bg-card text-muted-foreground hover:border-primary/40",
                        )}
                      >
                        <span>{r.label}</span>
                        {on && <Check className="size-4 text-primary" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="stores">Mercados favoritos</Label>
                <Input
                  id="stores"
                  placeholder="Ex: Carrefour, Atacadão"
                  value={form.favorite_stores}
                  onChange={(e) => update("favorite_stores", e.target.value)}
                  className="h-12 text-base"
                  maxLength={200}
                />
                <p className="text-[11px] text-muted-foreground">Separe por vírgula.</p>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div className="space-y-2">
                <Label>Frequência de compras</Label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { v: "semanal", l: "Semanal" },
                    { v: "quinzenal", l: "Quinzenal" },
                    { v: "mensal", l: "Mensal" },
                    { v: "esporadica", l: "Esporádica" },
                  ].map((opt) => {
                    const on = form.shopping_frequency === opt.v;
                    return (
                      <button
                        key={opt.v}
                        type="button"
                        onClick={() => update("shopping_frequency", opt.v)}
                        className={cn(
                          "rounded-xl border px-3 py-3 text-sm font-medium transition-all",
                          on
                            ? "border-primary bg-primary/5 shadow-sm"
                            : "border-border bg-card text-muted-foreground hover:border-primary/40",
                        )}
                      >
                        {opt.l}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Forma de pagamento favorita</Label>
                <Select
                  value={form.preferred_payment_method}
                  onValueChange={(v) => update("preferred_payment_method", v)}
                >
                  <SelectTrigger className="h-12">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pix">Pix</SelectItem>
                    <SelectItem value="credito">Cartão de crédito</SelectItem>
                    <SelectItem value="debito">Cartão de débito</SelectItem>
                    <SelectItem value="dinheiro">Dinheiro</SelectItem>
                    <SelectItem value="vale">Vale alimentação</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Card className="border-primary/20 bg-primary/5 p-4">
                <div className="flex gap-3">
                  <Sparkles className="size-4 shrink-0 text-primary" />
                  <p className="text-xs leading-relaxed text-foreground">
                    Vamos cruzar essas informações com seus cupons para prever a duração de itens, alertar sobre estoque
                    baixo e sugerir economia para sua casa.
                  </p>
                </div>
              </Card>
            </>
          )}
        </div>

        {/* Footer fixo */}
        <div className="sticky bottom-0 -mx-6 mt-8 border-t border-border/50 bg-background/80 px-6 py-4 backdrop-blur-md">
          <div className="flex gap-2">
            {step > 0 && (
              <Button
                variant="outline"
                size="lg"
                onClick={() => setStep((s) => s - 1)}
                disabled={saving}
                className="h-12"
              >
                <ArrowLeft className="size-4" />
              </Button>
            )}
            <Button
              size="lg"
              onClick={handleNext}
              disabled={saving}
              className="h-12 flex-1 bg-gradient-primary text-base font-semibold shadow-elevated"
            >
              {saving ? "Salvando…" : step === STEPS.length - 1 ? "Concluir" : "Continuar"}
              {!saving && step < STEPS.length - 1 && <ArrowRight className="ml-1 size-4" />}
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}

function CounterField({
  label,
  hint,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div>
        <p className="text-sm font-semibold">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          className="flex size-9 items-center justify-center rounded-full border border-border text-lg font-medium transition-colors hover:bg-muted disabled:opacity-40"
        >
          −
        </button>
        <span className="w-6 text-center text-base font-bold tabular-nums">{value}</span>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          className="flex size-9 items-center justify-center rounded-full border border-border text-lg font-medium transition-colors hover:bg-muted disabled:opacity-40"
        >
          +
        </button>
      </div>
    </div>
  );
}
