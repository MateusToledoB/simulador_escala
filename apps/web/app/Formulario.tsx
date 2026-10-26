"use client";

import { DIAS_LABEL, Escala, escalaTexto } from "@/lib/escala";

export type Linha = { id: number; equipe: string; cargo: string; escala: Escala; quantidade: number };

type Props = {
  linhas: Linha[];
  onChange: (linhas: Linha[]) => void;
};

let proximoId = 1;
export const novaLinha = (parcial: Partial<Linha> = {}): Linha => ({
  id: proximoId++,
  equipe: "",
  cargo: "",
  escala: { tipo: "semana", de: 0, ate: 4, entrada: "07:30", saida: "17:18" },
  quantidade: 1,
  ...parcial,
});

function CampoEscala({ escala, onChange }: { escala: Escala; onChange: (e: Escala) => void }) {
  const entrada = escala.tipo === "texto" ? "07:30" : escala.entrada;
  const saida = escala.tipo === "texto" ? "17:18" : escala.saida;

  const trocarTipo = (tipo: Escala["tipo"]) => {
    if (tipo === "semana") onChange({ tipo, de: 0, ate: 4, entrada, saida });
    else if (tipo === "ciclo") onChange({ tipo, trabalha: 6, entrada, saida });
    else onChange({ tipo, texto: escalaTexto(escala) });
  };

  return (
    <div>
      <div className="escala">
        <select value={escala.tipo} onChange={(e) => trocarTipo(e.target.value as Escala["tipo"])} aria-label="Tipo de escala">
          <option value="semana">Dias da semana</option>
          <option value="ciclo">Ciclo (6x1, 5x2…)</option>
          <option value="texto">Texto da PEC</option>
        </select>

        {escala.tipo === "semana" && (
          <>
            <select value={escala.de} onChange={(e) => onChange({ ...escala, de: Number(e.target.value) })} aria-label="De">
              {DIAS_LABEL.map((d, i) => <option key={d} value={i}>{d}</option>)}
            </select>
            <span className="muted">a</span>
            <select value={escala.ate} onChange={(e) => onChange({ ...escala, ate: Number(e.target.value) })} aria-label="Até">
              {DIAS_LABEL.map((d, i) => <option key={d} value={i}>{d}</option>)}
            </select>
          </>
        )}

        {escala.tipo === "ciclo" && (
          <select value={escala.trabalha} onChange={(e) => onChange({ ...escala, trabalha: Number(e.target.value) })} aria-label="Ciclo">
            {[6, 5, 4].map((n) => <option key={n} value={n}>{n}x{7 - n}</option>)}
          </select>
        )}

        {escala.tipo === "texto" ? (
          <input className="texto" value={escala.texto} placeholder="ESCALA SEGUNDA - SEXTA (07:30 - 17:18)"
                 onChange={(e) => onChange({ tipo: "texto", texto: e.target.value })} aria-label="Escala" />
        ) : (
          <>
            <input type="time" value={escala.entrada} onChange={(e) => onChange({ ...escala, entrada: e.target.value })} aria-label="Entrada" />
            <span className="muted">às</span>
            <input type="time" value={escala.saida} onChange={(e) => onChange({ ...escala, saida: e.target.value })} aria-label="Saída" />
          </>
        )}
      </div>
      {escala.tipo !== "texto" && <div className="preview">{escalaTexto(escala)}</div>}
    </div>
  );
}

export default function Formulario({ linhas, onChange }: Props) {
  const atualizar = (id: number, campos: Partial<Linha>) =>
    onChange(linhas.map((l) => (l.id === id ? { ...l, ...campos } : l)));

  return (
    <div className="tabela-wrap">
      <table>
        <thead>
          <tr>
            <th style={{ width: "18%" }}>Equipe</th>
            <th style={{ width: "22%" }}>Cargo</th>
            <th>Horário / escala</th>
            <th className="num" style={{ width: 90 }}>Quantidade</th>
            <th style={{ width: 44 }} />
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.id}>
              <td>
                <input value={l.equipe} placeholder="Ex.: Limpeza 1º turno" style={{ width: "100%" }}
                       onChange={(e) => atualizar(l.id, { equipe: e.target.value })} aria-label="Equipe" />
              </td>
              <td>
                <input value={l.cargo} placeholder="Ex.: Auxiliar de limpeza" style={{ width: "100%" }}
                       onChange={(e) => atualizar(l.id, { cargo: e.target.value })} aria-label="Cargo" />
              </td>
              <td>
                <CampoEscala escala={l.escala} onChange={(escala) => atualizar(l.id, { escala })} />
              </td>
              <td className="num">
                <input type="number" min={1} value={l.quantidade} style={{ width: 70, textAlign: "right" }}
                       onChange={(e) => atualizar(l.id, { quantidade: Math.max(1, Number(e.target.value) || 1) })}
                       aria-label="Quantidade" />
              </td>
              <td>
                <button className="icone" title="Remover linha" aria-label="Remover linha"
                        onClick={() => onChange(linhas.filter((x) => x.id !== l.id))}>✕</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
