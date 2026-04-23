

## Promoções Inteligentes 2.0 — Cadastro de panfletos por link/upload

### Objetivo
Substituir o seed estático por um fluxo onde o usuário cadastra panfletos dos seus mercados favoritos (link HTML, link de PDF/imagem, upload de PDF, upload de foto). A IA extrai os produtos, normaliza e injeta em `promotions` privadas (RLS por usuário). Refazer a UI da Home (botão Promoções) e da página `/promocoes`. Trocar Calendário por Ofertas no nav inferior.

---

### 1. Banco de dados (nova migração)

**Nova tabela `promo_flyers`** — cada panfleto cadastrado:
- `id`, `user_id` (RLS own), `store_id` (nullable — IA detecta), `store_name_guess` (texto livre quando IA não identifica), `source_kind` ('html_url'|'file_url'|'upload_pdf'|'upload_image'), `source_url`, `storage_path` (bucket `flyers`), `status` ('pending'|'processing'|'ready'|'failed'), `error_message`, `valid_from`, `valid_until`, `extracted_count`, `raw_extraction` jsonb, `created_at`, `processed_at`.
- Índice em `(user_id, status)`.

**Alterações em `promotions`**:
- Adicionar `user_id uuid NULL` (NULL = catálogo público demo; preenchido = privada do usuário).
- Adicionar `flyer_id uuid NULL` (FK lógica com `promo_flyers.id`).
- Atualizar policy `promotions: public read` para `USING (user_id IS NULL OR user_id = auth.uid())`.

**Alterações em `promo_stores`**:
- Adicionar `user_id uuid NULL` (NULL = público; preenchido = mercado criado por um usuário).
- Adicionar policy de insert própria: `WITH CHECK (auth.uid() = user_id)`.
- Atualizar policy de read: `USING (user_id IS NULL OR user_id = auth.uid())`.

**Bucket de storage `flyers`** (privado) com policies: select/insert/delete próprios via prefixo `{user_id}/...`.

### 2. Edge function `extract-flyer`

Nova função em `supabase/functions/extract-flyer/index.ts`. Recebe `{ flyer_id }`. Fluxo:

1. Carrega `promo_flyers` (validação user). Marca `status='processing'`.
2. **Coleta da fonte** conforme `source_kind`:
   - `html_url`: usa **Firecrawl** connector (`scrape` formato `markdown` + `links` + `screenshot`) para baixar o conteúdo do site.
   - `file_url`: `fetch()` direto do PDF/imagem.
   - `upload_pdf`/`upload_image`: lê do bucket `flyers` via service role.
3. **Detecção de mercado**: chama Lovable AI Gateway (`gemini-2.5-flash`) com tool `detect_store` recebendo URL/título/markdown → retorna `{chain, name, brand_color, logo_emoji}`. Faz upsert em `promo_stores` (user_id do dono) ou casa com público existente por `chain` (case-insensitive).
4. **Extração de produtos**: chama Lovable AI Gateway com tool `extract_flyer_items` (multimodal — manda imagens do PDF/site, ou texto do markdown). Schema: `[{ product_name, brand, category_slug, unit, price, original_price, ends_at }]`. Reusa o mesmo prompt-style do `extract-receipt` (PT-BR, normaliza nomes, categoriza em uma das 10 categorias existentes).
5. **Normalização**: para cada item, faz upsert em `promo_products` (matching por nome+brand existente; senão cria com `user_id` próprio) e cria `promotions` com `user_id`, `flyer_id`, `store_id` calculados. Calcula `discount_pct`. Aliases automáticos: insere `promo_product_aliases` com variações comuns.
6. Marca `status='ready'`, preenche `extracted_count`, `valid_until`. Em erro: `status='failed'` + `error_message`.

Limites: PDF ≤ 10MB, máximo 3 panfletos processando simultâneos por usuário (verificação por count).

### 3. Frontend — onboarding de panfleto

Novo componente fluxo passo-a-passo em `src/routes/promocoes.cadastrar.tsx` (modal-like fullscreen, 4 passos):

1. **Tipo de fonte**: 4 cards grandes (Link do site / Link PDF ou imagem / Upload PDF / Upload foto). Cada card com instrução visual de "como encontrar" (acordeão expansível com print mockado e dicas: "Vá no site do mercado → menu Encartes → copie o link da página").
2. **Coleta**: dependendo da escolha — input de URL com validador zod, ou dropzone (react-dropzone? não — usar `<input type="file" accept>` simples) para PDF/imagem. Preview do que foi enviado.
3. **Validade do panfleto** (opcional): `valid_from` e `valid_until` com defaults sensatos (hoje + 7 dias). IA tenta inferir e sobrescreve depois.
4. **Processando**: cria registro `promo_flyers`, faz upload se necessário, invoca `extract-flyer` (não bloqueante — mostra progresso em tempo real via polling do status a cada 2s). Ao ficar `ready`, mostra resumo "Adicionamos X promoções do {mercado}" + CTA "Ver promoções".

