import type { Dimensionamento as D } from "@/lib/types";
import Sugestoes from "./Sugestoes";

export default function Dimensionamento({ d }: { d: D }) {
  const postos = d.postos.reduce((s, p) => s + p.quantidade, 0);
  const rev = d.sugestoes?.revezamento;

  return (
    <>
      <div className="kpis">
        <div className="kpi"><div className="valor">{postos}</div><div className="rotulo">posto(s) em {d.postos.length} horário(s)</div></div>
        <div className="kpi"><div className="valor">{d.horas_posto_semana}</div><div className="rotulo">de posto ocupado por semana</div></div>
        <div className="kpi"><div className="valor">{d.colaboradores_equivalentes.toLocaleString("pt-BR")}</div><div className="rotulo">colaborador(es) de {d.config.limite_horas_semana}h equivalentes</div></div>
        {rev && <div className="kpi"><div className="valor">{rev.total}</div><div className="rotulo">contratações no revezamento</div></div>}
      </div>

      {d.sem_horario.length > 0 && (
        <div className="aviso" style={{ marginBottom: 20 }}>
          <strong>Sem horário reconhecido (fora do cálculo):</strong>
          <ul style={{ margin: "6px 0 0" }}>
            {d.sem_horario.map((s, i) => <li key={i}>{s.cargo} ({s.quantidade}): <span className="mono">{s.escala || "(vazio)"}</span></li>)}
          </ul>
        </div>
      )}

      {d.sugestoes && <Sugestoes s={d.sugestoes} dias={d.config.dias} titulo="Como cobrir a demanda" />}
    </>
  );
}
