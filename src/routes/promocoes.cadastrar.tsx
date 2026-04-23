import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { useAuth } from "@/hooks/use-auth";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { FlyerSourceCard, type SourceKind } from "@/components/promocoes/FlyerSourceCard";
import { FlyerStatusChip, type FlyerStatus } from "@/components/promocoes/FlyerStatusChip";
import {
  ArrowLeft, ChevronDown, FileText, Globe, ImageIcon, Link2, CheckCircle2, Loader2, Sparkles,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { pollFlyer } from "@/lib/flyer-poll";
import { toast } from "sonner";

export const Route = createFileRoute("/promocoes/cadastrar")({
  head: () => ({
    meta: [
      { title: "Cadastrar panfleto — CuponizAI" },
      { name: "description", content: "Cadastre o panfleto do seu mercado e a IA extrai as promoções." },
    ],
  }),
  component: CadastrarPanfleto,
});

const urlSchema = z.string().url({ message: "URL inválida" }).max(2048);
const MAX_FILE_MB = 10;

function CadastrarPanfleto() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [kind, setKind] = useState<SourceKind | null>(null);
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [validUntil, setValidUntil] = useState(() =>
    new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
  );
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<{ status: FlyerStatus; count: number; storeName?: string; error?: string } | null>(null);

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/auth" });
  }, [user, authLoading, navigate]);

  const sourceCards = [
    {
      kind: "html_url" as const, icon: Globe, title: "Link do site do mercado",
      description: "Cole o link da página de ofertas/encartes",
      hint: <>Ex.: <code className="rounded bg-muted px-1">savegnago.com.br/ofertas</code> — vá no site → menu Encartes → copie a URL.</>,
    },
    {
      kind: "file_url" as const, icon: Link2, title: "Link direto de PDF ou imagem",
      description: "Cole o link de um arquivo PDF/JPG do encarte",
      hint: <>Funciona com URLs que terminam em <code className="rounded bg-muted px-1">.pdf</code>, <code className="rounded bg-muted px-1">.jpg</code> ou <code className="rounded bg-muted px-1">.png</code>.</>,
    },
    {
      kind: "upload_pdf" as const, icon: FileText, title: "Upload de PDF",
      description: "Envie o PDF do encarte do seu computador/celular",
      hint: <>Tamanho máximo: {MAX_FILE_MB} MB. Baixe o PDF do site do mercado e envie aqui.</>,
    },
    {
      kind: "upload_image" as const, icon: ImageIcon, title: "Foto do panfleto",
      description: "Tire uma foto do encarte impresso ou print da tela",
      hint: <>Imagens nítidas extraem melhor. Você pode enviar JPG ou PNG (até {MAX_FILE_MB} MB).</>,
    },
  ];

  const canProceedStep2 = () => {
    if (!kind) return false;
    if (kind === "html_url" || kind === "file_url") return urlSchema.safeParse(url).success;
    return file !== null && file.size <= MAX_FILE_MB * 1024 * 1024;
  };

  async function handleSubmit() {
    if (!user) return;
    setSubmitting(true);
    setStep(4);
    setProgress({ status: "pending", count: 0 });

    try {
      let storagePath: string | null = null;
      if (kind === "upload_pdf" || kind === "upload_image") {
        if (!file) throw new Error("Arquivo obrigatório");
        const ext = file.name.split(".").pop() ?? (kind === "upload_pdf" ? "pdf" : "jpg");
        const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage.from("flyers").upload(path, file, { contentType: file.type });
        if (upErr) throw upErr;
        storagePath = path;
      }

      const validUntilIso = new Date(validUntil + "T23:59:59").toISOString();
      const { data: inserted, error: insErr } = await supabase.from("promo_flyers").insert({
        user_id: user.id,
        source_kind: kind!,
        source_url: kind === "html_url" || kind === "file_url" ? url : null,
        storage_path: storagePath,
        valid_from: new Date().toISOString(),
        valid_until: validUntilIso,
        status: "pending",
      }).select("id").single();
      if (insErr || !inserted) throw insErr ?? new Error("erro ao criar panfleto");

      // Fire-and-forget invocation
      supabase.functions.invoke("extract-flyer", { body: { flyer_id: inserted.id } }).catch(() => {});

      // Poll
      const final = await pollFlyer(inserted.id, (r) => {
        setProgress({ status: r.status, count: r.extracted_count, error: r.error_message ?? undefined });
      });

      let storeName: string | undefined;
      if (final.store_id) {
        const { data: s } = await supabase.from("promo_stores").select("name").eq("id", final.store_id).maybeSingle();
        storeName = (s?.name as string | undefined) ?? undefined;
      }
      setProgress({ status: final.status, count: final.extracted_count, error: final.error_message ?? undefined, storeName });

      if (final.status === "ready") toast.success(`${final.extracted_count} promoções adicionadas`);
      else toast.error("Não conseguimos processar este panfleto");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro desconhecido";
      setProgress({ status: "failed", count: 0, error: msg });
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppLayout>
      <div className="space-y-4 px-4 py-5">
        <div className="flex items-center gap-2">
          <Link to="/promocoes">
            <Button variant="ghost" size="icon" className="size-9"><ArrowLeft className="size-4" /></Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-base font-bold leading-tight">Cadastrar panfleto</h1>
            <p className="text-xs text-muted-foreground">Passo {Math.min(step, 4)} de 4</p>
          </div>
        </div>

        {/* Progress dots */}
        <div className="flex gap-1.5">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className={`h-1 flex-1 rounded-full ${n <= step ? "bg-primary" : "bg-muted"}`} />
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold">Como você quer enviar?</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Escolha a forma mais prática pra você.</p>
            </div>
            <div className="space-y-2">
              {sourceCards.map((s) => (
                <Collapsible key={s.kind}>
                  <FlyerSourceCard
                    icon={s.icon} title={s.title} description={s.description}
                    selected={kind === s.kind}
                    onClick={() => setKind(s.kind)}
                    hint={
                      <CollapsibleTrigger className="inline-flex items-center gap-1 text-primary hover:underline">
                        Como encontrar <ChevronDown className="size-3" />
                      </CollapsibleTrigger>
                    }
                  />
                  <CollapsibleContent className="mt-1.5 ml-14 rounded-lg bg-muted/50 p-2 text-[11px] text-muted-foreground">
                    {s.hint}
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </div>
            <Button className="w-full" disabled={!kind} onClick={() => setStep(2)}>Continuar</Button>
          </div>
        )}

        {step === 2 && kind && (
          <div className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold">
                {kind === "html_url" || kind === "file_url" ? "Cole o link" : "Envie o arquivo"}
              </h2>
            </div>
            {(kind === "html_url" || kind === "file_url") && (
              <div className="space-y-1.5">
                <Label htmlFor="url" className="text-xs">URL</Label>
                <Input
                  id="url" type="url" placeholder="https://..."
                  value={url} onChange={(e) => setUrl(e.target.value)} autoFocus
                />
                {url.length > 0 && !urlSchema.safeParse(url).success && (
                  <p className="text-[11px] text-destructive">URL inválida</p>
                )}
              </div>
            )}
            {(kind === "upload_pdf" || kind === "upload_image") && (
              <div className="space-y-1.5">
                <Label htmlFor="file" className="text-xs">{kind === "upload_pdf" ? "Arquivo PDF" : "Imagem"}</Label>
                <Input
                  id="file" type="file"
                  accept={kind === "upload_pdf" ? "application/pdf" : "image/*"}
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                {file && (
                  <p className="text-[11px] text-muted-foreground">
                    {file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                )}
                {file && file.size > MAX_FILE_MB * 1024 * 1024 && (
                  <p className="text-[11px] text-destructive">Arquivo maior que {MAX_FILE_MB} MB</p>
                )}
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>Voltar</Button>
              <Button className="flex-1" disabled={!canProceedStep2()} onClick={() => setStep(3)}>Continuar</Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold">Validade do panfleto</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">A IA tenta detectar — você pode ajustar.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="valid" className="text-xs">Válido até</Label>
              <Input id="valid" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
            </div>
            <Card className="rounded-xl bg-primary/5 p-3">
              <div className="flex gap-2">
                <Sparkles className="size-4 shrink-0 text-primary" />
                <p className="text-[11px] leading-relaxed text-foreground">
                  Após enviar, a IA vai analisar o panfleto, identificar o mercado, extrair os produtos e calcular descontos. Leva ~30 segundos.
                </p>
              </div>
            </Card>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep(2)}>Voltar</Button>
              <Button className="flex-1" disabled={submitting} onClick={handleSubmit}>Enviar panfleto</Button>
            </div>
          </div>
        )}

        {step === 4 && progress && (
          <div className="space-y-4">
            <Card className="rounded-2xl border-0 bg-gradient-promo p-6 text-center text-primary-foreground">
              {progress.status !== "ready" && progress.status !== "failed" && (
                <>
                  <Loader2 className="mx-auto size-10 animate-spin" />
                  <h3 className="mt-3 text-base font-bold">Processando panfleto…</h3>
                  <p className="mt-1 text-xs opacity-90">
                    {progress.status === "pending" ? "Enviando para análise" : "IA lendo as promoções"}
                  </p>
                </>
              )}
              {progress.status === "ready" && (
                <>
                  <CheckCircle2 className="mx-auto size-12" />
                  <h3 className="mt-2 text-lg font-bold">Pronto!</h3>
                  <p className="mt-1 text-sm">
                    Adicionamos <span className="font-bold">{progress.count}</span> promoções
                    {progress.storeName ? <> do <span className="font-bold">{progress.storeName}</span></> : null}.
                  </p>
                </>
              )}
              {progress.status === "failed" && (
                <>
                  <FlyerStatusChip status="failed" className="mx-auto" />
                  <h3 className="mt-2 text-base font-bold">Não foi possível processar</h3>
                  <p className="mt-1 text-xs opacity-90">{progress.error ?? "Tente novamente com outro link/arquivo."}</p>
                </>
              )}
            </Card>
            <div className="flex gap-2">
              {progress.status === "ready" ? (
                <>
                  <Link to="/promocoes" className="flex-1">
                    <Button className="w-full">Ver promoções</Button>
                  </Link>
                  <Button variant="outline" className="flex-1" onClick={() => { setStep(1); setKind(null); setUrl(""); setFile(null); setProgress(null); }}>
                    Cadastrar outro
                  </Button>
                </>
              ) : progress.status === "failed" ? (
                <>
                  <Link to="/promocoes" className="flex-1">
                    <Button variant="outline" className="w-full">Voltar</Button>
                  </Link>
                  <Button className="flex-1" onClick={() => setStep(1)}>Tentar de novo</Button>
                </>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
