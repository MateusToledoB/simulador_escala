"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ACOES, Acao, Base, Cockpit, NIVEIS, NIVEL_DA_ACAO, Nivel, ORDEM, PRAZOS, classificar, dec, fmt, pct,
} from "@/lib/relatorio";

type Filtros = { dir: string; uf: string; esc: string; lv: string; act: string; neg: string; q: string; c1236: boolean };
const SEM_FILTRO: Filtros = { dir: "", uf: "", esc: "", lv: "", act: "", neg: "", q: "", c1236: true };
const CHAVE = "radar5x2";

type Linha = {
  d: number; e: number; p: number; neg: number; h: number | null; c: number; inc: number; sem: number;
  lv: Nivel; act: Acao; fte1: number; fte2: number;
};
type PorCR = {
  p: number; code: string; uf: string; cli: string; dirs: Set<number>; t: number; c: Partial<Record<Nivel, number>>;
  fte: number; inc: number; acts: Partial<Record<Acao, number>>; escs: Record<number, number>; hs: number; hc: number;
  imp: number; worst: Nivel; act: Acao; esc: number; hm: number | null; score: number; ck: Record<string, string> | null;
};

const ler = <T,>(chave: string, padrao: T): T => {
  try { const v = localStorage.getItem(chave); return v ? (JSON.parse(v) as T) : padrao; } catch { return padrao; }
};
const gravar = (chave: string, valor: unknown) => {
  try { if (valor == null) localStorage.removeItem(chave); else localStorage.setItem(chave, JSON.stringify(valor)); } catch {}
};
const soma = (c: Partial<Record<Nivel, number>>, ...k: Nivel[]) => k.reduce((s, x) => s + (c[x] || 0), 0);

async function erroDe(resp: Response) {
  try { const j = await resp.json(); if (typeof j.detail === "string") return j.detail; } catch {}
  return `Erro ${resp.status} ao falar com a API.`;
}

function Pilula({ n }: { n: Nivel }) {
  return <span className="pill" style={{ background: `var(${NIVEIS[n].cor})` }}>{NIVEIS[n].nome}</span>;
}

function Pilha({ c, t }: { c: Partial<Record<Nivel, number>>; t: number }) {
  return (
    <>
      {ORDEM.filter((k) => c[k]).map((k) => (
        <i key={k} style={{ width: `${(c[k]! / t) * 100}%`, background: `var(${NIVEIS[k].cor})` }}
           title={`${NIVEIS[k].nome}: ${fmt(c[k]!)}`} />
      ))}
    </>
  );
}

/** Régua da promulgação até a 2ª etapa, com hoje marcado e a contagem regressiva. */
function Regua() {
  const [hoje, setHoje] = useState<Date | null>(null);
  useEffect(() => { const d = new Date(); d.setHours(0, 0, 0, 0); setHoje(d); }, []);
  const t0 = PRAZOS.promulgacao.getTime(), t1 = PRAZOS.etapa2.getTime();
  const x = (d: Date) => Math.max(0, Math.min(100, ((d.getTime() - t0) / (t1 - t0)) * 100));
  const dias = (d: Date) => (hoje ? Math.max(0, Math.ceil((d.getTime() - hoje.getTime()) / 864e5)) : "–");
  return (
    <div className="ruler" aria-label="Régua de prazos">
      <div className="track">
        {hoje && <div className="fill" style={{ width: `${x(hoje)}%` }} />}
        <div className="mk" style={{ left: 0 }} />
        <div className="lab dn" style={{ left: 0, transform: "none", textAlign: "left" }}><b>16/10/2026</b>Promulgação</div>
        <div className="mk next" style={{ left: `${x(PRAZOS.etapa1)}%` }} />
        <div className="lab up" style={{ left: `${x(PRAZOS.etapa1)}%`, transform: "translateX(-30%)" }}><b>≈15/12/2026</b>1ª etapa · 5x2 · 42h</div>
        <div className="mk" style={{ left: "100%" }} />
        <div className="lab up" style={{ left: "100%", transform: "translateX(-100%)", textAlign: "right" }}><b>≈15/12/2027</b>2ª etapa · 40h</div>
        {hoje && <div className="today" style={{ left: `${x(hoje)}%` }} title="hoje" />}
      </div>
      <div className="countdown">
        <span><strong>{dias(PRAZOS.etapa1)}</strong> dias para a 1ª etapa</span>
        <span><strong style={{ color: "var(--n-mo)" }}>{dias(PRAZOS.etapa2)}</strong> dias para a 2ª etapa</span>
      </div>
    </div>
  );
}

