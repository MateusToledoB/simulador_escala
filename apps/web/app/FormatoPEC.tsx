// Como deve ser o xlsx da PEC para "Importar xlsx" (lido por apps/api/main.py: ler_linhas)

const COLUNAS = [
  { nome: "SL_CR", uso: "Centro de resultado. As linhas são agrupadas por CR; com mais de um, você escolhe qual simular.",
    exemplo: "10006 - RS - LPG - AGRALE - PLANTA AGRALE 1 (FRT)" },
  { nome: "SL_DESC", uso: "Equipe (posto). O código do início (\"22383847 - \") é removido.",
    exemplo: "22383847 - AGRALE LIMPEZA UNIDADE I" },
  { nome: "QF_CARGO", uso: "Cargo. O código do início é removido.", exemplo: "14833188 - AUXILIAR DE LIMPEZA I - DIA" },
  { nome: "Escala", uso: "Dias e horário de entrada e saída, em um dos formatos abaixo.",
    exemplo: "ESCALA SEGUNDA - SEXTA (07:30 - 17:18)" },
  { nome: "Quantidade", uso: "Número de pessoas do cargo nessa escala (número inteiro).", exemplo: "4" },
];

export default function FormatoPEC() {
  return (
    <details style={{ marginBottom: 16 }}>
      <summary>Como deve ser o xlsx da PEC</summary>
      <div className="aviso" style={{ background: "var(--subtle)", border: "1px solid var(--border)" }}>
        <p style={{ marginTop: 0 }}>
          Um arquivo <strong>.xlsx</strong> com o cabeçalho na <strong>primeira linha</strong> e uma linha por cargo e escala.
          As colunas abaixo são obrigatórias; outras colunas (Salario, Total, QF_ID…) podem existir e são ignoradas.
          O nome da coluna não diferencia maiúsculas, e acentos ou caracteres corrompidos do export são tolerados.
        </p>
        <div className="tabela-wrap">
          <table>
            <thead><tr><th>Coluna</th><th>O que é</th><th>Exemplo</th></tr></thead>
            <tbody>
              {COLUNAS.map((c) => (
                <tr key={c.nome}>
                  <td className="mono" style={{ fontWeight: 600 }}>{c.nome}</td>
                  <td>{c.uso}</td>
                  <td className="mono">{c.exemplo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 style={{ marginTop: 16 }}>Formatos aceitos na coluna Escala</h3>
        <ul style={{ margin: 0 }}>
          <li>
            <span className="mono">ESCALA &lt;DIA&gt; - &lt;DIA&gt; (HH:MM - HH:MM)</span>: dias corridos, por exemplo{" "}
            <span className="mono">ESCALA SEGUNDA - SABADO (07:00 - 15:20)</span>. Basta o início do nome do dia (SEG, TER, QUA,
            QUI, SEX, SAB, DOM), com ou sem acento.
          </li>
          <li>
            <span className="mono">ESCALA N X M (HH:MM - HH:MM)</span>: ciclo com N + M = 7, por exemplo{" "}
            <span className="mono">ESCALA 6 X 1 (07:30 - 16:00)</span> (6 dias contados a partir de segunda).
          </li>
          <li>
            Saída menor que a entrada é turno que vira a noite: <span className="mono">(22:00 - 06:00)</span>.
          </li>
          <li>
            Linhas com escala fora desses formatos (12x36, vazia…) entram na soma de pessoas, mas ficam fora do cálculo e
            aparecem em &quot;Sem horário reconhecido&quot;.
          </li>
        </ul>
      </div>
    </details>
  );
}
