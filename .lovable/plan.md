

## Estabilizar insights da Home e da /lista

**Problema:** Os cards "Previsão para o mês", "Dicas para você economizar" e "Provável baixa de estoque" mudam a cada refresh porque (1) a IA é chamada do zero toda vez, (2) modelos LLM são naturalmente não determinísticos, e (3) nada é persistido — o resultado vive só na memória do componente. A `/lista` herda o mesmo problema e ainda recalcula produtos frequentes com IDs aleatórios.

**Estratégia:** Cachear insights da IA no banco com uma "impressão digital" dos dados de entrada. Mesma entrada → mesmo resultado. Só recalcular quando os dados mudarem ou o usuário pedir explicitamente.

---

### 1. Nova tabela `ai_insights` (cache determinístico)

Campos: `id`, `user_id`, `kind` ('forecast' ou 'stock'), `input_hash` (texto), `payload` (jsonb), `generated_at`, `data_version` (int — incrementa quando recibos/itens mudam).

RLS: own select / insert / update / delete. Índice único em `(user_id, kind)`.

### 2. Edge function `insights-ai` — torná-la mais estável

- Adicionar `temperature: 0` e `seed: 42` na chamada do gateway (reduz variação do LLM).
- Arredondar `forecast_month_total` para múltiplos de R$ 5 e `days_left_estimate` para inteiros no servidor (evita mudanças cosméticas tipo 412,73 → 415,18).
- Manter o schema atual de tools.

### 3. Home (`src/routes/home.tsx`) — cache + separação

**Camada local (sempre estável, instantânea):**
- `forecast_pace` = ritmo do mês × dias do mês (já existe — usar como valor primário do card "Previsão" enquanto IA não responde, e como fallback permanente).
- Produtos frequentes, alertas de aumento de preço, categorias: já são determinísticos, manter.

**Camada IA (cacheada):**
- Ao montar: gerar `input_hash` = hash estável de `{ totalMonth arredondado, monthCount, totalPrev arredondado, top 10 produtos, household }`.
- Buscar `ai_insights` onde `user_id = me AND kind = 'forecast' AND input_hash = hash`. Se existir → usar direto (sem chamar IA). Se não existir → chamar edge function, salvar com upsert no `(user_id, kind)`, exibir.
- Botão discreto "Atualizar análise" no canto do card (ícone refresh) força nova chamada e sobrescreve o cache.
- Exibir timestamp "Atualizado há X" no card para deixar claro que é estável.

**Resultado visível:** abrir/fechar a Home 10× mostra exatamente o mesmo número, as mesmas 3 dicas e os mesmos 3 alertas, até que o usuário adicione um cupom novo (que muda o hash) ou clique em atualizar.

### 4. Lista (`src/routes/lista.tsx`) — refatoração

**Problema atual:** mistura IA + heurística frequente + IDs com `Date.now()+Math.random()`, então a lista "pula" entre gerações.

**Nova arquitetura:**
- IDs determinísticos (`stock-{slug}`, `freq-{slug}`, `manual-{uuid}`) — permite merge estável.
- Reaproveitar o cache de `ai_insights` (kind='stock') em vez de chamar a edge function de novo.
- Algoritmo de merge: ao gerar/atualizar a lista, manter itens já marcados (checked) e quantidades editadas pelo usuário; adicionar novos do estoque/frequentes apenas se ainda não existirem (por slug). Remover só os que sumiram da fonte E não foram editados manualmente.
- Persistência: continuar em `localStorage` (já funciona bem para esse caso de uso pessoal).
- Mostrar uma linha de status: "Última geração: dd/mm hh:mm · X itens da IA, Y manuais".

### 5. Estoque (`src/routes/estoque.tsx`)

- Reutilizar mesmo cache `ai_insights` kind='stock'. Recalcular automaticamente apenas quando o usuário salvar mudança na composição familiar (já é o comportamento desejado).
- Remover o `useEffect` que dispara `generate()` toda vez que `items.length` muda — só gerar se não houver cache válido.

---

### Diagrama de fluxo

```text
adicionar cupom ──► invalidate cache (apaga ai_insights do user)
                           │
abrir Home ────────────────┤
                           ▼
              ┌─ hash(dados) existe em ai_insights? ─┐
              │ sim                                   │ não
              ▼                                       ▼
      mostrar payload salvo              chamar edge fn → salvar → mostrar
              │                                       │
              └──────► card estável ◄─────────────────┘
                           │
              [botão atualizar força nova chamada]
```

### Detalhes técnicos

- **Hash:** SHA-256 de JSON canônico (chaves ordenadas), truncado a 16 chars. Calculado no client com `crypto.subtle.digest`.
- **Invalidação:** trigger SQL em `receipts` e `receipt_items` (AFTER INSERT/UPDATE/DELETE) que faz `DELETE FROM ai_insights WHERE user_id = NEW.user_id` — garante que adicionar/editar cupom invalida sem depender do client.
- **Migração:** criar tabela + RLS + trigger de invalidação + trigger `set_updated_at`.
- **Edge function:** acrescentar `temperature: 0`, `seed: 42` no body do POST ao gateway; arredondar números na resposta antes de devolver.

### Arquivos afetados

- `supabase/migrations/...` (novo) — tabela `ai_insights` + RLS + trigger de invalidação.
- `supabase/functions/insights-ai/index.ts` — temperatura/seed/arredondamento.
- `src/routes/home.tsx` — leitura do cache, hash, botão refresh, timestamp.
- `src/routes/lista.tsx` — IDs determinísticos, merge estável, reuso de cache.
- `src/routes/estoque.tsx` — reuso de cache, recálculo só após salvar família.
- `src/lib/insights-cache.ts` (novo) — helper de hash + get/set do cache.
- `src/integrations/supabase/types.ts` — atualizado automaticamente.

