import { Fragment } from "react";
import type { Cargo, Contratacoes, Resultado as R } from "@/lib/types";

function Corte({ c }: { c: Cargo }) {
  if (c.corte_min > 0) return <>corte de {c.corte_min} min no fim</>;
  if (c.corte_min < 0) return <>saída estendida em {Math.round(-c.corte_min)} min</>;
  return <span className="muted">—</span>;
}

function Sugestao({ titulo, descricao, s }: { titulo: string; descricao: string; s: Contratacoes }) {
  return (
    <div className="card" style={{ marginBottom: 0 }}>
      <div className="row" style={{ marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>{titulo}</h3>
        <span className="spacer" />
        <span className="tag">{s.total} contratação(ões) · {s.horas_semana}/semana</span>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>{descricao}</p>
      <ul className="frases">
        {s.frases.map((f) => <li key={f}>{f}</li>)}
      </ul>
      <details>
        <summary>Horários por pessoa</summary>
        <table style={{ marginTop: 8 }}>
          <tbody>
            {s.pessoas.map((p, i) => (
              <tr key={i}>
                <td style={{ whiteSpace: "nowrap" }}>Pessoa {i + 1}<div className="muted">{p.contrato}</div></td>
                <td className="mono">{p.turnos.map((t) => `${t.dia} ${t.entrada}–${t.saida}`).join(" · ")}</td>
                <td className="num">{p.horas_semana}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

export default function Resultado({ r }: { r: R }) {
  const maxDia = Math.max(1, ...r.rombo.por_dia.map((d) => d.valor));

  return (
    <>
      <div className="kpis">
        <div className="kpi"><div className="valor">{r.total_pessoas}</div><div className="rotulo">colaboradores em {r.cargos.length + r.sem_horario.length} cargo(s)</div></div>
        <div className="kpi"><div className="valor">{r.rombo.total_horas}</div><div className="rotulo">descobertas por semana</div></div>
        <div className="kpi"><div className="valor">{(r.rombo.percentual * 100).toFixed(1)}%</div><div className="rotulo">das {r.rombo.horas_demandadas} cobertas hoje</div></div>
        <div className="kpi"><div className="valor">{r.rombo.colaboradores_equivalentes.toLocaleString("pt-BR")}</div><div className="rotulo">colaborador(es) de {r.config.limite_horas_semana}h equivalentes</div></div>
      </div>

      <section className="card">
        <h2>Escala por cargo: antes x depois</h2>
        <p className="muted" style={{ marginTop: -6 }}>
          Meta de {r.config.limite_horas_semana}h por semana em {r.config.escala}, intervalo até {r.config.intervalo_maximo},
          corte de até {r.config.corte_maximo_min} min no fim do turno.
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
                  {r.cargos.map((c, i) => (
                    <tr key={i}>
                      <td>{c.cargo}<div className="preview">{c.escala}</div></td>
                      <td className="num">{c.quantidade}</td>
                      <td>
                        {c.dias}
                        {c.rodizio.length > 0 && (
                          <div className="muted" style={{ fontSize: 12 }}>
                            → 5x2: {c.rodizio.map((g) => `${g.quantidade} em ${g.dias}`).join("; ")}
                          </div>
                        )}
                      </td>
                      <td className="mono">{c.antes.entrada}–{c.antes.saida}<div className="muted">int {c.antes.intervalo} · {c.antes.horas}</div></td>
                      <td className="mono">{c.depois.entrada}–{c.depois.saida}<div className="muted">int {c.depois.intervalo} · {c.depois.horas}</div></td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {c.semana_antes} → {c.semana_depois}
                        {!c.enquadrou && <div><span className="tag erro">não enquadrou em {c.meta}</span></div>}
                      </td>
                      <td><Corte c={c} /></td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
        {r.sem_horario.length > 0 && (
          <div className="aviso">
            <strong>Sem horário reconhecido (fora do cálculo):</strong>
            <ul style={{ margin: "6px 0 0" }}>
              {r.sem_horario.map((s, i) => <li key={i}>{s.cargo} ({s.quantidade}): <span className="mono">{s.escala || "(vazio)"}</span></li>)}
            </ul>
          </div>
        )}
      </section>

      <section className="card">
        <h2>Rombo de cobertura</h2>
        {r.rombo.blocos.length === 0 ? (
          <p><span className="tag ok">Nenhum</span> A cobertura atual se mantém.</p>
        ) : (
          <div className="row" style={{ alignItems: "flex-start", gap: 32 }}>
            <div style={{ flex: "1 1 280px" }}>
              <h3>Horas descobertas por dia</h3>
              <div className="barras">
                {r.rombo.por_dia.map((d) => (
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
                  {r.rombo.blocos.map((b, i) => (
                    <tr key={i}><td>{b.inicio}</td><td>{b.fim}</td><td className="num">{b.duracao}</td><td className="num">{b.pessoas}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {r.sugestoes && (
        <section>
          <h2>Sugestões para cobrir o rombo</h2>
          <div className="sugestoes">
            <Sugestao titulo="1) Revezamento" s={r.sugestoes.revezamento}
                      descricao="Escala fixa para quem cobre o rombo em vários dias da semana; horista para os demais." />
            <Sugestao titulo="2) Horista" s={r.sugestoes.horista}
                      descricao="Todos por hora (intermitente), pagando só as horas do rombo." />
          </div>
        </section>
      )}
    </>
  );
}