### 4. Página `/promocoes` — UX refeita

**Header novo** (no lugar do hero atual):
- Saudação compacta + saldo de economia do dia.
- Linha de **chips de panfletos ativos** do usuário com status (badge colorido: ✅ ready / ⏳ processing / ⚠️ failed) e ação "+" para cadastrar novo.
- Empty state forte quando o usuário ainda não cadastrou nenhum: ilustração + CTA "Cadastrar meu primeiro panfleto".

**Seções reorganizadas (em ordem de utilidade)**:
1. **Suas promoções ativas** (filtradas por panfletos do user) — destaque grande.
2. **Acabando hoje** (urgência, badge laranja `⏱`).
3. **Recomendadas** (mantém score atual, mas só sobre catálogo do user + público demo).
4. **Mercados parceiros** (chips horizontais, agora também mostram mercados que o user cadastrou via panfleto).
5. **Histórico de panfletos** (lista de todos os `promo_flyers` do user com data, mercado, # produtos, ação reprocessar/excluir).

**Componentes novos** em `src/components/promocoes/`:
- `FlyerSourceCard` — card do passo 1.
- `FlyerStatusChip` — badge de status (pending/processing/ready/failed).
- `FlyerHistoryItem` — linha do histórico.
- `EmptyPromocoes` — empty state ilustrado.

### 5. Home — botão refeito

Substituir o `Card` linear de "Promoções inteligentes" (linhas 414-427 de `home.tsx`) por um **bloco hero com 2 ações claras**:
```
[ 🏷️  Promoções inteligentes ]
   ── 12 ofertas ativas · economiza ~R$ 47
[ Cadastrar panfleto ]  [ Ver ofertas → ]
```
Visual: gradient promo, dois botões secundários lado a lado, mostra contador real de promoções do user. Clicar "Cadastrar panfleto" leva para `/promocoes/cadastrar`; "Ver ofertas" leva para `/promocoes`.

### 6. Navegação inferior

Em `src/components/AppLayout.tsx`: trocar item "Calendário" (`/calendario`) por "Ofertas" (`/promocoes`) com ícone `Tag`. Calendário continua acessível via card na Home (já existe ShortcutCard).

### 7. Integração Firecrawl

Conectar via `standard_connectors--connect` com `connector_id: firecrawl`. Após conectado, a edge function `extract-flyer` usa `FIRECRAWL_API_KEY` direto (SDK `@mendable/firecrawl-js` não roda em Deno → usar fetch REST `https://api.firecrawl.dev/v2/scrape`).

---

### Diagrama do fluxo

```text
Home → "Cadastrar panfleto"
  ↓
/promocoes/cadastrar → escolhe fonte + envia
  ↓
INSERT promo_flyers (status=pending) + upload (se arquivo)
  ↓
invoke extract-flyer(flyer_id)
  ↓
[Firecrawl scrape] OU [fetch direto] OU [storage download]
  ↓
Lovable AI: detect_store + extract_flyer_items
  ↓
upsert promo_stores → upsert promo_products → INSERT promotions (user_id, flyer_id)
  ↓
status=ready → /promocoes mostra ofertas novas
```

### Detalhes técnicos / arquivos

- **Migração**: `supabase/migrations/<ts>_flyers.sql` — tabela `promo_flyers`, alters em `promotions`/`promo_stores`, bucket `flyers` + policies.
- **Edge function**: `supabase/functions/extract-flyer/index.ts` (nova) + entry no `supabase/config.toml` se necessário.
- **Conector**: Firecrawl via `standard_connectors--connect` antes de deploy (eu peço a conexão).
- **Routes novas**: `src/routes/promocoes.cadastrar.tsx`.
- **Routes editadas**: `src/routes/promocoes.index.tsx` (UX refeita), `src/routes/home.tsx` (botão refeito), `src/components/AppLayout.tsx` (nav).
- **Componentes novos**: 4 arquivos em `src/components/promocoes/`.
- **Lib**: `src/lib/promo-data.ts` ganha filtro por `user_id IS NULL OR user_id = me`. `src/lib/flyer-poll.ts` (polling helper).
- **Tipos**: `src/integrations/supabase/types.ts` regenerado automaticamente.
- **Validação client**: zod schemas para URL e tamanho de arquivo.
- **Segurança**: RLS em `promo_flyers`, bucket privado, edge function valida `user_id` da row, prompt da IA com `temperature: 0` e `seed: 42` (consistência igual aos outros caches).

### Fora de escopo
- Compartilhar panfleto entre usuários (visibilidade pública opt-in fica como TODO).
- Re-processamento agendado quando panfleto vence (o cron `promotions-cleanup` já expira automaticamente; refresh manual via botão "Reprocessar" no histórico).
- OCR offline — sempre usa Lovable AI multimodal.

