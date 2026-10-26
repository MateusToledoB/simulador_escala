// Formato da resposta de POST /simular (apps/api/api.py: resultado_json)

export type LinhaPEC = { equipe: string; cargo: string; escala: string; quantidade: number };

export type Turno = { entrada: string; saida: string; intervalo: string; horas: string; descricao: string };

export type Cargo = {
  equipe: string;
  cargo: string;
  escala: string;
  quantidade: number;
  dias: string;
  antes: Turno;
  depois: Turno;
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

export type Resultado = {
  config: { limite_horas_semana: number; escala: string; intervalo_maximo: string; corte_maximo_min: number };
  total_pessoas: number;
  por_equipe: { equipe: string; quantidade: number }[];
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
  sugestoes: { revezamento: Contratacoes; horista: Contratacoes } | null;
};
