// Monta e lê o texto de escala no formato da PEC, o mesmo que a API (main.ler_escala) entende:
//   "ESCALA SEGUNDA - SEXTA (07:30 - 17:18)"
//   "ESCALA SEGUNDA - SEXTA (07:30 - 17:18, INTERVALO 12:00 - 13:00)"     (intervalo informado)
//   "ESCALA SEGUNDA - QUINTA (08:00 - 19:00) / SEXTA (08:00 - 18:00)"     (dinâmica: horário por faixa de dias)
//   "ESCALA 6 X 1 (07:30 - 16:00)"

export const DIAS = ["SEGUNDA", "TERCA", "QUARTA", "QUINTA", "SEXTA", "SABADO", "DOMINGO"];
export const DIAS_LABEL = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

export type Intervalo = { inicio: string; fim: string } | null;
export type Horario = { entrada: string; saida: string; intervalo: Intervalo };
export type Faixa = Horario & { de: number; ate: number };

export type Escala =
  | { tipo: "semana"; faixas: Faixa[] }
  | ({ tipo: "ciclo"; trabalha: number } & Horario)
  | { tipo: "texto"; texto: string };

export const semana = (de: number, ate: number, entrada: string, saida: string, intervalo: Intervalo = null): Escala =>
  ({ tipo: "semana", faixas: [{ de, ate, entrada, saida, intervalo }] });

const horarioTexto = (h: Horario) =>
  `(${h.entrada} - ${h.saida}${h.intervalo ? `, INTERVALO ${h.intervalo.inicio} - ${h.intervalo.fim}` : ""})`;

export function escalaTexto(e: Escala): string {
  if (e.tipo === "texto") return e.texto;
  if (e.tipo === "ciclo") return `ESCALA ${e.trabalha} X ${7 - e.trabalha} ${horarioTexto(e)}`;
  return "ESCALA " + e.faixas
    .map((f) => `${f.de === f.ate ? DIAS[f.de] : `${DIAS[f.de]} - ${DIAS[f.ate]}`} ${horarioTexto(f)}`)
    .join(" / ");
}

const SIGLAS = ["SEG", "TER", "QUA", "QUI", "SEX", "SAB", "DOM"];
const DIA = "\\b(SEG|TER|QUA|QUI|SEX|SAB|DOM)\\w*";
const HORARIO = "\\(\\s*(\\d{1,2}):(\\d{2})\\s*-\\s*(\\d{1,2}):(\\d{2})" +
  "(?:\\s*[,;]?\\s*INT(?:ERVALO)?\\.?:?\\s*(\\d{1,2}):(\\d{2})\\s*(?:-|AS?\\b)\\s*(\\d{1,2}):(\\d{2}))?\\s*\\)";
const RE_FAIXA = new RegExp(`${DIA}(?:\\s*(?:-|\\bA\\b)\\s*${DIA})?\\s*${HORARIO}`, "g");
const RE_CICLO = new RegExp(`\\b(\\d)\\s*X\\s*(\\d)\\b\\s*${HORARIO}`);

const hora = (h: string, m: string) => `${h.padStart(2, "0")}:${m}`;

/** Grupos [entrada h, m, saída h, m, intervalo início h, m, fim h, m] da regex -> Horario. */
const lerHorario = (g: string[]): Horario => ({
  entrada: hora(g[0], g[1]),
  saida: hora(g[2], g[3]),
  intervalo: g[4] ? { inicio: hora(g[4], g[5]), fim: hora(g[6], g[7]) } : null,
});

/** Texto da PEC -> campos do formulário; o que não reconhece fica como texto livre. */
export function lerEscala(texto: string | null | undefined): Escala {
  const t = (texto ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toUpperCase();
  const faixas = [...t.matchAll(RE_FAIXA)].map((m) => ({
    de: SIGLAS.indexOf(m[1]), ate: SIGLAS.indexOf(m[2] ?? m[1]), ...lerHorario(m.slice(3)),
  }));
  if (faixas.length) return { tipo: "semana", faixas };
  const m = RE_CICLO.exec(t);
  if (m && Number(m[1]) + Number(m[2]) === 7) return { tipo: "ciclo", trabalha: Number(m[1]), ...lerHorario(m.slice(3)) };
  return { tipo: "texto", texto: texto ?? "" };
}
