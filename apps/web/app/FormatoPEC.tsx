"use client";

// Popup com o formato do xlsx da PEC para "Importar xlsx" (lido por apps/api/main.py: ler_linhas)
// e o download do modelo (GET /modelo).

import { useRef } from "react";

const COLUNAS = [
  { nome: "QF_CARGO", tipo: "Texto", uso: "Cargo. O código numérico do início é removido.",
    exemplo: "14833188 - AUXILIAR DE LIMPEZA I - DIA" },
  { nome: "Escala", tipo: "Texto", uso: "Dias, horário de entrada e saída e, se houver, o intervalo (formatos abaixo).",
    exemplo: "ESCALA SEGUNDA - SEXTA (07:30 - 17:18, INTERVALO 12:00 - 13:00)" },
  { nome: "Quantidade", tipo: "Número inteiro", uso: "Pessoas do cargo nessa escala.", exemplo: "4" },
];

const ESCALAS = [
  { formato: "ESCALA <DIA> - <DIA> (HH:MM - HH:MM)", exemplo: "ESCALA SEGUNDA - SABADO (07:00 - 15:20)",
    nota: "Dias corridos. Basta o início do dia (SEG, TER, QUA, QUI, SEX, SAB, DOM), com ou sem acento." },
  { formato: "(HH:MM - HH:MM, INTERVALO HH:MM - HH:MM)", exemplo: "ESCALA SEGUNDA - SEXTA (07:30 - 17:18, INTERVALO 12:00 - 13:00)",
    nota: "Intervalo opcional, com início e fim, dentro dos parênteses de cada horário. Sem ele, usa o mínimo da CLT no meio do turno." },
  { formato: "Faixas separadas por /", exemplo: "ESCALA SEGUNDA - QUINTA (08:00 - 19:00) / SEXTA (08:00 - 18:00)",
    nota: "Escala dinâmica: horário diferente por dia. Um dia sozinho também vale, ex.: SABADO (08:00 - 12:00)." },
  { formato: "ESCALA N X M (HH:MM - HH:MM)", exemplo: "ESCALA 6 X 1 (07:30 - 16:00)",
    nota: "Ciclo com N + M = 7. Os N dias de trabalho contam a partir de segunda." },
  { formato: "Saída menor que a entrada", exemplo: "ESCALA SEGUNDA - SEXTA (22:00 - 06:00)",
    nota: "Turno que vira a noite; pertence ao dia em que começa." },
];

export default function FormatoPEC() {
  const dialogo = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button onClick={() => dialogo.current?.showModal()}>Formato do xlsx</button>

      <dialog ref={dialogo} className="modal" aria-labelledby="formato-titulo"
              onClick={(e) => e.target === dialogo.current && dialogo.current.close()}>
        <div className="modal-corpo">
          <header className="modal-topo">
            <div>
              <h2 id="formato-titulo" style={{ margin: 0 }}>Formato do xlsx da PEC</h2>
              <p className="muted" style={{ margin: "2px 0 0" }}>
                Cabeçalho na primeira linha da primeira aba e uma linha por cargo e escala.
              </p>
            </div>
            <button className="icone" aria-label="Fechar" onClick={() => dialogo.current?.close()}>✕</button>
          </header>

          <section>
            <h3>1. Colunas</h3>
            <div className="tabela-wrap">
              <table>
                <thead><tr><th>Coluna</th><th>Tipo</th><th>O que é</th><th>Exemplo</th></tr></thead>
                <tbody>
                  {COLUNAS.map((c) => (
                    <tr key={c.nome}>
                      <td><code className={c.tipo === "Opcional" ? "coluna opcional" : "coluna"}>{c.nome}</code></td>
                      <td style={{ whiteSpace: "nowrap" }}>{c.tipo}</td>
                      <td>{c.uso}</td>
                      <td className="mono">{c.exemplo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="muted" style={{ margin: "8px 0 0", fontSize: 13 }}>
              Outras colunas (Salario, Total, QF_ID…) podem existir e são ignoradas. O nome da coluna não diferencia
              maiúsculas e tolera acentos corrompidos do export.
            </p>
          </section>

          <section>
            <h3>2. Formatos da coluna Escala</h3>
            <div className="formatos">
              {ESCALAS.map((e) => (
                <div key={e.formato} className="formato">
                  <div className="mono" style={{ fontWeight: 600 }}>{e.formato}</div>
                  <div className="mono muted">{e.exemplo}</div>
                  <div style={{ fontSize: 13 }}>{e.nota}</div>
                </div>
              ))}
            </div>
            <p className="aviso" style={{ fontSize: 13 }}>
              Escalas fora desses formatos (12x36, vazia…) entram na soma de pessoas, mas ficam fora do cálculo e
              aparecem em &quot;Sem horário reconhecido&quot;.
            </p>
          </section>

          <footer className="modal-rodape">
            <span className="muted" style={{ fontSize: 13 }}>
              O modelo traz o cabeçalho, linhas de exemplo e uma aba com estas instruções.
            </span>
            <span className="spacer" />
            <button onClick={() => dialogo.current?.close()}>Fechar</button>
            <a className="botao primario" href="/api/modelo" download="modelo_pec.xlsx">Baixar modelo (.xlsx)</a>
          </footer>
        </div>
      </dialog>
    </>
  );
}
