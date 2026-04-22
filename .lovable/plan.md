
# 📸 Cuponizei — App Web de Leitura de Cupom Fiscal com IA

Web app responsivo (mobile-first, instalável) que transforma fotos de cupons fiscais brasileiros em dados estruturados e insights de consumo, usando IA para OCR e estruturação.

## 🎯 Escopo do MVP (v1)

Foco no núcleo: **foto → IA extrai → salva → visualiza**. Recursos avançados (calendário rico, previsão de gastos, alertas) ficam em fases seguintes.

## 🔑 Funcionalidades

### 1. Autenticação
- Cadastro e login por **e-mail + senha**
- Cada usuário só vê seus próprios cupons (RLS no banco)

### 2. Captura do Cupom
- Botão grande "Adicionar cupom" que abre a câmera do celular (ou seleciona da galeria/upload no desktop)
- Pré-visualização da foto antes de enviar
- Feedback visual durante o processamento (ex: "Lendo cupom… extraindo itens…")

### 3. Extração via IA (Lovable AI)
Imagem é enviada ao backend, processada por modelo multimodal (Gemini 2.5 Flash via Lovable AI Gateway) com prompt especializado em cupons brasileiros (NFC-e/SAT/cupom não-fiscal). Extrai:
- Estabelecimento (nome + CNPJ se visível)
- Data e horário
- Itens: descrição, quantidade, preço unitário, preço total
- Valor total da compra
- Forma de pagamento
- Tratamento de erros de OCR (campos opcionais quando ilegíveis)

Após extração, IA também:
- **Normaliza nome do produto** (ex: "COCA 2L" → "Coca-Cola 2L")
- **Categoriza** (Alimentos, Bebidas, Limpeza, Higiene, Padaria, Outros)
- **Padroniza estabelecimento** (mesma loja não duplica)

### 4. Tela de Revisão
Antes de salvar, o usuário vê os dados extraídos em formulário editável e pode corrigir qualquer campo. Isso treina confiança no produto e cobre falhas de OCR.

### 5. Lista de Cupons
- Lista cronológica de todas as compras
- Cada item: data, estabelecimento, total, nº de itens
- Toque abre detalhes com lista completa de produtos e valores

### 6. Dashboard (Home)
Cards com insights básicos do mês atual:
- 💰 **Total gasto no mês**
- 🏪 **Estabelecimento mais frequente**
- 🛒 **Produto mais comprado**
- 📈 **Comparação com o mês anterior** (variação %)
- 🥇 **Produto mais caro / mais barato** comprado no período
- Gráfico simples de gastos por categoria (pizza ou barras)

### 7. Navegação
Bottom nav mobile com 3 abas: **Início (Dashboard)** · **Cupons** · **Adicionar (CTA central)**.

## 🗄️ Modelagem de Dados

- `profiles` — dados do usuário (FK auth.users)
- `stores` — estabelecimentos normalizados (nome, cnpj)
- `receipts` — cupom: usuário, loja, data, total, forma de pagamento, URL da imagem
- `products` — catálogo normalizado (nome canônico, categoria)
- `receipt_items` — itens do cupom: receipt_id, product_id, quantidade, preço unitário, preço total
- `user_roles` — tabela separada para roles (segurança)

Tudo com **RLS** ativo: cada usuário lê/escreve apenas seus próprios dados.

## 🏗️ Arquitetura Técnica

- **Frontend**: TanStack Start + React + Tailwind, mobile-first, design system com tokens semânticos
- **Backend**: Server functions do TanStack Start (sem edge functions externas)
- **IA**: Lovable AI Gateway com `google/gemini-2.5-flash` (multimodal — lê imagem + extrai JSON estruturado via tool calling)
- **Banco + Auth + Storage**: Lovable Cloud (Supabase) — imagens dos cupons em Storage privado por usuário
- **Idioma**: 100% PT-BR, valores em R$, datas no formato brasileiro

## 🎨 Design

- Visual moderno, leve, mobile-first (a maioria vai usar no celular)
- Paleta: verde/azul transmitindo "finanças saudáveis"
- Cards arredondados, microinterações suaves, feedback claro durante processamento da IA
- Estado vazio amigável ("Tire a foto do seu primeiro cupom!")

## 🚀 Roadmap pós-MVP (não entra agora, mas planejado)

- **Fase 2**: Calendário com indicadores (1, 2, 3, 4, 5+) por dia, leitura de QR Code do NFC-e
- **Fase 3**: Histórico de preços por produto, comparação entre mercados, alertas de aumento
- **Fase 4**: Previsão de gastos (IA), sugestões de economia, gamificação
- **Fase 5**: Plano premium (insights avançados), exportação CSV/PDF, instalação como PWA real
