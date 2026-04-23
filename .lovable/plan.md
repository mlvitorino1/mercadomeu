

## Módulo Promoções Inteligentes

Construir um módulo completo dentro do CuponizAI que ajuda o usuário a economizar cruzando promoções de mercados com seu histórico de compras, preferências e localização.

### Arquitetura em uma frase
Banco no Lovable Cloud guarda mercados, produtos, promoções e watchlist; um job diário (pg_cron + rota `/api/public/hooks/promotions-*`) atualiza ranking, expira ofertas e gera alertas; o front consome via Supabase JS com RLS por usuário; o ranking é calculado como score determinístico no cliente sobre dados pré-filtrados.

### 1. Banco de dados (nova migração)

Tabelas novas (todas com `id uuid`, `created_at`, `updated_at` quando faz sentido):

- `cities` — `name`, `state`, `lat`, `lng` (públicas, leitura por todos autenticados).
- `promo_stores` — mercado da rede de promoções: `name`, `chain`, `logo_emoji`, `brand_color`, `city_id`, `address`, `lat`, `lng`. Público.
- `promo_categories` — `slug`, `name`, `icon` (lucide name). Público.
- `promo_products` — catálogo público: `name`, `brand`, `category_id`, `unit` (kg/un/L), `image_emoji`. Público.
- `promo_product_aliases` — `product_id`, `alias` (para casar com `receipt_items.canonical_name`). Público.
- `promotions` — `product_id`, `store_id`, `price`, `original_price`, `discount_pct` (gerada), `starts_at`, `ends_at`, `stock_level` ('alto'|'médio'|'baixo'), `source` ('manual'|'scraper'|'parceiro'), `status` ('ativa'|'expirada'|'pausada'). Índices em `(store_id, ends_at)`, `(product_id, ends_at)`, `(status, ends_at)`. Público read.
- `promo_price_history` — `product_id`, `store_id`, `price`, `observed_at`. Público read.
- `user_watchlist` — `user_id`, `product_id`, `target_price` (opcional), `created_at`. RLS own.
- `user_promotion_events` — `user_id`, `promotion_id`, `event` ('view'|'click'|'dismiss'|'save'), `created_at`. RLS own. Usado no score.
- `promo_notifications` — `user_id`, `kind` ('price_drop'|'ending_today'|'favorite_on_sale'|'basket_match'), `title`, `body`, `promotion_id`, `read_at`. RLS own.
- `user_location` — `user_id`, `city_id`, `lat`, `lng`, `radius_km` (default 5). RLS own.

RLS pública (read-only) para `cities`, `promo_stores`, `promo_categories`, `promo_products`, `promo_product_aliases`, `promotions`, `promo_price_history` via policy `USING (true)` para `authenticated`. Sem insert/update/delete pelo client.

### 2. Lógica de recomendação (client-side, determinística)

```text
score(promo, user) =
  0.30 * frequencia_compra(product, user)        // nº compras nos últimos 90d, normalizado 0–1
+ 0.25 * desconto_pct / 100
+ 0.15 * proximidade(store, user)                // 1 - dist/raio, clamp 0–1
+ 0.10 * marca_preferida(product, household)     // 1 se brand ∈ favorite_brands
+ 0.10 * urgencia(ends_at)                       // 1 se acaba hoje, 0.5 amanhã, …
+ 0.10 * historico_click(promo, user)            // CTR normalizado
```
Distância calculada por Haversine. Resultado ordenado e cacheado em `localStorage` por 10 min com hash dos inputs (mesmo padrão do `insights-cache`).

### 3. Telas (rotas TanStack)

Adicionar item "Ofertas" no `AppLayout` (substitui ícone Calendário por dropdown? Não — manter 5 itens, trocar `Produtos` para `Ofertas` no nav inferior, manter `/produtos` acessível via Cupons). Decisão: adicionar 6º slot não cabe em mobile-first; vou trocar **Calendário** por **Ofertas** no nav e mover Calendário para link interno na Home. *Ajuste:* manter o nav atual e adicionar **/promocoes** como hub acessível por um card de destaque na Home + deep links.

Rotas criadas em `src/routes/`:

- `promocoes.index.tsx` — **Home Promoções**: hero "Você pode economizar R$ X hoje", carrossel "Perto de você", grid "Recomendadas pra você", seção "Seus produtos em oferta", banner de mercados parceiros (chips clicáveis).
- `promocoes.explorar.tsx` — **Explorar** com filtros (Sheet lateral): mercado (multi), categoria (chips), faixa de preço (slider), distância (slider km), validade (hoje/semana/mês), desconto mínimo (slider). Lista virtual de cards.
- `promocoes.cesta.tsx` — **Comparador de Cesta**: usuário adiciona produtos (autocomplete sobre `promo_products`), define quantidade, sistema soma o melhor preço de cada produto por mercado e mostra ranking "Mercado A R$ X · economiza R$ Y vs pior opção". Mostra também "cesta dividida" (quais itens comprar em cada mercado).
- `promocoes.alertas.tsx` — **Alertas** com tabs "Não lidos / Todos". Cada item tem CTA "Ver oferta".
- `promocoes.favoritos.tsx` — **Favoritos**: produtos da watchlist com mini sparkline de preço (recharts) e badge "em oferta agora".
- `promocoes.mercado.$id.tsx` — **Mercado detalhe**: header com logo/cor da rede, mapa simples (link Google Maps), grid de promoções daquele mercado agrupadas por categoria.
- `promocoes.produto.$id.tsx` — **Produto detalhe**: histórico de preço (LineChart), ofertas atuais por mercado, botão "Adicionar à watchlist".