export default function Radar() {
  const [base, setBase] = useState<Base | null>(null);
  const [estado, setEstado] = useState<"carregando" | "vazio" | "ok">("carregando");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [F, setF] = useState<Filtros>(SEM_FILTRO);
  const [ordem, setOrdem] = useState<{ k: string; dir: number }>({ k: "imp", dir: -1 });
  const [pagina, setPagina] = useState(0);
  const [ck, setCk] = useState<Cockpit | null>(null);
  const [ckMsg, setCkMsg] = useState("");
  const [aviso, setAviso] = useState("");
  const arquivo = useRef<HTMLInputElement>(null);
  const arquivoCk = useRef<HTMLInputElement>(null);
  const regs = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setF({ ...SEM_FILTRO, ...ler<Partial<Filtros>>(CHAVE, {}) });
    setCk(ler<Cockpit | null>(CHAVE + "ck", null));
    fetch("/api/relatorio").then(async (r) => {
      if (r.ok) { setBase(await r.json()); setEstado("ok"); }
      else if (r.status === 404) setEstado("vazio");
      else { setErro(await erroDe(r)); setEstado("vazio"); }
    }).catch(() => { setErro("Não foi possível falar com a API."); setEstado("vazio"); });
  }, []);
  useEffect(() => { gravar(CHAVE, F); }, [F]);

  const mudar = (campos: Partial<Filtros>) => { setF((f) => ({ ...f, ...campos })); setPagina(0); };
  const alternar = (k: keyof Filtros, v: string) => mudar({ [k]: F[k] === v ? "" : v } as Partial<Filtros>);
  const avisar = (m: string) => { setAviso(m); setTimeout(() => setAviso(""), 2600); };

  const enviarBase = async (f: File) => {
    setErro(""); setEnviando(true);
    const form = new FormData(); form.append("arquivo", f);
    const r = await fetch("/api/relatorio", { method: "POST", body: form }).catch(() => null);
    setEnviando(false);
    if (arquivo.current) arquivo.current.value = "";
    if (!r?.ok) return setErro(r ? await erroDe(r) : "Não foi possível falar com a API.");
    setBase(await r.json()); setEstado("ok"); setPagina(0); avisar("Base atualizada.");
  };

  const enviarCockpit = async (f?: File) => {
    if (!f) return;
    setCkMsg("Lendo…");
    const form = new FormData(); form.append("arquivo", f);
    const r = await fetch("/api/relatorio/cockpit", { method: "POST", body: form }).catch(() => null);
    if (arquivoCk.current) arquivoCk.current.value = "";
    if (!r?.ok) return setCkMsg(r ? await erroDe(r) : "Não foi possível falar com a API.");
    const dados = (await r.json()) as Cockpit;
    setCk(dados); gravar(CHAVE + "ck", dados); setCkMsg("");
  };

  const compensado = useMemo(() => new Set((base?.escs ?? []).map((e, i) => (/compensado/i.test(e[0]) ? i : -1))), [base]);
  const ufs = useMemo(() => [...new Set((base?.crs ?? []).map((c) => c[1]))].sort(), [base]);

  // linhas do recorte
  const L = useMemo<Linha[]>(() => {
    if (!base) return [];
    const q = F.q.trim().toLowerCase();
    const out: Linha[] = [];
    for (const [d, e, p, h, c, inc, sem, neg] of base.rows) {
      const cr = base.crs[p];
      if (F.dir !== "" && d !== +F.dir) continue;
      if (F.uf && cr[1] !== F.uf) continue;
      if (F.esc !== "" && e !== +F.esc) continue;
      if (F.neg !== "" && neg !== +F.neg) continue;
      if (q && !(cr[0].toLowerCase().includes(q) || cr[2].toLowerCase().includes(q))) continue;
      const [lv, act] = classificar(base.escs[e][1], h, compensado.has(e), F.c1236);
      if (F.lv === "IMP" ? lv !== "CR" && lv !== "AL" : F.lv && lv !== F.lv) continue;
      if (F.act && act !== F.act) continue;
      const hh = h && h <= 100 ? h : 0;
      out.push({
        d, e, p, neg, h, c, inc, sem, lv, act,
        fte1: lv === "CR" || lv === "AL" || lv === "X" ? (Math.max(0, hh - 42) * c) / 42 : 0,
        fte2: lv !== "V" ? (Math.max(0, hh - 40) * c) / 40 : 0,
      });
    }
    return out;
  }, [base, F, compensado]);

  const R = useMemo(() => {
    if (!base) return null;
    // KPIs
    let tot = 0, imp = 0, cr = 0, f1 = 0, f2 = 0, inc = 0, sem = 0;
    const pI = new Set<number>(), pA = new Set<number>();
    for (const x of L) {
      tot += x.c; inc += x.inc; sem += x.sem; f1 += x.fte1; f2 += x.fte2; pA.add(x.p);
      if (x.lv === "CR" || x.lv === "AL") { imp += x.c; pI.add(x.p); }
      if (x.lv === "CR") cr += x.c;
    }
    // por diretor
    const porDir: Record<number, { t: number; c: Partial<Record<Nivel, number>>; p: Set<number>; fte: number }> = {};
    for (const x of L) {
      const o = (porDir[x.d] ??= { t: 0, c: {}, p: new Set(), fte: 0 });
      o.t += x.c; o.c[x.lv] = (o.c[x.lv] || 0) + x.c; o.fte += x.fte1;
      if (x.lv === "CR" || x.lv === "AL") o.p.add(x.p);
    }
    const dk = Object.keys(porDir).map(Number).sort((a, b) => porDir[b].t - porDir[a].t);
    // por escala
    const porEsc: Record<number, { t: number; c: Partial<Record<Nivel, number>> }> = {};
    for (const x of L) { const o = (porEsc[x.e] ??= { t: 0, c: {} }); o.t += x.c; o.c[x.lv] = (o.c[x.lv] || 0) + x.c; }
    const ek = Object.keys(porEsc).map(Number)
      .sort((a, b) => soma(porEsc[b].c, "CR", "AL", "X") - soma(porEsc[a].c, "CR", "AL", "X") || porEsc[b].t - porEsc[a].t)
      .slice(0, 14);
    // matriz UF x diretor (crítico + alto)
    const H: Record<string, number> = {}, uT: Record<string, number> = {};
    for (const x of L) {
      if (x.lv !== "CR" && x.lv !== "AL") continue;
      const u = base.crs[x.p][1];
      H[u + "|" + x.d] = (H[u + "|" + x.d] || 0) + x.c; uT[u] = (uT[u] || 0) + x.c;
    }
    const uk = Object.keys(uT).sort((a, b) => uT[b] - uT[a]);
    const hm = Math.max(1, ...Object.values(H));
    const dks = base.dirs.map((_, i) => i).filter((i) => uk.some((u) => H[u + "|" + i]));
    // por CR
    const P: Record<number, PorCR> = {};
    for (const x of L) {
      const c = base.crs[x.p];
      const o = (P[x.p] ??= {
        p: x.p, code: c[0], uf: c[1], cli: c[2], dirs: new Set(), t: 0, c: {}, fte: 0, inc: 0, acts: {}, escs: {},
        hs: 0, hc: 0, imp: 0, worst: "OK", act: "A0", esc: x.e, hm: null, score: 0, ck: null,
      });
      o.dirs.add(x.d); o.t += x.c; o.c[x.lv] = (o.c[x.lv] || 0) + x.c; o.fte += x.fte1; o.inc += x.inc;
      if (x.act !== "A0") o.acts[x.act] = (o.acts[x.act] || 0) + x.c;
      o.escs[x.e] = (o.escs[x.e] || 0) + x.c;
      if (x.h && x.h < 100) { o.hs += x.h * x.c; o.hc += x.c; }
    }
    const PL = Object.values(P).map((o) => {
      o.imp = soma(o.c, "CR", "AL");
      o.worst = ORDEM.find((k) => o.c[k] && k !== "OK") || "OK";
      o.act = (Object.entries(o.acts).sort((a, b) => b[1] - a[1])[0]?.[0] as Acao) || "A0";
      o.esc = Number(Object.entries(o.escs).sort((a, b) => b[1] - a[1])[0][0]);
      o.hm = o.hc ? o.hs / o.hc : null;
      o.ck = ck?.map[o.code.toUpperCase()] ?? null;
      o.score = (o.c.CR || 0) * 3 + (o.c.AL || 0) * 2 + (o.c.X || 0) + (o.c.MO || 0) * 0.5 + o.inc;
      return o;
    });
    // regionais
    const RG: Record<string, { t: number; imp: number; fte: number; c: Partial<Record<Nivel, number>>; acts: Partial<Record<Acao, number>>; actP: Partial<Record<Acao, Set<number>>> }> = {};
    for (const x of L) {
      const u = base.crs[x.p][1];
      const o = (RG[u] ??= { t: 0, imp: 0, fte: 0, c: {}, acts: {}, actP: {} });
      o.t += x.c; o.c[x.lv] = (o.c[x.lv] || 0) + x.c; o.fte += x.fte1;
      if (x.lv === "CR" || x.lv === "AL") o.imp += x.c;
      if (x.act !== "A0") { o.acts[x.act] = (o.acts[x.act] || 0) + x.c; (o.actP[x.act] ??= new Set()).add(x.p); }
    }
    const rk = Object.keys(RG).filter((u) => Object.keys(RG[u].acts).length).sort((a, b) => RG[b].imp - RG[a].imp || RG[b].t - RG[a].t);
    return { tot, imp, cr, f1, f2, inc, sem, pI, pA, porDir, dk, porEsc, ek, H, uT, uk, hm, dks, PL, RG, rk };
  }, [base, L, ck]);

  // tabela de CRs
  const ckCols = ck ? ck.cols.slice(0, 4) : [];
  const colunas: [string, string, boolean, boolean][] = [
    ["code", "CR", false, false], ["cli", "Cliente / posto", false, false], ["uf", "UF", false, false],
    ["dir", "Diretor", false, false], ["t", "Colab.", true, false], ["cr", "Crít.", true, false], ["al", "Alto", true, false],
    ["mo", "Mod.", true, false], ["escN", "Escala principal", false, false], ["hm", "h/sem", true, false],
    ["fte", "FTE 42h", true, false], ["inc", "Inconsist.", true, false], ["actN", "Ação principal", false, false],
    ...ckCols.map((c): [string, string, boolean, boolean] => ["ck:" + c, c, false, true]),
  ];
  const valor = (o: PorCR, k: string): string | number => {
    if (!base) return "";
    switch (k) {
      case "code": return o.code;
      case "cli": return o.cli;
      case "uf": return o.uf;
      case "dir": return [...o.dirs].map((i) => base.dirs[i]).join(" / ");
      case "t": return o.t;
      case "cr": return o.c.CR || 0;
      case "al": return o.c.AL || 0;
      case "mo": return o.c.MO || 0;
      case "escN": return base.escs[o.esc][0];
      case "hm": return o.hm ?? -1;
      case "fte": return o.fte;
      case "inc": return o.inc;
      case "actN": return ACOES[o.act];
      case "imp": return o.score;
      default: return k.startsWith("ck:") ? o.ck?.[k.slice(3)] ?? "" : "";
    }
  };
  const ordenados = useMemo(() => {
    if (!R) return [];
    return [...R.PL].sort((a, b) => {
      const x = valor(a, ordem.k), y = valor(b, ordem.k);
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "pt-BR", { numeric: true })) * ordem.dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [R, ordem]);
  const POR_PAGINA = 25;
  const paginas = Math.max(1, Math.ceil(ordenados.length / POR_PAGINA));
  const pg = Math.min(pagina, paginas - 1);

  const ordenar = (k: string) =>
    setOrdem((o) => (o.k === k ? { k, dir: -o.dir } : { k, dir: ["code", "cli", "uf", "dir", "escN", "actN"].includes(k) || k.startsWith("ck:") ? 1 : -1 }));

  const copiarCSV = () => {
    const q = (v: unknown) => { const s = String(v ?? ""); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const linhas = [
      ["Nível", ...colunas.map((c) => c[1])].join(";"),
      ...ordenados.map((o) => [NIVEIS[o.worst].nome, ...colunas.map(([k]) => {
        let v = valor(o, k);
        if (typeof v === "number") v = k === "hm" && v < 0 ? "" : v.toLocaleString("pt-BR", { maximumFractionDigits: 2, useGrouping: false });
        return q(v);
      })].join(";")),
    ].join("\n");
    navigator.clipboard.writeText(linhas).then(() => avisar(`${fmt(ordenados.length)} CRs copiados. Cole no Excel.`))
      .catch(() => avisar("Não foi possível copiar."));
  };

  const BotaoBase = (
    <label className={"botao" + (enviando ? " desabilitado" : "")}>
      {enviando ? "Lendo base…" : base ? "Atualizar base (xlsx)" : "Enviar base (xlsx)"}
      <input ref={arquivo} type="file" accept=".xlsx,.xls" hidden disabled={enviando}
             onChange={(e) => e.target.files?.[0] && enviarBase(e.target.files[0])} />
    </label>
  );

  if (estado === "carregando") return <p className="muted">Carregando relatório…</p>;
  if (!base || !R) {
    return (
      <section className="card">
        <h2>Base do relatório</h2>
        <p className="muted">
          Envie a exportação de escalas e jornadas (xlsx com as colunas ESCALA, HORAS SEMANAIS, DIRETOR, CR,
          NEGÓCIO, GERENTE_REGIONAL, COLABORADORES, INCONSISTÊNCIAS e COLAB. SEM ESCALA). Ela fica salva no servidor
          para todos que acessam o site.
        </p>
        {BotaoBase}
        {erro && <div className="erro-msg" style={{ marginTop: 12 }}>{erro}</div>}
      </section>
    );
  }

  const chips: [keyof Filtros, string][] = [];
  if (F.dir !== "") chips.push(["dir", "Diretor: " + base.dirs[+F.dir]]);
  if (F.uf) chips.push(["uf", "UF: " + F.uf]);
  if (F.esc !== "") chips.push(["esc", "Escala: " + base.escs[+F.esc][0]]);
  if (F.neg !== "") chips.push(["neg", "Negócio: " + base.negs[+F.neg]]);
  if (F.lv) chips.push(["lv", "Nível: " + (F.lv === "IMP" ? "Crítico + Alto" : NIVEIS[F.lv as Nivel].nome)]);
  if (F.act) chips.push(["act", "Ação: " + ACOES[F.act as Acao]]);
  if (F.q) chips.push(["q", "Busca: " + F.q]);

  const mxD = Math.max(1, ...R.dk.map((k) => R.porDir[k].t));
  const mxE = Math.max(1, ...R.ek.map((k) => R.porEsc[k].t));
  const crs = base.crs.length;

  return (
    <div className="radar">
      <header className="radar-topo">
        <div>
          <div className="eyebrow">PEC 221/2019 promulgada em 16/10/2026 · base {base.fonte}</div>
          <h1>Radar Escala 5x2</h1>
          <p className="lede">
            Escalas e jornadas cadastradas por diretor e CR confrontadas com a nova regra constitucional: fim da 6x1,
            duas folgas semanais e teto de 42h em 60 dias, caindo para 40h doze meses depois.
          </p>
        </div>
        <Regua />
      </header>

      <div className="filtros">
        <div className="fld"><label htmlFor="fDir">Diretor</label>
          <select id="fDir" value={F.dir} onChange={(e) => mudar({ dir: e.target.value })}>
            <option value="">Todos</option>{base.dirs.map((d, i) => <option key={i} value={i}>{d}</option>)}
          </select></div>
        <div className="fld"><label htmlFor="fUf">Regional (UF)</label>
          <select id="fUf" value={F.uf} onChange={(e) => mudar({ uf: e.target.value })}>
            <option value="">Todas</option>{ufs.map((u) => <option key={u} value={u}>{u}</option>)}
          </select></div>
        <div className="fld"><label htmlFor="fNeg">Negócio</label>
          <select id="fNeg" value={F.neg} onChange={(e) => mudar({ neg: e.target.value })}>
            <option value="">Todos</option>
            {base.negs.map((n, i) => [n, i] as const).sort((a, b) => a[0].localeCompare(b[0])).map(([n, i]) => <option key={i} value={i}>{n}</option>)}
          </select></div>
        <div className="fld"><label htmlFor="fEsc">Escala</label>
          <select id="fEsc" value={F.esc} onChange={(e) => mudar({ esc: e.target.value })}>
            <option value="">Todas</option>
            {base.escs.map((e, i) => [e[0], i] as const).sort((a, b) => a[0].localeCompare(b[0])).map(([n, i]) => <option key={i} value={i}>{n}</option>)}
          </select></div>
        <div className="fld"><label htmlFor="fLv">Nível de impacto</label>
          <select id="fLv" value={F.lv} onChange={(e) => mudar({ lv: e.target.value })}>
            <option value="">Todos</option>{ORDEM.map((k) => <option key={k} value={k}>{NIVEIS[k].nome}</option>)}
            <option value="IMP">Crítico + Alto (1ª etapa)</option>
          </select></div>
        <div className="fld"><label htmlFor="fAct">Ação requerida</label>
          <select id="fAct" value={F.act} onChange={(e) => mudar({ act: e.target.value })}>
            <option value="">Todas</option>{Object.entries(ACOES).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
          </select></div>
        <div className="fld"><label htmlFor="fQ">CR ou cliente</label>
          <input type="search" id="fQ" placeholder="ex.: 36031 ou Electrolux" value={F.q} onChange={(e) => mudar({ q: e.target.value })} /></div>
        <label className="tog"><input type="checkbox" checked={F.c1236} onChange={(e) => mudar({ c1236: e.target.checked })} /> 12x36 acima de 42h conta como impacto</label>
        <button onClick={() => mudar({ ...SEM_FILTRO, c1236: F.c1236 })}>Limpar filtros</button>
        {BotaoBase}
        {chips.length > 0 && (
          <div className="chips">
            {chips.map(([k, l]) => (
              <span className="chip" key={k}>{l}<button aria-label="Remover filtro" onClick={() => mudar({ [k]: "" } as Partial<Filtros>)}>×</button></span>
            ))}
          </div>
        )}
      </div>
      {erro && <div className="erro-msg">{erro}</div>}

      <section className="kpis-radar" aria-label="Indicadores">
        {[
          ["Colaboradores no recorte", fmt(R.tot), `${fmt(R.pA.size)} CRs`, false],
          ["Impactados na 1ª etapa", fmt(R.imp), pct(R.imp, R.tot) + " do recorte", true],
          ["Nível crítico", fmt(R.cr), "escala e jornada fora", true],
          ["CRs com ajuste", fmt(R.pI.size), pct(R.pI.size, R.pA.size) + " dos CRs", false],
          ["FTE estimado · 42h", fmt(R.f1), `${fmt(R.f2)} FTE para 40h em 2027`, false],
          ["Cadastro a corrigir", fmt(R.inc), `${fmt(R.sem)} colaboradores sem escala`, false],
        ].map(([l, v, s, hot]) => (
          <div className={"kpi-r" + (hot ? " hot" : "")} key={l as string}>
            <div className="eyebrow">{l}</div><div className="v num">{v}</div><div className="s">{s}</div>
          </div>
        ))}
      </section>

      <section className="grid2">
        <div className="painel">
          <div className="painel-h"><h2>Impacto por diretor</h2><p>Clique numa barra para filtrar</p></div>
          <div className="legend">
            {ORDEM.filter((k) => k !== "X" || !F.c1236).map((k) => (
              <span key={k}><i className="sw" style={{ background: `var(${NIVEIS[k].cor})` }} />{NIVEIS[k].nome}</span>
            ))}
          </div>
          <div className="bars" style={{ marginTop: 12 }}>
            {R.dk.length ? R.dk.map((k) => (
              <button key={k} className={"bar-row" + (F.dir === String(k) ? " sel" : "")} onClick={() => alternar("dir", String(k))}>
                <span className="nm">{base.dirs[k]}</span>
                <span className="stack" style={{ width: `${(R.porDir[k].t / mxD) * 100}%` }}><Pilha c={R.porDir[k].c} t={R.porDir[k].t} /></span>
                <span className="tt">{fmt(R.porDir[k].t)}</span>
              </button>
            )) : <p className="note">Nenhum dado no recorte.</p>}
          </div>
          <div className="tabela-wrap" style={{ marginTop: 14 }}>
            <table className="tbl">
              <thead><tr><th>Diretor</th><th className="n">Crítico</th><th className="n">Alto</th><th className="n">Moderado</th><th className="n">% impacto</th><th className="n">CRs</th><th className="n">FTE 42h</th></tr></thead>
              <tbody>
                {R.dk.map((k) => { const o = R.porDir[k]; return (
                  <tr key={k} className="clk" onClick={() => alternar("dir", String(k))}>
                    <td>{base.dirs[k]}</td><td className="n">{fmt(o.c.CR || 0)}</td><td className="n">{fmt(o.c.AL || 0)}</td>
                    <td className="n">{fmt(o.c.MO || 0)}</td><td className="n">{pct(soma(o.c, "CR", "AL"), o.t)}</td>
                    <td className="n">{o.p.size}</td><td className="n">{fmt(o.fte)}</td>
                  </tr>); })}
              </tbody>
            </table>
          </div>
        </div>
        <div className="painel">
          <div className="painel-h"><h2>Escalas impactadas</h2><p>Colaboradores por escala cadastrada</p></div>
          <div className="bars">
            {R.ek.map((k) => (
              <button key={k} className={"bar-row" + (F.esc === String(k) ? " sel" : "")} onClick={() => alternar("esc", String(k))}>
                <span className="nm" title={base.escs[k][0]}>{base.escs[k][0]}</span>
                <span className="stack" style={{ width: `${(R.porEsc[k].t / mxE) * 100}%` }}><Pilha c={R.porEsc[k].c} t={R.porEsc[k].t} /></span>
                <span className="tt">{fmt(R.porEsc[k].t)}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="painel">
        <div className="painel-h"><h2>Matriz regional × diretor</h2><p>Colaboradores em nível crítico ou alto. Clique numa célula para abrir o recorte</p></div>
        <div className="tabela-wrap">
          <table className="tbl heat">
            {R.uk.length ? (
              <>
                <thead><tr><th>UF</th>{R.dks.map((i) => <th key={i} className="n">{base.dirs[i].split(" ")[0]}</th>)}<th className="n">Total</th></tr></thead>
                <tbody>
                  {R.uk.map((u) => (
                    <tr key={u}>
                      <td><b>{u}</b></td>
                      {R.dks.map((i) => {
                        const v = R.H[u + "|" + i] || 0, a = v ? 0.12 + 0.78 * Math.sqrt(v / R.hm) : 0;
                        return (
                          <td key={i} className="c" onClick={() => { mudar({ uf: u, dir: String(i), lv: "IMP" }); regs.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
                              style={{ background: `color-mix(in srgb, var(--n-cr) ${Math.round(a * 100)}%, transparent)`, color: a > 0.5 ? "#fff" : "var(--text)" }}>
                            {v ? fmt(v) : "·"}
                          </td>
                        );
                      })}
                      <td className="n"><b>{fmt(R.uT[u])}</b></td>
                    </tr>
                  ))}
                </tbody>
              </>
            ) : <tbody><tr><td className="note">Sem colaboradores em nível crítico ou alto no recorte.</td></tr></tbody>}
          </table>
        </div>
      </section>

      <section className="painel" ref={regs}>
        <div className="painel-h"><h2>Plano de ação por regional</h2><p>Frentes de ajuste geradas a partir do recorte atual, ordenadas por colaboradores afetados</p></div>
        <div className="regs">
          {R.rk.length ? R.rk.map((u) => {
            const o = R.RG[u];
            const acts = (Object.entries(o.acts) as [Acao, number][])
              .sort((a, b) => ORDEM.indexOf(NIVEL_DA_ACAO[a[0]]) - ORDEM.indexOf(NIVEL_DA_ACAO[b[0]]) || b[1] - a[1]);
            const tops = R.PL.filter((p) => p.uf === u && p.score > 0).sort((a, b) => b.score - a.score).slice(0, 4);
            const imp = R.PL.filter((p) => p.uf === u && p.imp);
            return (
              <article className="reg" key={u}>
                <div className="reg-h"><span className="uf">{u}</span><span className="num muted" style={{ fontSize: 13 }}>{fmt(o.imp)} de {fmt(o.t)} colab. · {fmt(o.fte)} FTE</span></div>
                <div className="stack"><Pilha c={o.c} t={o.t} /></div>
                <ul className="acts">
                  {acts.map(([a, n]) => (
                    <li key={a}>
                      <i className="d" style={{ background: `var(${NIVEIS[NIVEL_DA_ACAO[a]].cor})` }} />
                      <span>{ACOES[a]}<small>{o.actP[a]!.size} CRs</small></span>
                      <span className="num mono-n">{fmt(n)}</span>
                    </li>
                  ))}
                </ul>
                {tops.length > 0 && (
                  <div className="top-pecs">Prioridade: {tops.map((p, i) => <span key={p.p}>{i > 0 && " · "}<b>{p.code}</b> {p.cli} ({fmt(p.imp)})</span>)}</div>
                )}
                {ck && <div className="top-pecs"><span className="cock">Cockpit:</span> {imp.filter((p) => p.ck).length} de {imp.length} CRs impactados referenciados</div>}
              </article>
            );
          }) : <p className="note">Nada a endereçar no recorte atual.</p>}
        </div>
      </section>

      <section className="painel">
        <div className="painel-h"><h2>CRs para endereçar</h2><button onClick={copiarCSV}>Copiar tabela (CSV)</button></div>
        <div className="tabela-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th className="s" onClick={() => ordenar("imp")} title="Ordenar por prioridade">Prior.</th>
                {colunas.map(([k, l, n, c]) => (
                  <th key={k} className={"s" + (n ? " n" : "")} onClick={() => ordenar(k)}>
                    {c && <span className="cock">◆ </span>}{l}{ordem.k === k ? (ordem.dir > 0 ? " ▲" : " ▼") : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ordenados.slice(pg * POR_PAGINA, pg * POR_PAGINA + POR_PAGINA).map((o) => (
                <tr key={o.p}>
                  <td><Pilula n={o.worst} /></td>
                  {colunas.map(([k, , n]) => {
                    let v = valor(o, k);
                    if (k === "hm") v = o.hm == null ? "–" : dec(o.hm);
                    else if (k === "fte") v = dec(o.fte);
                    else if (n && typeof v === "number") v = fmt(v);
                    return <td key={k} className={n ? "n" : k === "code" ? "mono" : undefined}>{v}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pager">
          <span>{fmt(ordenados.length)} CRs no recorte</span>
          <button disabled={pg === 0} onClick={() => setPagina(pg - 1)}>Anterior</button>
          <span>Página {pg + 1} de {paginas}</span>
          <button disabled={pg >= paginas - 1} onClick={() => setPagina(pg + 1)}>Próxima</button>
        </div>
      </section>

      <section className="painel">
        <div className="painel-h"><h2>Cruzar com o Cockpit</h2><p>Referencia cada CR com uma exportação do Cockpit (faturamento, margem, gestor, status de contrato)</p></div>
        <div className="drop">
          <label className="botao">
            Enviar exportação do Cockpit
            <input ref={arquivoCk} type="file" accept=".csv,.xlsx,.xls,.txt" hidden onChange={(e) => enviarCockpit(e.target.files?.[0])} />
          </label>
          <span className="note">
            {ckMsg || (ck
              ? <><span className="cock">◆ {ck.nome}</span>: {fmt(Object.keys(ck.map).length)} CRs referenciados de {fmt(crs)}. Colunas na tabela: {ck.cols.slice(0, 4).join(", ")}{ck.cols.length > 4 ? ` (+${ck.cols.length - 4} fora da tabela)` : ""}.</>
              : "CSV ou XLSX exportado do Cockpit com uma coluna de código do CR (ex.: 36031 ou C97CY). As colunas extras aparecem na tabela de CRs e no plano por regional. O cruzamento fica só no seu navegador.")}
          </span>
          {ck && <button onClick={() => { setCk(null); gravar(CHAVE + "ck", null); setCkMsg("Cruzamento removido."); }}>Remover cruzamento</button>}
        </div>
      </section>

      <section className="painel">
        <h2>Como o impacto foi calculado</h2>
        <ul className="note" style={{ marginTop: 10 }}>
          <li><b>Base:</b> {base.fonte}: {fmt(base.rows.reduce((s, r) => s + r[4], 0))} colaboradores em {fmt(crs)} CRs, {base.dirs.length} diretores, {base.escs.length} escalas{base.jornadas ? ` e ${fmt(base.jornadas)} jornadas` : ""}. Horas semanais conforme a jornada cadastrada.</li>
          <li><b style={{ color: "var(--n-cr)" }}>Crítico</b>: escala com mais de 5 dias seguidos ou sem 2 folgas semanais (Seg–Sáb, 6x1, 6x2, 5x1, 4x1, Dom–Sex, sábado/domingo alternado, 7x7) <i>e</i> jornada acima de 42h. Precisa redesenhar escala e horas até a 1ª etapa.</li>
          <li><b style={{ color: "var(--n-al)" }}>Alto</b>: só um dos dois problemas na 1ª etapa (escala fora do 5x2 ou jornada acima de 42h).</li>
          <li><b style={{ color: "var(--n-mo)" }}>Moderado</b>: já compatível com a 1ª etapa, mas acima de 40h; precisa ajuste até a 2ª etapa.</li>
          <li><b style={{ color: "var(--n-x)" }}>12x36 em análise</b>: aparece quando o filtro de 12x36 está desligado. O regime tem previsão própria (art. 59-A da CLT) e média semanal próxima de 42h; o enquadramento deve ser confirmado com o Jurídico e as CCTs.</li>
          <li><b style={{ color: "var(--n-v)" }}>Validar cadastro</b>: escala não informada, “somente folga”, jornada zerada ou horista com carga atípica.</li>
          <li><b>FTE estimado</b> = horas semanais acima do teto × colaboradores ÷ teto. Indica o reforço de quadro para manter a mesma cobertura do posto, antes de qualquer renegociação de escopo com o cliente.</li>
          <li><b>Prazos:</b> 1ª etapa 60 dias após a promulgação (≈ 15/12/2026); 2ª etapa 12 meses depois (≈ 15/12/2027). Datas exatas dependem da contagem oficial e de eventual regulamentação.</li>
        </ul>
      </section>
      {aviso && <div className="toast">{aviso}</div>}
    </div>
  );
}
