import { custo } from "@/lib/moeda";
import type { Contratacoes, Sugestoes as S, TurnoRevezamento } from "@/lib/types";

function porDia(t: TurnoRevezamento) {
  const trabalhando = t.por_dia.filter((n) => n > 0);
  const min = Math.min(...trabalhando);
  const max = Math.max(...trabalhando);
  const n = min === max ? `${min}` : `De ${min} a ${max}`;
  return `${n} profissiona${max > 1 ? "is" : "l"} trabalhando por dia`;
}

/** Grade semana x pessoa de um turno do revezamento: T = trabalha, F = folga (escadinha). */
function GradeTurno({ t, dias }: { t: TurnoRevezamento; dias: string[] }) {
  const faltaHorista = t.demanda.some((d, i) => d > t.por_dia[i]);
  return (
    <div className="grade">
      <div className="grade-topo">
        <h3 className="grade-titulo">
          {t.titulo} — {t.entrada} às {t.saida}
          {t.intervalo && <span className="muted" style={{ fontWeight: 400 }}> · intervalo {t.intervalo}</span>}
        </h3>
        <span className="muted">{porDia(t)} · {t.horas_dia} por dia, {t.horas_semana} por semana cada</span>
      </div>
      <div className="tabela-wrap">
        <table className="grade-tabela">
          <thead>
            <tr>
              <th>Equipe</th>
              {dias.map((d) => <th key={d}>{d}</th>)}
              <th>Semana</th>
            </tr>
          </thead>
          <tbody>
            {t.pessoas.map((p) => (
              <tr key={p.nome}>
                <td className="grade-nome">{p.nome}</td>
                {p.trabalha.map((trabalha, i) => (
                  <td key={i}>
                    {!trabalha ? <span className="celula f">F</span>
                      : p.complemento[i] ? <span className="celula t" title="Trabalha com complemento (extensão ou turno quebrado)">T+</span>
                      : <span className="celula t">T</span>}
                  </td>
                ))}
                <td className="grade-horas">{p.horas_semana}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Trabalhando</td>
              {t.por_dia.map((n, i) => <td key={i}>{n}</td>)}
              <td />
            </tr>
            <tr>
              <td>Necessário</td>
              {t.demanda.map((n, i) => (
                <td key={i} className={n > t.por_dia[i] ? "falta" : undefined}>{n}</td>
              ))}
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      {t.pessoas.some((p) => p.extras) && (
        <div className="complementos">
          <strong>T+ = complemento para aproveitar a semana inteira</strong> (emenda no turno ou turno quebrado, com
          pelo menos 1h entre as partes):
          <ul>
            {t.pessoas.filter((p) => p.extras).map((p) => (
              <li key={p.nome}><strong>{p.nome}</strong>: {p.extras} <span className="muted">· {p.horas_semana} por semana</span></li>
            ))}
          </ul>
        </div>
      )}
      {faltaHorista && (
        <p className="muted" style={{ margin: "6px 0 0", fontSize: 13 }}>
          Onde o necessário passa do que a equipe cobre, a diferença fica com os horistas abaixo.
        </p>
      )}
    </div>
  );
}

function Horistas({ s, titulo }: { s: Contratacoes; titulo: string }) {
  if (!s.total) return null;
  return (
    <details>
      <summary>{titulo}</summary>
      <table style={{ marginTop: 8 }}>
        <tbody>
          {s.pessoas.map((p, i) => (
            <tr key={i}>
              <td style={{ whiteSpace: "nowrap" }}>Horista {i + 1}<div className="muted">{p.contrato}</div></td>
              <td className="mono">{p.turnos.map((t) => `${t.dia} ${t.entrada}–${t.saida}`).join(" · ")}</td>
              <td className="num">{p.horas_semana}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

function Cabecalho({ titulo, total, horas, valor }: { titulo: string; total: number; horas: string; valor: number | null }) {
  return (
    <div className="row" style={{ marginBottom: 8 }}>
      <h3 style={{ margin: 0 }}>{titulo}</h3>
      <span className="spacer" />
      <span className="tag">{total} contratação(ões) · {horas}/semana</span>
      {valor != null && <span className="tag custo">{custo(valor)}/mês</span>}
    </div>
  );
}

export default function Sugestoes({ s, dias, titulo }: { s: S; dias: string[]; titulo: string }) {
  const rev = s.revezamento;
  return (
    <section>
      <h2>{titulo}</h2>
      <div className="card">
        <Cabecalho titulo="1) Revezamento" total={rev.total} horas={rev.horas_semana} valor={rev.custo_mensal} />
        <p className="muted" style={{ marginTop: 0 }}>
          Equipes 5x2 por turno, com as folgas em dias seguidos em escadinha; horistas para o que a equipe não cobre.
        </p>
        <ul className="frases">{rev.frases.map((f) => <li key={f}>{f}</li>)}</ul>
        {rev.turnos.map((t) => <GradeTurno key={t.entrada + t.saida} t={t} dias={dias} />)}
        {rev.turnos.length > 0 && <p className="muted" style={{ fontSize: 13 }}>T = trabalha; F = folga.</p>}
        <Horistas s={rev.horistas} titulo="Horários dos horistas do revezamento" />
      </div>

      <div className="card">
        <Cabecalho titulo="2) Horista" total={s.horista.total} horas={s.horista.horas_semana} valor={s.horista.custo_mensal} />
        <p className="muted" style={{ marginTop: 0 }}>Todos por hora (intermitente), pagando só as horas necessárias.</p>
        <ul className="frases">{s.horista.frases.map((f) => <li key={f}>{f}</li>)}</ul>
        <Horistas s={s.horista} titulo="Horários por horista" />
      </div>
    </section>
  );
}
