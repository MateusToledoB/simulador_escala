"use client";

import { useRef, useState } from "react";
import { escalaTexto, lerEscala, semana } from "@/lib/escala";
import type { Dimensionamento as D, LinhaPEC, Resultado as R } from "@/lib/types";
import Dimensionamento from "./Dimensionamento";
import FormatoPEC from "./FormatoPEC";
import Formulario, { Linha, novaLinha } from "./Formulario";
import Resultado from "./Resultado";

type Centro = { cr: string; linhas: LinhaPEC[] };
type Modo = "quadro" | "demanda";

const EXEMPLO_QUADRO: Linha[] = [
  novaLinha({ cargo: "Auxiliar de limpeza", quantidade: 4,
              escala: semana(0, 4, "07:30", "17:18", { inicio: "12:00", fim: "13:00" }) }),
  novaLinha({ cargo: "Auxiliar de limpeza - 6x1", quantidade: 2,
              escala: { tipo: "ciclo", trabalha: 6, entrada: "07:30", saida: "16:00", intervalo: null } }),
  novaLinha({ cargo: "Líder de limpeza", quantidade: 1,
              escala: { tipo: "semana", faixas: [
                { de: 0, ate: 3, entrada: "08:00", saida: "19:00", intervalo: { inicio: "12:00", fim: "13:00" } },
                { de: 4, ate: 4, entrada: "08:00", saida: "18:00", intervalo: { inicio: "12:00", fim: "13:00" } },
              ] } }),
];

const EXEMPLO_DEMANDA: Linha[] = [
  novaLinha({ cargo: "Limpeza", quantidade: 5, escala: semana(0, 6, "06:00", "22:00") }),
];

const MODOS = {
  quadro: {
    rotulo: "Converter quadro atual",
    descricao: "Informe o quadro como na PEC (cargo, horário/escala e quantidade de pessoas). O simulador leva cada " +
               "cargo para 5x2 de 42h, mede o rombo de cobertura e sugere contratações.",
    rotulos: { cargo: "Cargo", quantidade: "Quantidade", exemplo: "Ex.: Auxiliar de limpeza" },
    rota: "/api/simular",
  },
  demanda: {
    rotulo: "Dimensionar por demanda",
    descricao: "Informe quantos postos precisam estar ocupados, em quais dias e horário (ex.: 5 postos de segunda a " +
               "domingo, das 06h às 22h). O simulador monta as equipes 5x2 por turno, com folgas em escadinha.",
    rotulos: { cargo: "Posto", quantidade: "Postos", exemplo: "Ex.: Limpeza" },
    rota: "/api/dimensionar",
  },
};

async function lerErro(resp: Response) {
  try {
    const corpo = await resp.json();
    if (typeof corpo.detail === "string") return corpo.detail;
    if (Array.isArray(corpo.detail)) return corpo.detail.map((d: { msg: string }) => d.msg).join("; ");
  } catch {}
  return `Erro ${resp.status} ao falar com a API. Ela está rodando em http://localhost:8000?`;
}

export default function Home() {
  const [modo, setModo] = useState<Modo>("quadro");
  const [linhas, setLinhas] = useState<Record<Modo, Linha[]>>({ quadro: EXEMPLO_QUADRO, demanda: EXEMPLO_DEMANDA });
  const [centros, setCentros] = useState<Centro[]>([]);
  const [resultado, setResultado] = useState<R | null>(null);
  const [dimensionamento, setDimensionamento] = useState<D | null>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const arquivo = useRef<HTMLInputElement>(null);

  const atuais = linhas[modo];
  const setAtuais = (novas: Linha[]) => setLinhas({ ...linhas, [modo]: novas });
  const config = MODOS[modo];

  const trocarModo = (m: Modo) => {
    setModo(m);
    setErro("");
  };

  const usarCentro = (c: Centro) => {
    setLinhas((l) => ({
      ...l,
      quadro: c.linhas.map((x) => novaLinha({ cargo: x.cargo, quantidade: x.quantidade, escala: lerEscala(x.escala) })),
    }));
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
    if (!atuais.length) return setErro("Adicione ao menos uma linha.");
    if (atuais.some((l) => !l.cargo.trim())) return setErro(`Preencha o campo ${config.rotulos.cargo} de todas as linhas.`);
    setCarregando(true);
    const corpo = {
      linhas: atuais.map((l) => ({
        cargo: l.cargo.trim(),
        escala: escalaTexto(l.escala),
        quantidade: l.quantidade,
      })),
    };
    const resp = await fetch(config.rota, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    }).catch(() => null);
    setCarregando(false);
    if (!resp?.ok) return setErro(resp ? await lerErro(resp) : "Não foi possível falar com a API.");
    const dados = await resp.json();
    if (modo === "quadro") setResultado(dados);
    else setDimensionamento(dados);
    setTimeout(() => document.getElementById("resultado")?.scrollIntoView({ behavior: "smooth" }), 50);
  };

  const limpar = () => {
    setAtuais([]);
    if (modo === "quadro") {
      setCentros([]);
      setResultado(null);
    } else setDimensionamento(null);
  };

  const total = atuais.reduce((s, l) => s + l.quantidade, 0);

  return (
    <main>
      <h1>Simulador de escala</h1>

      <div className="abas" role="tablist">
        {(Object.keys(MODOS) as Modo[]).map((m) => (
          <button key={m} role="tab" aria-selected={modo === m} className={modo === m ? "aba ativa" : "aba"}
                  onClick={() => trocarModo(m)}>
            {MODOS[m].rotulo}
          </button>
        ))}
      </div>
      <p className="sub">{config.descricao}</p>

      <section className="card">
        <div className="row" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>{modo === "quadro" ? "Quadro" : "Demanda"}</h2>
          <span className="spacer" />
          {modo === "quadro" && (
            <>
              {centros.length > 1 && (
                <select aria-label="Centro de resultado" onChange={(e) => usarCentro(centros[Number(e.target.value)])}>
                  {centros.map((c, i) => <option key={c.cr} value={i}>{c.cr} ({c.linhas.length} linhas)</option>)}
                </select>
              )}
              <FormatoPEC />
              <label className="botao">
                Importar xlsx da PEC
                <input ref={arquivo} type="file" accept=".xlsx,.xls" hidden
                       onChange={(e) => e.target.files?.[0] && importar(e.target.files[0])} />
              </label>
            </>
          )}
          <button onClick={limpar}>Limpar</button>
        </div>

        <Formulario linhas={atuais} onChange={setAtuais} rotulos={config.rotulos} comIntervalo={modo === "quadro"} />

        <div className="row" style={{ marginTop: 16 }}>
          <button onClick={() => setAtuais([...atuais, novaLinha()])}>+ Adicionar linha</button>
          <span className="muted">
            {total} {modo === "quadro" ? "pessoa(s)" : "posto(s)"} em {atuais.length} linha(s)
          </span>
          <span className="spacer" />
          <button className="primario" onClick={simular} disabled={carregando}>
            {carregando ? "Calculando…" : modo === "quadro" ? "Simular" : "Dimensionar"}
          </button>
        </div>
      </section>

      {erro && <div className="erro-msg">{erro}</div>}

      <div id="resultado">
        {modo === "quadro" && resultado && <Resultado r={resultado} />}
        {modo === "demanda" && dimensionamento && <Dimensionamento d={dimensionamento} />}
      </div>
    </main>
  );
}
