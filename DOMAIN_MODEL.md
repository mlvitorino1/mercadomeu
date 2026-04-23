# DOMAIN_MODEL.md

# Modelo de Domínio

## User

- id
- name
- email
- plan
- created_at

---

## Receipt

- id
- user_id
- store_id
- total_amount
- payment_method
- purchased_at
- raw_text

---

## Store

- id
- canonical_name
- cnpj
- city
- state

---

## Product

- id
- canonical_name
- category
- brand

---

## PurchaseItem

- id
- receipt_id
- product_id
- quantity
- unit_price
- total_price

---

## PriceHistory

- id
- product_id
- store_id
- price
- observed_at

---

## OCRJob

- id
- user_id
- receipt_id
- status
- started_at
- finished_at
- confidence

---

## Insight

- id
- user_id
- type
- payload
- generated_at

---

## Notification

- id
- user_id
- type
- title
- body
- read_at

---

## Relacionamentos

User 1:N Receipt  
Receipt 1:N PurchaseItem  
Store 1:N Receipt  
Product 1:N PurchaseItem  
Product 1:N PriceHistory
