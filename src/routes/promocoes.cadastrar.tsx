import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { FlyerSourceCard, type SourceKind } from "@/components/promocoes/FlyerSourceCard";
import {
  ArrowLeft, FileText, ImageIcon, Camera, CheckCircle2, Loader2, Sparkles,
  X, Plus, AlertCircle, CalendarClock,
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

const MAX_FILE_MB = 10;
type Phase = "upload" | "scan" | "extract" | "done";

function CadastrarPanfleto() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [kind, setKind] = useState<SourceKind | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [phase, setPhase] = useState<Phase>("upload");
  const [progress, setProgress] = useState<{ status: string; count: number; storeName?: string; error?: string } | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/auth" });
  }, [user, authLoading, navigate]);

  // Build/cleanup preview URLs
  useEffect(() => {
    if (kind === "upload_pdf") { setPreviews([]); return; }
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files, kind]);

  const sourceCards = [
    {
      kind: "upload_image" as const,
      icon: Camera,
      title: "Tirar foto do panfleto",
      description: "Use a câmera. Pode tirar várias fotos pra panfletos com mais de uma página.",
    },
    {
      kind: "upload_image_gallery" as const,
      icon: ImageIcon,
      title: "Anexar foto da galeria",
      description: "Selecione uma ou mais imagens já salvas no celular ou computador.",
    },
    {
      kind: "upload_pdf" as const,
      icon: FileText,
      title: "Enviar PDF",
      description: "Envie o arquivo PDF do encarte do mercado.",
    },
  ];

  function chooseKind(k: typeof sourceCards[number]["kind"]) {
    // We map both image options to "upload_image" backend; "gallery" only changes input behavior
    if (k === "upload_image_gallery") setKind("upload_image");
    else setKind(k);
    setFiles([]);
    setStep(2);
    // open file picker on next tick
    setTimeout(() => {
      if (k === "upload_image") photoInputRef.current?.click();
      else if (k === "upload_image_gallery") galleryInputRef.current?.click();
      else pdfInputRef.current?.click();
    }, 50);
  }

  function addFiles(list: FileList | null, append: boolean) {
    if (!list || list.length === 0) return;
    const arr = Array.from(list);
    if (kind === "upload_pdf") {
      setFiles(arr.slice(0, 1));
    } else {
      setFiles((prev) => (append ? [...prev, ...arr] : arr));
    }
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  const oversize = files.find((f) => f.size > MAX_FILE_MB * 1024 * 1024);
  const canProceedStep2 = files.length > 0 && !oversize;

  const phasePct = phase === "upload" ? 25 : phase === "scan" ? 55 : phase === "extract" ? 85 : 100;
  const phaseLabel =
    phase === "upload" ? "Enviando arquivos" :
    phase === "scan" ? "Lendo o panfleto" :
    phase === "extract" ? "Identificando produtos" : "Pronto";

  async function handleSubmit() {
    if (!user || files.length === 0) return;
    setSubmitting(true);
    setStep(4);
    setPhase("upload");
    setProgress({ status: "pending", count: 0 });

    try {
      const storagePaths: string[] = [];
      for (const f of files) {
        const ext = f.name.split(".").pop() ?? (kind === "upload_pdf" ? "pdf" : "jpg");
        const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage.from("flyers").upload(path, f, { contentType: f.type });
        if (upErr) throw upErr;
        storagePaths.push(path);
      }

      setPhase("scan");

      const { data: inserted, error: insErr } = await supabase.from("promo_flyers").insert({
        user_id: user.id,
        source_kind: kind!,
        source_url: null,
        storage_path: storagePaths[0],
        storage_paths: storagePaths,
        valid_from: new Date().toISOString(),
        valid_until: null,
        status: "pending",
      }).select("id").single();
      if (insErr || !inserted) throw insErr ?? new Error("erro ao criar panfleto");

      supabase.functions.invoke("extract-flyer", { body: { flyer_id: inserted.id } }).catch(() => {});

      const final = await pollFlyer(inserted.id, (r) => {
        if (r.status === "processing") setPhase("extract");
        setProgress({ status: r.status, count: r.extracted_count, error: r.error_message ?? undefined });
      });

      let storeName: string | undefined;
      if (final.store_id) {
        const { data: s } = await supabase.from("promo_stores").select("name").eq("id", final.store_id).maybeSingle();
        storeName = (s?.name as string | undefined) ?? undefined;
      }
      setPhase("done");
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
      <div className="space-y-5 px-4 py-5">
        <div className="flex items-center gap-2">
          <Link to="/promocoes">
            <Button variant="ghost" size="icon" className="size-9"><ArrowLeft className="size-4" /></Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-base font-bold leading-tight">Cadastrar panfleto</h1>
            <p className="text-xs text-muted-foreground">Passo {Math.min(step, 4)} de 4</p>
          </div>
        </div>

        <div className="flex gap-1.5">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className={`h-1 flex-1 rounded-full ${n <= step ? "bg-primary" : "bg-muted"}`} />
          ))}
        </div>

        {/* hidden inputs */}
        <input
          ref={photoInputRef} type="file" accept="image/*" capture="environment" multiple
          className="hidden" onChange={(e) => { addFiles(e.target.files, false); e.target.value = ""; }}
        />
        <input
          ref={galleryInputRef} type="file" accept="image/*" multiple
          className="hidden" onChange={(e) => { addFiles(e.target.files, false); e.target.value = ""; }}
        />
        <input
          ref={pdfInputRef} type="file" accept="application/pdf"
          className="hidden" onChange={(e) => { addFiles(e.target.files, false); e.target.value = ""; }}
        />

        {/* STEP 1 — choose source */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-base font-semibold">Como você quer enviar?</h2>
              <p className="mt-1 text-xs text-muted-foreground">Escolha a forma mais prática pra você.</p>
            </div>
            <div className="space-y-2.5">
              {sourceCards.map((s) => (
                <FlyerSourceCard
                  key={s.kind}
                  icon={s.icon} title={s.title} description={s.description}
                  selected={false}
                  onClick={() => chooseKind(s.kind)}
                />
              ))}
            </div>
          </div>
        )}

        {/* STEP 2 — review files */}
        {step === 2 && kind && (
          <div className="space-y-4">
            <div>
              <h2 className="text-base font-semibold">
                {kind === "upload_pdf" ? "Confira o PDF" : "Confira as fotos"}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {kind === "upload_pdf"
                  ? `Tamanho máximo ${MAX_FILE_MB} MB.`
                  : "Você pode adicionar mais imagens. A ordem do envio é mantida."}
              </p>
            </div>

            {kind === "upload_pdf" && files[0] && (
              <Card className="flex items-center gap-3 rounded-2xl p-4">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <FileText className="size-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{files[0].name}</p>
                  <p className="text-xs text-muted-foreground">{(files[0].size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => pdfInputRef.current?.click()}>Trocar</Button>
              </Card>
            )}

            {(kind === "upload_image") && files.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {previews.map((src, i) => (
                  <div key={src} className="group relative aspect-square overflow-hidden rounded-xl border bg-muted">
                    <img src={src} alt={`Página ${i + 1}`} className="size-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-background/90 text-foreground shadow"
                      aria-label="Remover"
                    >
                      <X className="size-3.5" />
                    </button>
                    <span className="absolute bottom-1 left-1 rounded-md bg-background/80 px-1.5 py-0.5 text-[10px] font-medium">
                      {i + 1}
                    </span>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    // re-open the same picker the user used (default to gallery if unsure)
                    if (photoInputRef.current && photoInputRef.current.files?.length) photoInputRef.current.click();
                    else galleryInputRef.current?.click();
                  }}
                  className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border text-xs text-muted-foreground hover:border-primary hover:text-primary"
                >
                  <Plus className="size-5" />
                  Adicionar
                </button>
              </div>
            )}

            {oversize && (
              <Card className="flex items-center gap-2 rounded-xl border-destructive/40 bg-destructive/5 p-3 text-destructive">
                <AlertCircle className="size-4 shrink-0" />
                <p className="text-xs">Arquivo "{oversize.name}" excede {MAX_FILE_MB} MB.</p>
              </Card>
            )}

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { setStep(1); setFiles([]); }}>Voltar</Button>
              <Button className="flex-1" disabled={!canProceedStep2} onClick={() => setStep(3)}>Continuar</Button>
            </div>
          </div>
        )}

        {/* STEP 3 — automatic validity */}
        {step === 3 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-base font-semibold">Validade do panfleto</h2>
              <p className="mt-1 text-xs text-muted-foreground">Detectamos automaticamente.</p>
            </div>

            <Card className="rounded-2xl p-4">
              <div className="flex gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <CalendarClock className="size-5" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold">Validade automática</p>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    A IA identifica a validade direto no panfleto. Se não conseguir, consideramos que vale até o fim do dia de hoje (23:59).
                  </p>
                </div>
              </div>
            </Card>

            <Card className="rounded-2xl bg-primary/5 p-4">
              <div className="flex gap-3">
                <Sparkles className="size-4 shrink-0 text-primary" />
                <p className="text-xs leading-relaxed text-foreground">
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

        {/* STEP 4 — processing/result */}
        {step === 4 && progress && (
          <div className="space-y-4">
            <Card className="rounded-2xl border-2 border-primary/30 bg-card p-6 text-center shadow-sm">
              {progress.status !== "ready" && progress.status !== "failed" && (
                <>
                  <Loader2 className="mx-auto size-10 animate-spin text-primary" />
                  <h3 className="mt-3 text-base font-bold text-foreground">Processando panfleto…</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{phaseLabel}</p>
                  <div className="mt-4 space-y-1.5">
                    <Progress value={phasePct} className="h-2" />
                    <p className="text-[10px] text-muted-foreground">{phasePct}%</p>
                  </div>
                </>
              )}
              {progress.status === "ready" && (
                <>
                  <CheckCircle2 className="mx-auto size-12 text-emerald-600" />
                  <h3 className="mt-2 text-lg font-bold text-foreground">Pronto!</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Adicionamos <span className="font-bold text-foreground">{progress.count}</span> promoções
                    {progress.storeName ? <> do <span className="font-bold text-foreground">{progress.storeName}</span></> : null}.
                  </p>
                </>
              )}
              {progress.status === "failed" && (
                <>
                  <AlertCircle className="mx-auto size-10 text-destructive" />
                  <h3 className="mt-2 text-base font-bold text-foreground">Não foi possível processar</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{progress.error ?? "Tente novamente com outro arquivo."}</p>
                </>
              )}
            </Card>
            <div className="flex gap-2">
              {progress.status === "ready" ? (
                <>
                  <Link to="/promocoes" className="flex-1">
                    <Button className="w-full">Ver promoções</Button>
                  </Link>
                  <Button variant="outline" className="flex-1" onClick={() => { setStep(1); setKind(null); setFiles([]); setProgress(null); }}>
                    Cadastrar outro
                  </Button>
                </>
              ) : progress.status === "failed" ? (
                <>
                  <Link to="/promocoes" className="flex-1">
                    <Button variant="outline" className="w-full">Voltar</Button>
                  </Link>
                  <Button className="flex-1" onClick={() => { setStep(1); setKind(null); setFiles([]); setProgress(null); }}>Tentar de novo</Button>
                </>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
