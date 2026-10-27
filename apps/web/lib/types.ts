// Formato da resposta de POST /simular (apps/api/api.py: resultado_json)

export type LinhaPEC = { cargo: string; escala: string; quantidade: number };

export type Turno = {
  entrada: string;
  saida: string;
  intervalo: string;
  intervalo_inicio: string | null;
  intervalo_fim: string | null;
  horas: string;
  descricao: string;
};

export type Cargo = {
  cargo: string;
  escala: string;
  quantidade: number;
  dias: string;
  faixas: { dias: string; antes: Turno; depois: Turno }[];
  semana_antes: string;
  semana_depois: string;
  corte_min: number;
  ajuste: string;
  enquadrou: boolean;
  meta: string;
  rodizio: { quantidade: number; dias: string }[];
};

export type Contratacoes = {
  total: number;
  custo_mensal: number | null;
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
  intervalo: string | null;
  horas_dia: string;
  horas_semana: string;
  por_dia: number[];
  demanda: number[];
  pessoas: {
    nome: string;
    folgas: number[];
    trabalha: boolean[];
    complemento: boolean[];
    extras: string | null;
    horas_semana: string;
  }[];
};

export type Revezamento = {
  total: number;
  custo_mensal: number | null;
  horas_semana: string;
  frases: string[];
  turnos: TurnoRevezamento[];
  horistas: Contratacoes;
};

export type Sugestoes = { revezamento: Revezamento; horista: Contratacoes };

export type Config = {
  limite_horas_semana: number;
  salario: number | null;
  fator_encargos: number;
  escala: string;
  intervalo_maximo: string;
  corte_maximo_min: number;
  dias: string[];
};

// Uma forma de levar a escala à meta (main.ESTRATEGIAS), com o rombo e as sugestões que ela gera
export type Opcao = {
  id: string;
  titulo: string;
  descricao: string;
  cargos: Cargo[];
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

export type Resultado = {
  config: Config;
  total_pessoas: number;
  custo_quadro: number | null;
  sem_horario: LinhaPEC[];
  opcoes: Opcao[];
};

// Formato da resposta de POST /dimensionar
// Proposta do dimensionamento (api.PROPOSTAS): manter o horário do posto ou o mínimo de colaboradores
export type Proposta = {
  id: string;
  titulo: string;
  descricao: string;
  postos: { cargo: string; escala: string; quantidade: number; dias: string; horario: string; reduzido: boolean }[];
  horas_posto_semana: string;
  colaboradores_equivalentes: number;
  sugestoes: Sugestoes;
};

export type Dimensionamento = {
  config: Config;
  sem_horario: LinhaPEC[];
  postos: number;
  propostas: Proposta[];
};
