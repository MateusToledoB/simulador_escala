"use client";

import { Fragment, useState } from "react";
import type { Config, Opcao, Resultado as R } from "@/lib/types";
import Sugestoes from "./Sugestoes";

const contratacoes = (o: Opcao) =>
  o.sugestoes ? { revezamento: o.sugestoes.revezamento.total, horista: o.sugestoes.horista.total } : { revezamento: 0, horista: 0 };

/** Todas as opções lado a lado; clicar numa linha abre o detalhe dela. */
function Comparacao({ opcoes, atual, onEscolher }: { opcoes: Opcao[]; atual: number; onEscolher: (i: number) => void }) {
  return (
    <section className="card">
      <h2>Opções para levar a escala à meta</h2>
      <p className="muted" style={{ marginTop: -6 }}>
        Cada opção ajusta o turno de um jeito e gera um rombo diferente. Clique numa opção para ver o detalhe.
      </p>
      <div className="tabela-wrap">
        <table>
          <thead>
            <tr>
              <th>Opção</th><th className="num">Horas descobertas</th>
              <th className="num">Contratações (revezamento)</th><th className="num">Contratações (só horista)</th>
            </tr>
          </thead>
          <tbody>
            {opcoes.map((o, i) => {
              const c = contratacoes(o);
              return (
                <tr key={o.id} className={i === atual ? "clicavel selecionada" : "clicavel"} onClick={() => onEscolher(i)}>
                  <td>
                    <strong>{o.titulo}</strong>
                    <div className="muted" style={{ fontSize: 12 }}>{o.descricao}</div>
                  </td>
                  <td className="num">{o.rombo.total_horas}</td>
                  <td className="num">{c.revezamento}</td>
                  <td className="num">{c.horista}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DetalheOpcao({ o, config, totalPessoas, semHorario }: { o: Opcao; config: Config; totalPessoas: number; semHorario: R["sem_horario"] }) {
  const maxDia = Math.max(1, ...o.rombo.por_dia.map((d) => d.valor));

  return (
    <>
      <div className="kpis">
        <div className="kpi"><div className="valor">{totalPessoas}</div><div className="rotulo">colaboradores em {o.cargos.length + semHorario.length} cargo(s)</div></div>
        <div className="kpi"><div className="valor">{o.rombo.total_horas}</div><div className="rotulo">descobertas por semana</div></div>
        <div className="kpi"><div className="valor">{(o.rombo.percentual * 100).toFixed(1)}%</div><div className="rotulo">das {o.rombo.horas_demandadas} cobertas hoje</div></div>
        <div className="kpi"><div className="valor">{o.rombo.colaboradores_equivalentes.toLocaleString("pt-BR")}</div><div className="rotulo">colaborador(es) de {config.limite_horas_semana}h equivalentes</div></div>
      </div>

      <section className="card">
        <h2>Escala por cargo: antes x depois</h2>
        <p className="muted" style={{ marginTop: -6 }}>
          {o.titulo}: {o.descricao} Meta de {config.limite_horas_semana}h por semana em {config.escala}.
        </p>
        <div className="tabela-wrap">
          <table>
            <thead>
              <tr>
                <th>Cargo</th><th className="num">Pessoas</th><th>Dias</th><th>Antes</th><th>Depois</th>
                <th>Semana</th><th>Ajuste</th>
              </tr>
            </thead>
            <tbody>
                  {o.cargos.map((c, i) => (
                    <tr key={i}>
                      <td>
                        {c.cargo}
                        <div className="preview">{c.escala}</div>
                      </td>
                      <td className="num">{c.quantidade}</td>
                      <td>
                        {c.dias}
                        {c.rodizio.length > 0 && (
                          <div className="muted" style={{ fontSize: 12 }}>
                            → 5x2: {c.rodizio.map((g) => `${g.quantidade} em ${g.dias}`).join("; ")}
                          </div>
                        )}
                      </td>
                      {(["antes", "depois"] as const).map((quando) => (
                        <td key={quando} className="mono">
                          {c.faixas.map((f) => (
                            <div key={f.dias} className="faixa-turno">
                              {c.faixas.length > 1 && <div className="muted">{f.dias}</div>}
                              {f[quando].entrada}–{f[quando].saida}
                              <div className="muted">
                                {f[quando].intervalo_inicio
                                  ? `int ${f[quando].intervalo_inicio}–${f[quando].intervalo_fim} (${f[quando].intervalo})`
                                  : "sem intervalo"} · {f[quando].horas}
                              </div>
                            </div>
                          ))}
                        </td>
                      ))}
                      <td style={{ whiteSpace: "nowrap" }}>
                        {c.semana_antes} → {c.semana_depois}
                        {!c.enquadrou && <div><span className="tag erro">não enquadrou em {c.meta}</span></div>}
                      </td>
                      <td>{c.ajuste || <span className="muted">—</span>}</td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
        {semHorario.length > 0 && (
          <div className="aviso">
            <strong>Sem horário reconhecido (fora do cálculo):</strong>
            <ul style={{ margin: "6px 0 0" }}>
              {semHorario.map((s, i) => <li key={i}>{s.cargo} ({s.quantidade}): <span className="mono">{s.escala || "(vazio)"}</span></li>)}
            </ul>
          </div>
        )}
      </section>

      <section className="card">
        <h2>Rombo de cobertura</h2>
        {o.rombo.blocos.length === 0 ? (
          <p><span className="tag ok">Nenhum</span> A cobertura atual se mantém.</p>
        ) : (
          <div className="row" style={{ alignItems: "flex-start", gap: 32 }}>
            <div style={{ flex: "1 1 280px" }}>
              <h3>Horas descobertas por dia</h3>
              <div className="barras">
                {o.rombo.por_dia.map((d) => (
                  <Fragment key={d.dia}>
                    <span>{d.dia}</span>
                    <div><div className="barra" style={{ width: `${(d.valor / maxDia) * 100}%` }} /></div>
                    <span className="num">{d.horas}</span>
                  </Fragment>
                ))}
              </div>
            </div>
            <div style={{ flex: "2 1 380px" }} className="tabela-wrap">
              <h3>Faixas descobertas</h3>
              <table>
                <thead><tr><th>De</th><th>Até</th><th className="num">Duração</th><th className="num">Pessoas</th></tr></thead>
                <tbody>
                  {o.rombo.blocos.map((b, i) => (
                    <tr key={i}><td>{b.inicio}</td><td>{b.fim}</td><td className="num">{b.duracao}</td><td className="num">{b.pessoas}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {o.sugestoes && <Sugestoes s={o.sugestoes} dias={config.dias} titulo="Sugestões para cobrir o rombo" />}
    </>
  );
}

export default function Resultado({ r }: { r: R }) {
  const [escolhida, setEscolhida] = useState(0);
  const atual = Math.min(escolhida, r.opcoes.length - 1);
  const o = r.opcoes[atual];

  return (
    <>
      {r.opcoes.length > 1 && (
        <>
          <Comparacao opcoes={r.opcoes} atual={atual} onEscolher={setEscolhida} />
          <div className="abas" role="tablist">
            {r.opcoes.map((x, i) => (
              <button key={x.id} role="tab" aria-selected={i === atual} className={i === atual ? "aba ativa" : "aba"}
                      onClick={() => setEscolhida(i)}>
                {x.titulo}
              </button>
            ))}
          </div>
        </>
      )}
      <DetalheOpcao o={o} config={r.config} totalPessoas={r.total_pessoas} semHorario={r.sem_horario} />
    </>
  );
}
