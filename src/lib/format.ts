export const formatBRL = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);

export const formatDate = (d: string | Date) => {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
};

export const formatDateTime = (d: string | Date) => {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

export const CATEGORY_LABELS: Record<string, string> = {
  alimentos: "Alimentos",
  bebidas: "Bebidas",
  limpeza: "Limpeza",
  higiene: "Higiene",
  padaria: "Padaria",
  hortifruti: "Hortifrúti",
  carnes: "Carnes",
  laticinios: "Laticínios",
  outros: "Outros",
};

export const CATEGORIES = Object.keys(CATEGORY_LABELS);
