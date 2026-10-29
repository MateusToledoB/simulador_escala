export const moeda = (valor: number) =>
  valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Custo mensal formatado, ou null quando a simulação não teve salário. */
export const custo = (valor: number | null | undefined) => (valor == null ? null : moeda(valor));

/** Custo anual: 12 meses do custo mensal (o fator 1,75 já cobre encargos, 13º e férias). */
export const anual = (mensal: number | null | undefined) => (mensal == null ? null : moeda(mensal * 12));

/** '2.345,67' ou '2345.67' -> número; vazio ou inválido -> null. */
export const lerValor = (texto: string) => {
  const t = texto.trim();
  if (!t) return null;
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) && n > 0 ? n : null;
};
