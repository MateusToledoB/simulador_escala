// Formato da resposta de POST /simular (apps/api/api.py: resultado_json)

export type LinhaPEC = { cargo: string; escala: string; quantidade: number; intervalo?: number | null };

export type Turno = { entrada: string; saida: string; intervalo: string; horas: string; descricao: string };

export type Cargo = {
  cargo: string;
  escala: string;
  quantidade: number;
  intervalo_informado: string | null;
  dias: string;
  faixas: { dias: string; antes: Turno; depois: Turno }[];
  semana_antes: string;
  semana_depois: string;
  corte_min: number;
  enquadrou: boolean;
  meta: string;
  rodizio: { quantidade: number; dias: string }[];
};

export type Contratacoes = {
  total: number;
  horas_semana: string;
  frases: string[];
  pessoas: {
    contrato: string;
    horas_semana: string;
    turnos: { dia: string; entrada: string; saida: string; horas: string }[];
  }[];
};

export type TurnoRevezamento = {
  titulo: string;
  entrada: string;
  saida: string;
  horas_semana: string;
  por_dia: number[];
  demanda: number[];
  pessoas: { nome: string; folgas: number[]; trabalha: boolean[] }[];
};

export type Revezamento = {
  total: number;
  horas_semana: string;
  frases: string[];
  turnos: TurnoRevezamento[];
  horistas: Contratacoes;
};

export type Sugestoes = { revezamento: Revezamento; horista: Contratacoes };

export type Config = {
  limite_horas_semana: number;
  escala: string;
  intervalo_maximo: string;
  corte_maximo_min: number;
  dias: string[];
};

export type Resultado = {
  config: Config;
  total_pessoas: number;
  cargos: Cargo[];
  sem_horario: LinhaPEC[];
  rombo: {
    blocos: { inicio: string; fim: string; duracao: string; pessoas: number }[];
    por_dia: { dia: string; horas: string; valor: number }[];
    total_horas: string;
    horas_demandadas: string;
    percentual: number;
    colaboradores_equivalentes: number;
  };
  sugestoes: Sugestoes | null;
};

// Formato da resposta de POST /dimensionar
export type Dimensionamento = {
  config: Config;
  postos: { cargo: string; escala: string; quantidade: number; dias: string }[];
  sem_horario: LinhaPEC[];
  horas_posto_semana: string;
  colaboradores_equivalentes: number;
  sugestoes: Sugestoes | null;
};
