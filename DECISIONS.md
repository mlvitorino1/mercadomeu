# DECISIONS.md

# Log de Decisões Técnicas

## 001 - Tesseract OCR

Escolhido por:

- Open source
- Custo zero inicial
- Boa comunidade

---

## 002 - Monólito Modular

Escolhido por:

- Velocidade MVP
- Menor complexidade
- Fácil evoluir

---

## 003 - Fila Assíncrona

OCR pode ser pesado.

Necessário desacoplar request principal.

---

## 004 - Supabase Futuro

Escolhido para escalar rapidamente com PostgreSQL + Auth + Storage.
