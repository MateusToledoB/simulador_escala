export const moeda = (valor: number) =>
  valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Custo mensal formatado, ou null quando a simulação não teve salário. */
export const custo = (valor: number | null | undefined) => (valor == null ? null : moeda(valor));