Componentes em `src/components/promocoes/`: `PromoCard`, `StoreChip`, `DiscountBadge`, `EconomyMeter`, `PriceSparkline`, `FilterSheet`, `BasketBuilder`.

### 4. Automações (pg_cron + rotas públicas)

Quatro rotas em `src/routes/api/public/hooks/`:

- `promotions-load.ts` — POST: insere promoções demo "rotativas" (simula scraping). Roda 06:00.
- `promotions-rank.ts` — POST: recalcula `discount_pct`, marca top 100 do dia em `promotions.is_featured`. Roda 06:30.
- `promotions-alerts.ts` — POST: para cada `user_watchlist`, se há promoção ativa hoje insere `promo_notifications` (kind='favorite_on_sale' ou 'price_drop' se `price < min(price_history.price)`). Roda 07:00.
- `promotions-cleanup.ts` — POST: `UPDATE promotions SET status='expirada' WHERE ends_at < now()`. Roda 08:00.

Todas validam header `Authorization: Bearer <anon-key>`. SQL de `cron.schedule` aplicado via insert tool (não migração).

### 5. Dados demo (seed via insert tool)

- 1 cidade: São Carlos/SP (lat -22.0175, lng -47.8908) + 4 cidades vizinhas.
- 5 mercados: Savegnago, Covabra, Pague Menos, Dalben, Enxuto — cada um com cor de marca, emoji, lat/lng dentro de 10km.
- 10 categorias: Alimentos, Bebidas, Hortifruti, Carnes, Laticínios, Padaria, Limpeza, Higiene, Pet, Bebê.
- 50 produtos com brand, unit, emoji.
- ~150 aliases para casar com `receipt_items` existentes.
- 100 promoções ativas (prazos próximos), distribuídas pelos 5 mercados, descontos 10–55%.
- 12 meses de `promo_price_history` (3–5 pontos por produto/mercado) para gerar sparklines críveis.

### 6. UX / visual

- Paleta atual (verde primary) + acento laranja `--promo-hot` para badges de desconto.
- Cards: `rounded-2xl`, sombra suave, header colorido com a cor da rede, ribbon diagonal "−35%" quando desconto ≥ 30%.
- "Economia estimada hoje" como hero com número grande animado (count-up).
- Distância em badge `📍 1.2km`, validade em badge `⏱ acaba em 4h` (vermelho se < 6h).
- Empty states ilustrados com lucide + copy curta. Skeletons em todos os fetches.
- Mobile-first 100% (max-w-md como o resto do app).

### 7. Integração com o app existente

- Card novo na `/home` ("Ofertas pra você · economize R$ X") linkando para `/promocoes`.
- Botão "Adicionar à lista" em `/promocoes/produto/$id` empurra item na shopping list de `/lista` (reusa `localStorage` key `cuponizei:shopping-list`).
- Onboarding: `favorite_brands` e `favorite_stores` do `household_profile` já alimentam o score sem mudanças.
- Receipts existentes alimentam `frequencia_compra` via join `receipt_items.canonical_name = promo_product_aliases.alias`.

### Diagrama de dependências

```text
receipts ─┐
           ├─► frequencia(produto)
items   ──┘                       \
                                    ─► score ─► ranking ─► PromoCard
promotions ─► discount, urgência   /
user_location ─► distância        /
watchlist ─► favorito boost      /
events ─► CTR boost            /
```

### Detalhes técnicos / arquivos

- **Migração SQL**: `supabase/migrations/<timestamp>_promocoes.sql` — cria 11 tabelas + RLS + índices + trigger `set_updated_at` em `promotions`.
- **Seed**: rodado via tool de insert (uma vez), idempotente por `ON CONFLICT DO NOTHING`.
- **Rotas API**: 4 arquivos em `src/routes/api/public/hooks/promotions-*.ts` com `createFileRoute` + Bearer check.
- **Cron**: 4 `cron.schedule` apontando para `https://project--cc7ea5a4-6306-4151-8435-175b40b88518.lovable.app/api/public/hooks/promotions-*`.
- **Front**: 7 rotas + 7 componentes em `src/components/promocoes/`.
- **Lib**: `src/lib/promo-score.ts` (haversine + score), `src/lib/promo-cache.ts` (cache local 10 min).
- **Nav**: card de entrada na Home + link no header de cada subseção (breadcrumb leve).
- **Tipos**: `src/integrations/supabase/types.ts` regenerado automaticamente após migração.

### Fora de escopo (deixado pronto para evoluir)

- Scraper real de encartes (a infraestrutura de `promotions.source` e os cron jobs já preveem o plug).
- Geolocalização do navegador (campo manual de cidade no MVP; `navigator.geolocation` fica como TODO no `/promocoes/explorar`).
- Push notifications (apenas in-app via `promo_notifications` + badge no nav).

