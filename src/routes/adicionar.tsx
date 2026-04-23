import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Camera, ImagePlus, Loader2, Sparkles, ArrowLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { CATEGORIES, CATEGORY_LABELS, formatBRL } from "@/lib/format";

export const Route = createFileRoute("/adicionar")({
  head: () => ({
    meta: [
      { title: "Adicionar cupom — CuponizAI" },
      { name: "description", content: "Tire foto do cupom fiscal e deixe a IA extrair os dados." },
    ],
  }),
  component: AddReceiptPage,
});

interface ExtractedItem {
  description: string;
  canonical_name: string;
  category: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}
interface ExtractedData {
  store_name: string;
  store_cnpj?: string;
  purchased_at: string;
  total_amount: number;
  payment_method?: string;
  items: ExtractedItem[];
}

type Stage = "capture" | "processing" | "review";

function AddReceiptPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);

  const [stage, setStage] = useState<Stage>("capture");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<ExtractedData | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/auth" });
  }, [user, authLoading, navigate]);

  function handleFile(file: File) {
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Imagem muito grande. Máximo 8MB.");
      return;
    }
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function handleProcess() {
    if (!imagePreview || !imageFile) return;
    setStage("processing");
    try {
      const { data, error } = await supabase.functions.invoke("extract-receipt", {
        body: { imageBase64: imagePreview },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const ex = data.data as ExtractedData;
      // Provide safe defaults for editing
      setExtracted({
        store_name: ex.store_name ?? "",
        store_cnpj: ex.store_cnpj ?? "",
        purchased_at: ex.purchased_at ?? new Date().toISOString(),
        total_amount: Number(ex.total_amount ?? 0),
        payment_method: ex.payment_method ?? "",
        items: (ex.items ?? []).map((i) => ({
          description: i.description ?? "",
          canonical_name: i.canonical_name ?? i.description ?? "",
          category: CATEGORIES.includes(i.category) ? i.category : "outros",
          quantity: Number(i.quantity ?? 1),
          unit_price: Number(i.unit_price ?? 0),
          total_price: Number(i.total_price ?? 0),
        })),
      });
      setStage("review");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao processar";
      toast.error(msg);
      setStage("capture");
    }
  }

  function reset() {
    setImageFile(null);
    setImagePreview(null);
    setExtracted(null);
    setStage("capture");
  }

  async function handleSave() {
    if (!extracted || !user || !imageFile) return;
    setSaving(true);
    try {
      // 1. Upload image
      const ext = imageFile.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("receipts").upload(path, imageFile, {
        contentType: imageFile.type,
        upsert: false,
      });
      if (upErr) throw upErr;

      // 2. Upsert store
      let storeId: string | null = null;
      const { data: existingStore } = await supabase
        .from("stores")
        .select("id")
        .eq("name", extracted.store_name)
        .maybeSingle();
      if (existingStore) {
        storeId = existingStore.id;
      } else {
        const { data: newStore } = await supabase
          .from("stores")
          .insert({ user_id: user.id, name: extracted.store_name, cnpj: extracted.store_cnpj || null })
          .select("id")
          .single();
        storeId = newStore?.id ?? null;
      }

      // 3. Insert receipt
      const { data: receipt, error: rErr } = await supabase
        .from("receipts")
        .insert({
          user_id: user.id,
          store_id: storeId,
          store_name: extracted.store_name,
          store_cnpj: extracted.store_cnpj || null,
          purchased_at: extracted.purchased_at,
          total_amount: extracted.total_amount,
          payment_method: extracted.payment_method || null,
          image_path: path,
          raw_extraction: JSON.parse(JSON.stringify(extracted)),
        })
        .select("id")
        .single();
      if (rErr) throw rErr;

      // 4. Insert items + upsert products
      const itemsRows = await Promise.all(
        extracted.items.map(async (it) => {
          let productId: string | null = null;
          const name = it.canonical_name || it.description;
          const cat = it.category as "alimentos" | "bebidas" | "limpeza" | "higiene" | "padaria" | "hortifruti" | "carnes" | "laticinios" | "outros";
          const { data: existingProd } = await supabase
            .from("products")
            .select("id")
            .eq("canonical_name", name)
            .maybeSingle();
          if (existingProd) {
            productId = existingProd.id;
          } else {
            const { data: newProd } = await supabase
              .from("products")
              .insert({ user_id: user.id, canonical_name: name, category: cat })
              .select("id")
              .single();
            productId = newProd?.id ?? null;
          }
          return {
            receipt_id: receipt.id,
            user_id: user.id,
            product_id: productId,
            description: it.description,
            canonical_name: name,
            category: cat,
            quantity: it.quantity,
            unit_price: it.unit_price,
            total_price: it.total_price,
          };
        }),
      );
      if (itemsRows.length > 0) {
        const { error: iErr } = await supabase.from("receipt_items").insert(itemsRows);
        if (iErr) throw iErr;
      }

      toast.success("Cupom salvo com sucesso!");

      // Após o primeiro cupom, dispara onboarding (se ainda não completou)
      const { data: prof } = await supabase
        .from("household_profile")
        .select("onboarding_completed_at")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!prof?.onboarding_completed_at) {
        navigate({ to: "/onboarding" });
      } else {
        navigate({ to: "/cupons/$id", params: { id: receipt.id } });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao salvar";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  function updateItem(idx: number, patch: Partial<ExtractedItem>) {
    if (!extracted) return;
    const items = [...extracted.items];
    items[idx] = { ...items[idx], ...patch };
    setExtracted({ ...extracted, items });
  }
  function removeItem(idx: number) {
    if (!extracted) return;
    setExtracted({ ...extracted, items: extracted.items.filter((_, i) => i !== idx) });
  }

  return (
    <AppLayout>
      <header className="flex items-center gap-3 px-4 pt-6 pb-3">
        <Link to="/">
          <Button variant="ghost" size="icon"><ArrowLeft className="size-5" /></Button>
        </Link>
        <h1 className="text-lg font-bold">
          {stage === "capture" ? "Adicionar cupom" : stage === "processing" ? "Processando..." : "Revisar dados"}
        </h1>
      </header>

      {stage === "capture" && (
        <div className="space-y-4 px-4 pb-6">
          {imagePreview ? (
            <Card className="overflow-hidden shadow-card">
              <img src={imagePreview} alt="Pré-visualização" className="max-h-96 w-full object-contain bg-muted" />
              <div className="flex gap-2 p-3">
                <Button variant="outline" className="flex-1" onClick={reset}>Trocar foto</Button>
                <Button className="flex-1 bg-gradient-primary" onClick={handleProcess}>
                  <Sparkles className="size-4" /> Ler com IA
                </Button>
              </div>
            </Card>
          ) : (
            <>
              <Card className="p-5 text-center shadow-card">
                <h2 className="text-base font-semibold">Fotografe seu cupom</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Em superfície plana, com boa iluminação e sem reflexos para melhor leitura.
                </p>
              </Card>
              <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
              <input ref={galleryInput} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
              <Button onClick={() => cameraInput.current?.click()} className="h-16 w-full bg-gradient-primary text-base">
                <Camera className="size-6" /> Abrir câmera
              </Button>
              <Button onClick={() => galleryInput.current?.click()} variant="outline" className="h-14 w-full">
                <ImagePlus className="size-5" /> Escolher da galeria
              </Button>
            </>
          )}
        </div>
      )}

      {stage === "processing" && (
        <div className="px-4 pb-6">
          <Card className="flex flex-col items-center gap-4 p-10 text-center shadow-card">
            <div className="relative">
              <div className="absolute inset-0 animate-ping rounded-full bg-primary/30" />
              <div className="relative flex size-16 items-center justify-center rounded-full bg-gradient-primary text-primary-foreground">
                <Sparkles className="size-7" />
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Lendo cupom… extraindo itens…
            </div>
            <p className="text-xs text-muted-foreground">Isso pode levar alguns segundos.</p>
          </Card>
        </div>
      )}

      {stage === "review" && extracted && (
        <div className="space-y-4 px-4 pb-8">
          <Card className="space-y-3 p-5 shadow-card">
            <h2 className="text-sm font-semibold">Estabelecimento</h2>
            <div className="space-y-2">
              <Label htmlFor="store">Nome</Label>
              <Input id="store" value={extracted.store_name} onChange={(e) => setExtracted({ ...extracted, store_name: e.target.value })} maxLength={120} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label htmlFor="cnpj">CNPJ</Label>
                <Input id="cnpj" value={extracted.store_cnpj ?? ""} onChange={(e) => setExtracted({ ...extracted, store_cnpj: e.target.value })} maxLength={20} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pay">Pagamento</Label>
                <Input id="pay" value={extracted.payment_method ?? ""} onChange={(e) => setExtracted({ ...extracted, payment_method: e.target.value })} maxLength={40} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label htmlFor="date">Data</Label>
                <Input
                  id="date"
                  type="datetime-local"
                  value={extracted.purchased_at.slice(0, 16)}
                  onChange={(e) => setExtracted({ ...extracted, purchased_at: new Date(e.target.value).toISOString() })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="total">Total (R$)</Label>
                <Input id="total" type="number" step="0.01" min="0" value={extracted.total_amount} onChange={(e) => setExtracted({ ...extracted, total_amount: Number(e.target.value) })} />
              </div>
            </div>
          </Card>

          <Card className="p-5 shadow-card">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Itens ({extracted.items.length})</h2>
              <p className="text-xs text-muted-foreground">Edite o que precisar</p>
            </div>
            <div className="space-y-4">
              {extracted.items.map((it, idx) => (
                <div key={idx} className="space-y-2 rounded-lg border border-border p-3">
                  <div className="flex items-start gap-2">
                    <Input value={it.canonical_name} onChange={(e) => updateItem(idx, { canonical_name: e.target.value })} className="flex-1" maxLength={120} />
                    <Button variant="ghost" size="icon" onClick={() => removeItem(idx)}>
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-xs">Qtd</Label>
                      <Input type="number" step="0.001" min="0" value={it.quantity} onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })} />
                    </div>
                    <div>
                      <Label className="text-xs">Unit.</Label>
                      <Input type="number" step="0.01" min="0" value={it.unit_price} onChange={(e) => updateItem(idx, { unit_price: Number(e.target.value) })} />
                    </div>
                    <div>
                      <Label className="text-xs">Total</Label>
                      <Input type="number" step="0.01" min="0" value={it.total_price} onChange={(e) => updateItem(idx, { total_price: Number(e.target.value) })} />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Categoria</Label>
                    <Select value={it.category} onValueChange={(v) => updateItem(idx, { category: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map((c) => (
                          <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-baseline justify-between border-t border-border pt-3">
              <span className="text-sm text-muted-foreground">Soma dos itens</span>
              <span className="text-base font-bold tabular-nums">
                {formatBRL(extracted.items.reduce((s, i) => s + Number(i.total_price), 0))}
              </span>
            </div>
          </Card>

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={reset} disabled={saving}>Cancelar</Button>
            <Button className="flex-1 bg-gradient-primary" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : "Salvar cupom"}
            </Button>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
