"use client";

import { DIAS_LABEL, Escala, Faixa, Horario, escalaTexto, semana } from "@/lib/escala";

export type Linha = { id: number; cargo: string; escala: Escala; quantidade: number };

type Props = {
  linhas: Linha[];
  onChange: (linhas: Linha[]) => void;
  rotulos?: { cargo: string; quantidade: string; exemplo: string };
  comIntervalo?: boolean;
};

const ROTULOS = { cargo: "Cargo", quantidade: "Quantidade", exemplo: "Ex.: Auxiliar de limpeza" };

let proximoId = 1;
export const novaLinha = (parcial: Partial<Linha> = {}): Linha => ({
  id: proximoId++,
  cargo: "",
  escala: semana(0, 4, "07:30", "17:18"),
  quantidade: 1,
  ...parcial,
});

function SeletorDia({ valor, onChange, rotulo }: { valor: number; onChange: (d: number) => void; rotulo: string }) {
  return (
    <select value={valor} onChange={(e) => onChange(Number(e.target.value))} aria-label={rotulo}>
      {DIAS_LABEL.map((d, i) => <option key={d} value={i}>{d}</option>)}
    </select>
  );
}

/** Entrada, saída e, opcionalmente, o intervalo (início e fim) de um horário. */
function CamposHorario({ h, onChange, comIntervalo }: { h: Horario; onChange: (h: Partial<Horario>) => void; comIntervalo: boolean }) {
  return (
    <>
      <input type="time" value={h.entrada} onChange={(e) => onChange({ entrada: e.target.value })} aria-label="Entrada" />
      <span className="muted">às</span>
      <input type="time" value={h.saida} onChange={(e) => onChange({ saida: e.target.value })} aria-label="Saída" />
      {comIntervalo && (h.intervalo ? (
        <span className="intervalo">
          <span className="muted">intervalo</span>
          <input type="time" value={h.intervalo.inicio} aria-label="Início do intervalo"
                 onChange={(e) => onChange({ intervalo: { ...h.intervalo!, inicio: e.target.value } })} />
          <span className="muted">às</span>
          <input type="time" value={h.intervalo.fim} aria-label="Fim do intervalo"
                 onChange={(e) => onChange({ intervalo: { ...h.intervalo!, fim: e.target.value } })} />
          <button className="icone" title="Remover intervalo (usa o mínimo da CLT)" aria-label="Remover intervalo"
                  onClick={() => onChange({ intervalo: null })}>✕</button>
        </span>
      ) : (
        <button className="link" title="Sem intervalo informado, usa o mínimo da CLT no meio do turno"
                onClick={() => onChange({ intervalo: { inicio: "12:00", fim: "13:00" } })}>+ intervalo</button>
      ))}
    </>
  );
}

