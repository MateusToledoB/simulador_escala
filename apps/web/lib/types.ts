// Formato da resposta de POST /simular (apps/api/api.py: resultado_json)

export type LinhaPEC = { cargo: string; escala: string; quantidade: number; salario?: number | null };

// custo mensal do quadro informado (linhas com salário); o anual é x 12
export type CustoQuadro = { mensal: number; pessoas_com_salario: number; salario_medio: number };

// impacto por cargo (api._por_cargo): custo das contratações repartido pelas horas que cada cargo perdeu (quadro)
// ou de posto (demanda), cada um pelo próprio salário
export type PorCargo = {
  cargo: string;
  pessoas: number;
  salario: number | null;
  custo_atual: number | null;
  horas: string;
  parte: number;
  impacto_revezamento_puro: number | null;
  impacto_revezamento: number | null;
  impacto_clt_horista: number | null;
};

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

// revezamento_puro: só 5x2 com escalas iguais; revezamento: 5x2 aproveitando a carga + horistas;
// clt_horista: 5x2 com a carga do turno + horistas pontuais (horista: até 80h por mês)
export type Sugestoes = { revezamento_puro: Revezamento; revezamento: Revezamento; clt_horista: Revezamento };

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
  salario_contratacao: number | null; // média dos salários dos cargos que perderam cobertura
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
  por_cargo: PorCargo[];
};

export type Resultado = {
  config: Config;
  total_pessoas: number;
  custo_quadro: CustoQuadro | null;
  sem_horario: LinhaPEC[];
  opcoes: Opcao[];
};

// Formato da resposta de POST /dimensionar
// Proposta do dimensionamento (api.PROPOSTAS): manter o horário do posto ou o mínimo de colaboradores
export type Proposta = {
  id: string;
  titulo: string;
  descricao: string;
  salario_contratacao: number | null; // média dos salários dos postos, pelas horas de posto
  postos: { cargo: string; escala: string; quantidade: number; dias: string; horario: string; reduzido: boolean }[];
  horas_posto_semana: string;
  colaboradores_equivalentes: number;
  sugestoes: Sugestoes;
  por_cargo: PorCargo[];
};

export type Dimensionamento = {
  config: Config;
  sem_horario: LinhaPEC[];
  postos: number;
  propostas: Proposta[];
};

// Aba Simular CR (apps/api/otimizar_cr.py): GET /cr, GET /cr/funcoes, POST /cr/simular
export type JornadaLida = { jornada: string; escala: string | null; pessoas: number; leitura: string; horas_semana: string };
export type SemHorarioCR = { jornada: string; escala: string; pessoas: number };

export type FuncaoCR = {
  funcao: string;
  pessoas: number;
  com_horario: number;
  jornadas: JornadaLida[];
  sem_horario: SemHorarioCR[];
};

export type CenarioCR = {
  id: "quadro" | "clt" | "clt_horista";
  titulo: string;
  descricao: string;
  erro?: string;
  clt: number;
  horistas: number;
  total: number;
  horas_horista: string;
  horas_contratadas: string;
  rombo: string;
  rombo_pct: number;
  aproveitamento: number | null;
  turnos: { entrada: string; saida: string; intervalo: string; horas_dia: string; pessoas: number; por_dia: number[];
            folgas: { dias: string; pessoas: number }[] }[];
  pessoas_horistas: { horas_semana: string; turnos: { dia: string; entrada: string; saida: string }[] }[];
  grade: [number, number][][]; // dia x hora: [necessário, na escala] no pior momento da hora
  otima: boolean;
  segundos: number;
  piso: string | null; // quando não é ótima: o mínimo que o OR-Tools garante
};

export type SimulacaoCR = {
  cr: string;
  funcao: string;
  limite_horas: 40 | 42;
  dias: string[];
  atual: { pessoas: number; horas_semana: string; jornadas: JornadaLida[]; sem_horario: SemHorarioCR[] };
  horas_necessarias: string;
  pico: number;
  grade: number[][] | null; // dia x hora: pico de pessoas no posto hoje
  cenarios: CenarioCR[];
};
