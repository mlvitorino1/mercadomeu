# ARCHITECTURE.md

# Arquitetura Técnica

## Frontend

Stack:

- Lovable

Responsabilidades:

- UI Mobile
- Captura câmera
- Dashboard
- Calendário
- Histórico
- Login

---

## Backend

Inicial:

- Lovable Backend

Futuro:

- Supabase
- Edge Functions

Responsabilidades:

- Auth
- APIs
- OCR pipeline
- Persistência
- Insights

---

## Banco de Dados

Inicial:

- Lovable DB

Futuro:

- PostgreSQL (Supabase)

---

## OCR / IA

Pipeline:

1. Upload imagem
2. Pré-processamento
3. OCR
4. Parser semântico
5. Estruturação
6. Correção IA
7. Persistência

Tecnologias:

- Tesseract
- OpenCV
- LLM auxiliar

---

## Fluxos Assíncronos

Necessários para:

- OCR pesado
- Insights mensais
- Alertas
- Reprocessamento

Fila futura:

- Queue Worker

---

## Segurança

- JWT Auth
- TLS
- Dados criptografados
- Storage seguro
- LGPD compliance

---

## Escalabilidade

Fase 1:

Monólito modular

Fase 2:

Separação de serviços:

- OCR Service
- Insights Service
- Notification Service

Fase 3:

Alta escala distribuída
