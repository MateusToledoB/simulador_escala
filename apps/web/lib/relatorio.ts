// Relatório Radar Escala 5x2: formato de GET /api/relatorio (apps/api/relatorio.py: compactar) e as regras de
// classificação de cada linha (escala x jornada x CR) na nova regra: fim da 6x1, 2 folgas e 42h, depois 40h.

export type TipoEscala = "C" | "F" | "R" | "V"; // compatível, fora do 5x2, 12x36, validar cadastro

export type Base = {
  fonte: string;
  dirs: string[];
  escs: [string, TipoEscala][];
  crs: [string, string, string][]; // código, UF, nome
  negs: string[];
  gers: string[];
  jornadas: number | null;
  rows: [number, number, number, number | null, number, number, number, number, number][];
  // diretor, escala, CR, horas semanais, colaboradores, inconsistências, sem escala, negócio, gerência regional
};

export type Cockpit = { nome: string; cols: string[]; map: Record<string, Record<string, string>> };

export type Nivel = "CR" | "AL" | "X" | "MO" | "V" | "OK";
export type Acao = "A1" | "A2" | "A3" | "A4" | "A5" | "A6" | "A7" | "A0";

export const NIVEIS: Record<Nivel, { nome: string; cor: string }> = {
  CR: { nome: "Crítico", cor: "--n-cr" },
  AL: { nome: "Alto", cor: "--n-al" },
  X: { nome: "12x36 em análise", cor: "--n-x" },
  MO: { nome: "Moderado (2027)", cor: "--n-mo" },
  V: { nome: "Validar cadastro", cor: "--n-v" },
  OK: { nome: "Sem impacto", cor: "--n-ok" },
};
export const ORDEM: Nivel[] = ["CR", "AL", "X", "MO", "V", "OK"];

export const ACOES: Record<Acao, string> = {
  A1: "Redesenhar para 5x2 e reduzir para 42h",
  A2: "Converter escala para 5x2 (2 folgas/semana)",
  A3: "Retirar 2h da compensação de sábado (44h → 42h)",
  A4: "Reduzir jornada de 5 dias para 42h",
  A5: "12x36: validar enquadramento e média semanal na CCT",
  A6: "Planejar redução para 40h até dez/2027",
  A7: "Corrigir cadastro de escala/jornada",
  A0: "Sem ação",
};
export const NIVEL_DA_ACAO: Record<Acao, Nivel> = { A1: "CR", A2: "AL", A3: "AL", A4: "AL", A5: "X", A6: "MO", A7: "V", A0: "OK" };

// prazos da PEC 221/2019 (promulgada em 16/10/2026): 1ª etapa em 60 dias, 2ª etapa 12 meses depois
export const PRAZOS = {
  promulgacao: new Date(2026, 9, 16),
  etapa1: new Date(2026, 11, 15),
  etapa2: new Date(2027, 11, 15),
};

/** Nível e ação de uma linha: tipo da escala e horas semanais; 12x36 acima de 42h conta como impacto se c1236. */
export function classificar(tipo: TipoEscala, h: number | null, compensado: boolean, c1236: boolean): [Nivel, Acao] {
  if (tipo === "V" || h == null || h === 0 || h > 100) return ["V", "A7"];
  if (tipo === "F") return h > 42 ? ["CR", "A1"] : ["AL", "A2"];
  if (tipo === "R") {
    if (h > 42) return [c1236 ? "AL" : "X", "A5"];
    return h > 40 ? ["MO", "A6"] : ["OK", "A0"];
  }
  if (h > 42) return ["AL", compensado ? "A3" : "A4"];
  if (h > 40) return ["MO", "A6"];
  return ["OK", "A0"];
}

export const fmt = (n: number) => Math.round(n).toLocaleString("pt-BR");
export const dec = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
export const pct = (a: number, b: number) => (b ? (100 * a / b).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%" : "–");
