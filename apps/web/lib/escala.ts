// Monta e lê o texto de escala no formato da PEC, o mesmo que a API (main.ler_escala) entende:
//   "ESCALA SEGUNDA - SEXTA (07:30 - 17:18)"  ou  "ESCALA 6 X 1 (07:30 - 16:00)"

export const DIAS = ["SEGUNDA", "TERCA", "QUARTA", "QUINTA", "SEXTA", "SABADO", "DOMINGO"];
export const DIAS_LABEL = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

export type Escala =
  | { tipo: "semana"; de: number; ate: number; entrada: string; saida: string }
  | { tipo: "ciclo"; trabalha: number; entrada: string; saida: string }
  | { tipo: "texto"; texto: string };

export function escalaTexto(e: Escala): string {
  if (e.tipo === "texto") return e.texto;
  const horario = `(${e.entrada} - ${e.saida})`;
  if (e.tipo === "semana") return `ESCALA ${DIAS[e.de]} - ${DIAS[e.ate]} ${horario}`;
  return `ESCALA ${e.trabalha} X ${7 - e.trabalha} ${horario}`;
}

const SIGLAS = ["SEG", "TER", "QUA", "QUI", "SEX", "SAB", "DOM"];
const DIA = "(SEG|TER|QUA|QUI|SEX|SAB|DOM)\\w*";
const HORARIO = "\\(\\s*(\\d{1,2}):(\\d{2})\\s*-\\s*(\\d{1,2}):(\\d{2})\\s*\\)";
const RE_SEMANA = new RegExp(`${DIA}\\s*-\\s*${DIA}\\s*${HORARIO}`);
const RE_CICLO = new RegExp(`\\b(\\d)\\s*X\\s*(\\d)\\b\\s*${HORARIO}`);

const hora = (h: string, m: string) => `${h.padStart(2, "0")}:${m}`;

/** Texto da PEC -> campos do formulário; o que não reconhece fica como texto livre. */
export function lerEscala(texto: string | null | undefined): Escala {
  const t = (texto ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toUpperCase();
  let m = RE_SEMANA.exec(t);
  if (m) {
    return { tipo: "semana", de: SIGLAS.indexOf(m[1]), ate: SIGLAS.indexOf(m[2]),
             entrada: hora(m[3], m[4]), saida: hora(m[5], m[6]) };
  }
  m = RE_CICLO.exec(t);
  if (m && Number(m[1]) + Number(m[2]) === 7) {
    return { tipo: "ciclo", trabalha: Number(m[1]), entrada: hora(m[3], m[4]), saida: hora(m[5], m[6]) };
  }
  return { tipo: "texto", texto: texto ?? "" };
}