function CampoEscala({ escala, onChange, comIntervalo }: { escala: Escala; onChange: (e: Escala) => void; comIntervalo: boolean }) {
  const base: Horario = escala.tipo === "ciclo" ? escala
    : escala.tipo === "semana" ? escala.faixas[0] : { entrada: "07:30", saida: "17:18", intervalo: null };

  const trocarTipo = (tipo: Escala["tipo"]) => {
    if (tipo === "semana") onChange(semana(0, 4, base.entrada, base.saida, base.intervalo));
    else if (tipo === "ciclo") onChange({ tipo, trabalha: 6, entrada: base.entrada, saida: base.saida, intervalo: base.intervalo });
    else onChange({ tipo, texto: escalaTexto(escala) });
  };

  const mudarFaixa = (i: number, campos: Partial<Faixa>) =>
    escala.tipo === "semana" &&
    onChange({ ...escala, faixas: escala.faixas.map((f, j) => (j === i ? { ...f, ...campos } : f)) });

  const novaFaixa = () => {
    if (escala.tipo !== "semana") return;
    const ultima = escala.faixas[escala.faixas.length - 1];
    const dia = (ultima.ate + 1) % 7;
    onChange({ ...escala, faixas: [...escala.faixas, { ...ultima, de: dia, ate: dia }] });
  };

  return (
    <div>
      <div className="escala">
        <select value={escala.tipo} onChange={(e) => trocarTipo(e.target.value as Escala["tipo"])} aria-label="Tipo de escala">
          <option value="semana">Dias da semana</option>
          <option value="ciclo">Ciclo (6x1, 5x2…)</option>
          <option value="texto">Texto da PEC</option>
        </select>

        {escala.tipo === "ciclo" && (
          <>
            <select value={escala.trabalha} onChange={(e) => onChange({ ...escala, trabalha: Number(e.target.value) })} aria-label="Ciclo">
              {[6, 5, 4].map((n) => <option key={n} value={n}>{n}x{7 - n}</option>)}
            </select>
            <CamposHorario h={escala} comIntervalo={comIntervalo} onChange={(h) => onChange({ ...escala, ...h })} />
          </>
        )}

        {escala.tipo === "texto" && (
          <input className="texto" value={escala.texto} placeholder="ESCALA SEGUNDA - SEXTA (07:30 - 17:18, INTERVALO 12:00 - 13:00)"
                 onChange={(e) => onChange({ tipo: "texto", texto: e.target.value })} aria-label="Escala" />
        )}
      </div>

      {escala.tipo === "semana" && (
        <div className="faixas">
          {escala.faixas.map((f, i) => (
            <div className="escala" key={i}>
              <SeletorDia valor={f.de} rotulo="De" onChange={(de) => mudarFaixa(i, { de })} />
              <span className="muted">a</span>
              <SeletorDia valor={f.ate} rotulo="Até" onChange={(ate) => mudarFaixa(i, { ate })} />
              <CamposHorario h={f} comIntervalo={comIntervalo} onChange={(h) => mudarFaixa(i, h)} />
              {escala.faixas.length > 1 && (
                <button className="icone" title="Remover horário" aria-label="Remover horário"
                        onClick={() => onChange({ ...escala, faixas: escala.faixas.filter((_, j) => j !== i) })}>✕</button>
              )}
            </div>
          ))}
          <button className="link" onClick={novaFaixa}>+ horário diferente em outros dias</button>
        </div>
      )}
      {escala.tipo !== "texto" && <div className="preview">{escalaTexto(escala)}</div>}
    </div>
  );
}

export default function Formulario({ linhas, onChange, rotulos = ROTULOS, comIntervalo = true }: Props) {
  const atualizar = (id: number, campos: Partial<Linha>) =>
    onChange(linhas.map((l) => (l.id === id ? { ...l, ...campos } : l)));

  return (
    <div className="tabela-wrap">
      <table>
        <thead>
          <tr>
            <th style={{ width: "24%" }}>{rotulos.cargo}</th>
            <th>Horário / escala</th>
            <th className="num" style={{ width: 90 }}>{rotulos.quantidade}</th>
            <th style={{ width: 44 }} />
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.id}>
              <td>
                <input value={l.cargo} placeholder={rotulos.exemplo} style={{ width: "100%" }}
                       onChange={(e) => atualizar(l.id, { cargo: e.target.value })} aria-label={rotulos.cargo} />
              </td>
              <td>
                <CampoEscala escala={l.escala} comIntervalo={comIntervalo} onChange={(escala) => atualizar(l.id, { escala })} />
              </td>
              <td className="num">
                <input type="number" min={1} value={l.quantidade} style={{ width: 70, textAlign: "right" }}
                       onChange={(e) => atualizar(l.id, { quantidade: Math.max(1, Number(e.target.value) || 1) })}
                       aria-label={rotulos.quantidade} />
              </td>
              <td>
                <button className="icone" title="Remover linha" aria-label="Remover linha"
                        onClick={() => onChange(linhas.filter((x) => x.id !== l.id))}>✕</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {comIntervalo && (
        <p className="muted" style={{ fontSize: 12, margin: "8px 0 0" }}>
          Sem intervalo informado, o cálculo usa o mínimo da CLT (1h acima de 6h de trabalho, 15 min acima de 4h) no meio do turno.
        </p>
      )}
    </div>
  );
}
