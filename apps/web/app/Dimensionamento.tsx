"use client";

import { useState } from "react";
import { custo } from "@/lib/moeda";
import type { Dimensionamento as D, Proposta } from "@/lib/types";
import Sugestoes from "./Sugestoes";

/** As duas propostas lado a lado; clicar numa linha abre o detalhe dela. */
function Comparacao({ d, atual, onEscolher }: { d: D; atual: number; onEscolher: (i: number) => void }) {
  const comCusto = d.config.salario != null;
  return (
    <section className="card">
      <h2>Propostas</h2>
      <p className="muted" style={{ marginTop: -6 }}>Clique numa proposta para ver o detalhe.</p>
      <div className="tabela-wrap">
        <table>
          <thead>
            <tr>
              <th>Proposta</th><th>Horário do posto</th><th className="num">Horas de posto</th>
              <th className="num">Revezamento</th><th className="num">Só horista</th>
            </tr>
          </thead>
          <tbody>
            {d.propostas.map((p, i) => {
              const rev = p.sugestoes.revezamento;
              const hor = p.sugestoes.horista;
              return (
                <tr key={p.id} className={i === atual ? "clicavel selecionada" : "clicavel"} onClick={() => onEscolher(i)}>
                  <td>
                    <strong>{p.titulo}</strong>
                    <div className="muted" style={{ fontSize: 12 }}>{p.descricao}</div>
                  </td>
                  <td>
                    {p.postos.map((x, k) => (
                      <div key={k} className="mono" style={{ fontSize: 13 }}>
                        {x.horario}{x.reduzido && <> <span className="tag erro">reduzido</span></>}
                      </div>
                    ))}
                  </td>
                  <td className="num">{p.horas_posto_semana}</td>
                  <td className="num">
                    {rev.total} pessoa(s)
                    {comCusto && <div className="muted">{custo(rev.custo_mensal)}/mês</div>}
                  </td>
                  <td className="num">
                    {hor.total} pessoa(s)
                    {comCusto && <div className="muted">{custo(hor.custo_mensal)}/mês</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {comCusto && (
        <p className="muted" style={{ fontSize: 12, margin: "8px 0 0" }}>
          Custo mensal = salário médio de {custo(d.config.salario)} x {d.config.fator_encargos.toLocaleString("pt-BR")} por
          pessoa 5x2; horista proporcional às horas da semana (horas / {d.config.limite_horas_semana}h).
        </p>
      )}
    </section>
  );
}

function DetalheProposta({ p, d }: { p: Proposta; d: D }) {
  const rev = p.sugestoes.revezamento;
  return (
    <>
      <div className="kpis">
        <div className="kpi"><div className="valor">{d.postos}</div><div className="rotulo">posto(s) informados</div></div>
        <div className="kpi"><div className="valor">{p.horas_posto_semana}</div><div className="rotulo">de posto ocupado por semana</div></div>
        <div className="kpi"><div className="valor">{p.colaboradores_equivalentes.toLocaleString("pt-BR")}</div><div className="rotulo">colaborador(es) de {d.config.limite_horas_semana}h equivalentes</div></div>
        <div className="kpi"><div className="valor">{rev.total}</div><div className="rotulo">contratações no revezamento</div></div>
        {rev.custo_mensal != null && (
          <div className="kpi"><div className="valor">{custo(rev.custo_mensal)}</div><div className="rotulo">por mês no revezamento</div></div>
        )}
      </div>
      <Sugestoes s={p.sugestoes} dias={d.config.dias} titulo={p.titulo + ": como cobrir a demanda"} />
    </>
  );
}

export default function Dimensionamento({ d }: { d: D }) {
  const [escolhida, setEscolhida] = useState(0);
  const atual = Math.min(escolhida, Math.max(0, d.propostas.length - 1));
  const p = d.propostas[atual];

  return (
    <>
      {d.sem_horario.length > 0 && (
        <div className="aviso" style={{ marginBottom: 20 }}>
          <strong>Sem horário reconhecido (fora do cálculo):</strong>
          <ul style={{ margin: "6px 0 0" }}>
            {d.sem_horario.map((s, i) => <li key={i}>{s.cargo} ({s.quantidade}): <span className="mono">{s.escala || "(vazio)"}</span></li>)}
          </ul>
        </div>
      )}
      {p && (
        <>
          <Comparacao d={d} atual={atual} onEscolher={setEscolhida} />
          <div className="abas" role="tablist">
            {d.propostas.map((x, i) => (
              <button key={x.id} role="tab" aria-selected={i === atual} className={i === atual ? "aba ativa" : "aba"}
                      onClick={() => setEscolhida(i)}>
                {x.titulo}
              </button>
            ))}
          </div>
          <DetalheProposta p={p} d={d} />
        </>
      )}
    </>
  );
}
