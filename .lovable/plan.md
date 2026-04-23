

## Aprimoramento de /promocoes/cadastrar e /promocoes

### Página `/promocoes/cadastrar`

**Passo 1 — Tipo de fonte (3 opções)**
Substituir as 4 opções por exatamente 3 cards:
1. **Tirar foto do panfleto** — abre câmera nativa (`<input type="file" accept="image/*" capture="environment" multiple>`). Suporta múltiplas fotos (panfletos com várias páginas).
2. **Anexar foto da galeria** — `<input type="file" accept="image/*" multiple>` (sem `capture`).
3. **Enviar PDF** — `<input type="file" accept="application/pdf">`.

Estado passa a guardar `File[]` (array). Remover opções `html_url` e `file_url`.

**Passo 2 — UX dos campos**
- Foto/galeria: dropzone grande estilizado com ícone, instrução clara, e **grid de thumbnails** das fotos selecionadas com botão remover (X) em cada miniatura. Botão "Adicionar mais fotos" abaixo.
- PDF: card com ícone do PDF, nome do arquivo, tamanho formatado, botão trocar arquivo. Validação visual (erro vermelho com ícone) se exceder 10MB.
- Tipografia maior, espaçamentos consistentes, hover/focus states.

**Passo 3 — Validade automática**
- Remover o input de data manual.
- Mostrar card informativo: "📅 A validade é detectada automaticamente do panfleto. Se não for possível identificar, consideramos que vale até hoje (23:59)."
- No envio: `valid_until` = `null` no insert (a edge function preenche). Default na edge function muda de `+7 dias` para **fim do dia atual** (`hoje 23:59:59`) quando a IA não retornar `valid_until`.

**Passo 4 — UI do carregamento**
- Trocar `bg-gradient-promo` + `text-primary-foreground` por card com fundo `bg-card` e borda destacada.
- Spinner em `text-primary` (visível), título em `text-foreground`, subtítulo em `text-muted-foreground`.
- Adicionar barra de progresso visual (Progress component) com etapas: "Enviando" → "Lendo panfleto" → "Identificando produtos" → "Pronto".
- Sucesso em verde (`text-emerald-600`), falha em `text-destructive`.

### Edge function `extract-flyer`

- Aceitar `storage_paths: string[]` (múltiplos arquivos) além do legacy `storage_path`.
- Iterar todos os arquivos, gerar data URL de cada um, e enviar **todas as imagens em uma única chamada** ao Gemini (multimodal aceita N imagens).
- Mudar `defaultEnds` para hoje 23:59:59 (em vez de +7 dias) quando IA não retorna validade.

### Schema

- Adicionar coluna `storage_paths text[] DEFAULT '{}'` em `promo_flyers` (mantém `storage_path` para compatibilidade).
- O cliente passa a popular `storage_paths` com array.

### Página `/promocoes`

**1. Chips "Seus panfletos" — adicionar validade**
Em `src/routes/promocoes.index.tsx`, mudar o chip para mostrar `{store_name} até {DD/MM} · {status}`. Carregar `valid_until` no select de `promo_flyers`. Formatar com `format(date, "dd/MM", { locale: ptBR })`.

**2. "Acabando hoje" — só itens de panfleto do usuário**
Substituir filtro:
```ts
ranked.filter((p) => myPromoIds.has(p.id) && endingTodayWindow(p.ends_at))
```
ou seja, só promoções que vieram de panfletos cadastrados pelo user (já presente em `myPromoIds`).

**3. "Recomendadas pra você" — só itens de panfleto**
Mesma lógica — filtrar por `myPromoIds` antes do `slice(0, 8)`. Remove qualquer oferta pública/manual da seção.

**4. Lista "Suas promoções ativas"** — mantém como está (já filtra por `myPromoIds`).

### Arquivos editados

- `src/routes/promocoes.cadastrar.tsx` — refatoração completa dos 4 passos.
- `src/components/promocoes/FlyerSourceCard.tsx` — sem mudança estrutural.
- `src/routes/promocoes.index.tsx` — chip com validade + filtros.
- `supabase/functions/extract-flyer/index.ts` — múltiplas imagens + default ends_at = hoje EOD.
- Migração: `ALTER TABLE promo_flyers ADD COLUMN storage_paths text[] NOT NULL DEFAULT '{}'`.

### Fora de escopo
- OCR offline (continua usando Lovable AI multimodal).
- Drag & drop de arquivos (mantém input nativo).
- Reordenar páginas do panfleto (envia na ordem em que o user selecionou).

