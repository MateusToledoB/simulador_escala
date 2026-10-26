"use client";

import { useRef, useState } from "react";
import { escalaTexto, lerEscala } from "@/lib/escala";
import type { LinhaPEC, Resultado as R } from "@/lib/types";
import Formulario, { Linha, novaLinha } from "./Formulario";
import Resultado from "./Resultado";

type Centro = { cr: string; linhas: LinhaPEC[] };

const EXEMPLO: Linha[] = [
  novaLinha({ equipe: "Limpeza", cargo: "Auxiliar de limpeza", quantidade: 4 }),
  novaLinha({ equipe: "Limpeza", cargo: "Auxiliar de limpeza - 6x1", quantidade: 2,
              escala: { tipo: "ciclo", trabalha: 6, entrada: "07:30", saida: "16:00" } }),
  novaLinha({ equipe: "Limpeza", cargo: "Líder de limpeza", quantidade: 1,
              escala: { tipo: "semana", de: 0, ate: 4, entrada: "08:00", saida: "17:48" } }),
];

async function lerErro(resp: Response) {
  try {
    const corpo = await resp.json();
    if (typeof corpo.detail === "string") return corpo.detail;
    if (Array.isArray(corpo.detail)) return corpo.detail.map((d: { msg: string }) => d.msg).join("; ");
  } catch {}
  return `Erro ${resp.status} ao falar com a API. Ela está rodando em http://localhost:8000?`;
}

export default function Home() {
  const [linhas, setLinhas] = useState<Linha[]>(EXEMPLO);
  const [centros, setCentros] = useState<Centro[]>([]);
  const [resultado, setResultado] = useState<R | null>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const arquivo = useRef<HTMLInputElement>(null);

  const usarCentro = (c: Centro) => {
    setLinhas(c.linhas.map((l) => novaLinha({ ...l, escala: lerEscala(l.escala) })));
    setResultado(null);
  };

  const importar = async (file: File) => {
    setErro("");
    const form = new FormData();
    form.append("arquivo", file);
    const resp = await fetch("/api/importar", { method: "POST", body: form }).catch(() => null);
    if (arquivo.current) arquivo.current.value = "";
    if (!resp?.ok) return setErro(resp ? await lerErro(resp) : "Não foi possível falar com a API.");
    const { centros } = (await resp.json()) as { centros: Centro[] };
    setCentros(centros);
    if (centros.length) usarCentro(centros[0]);
  };

  const simular = async () => {
    setErro("");
    const vazias = linhas.filter((l) => !l.cargo.trim());
    if (!linhas.length) return setErro("Adicione ao menos uma linha.");
    if (vazias.length) return setErro("Preencha o cargo de todas as linhas.");
    setCarregando(true);
    const corpo = {
      linhas: linhas.map((l) => ({
        equipe: l.equipe.trim() || "Equipe",
        cargo: l.cargo.trim(),
        escala: escalaTexto(l.escala),
        quantidade: l.quantidade,
      })),
    };
    const resp = await fetch("/api/simular", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    }).catch(() => null);
    setCarregando(false);
    if (!resp?.ok) return setErro(resp ? await lerErro(resp) : "Não foi possível falar com a API.");
    setResultado(await resp.json());
    setTimeout(() => document.getElementById("resultado")?.scrollIntoView({ behavior: "smooth" }), 50);
  };

  return (
    <main>
      <h1>Simulador de escala</h1>
      <p className="sub">
        Informe o quadro como na PEC (equipe, cargo, horário/escala e quantidade de pessoas). O simulador leva cada
        cargo para 5x2 de 42h, mede o rombo de cobertura e sugere contratações.
      </p>

      <section className="card">
        <div className="row" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>Quadro</h2>
          <span className="spacer" />
          {centros.length > 1 && (
            <select aria-label="Centro de resultado" onChange={(e) => usarCentro(centros[Number(e.target.value)])}>
              {centros.map((c, i) => <option key={c.cr} value={i}>{c.cr} ({c.linhas.length} linhas)</option>)}
            </select>
          )}
          <label className="botao">
            Importar xlsx da PEC
            <input ref={arquivo} type="file" accept=".xlsx,.xls" hidden
                   onChange={(e) => e.target.files?.[0] && importar(e.target.files[0])} />
          </label>
          <button onClick={() => { setLinhas([]); setCentros([]); setResultado(null); }}>Limpar</button>
        </div>

        <Formulario linhas={linhas} onChange={setLinhas} />

        <div className="row" style={{ marginTop: 16 }}>
          <button onClick={() => setLinhas([...linhas, novaLinha({ equipe: linhas.at(-1)?.equipe ?? "" })])}>
            + Adicionar linha
          </button>
          <span className="muted">
            {linhas.reduce((s, l) => s + l.quantidade, 0)} pessoa(s) em {linhas.length} linha(s)
          </span>
          <span className="spacer" />
          <button className="primario" onClick={simular} disabled={carregando}>
            {carregando ? "Simulando…" : "Simular"}
          </button>
        </div>
      </section>

      {erro && <div className="erro-msg">{erro}</div>}

      <div id="resultado">{resultado && <Resultado r={resultado} />}</div>
    </main>
  );
}
