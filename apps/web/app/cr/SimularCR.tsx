"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CenarioCR, FuncaoCR, SimulacaoCR } from "@/lib/types";

type Centro = { cr: string; pessoas: number };
type Item = { funcao: FuncaoCR; sim?: SimulacaoCR; erro?: string };

const normalizar = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const pct = (v: number) => (v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%";
/** "554h30" -> 554,5 */
const horas = (t: string) => {
  const m = /(\d+)h(\d+)?/.exec(t);
  return m ? Number(m[1]) + Number(m[2] ?? 0) / 60 : 0;
};
const fmtHoras = (h: number) => {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return mm ? `${hh}h${String(mm).padStart(2, "0")}` : `${hh}h`;
};

async function lerErro(r: Response) {
  try {
    const j = await r.json();
    return typeof j.detail === "string" ? j.detail : r.statusText;
  } catch {
    return r.statusText;
  }
}

const cenario = (s: SimulacaoCR | undefined, id: CenarioCR["id"]) => s?.cenarios.find((c) => c.id === id && !c.erro);

/** Dia x hora com o pico de pessoas no posto hoje. */
function MapaDemanda({ grade, dias }: { grade: number[][]; dias: string[] }) {
  const max = Math.max(1, ...grade.flat());
  return (
    <div className="tabela-wrap">
      <table className="mapa">
        <thead>
          <tr><th />{Array.from({ length: 24 }, (_, h) => <th key={h}>{String(h).padStart(2, "0")}</th>)}</tr>
        </thead>
        <tbody>
          {grade.map((linha, d) => (
            <tr key={d}>
              <th>{dias[d]}</th>
              {linha.map((n, h) => (
                <td key={h} className={n ? "dem" : undefined}
                    style={n ? { background: `rgba(91, 140, 255, ${0.18 + 0.6 * (n / max)})` } : undefined}>
                  {n || ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Dia x hora: quantas pessoas a nova escala põe no posto contra as necessárias, no pior momento da hora. */
function MapaCobertura({ grade, dias }: { grade: [number, number][][]; dias: string[] }) {
  return (
    <div className="tabela-wrap">
      <table className="mapa">
        <thead>
          <tr><th />{Array.from({ length: 24 }, (_, h) => <th key={h}>{String(h).padStart(2, "0")}</th>)}</tr>
        </thead>
        <tbody>
          {grade.map((linha, d) => (
            <tr key={d}>
              <th>{dias[d]}</th>
              {linha.map(([nec, cob], h) => {
                const classe = !nec && !cob ? undefined : cob < nec ? "falta" : cob > nec ? "sobra" : "ok";
                return (
                  <td key={h} className={classe} title={nec || cob ? `${dias[d]} ${h}h: ${cob} na escala, ${nec} necessário(s)` : undefined}>
                    {nec || cob ? (cob < nec ? `${cob}/${nec}` : cob) : ""}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted legenda">
        <span className="chip ok" /> igual ao necessário <span className="chip sobra" /> sobra
        <span className="chip falta" /> falta (na escala / necessário)
      </p>
    </div>
  );
}

function Cenario({ c, dias, atual }: { c: CenarioCR; dias: string[]; atual: number }) {
  if (c.erro) return <p className="erro-msg">{c.erro}</p>;
  const delta = c.total - atual;
  return (
    <div>
      <p className="muted" style={{ marginTop: 0 }}>{c.descricao}</p>
      <div className="kpis">
        <div className="kpi"><div className="valor">{c.clt}</div><div className="rotulo">CLT 5x2</div></div>
        <div className="kpi"><div className="valor">{c.horistas}</div><div className="rotulo">horistas ({c.horas_horista}/semana)</div></div>
        <div className="kpi">
          <div className="valor">{delta > 0 ? `+${delta}` : delta}</div><div className="rotulo">pessoas em relação a hoje</div>
        </div>
        <div className="kpi">
          <div className="valor">{c.rombo}</div><div className="rotulo">rombo por semana ({pct(c.rombo_pct)} das horas)</div>
        </div>
        <div className="kpi">
          <div className="valor">{c.aproveitamento == null ? "–" : pct(c.aproveitamento)}</div>
          <div className="rotulo">das horas contratadas ({c.horas_contratadas}) no posto</div>
        </div>
      </div>
      <p className="muted" style={{ fontSize: 12 }}>
        {c.otima ? `Solução ótima (OR-Tools, ${c.segundos.toLocaleString("pt-BR")} s).`
          : `Melhor solução em ${c.segundos.toLocaleString("pt-BR")} s, sem prova de que é a ótima${c.piso ? `; o OR-Tools garante que não dá para ficar abaixo de ${c.piso}` : ""}.`}
      </p>

      {c.turnos.length > 0 && (
        <div className="tabela-wrap">
          <table>
            <thead>
              <tr>
                <th>Turno</th><th>Intervalo</th><th className="num">Pessoas</th>
                {dias.map((d) => <th key={d} className="num">{d}</th>)}
                <th>Folgas</th>
              </tr>
            </thead>
            <tbody>
              {c.turnos.map((t) => (
                <tr key={t.entrada + t.saida + t.intervalo}>
                  <td className="mono">{t.entrada}–{t.saida}<div className="muted">{t.horas_dia} por dia</div></td>
                  <td className="mono">{t.intervalo}</td>
                  <td className="num">{t.pessoas}</td>
                  {t.por_dia.map((n, d) => <td key={d} className="num">{n || <span className="muted">–</span>}</td>)}
                  <td>{t.folgas.map((f) => <div key={f.dias}>{f.pessoas} x {f.dias}</div>)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {c.pessoas_horistas.length > 0 && (
        <details style={{ marginTop: 12 }}>
          <summary>Horários dos {c.pessoas_horistas.length} horista(s)</summary>
          <table style={{ marginTop: 8 }}>
            <tbody>
              {c.pessoas_horistas.map((p, i) => (
                <tr key={i}>
                  <td style={{ whiteSpace: "nowrap" }}>Horista {i + 1}</td>
                  <td className="mono">{p.turnos.map((t) => `${t.dia} ${t.entrada}–${t.saida}`).join(" · ")}</td>
                  <td className="num">{p.horas_semana}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}

      <h3 style={{ marginTop: 18 }}>Cobertura da nova escala</h3>
      <MapaCobertura grade={c.grade} dias={dias} />
    </div>
  );
}

function Detalhe({ item }: { item: Item }) {
  const [aba, setAba] = useState<CenarioCR["id"]>("quadro");
  const s = item.sim;
  if (!s) return null;
  return (
    <section className="card">
      <h2 style={{ marginTop: 0 }}>{s.funcao}</h2>
      <h3>Jornadas de hoje</h3>
      <div className="tabela-wrap">
        <table>
          <thead>
            <tr><th className="num">Pessoas</th><th>Jornada no cadastro</th><th>Como o simulador leu</th><th className="num">Horas/semana</th></tr>
          </thead>
          <tbody>
            {s.atual.jornadas.map((j) => (
              <tr key={j.jornada + j.escala}>
                <td className="num">{j.pessoas}</td>
                <td>{j.jornada}<div className="muted">{j.escala}</div></td>
                <td>{j.leitura}</td>
                <td className="num">{j.horas_semana}</td>
              </tr>
            ))}
            {s.atual.sem_horario.map((j) => (
              <tr key={"sem" + j.jornada + j.escala}>
                <td className="num">{j.pessoas}</td>
                <td>{j.jornada}<div className="muted">{j.escala}</div></td>
                <td colSpan={2}><span className="tag erro">sem horário: fora do cálculo</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {s.grade && (
        <>
          <h3 style={{ marginTop: 18 }}>Cobertura de hoje (pessoas no posto, pico de cada hora)</h3>
          <p className="muted" style={{ marginTop: 0 }}>
            {s.horas_necessarias} de posto por semana, pico de {s.pico} pessoa(s). É o que a nova escala tem de cobrir; os
            intervalos de hoje já estão descontados e 12x36, 6x1 e afins entram pela fração da equipe presente no dia.
          </p>
          <MapaDemanda grade={s.grade} dias={s.dias} />
        </>
      )}

      {s.cenarios.length > 0 && (
        <>
          <div className="abas abas-compactas" role="tablist" style={{ margin: "18px 0 12px" }}>
            {s.cenarios.map((c) => (
              <button key={c.id} role="tab" aria-selected={aba === c.id} className={aba === c.id ? "aba ativa" : "aba"}
                      onClick={() => setAba(c.id)}>
                {c.titulo}
              </button>
            ))}
          </div>
          {s.cenarios.filter((c) => c.id === aba).map((c) => <Cenario key={c.id} c={c} dias={s.dias} atual={s.atual.pessoas} />)}
        </>
      )}
    </section>
  );
}

export default function SimularCR() {
  const [centros, setCentros] = useState<Centro[] | null>(null);
  const [fonte, setFonte] = useState<string | null>(null);
  const [erroBase, setErroBase] = useState<string | null>(null);
  const [filtro, setFiltro] = useState("");
  const [cr, setCr] = useState("");
  const [limite, setLimite] = useState<42 | 40>(42);
  const [itens, setItens] = useState<Item[]>([]);
  const [simulado, setSimulado] = useState<{ cr: string; limite: number } | null>(null);
  const [rodando, setRodando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aberta, setAberta] = useState<string | null>(null);
  const execucao = useRef(0);

  useEffect(() => {
    fetch("/api/cr")
      .then(async (r) => {
        if (!r.ok) throw new Error(await lerErro(r));
        return r.json();
      })
      .then((d) => {
        setCentros(d.centros);
        setFonte(d.fonte);
      })
      .catch((e: Error) => setErroBase(e.message || "Não consegui carregar os CRs."));
    return () => {
      execucao.current++; // sai da página: para de pedir as funções que faltam
    };
  }, []);

  const filtrados = useMemo(() => {
    const f = normalizar(filtro.trim());
    return (centros ?? []).filter((c) => !f || normalizar(c.cr).includes(f));
  }, [centros, filtro]);

  useEffect(() => {
    if (filtrados.length && !filtrados.some((c) => c.cr === cr)) setCr(filtrados[0].cr);
  }, [filtrados, cr]);

  async function simular() {
    if (!cr) return;
    const id = ++execucao.current;
    setItens([]);
    setAberta(null);
    setErro(null);
    setSimulado({ cr, limite });
    setRodando("…");
    const r = await fetch(`/api/cr/funcoes?cr=${encodeURIComponent(cr)}`).catch(() => null);
    if (execucao.current !== id) return;
    if (!r?.ok) {
      setErro(r ? await lerErro(r) : "Sem resposta da API.");
      setRodando(null);
      return;
    }
    const { funcoes } = (await r.json()) as { funcoes: FuncaoCR[] };
    let lista: Item[] = funcoes.map((f) => ({ funcao: f }));
    setItens(lista);
    for (const f of funcoes) {
      if (!f.com_horario) continue;
      setRodando(f.funcao);
      const resp = await fetch("/api/cr/simular", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cr, funcao: f.funcao, limite_horas: limite }),
      }).catch(() => null);
      if (execucao.current !== id) return;
      const item: Item = resp?.ok ? { funcao: f, sim: await resp.json() }
        : { funcao: f, erro: resp ? await lerErro(resp) : "Sem resposta da API." };
      if (execucao.current !== id) return;
      lista = lista.map((e) => (e.funcao.funcao === f.funcao ? item : e));
      setItens(lista);
      setAberta((a) => a ?? (item.sim ? f.funcao : null));
    }
    setRodando(null);
  }

  function parar() {
    execucao.current++;
    setRodando(null);
  }

  const prontos = itens.filter((i) => i.sim);
  const comHorario = itens.filter((i) => i.funcao.com_horario > 0);
  const soma = (f: (s: SimulacaoCR) => number) => prontos.reduce((t, i) => t + f(i.sim!), 0);
  const hoje = soma((s) => s.atual.pessoas);
  const necessarias = soma((s) => horas(s.horas_necessarias));
  const rombo = soma((s) => horas(cenario(s, "quadro")?.rombo ?? "0h"));
  const soClt = soma((s) => cenario(s, "clt")?.clt ?? 0);
  const cltH = soma((s) => cenario(s, "clt_horista")?.clt ?? 0);
  const horistasH = soma((s) => cenario(s, "clt_horista")?.horistas ?? 0);
  const semHorario = itens.reduce((t, i) => t + i.funcao.sem_horario.reduce((u, j) => u + j.pessoas, 0), 0);
  const itemAberto = itens.find((i) => i.funcao.funcao === aberta);
  const diferenca = (n: number) => (n - hoje > 0 ? `+${n - hoje}` : `${n - hoje}`);

  return (
    <>
      <section className="card">
        {erroBase ? (
          <p className="erro-msg" style={{ margin: 0 }}>
            {erroBase} A lista de CRs vem da base enviada na aba <a href="/relatorio">Relatório</a>.
          </p>
        ) : (
          <>
            <div className="row" style={{ alignItems: "flex-end" }}>
              <label className="campo-cr">
                <span className="muted">Filtrar CR</span>
                <input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="código, UF ou nome"
                       disabled={!centros} />
              </label>
              <label className="campo-cr largo">
                <span className="muted">
                  CR {centros ? `(${filtrados.length} de ${centros.length})` : "(carregando…)"}
                </span>
                <select value={cr} onChange={(e) => setCr(e.target.value)} disabled={!filtrados.length}>
                  {filtrados.map((c) => <option key={c.cr} value={c.cr}>{c.cr} · {c.pessoas} pessoa(s)</option>)}
                </select>
              </label>
            </div>
            <div className="row" style={{ marginTop: 14 }}>
              {fonte && <span className="muted">Base: {fonte}</span>}
              <span className="spacer" />
              <span className="muted">Carga semanal máxima</span>
              <div className="abas abas-compactas" role="radiogroup" aria-label="Carga semanal máxima">
                {([42, 40] as const).map((h) => (
                  <button key={h} role="radio" aria-checked={limite === h} className={limite === h ? "aba ativa" : "aba"}
                          onClick={() => setLimite(h)}>
                    {h}h
                  </button>
                ))}
              </div>
              {rodando ? <button onClick={parar}>Parar</button>
                : <button className="primario" onClick={simular} disabled={!cr}>Simular</button>}
            </div>
          </>
        )}
      </section>

      {erro && <div className="erro-msg">{erro}</div>}

      {simulado && itens.length > 0 && (
        <section className="card">
          <div className="row" style={{ marginBottom: 8 }}>
            <h2 style={{ margin: 0 }}>{simulado.cr}</h2>
            <span className="spacer" />
            <span className="tag neutra">5x2 de {simulado.limite}h</span>
          </div>
          {rodando && (
            <p className="progresso">
              Otimizando {prontos.length + 1} de {comHorario.length}: <strong>{rodando}</strong>
              <span className="barra-progresso"><span style={{ width: `${(prontos.length / Math.max(1, comHorario.length)) * 100}%` }} /></span>
            </p>
          )}
          <div className="kpis">
            <div className="kpi"><div className="valor">{hoje}</div><div className="rotulo">pessoas hoje com horário{semHorario ? ` (+${semHorario} sem horário)` : ""}</div></div>
            <div className="kpi"><div className="valor">{fmtHoras(rombo)}</div><div className="rotulo">rombo por semana com o mesmo quadro em 5x2{necessarias ? ` (${pct(rombo / necessarias)})` : ""}</div></div>
            <div className="kpi"><div className="valor">{soClt} <small>({diferenca(soClt)})</small></div><div className="rotulo">pessoas só CLT, cobrindo tudo</div></div>
            <div className="kpi"><div className="valor">{cltH} + {horistasH}</div><div className="rotulo">CLT + horistas pontuais, cobrindo tudo</div></div>
          </div>

          <div className="tabela-wrap" style={{ marginTop: 12 }}>
            <table>
              <thead>
                <tr>
                  <th>Função</th><th className="num">Hoje</th><th className="num">Mesmo quadro: rombo</th>
                  <th className="num">Só CLT</th><th className="num">CLT + horista</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((i) => {
                  const q = cenario(i.sim, "quadro");
                  const c = cenario(i.sim, "clt");
                  const h = cenario(i.sim, "clt_horista");
                  const sem = i.funcao.pessoas - i.funcao.com_horario;
                  return (
                    <tr key={i.funcao.funcao} className={`${i.sim ? "clicavel" : ""} ${aberta === i.funcao.funcao ? "selecionada" : ""}`}
                        onClick={() => i.sim && setAberta(i.funcao.funcao)}>
                      <td>{i.funcao.funcao}{sem > 0 && <div className="muted">{sem} sem horário</div>}</td>
                      <td className="num">{i.funcao.com_horario}</td>
                      {i.sim ? (
                        <>
                          <td className="num">{q ? <>{q.rombo} <span className="muted">({pct(q.rombo_pct)})</span></> : "–"}</td>
                          <td className="num">{c ? c.clt : "–"}</td>
                          <td className="num">{h ? `${h.clt} + ${h.horistas}` : "–"}</td>
                        </>
                      ) : (
                        <td colSpan={3} className="muted" style={{ textAlign: "right" }}>
                          {i.erro ?? (!i.funcao.com_horario ? "sem horário no cadastro"
                            : rodando === i.funcao.funcao ? "otimizando…" : rodando ? "na fila" : "não simulada")}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ fontSize: 12, margin: "10px 0 0" }}>
            Cada função é otimizada à parte (uma não cobre a outra). A cobertura de hoje sai das jornadas do cadastro;
            jornadas sem horário (N/I, horista, cargo de confiança, revezamento sem hora) ficam fora do cálculo. Clique
            numa função para ver turnos, folgas e a cobertura hora a hora.
          </p>
        </section>
      )}

      {itemAberto && <Detalhe key={`${simulado?.cr}|${simulado?.limite}|${itemAberto.funcao.funcao}`} item={itemAberto} />}
    </>
  );
}
