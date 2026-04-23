# API_CONTRACT.md

# API Contract

## Auth

POST /auth/register  
POST /auth/login  
POST /auth/logout

---

## Receipt

POST /receipts/upload

Upload imagem cupom.

GET /receipts

Lista compras.

GET /receipts/{id}

Detalhes compra.

DELETE /receipts/{id}

---

## OCR

POST /ocr/process/{receipt_id}

GET /ocr/status/{job_id}

---

## Dashboard

GET /dashboard/summary

GET /dashboard/monthly

GET /dashboard/top-products

---

## Calendar

GET /calendar/{year}/{month}

GET /calendar/day/{date}

---

## History

GET /history/prices/{product_id}

---

## Insights

GET /insights

POST /insights/recalculate

---

## Notifications

GET /notifications

PATCH /notifications/{id}/read
