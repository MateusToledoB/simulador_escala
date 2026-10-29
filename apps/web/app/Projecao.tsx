import { anual, custo, moeda } from "@/lib/moeda";
import type { CustoQuadro, PorCargo, Sugestoes } from "@/lib/types";
import { ALTERNATIVAS } from "./Sugestoes";

type Props = {
  sugestoes: Sugestoes | null;
  porCargo: PorCargo[];
  rotuloHoras: string; // o que a coluna de horas mede: perdidas (quadro) ou de posto (demanda)
  salario: number | null; // salário médio usado nas contratações
  fator: number;
  quadro?: CustoQuadro | null; // só no "Converter quadro atual"
  totalPessoas?: number;
};

/** Por cargo: salário médio, custo de hoje (no quadro) e a parte de cada cargo no impacto de cada alternativa. */
function TabelaCargos({ linhas, quadro, rotuloHoras, comImpacto }: { linhas: PorCargo[]; quadro: boolean; rotuloHoras: string; comImpacto: boolean }) {
  const impacto = (c: PorCargo, chave: (typeof ALTERNATIVAS)[number]["chave"]) =>
    c[`impacto_${chave}`] as number | null;
  const pct = (p: number) => (p * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%";
  const val = (v: number | null, f: (n: number) => string | null) => (v == null ? "–" : f(v));
  return (
    <>
      <h3 style={{ marginTop: 18 }}>Por cargo</h3>
      <div className="tabela-wrap">
        <table>
          <thead>
            <tr>
              <th>Cargo</th><th className="num">Pessoas</th><th className="num">Salário médio</th>
              {quadro && <th className="num">Custo atual/mês</th>}
              {quadro && <th className="num">Custo atual/ano</th>}
              <th className="num">{rotuloHoras}</th>
              {comImpacto && ALTERNATIVAS.map((a) => <th key={a.chave} className="num">Impacto: {a.titulo}</th>)}
            </tr>
          </thead>
          <tbody>
            {linhas.map((c) => (
              <tr key={c.cargo}>
                <td>{c.cargo}</td>
                <td className="num">{c.pessoas}</td>
                <td className="num">{val(c.salario, custo)}</td>
                {quadro && <td className="num">{val(c.custo_atual, custo)}</td>}
                {quadro && <td className="num">{val(c.custo_atual, anual)}</td>}
                <td className="num">{c.horas} <span className="muted">({pct(c.parte)})</span></td>
                {comImpacto && ALTERNATIVAS.map((a) => {
                  const v = impacto(c, a.chave);
                  return (
                    <td key={a.chave} className="num">
                      {val(v, custo)}{v != null && <div className="muted">{anual(v)}/ano</div>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function Projecao({ sugestoes, porCargo, rotuloHoras, salario, fator, quadro, totalPessoas }: Props) {
  if (salario == null && !quadro) {
    return (
      <section className="card">
        <h2>Impacto financeiro</h2>
        <p className="muted" style={{ margin: 0 }}>
          Informe o salário médio nas linhas para ver o impacto mensal e anual (custo = salário x {fator.toLocaleString("pt-BR")}).
        </p>
      </section>
    );
  }
  const opcoes = sugestoes
    ? ALTERNATIVAS.map((a) => [a.titulo, sugestoes[a.chave].total, sugestoes[a.chave].custo_mensal] as const)
    : [];
  const comCusto = opcoes.filter((o) => o[2] != null) as (readonly [string, number, number])[];
  const menor = comCusto.length ? comCusto.reduce((a, b) => (b[2] < a[2] ? b : a)) : null;
  const sobre = (v: number | null) =>
    quadro && v != null ? `+${((v / quadro.mensal) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "–";

  return (
    <section className="card">
      <h2>Impacto financeiro</h2>
      <div className="kpis">
        {quadro && (
          <>
            <div className="kpi"><div className="valor">{custo(quadro.mensal)}</div><div className="rotulo">custo mensal do quadro atual</div></div>
            <div className="kpi"><div className="valor">{anual(quadro.mensal)}</div><div className="rotulo">custo anual do quadro atual</div></div>
          </>
        )}
        {menor && (
          <>
            <div className="kpi"><div className="valor">+{custo(menor[2])}</div><div className="rotulo">por mês no menor impacto ({menor[0]})</div></div>
            <div className="kpi"><div className="valor">+{anual(menor[2])}</div><div className="rotulo">por ano no menor impacto ({menor[0]})</div></div>
          </>
        )}
      </div>
      {opcoes.length > 0 ? (
        <div className="tabela-wrap">
          <table>
            <thead>
              <tr>
                <th>Proposta</th><th className="num">Contratações</th><th className="num">Impacto mensal</th>
                <th className="num">Impacto anual</th>{quadro && <th className="num">Sobre o quadro</th>}
                {quadro && <th className="num">Total anual</th>}
              </tr>
            </thead>
            <tbody>
              {opcoes.map(([nome, n, mensal]) => (
                <tr key={nome}>
                  <td>{nome}</td>
                  <td className="num">{n}</td>
                  <td className="num">{mensal == null ? "–" : custo(mensal)}</td>
                  <td className="num">{mensal == null ? "–" : anual(mensal)}</td>
                  {quadro && <td className="num">{sobre(mensal)}</td>}
                  {quadro && <td className="num">{mensal == null ? "–" : anual(quadro.mensal + mensal)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted" style={{ margin: 0 }}>Sem rombo: nenhuma contratação, o custo continua o do quadro atual.</p>
      )}
      {porCargo.length > 0 && (
        <TabelaCargos linhas={porCargo} quadro={!!quadro} rotuloHoras={rotuloHoras} comImpacto={!!sugestoes} />
      )}
      <p className="muted" style={{ fontSize: 12, margin: "10px 0 0" }}>
        Custo = salário x {fator.toLocaleString("pt-BR")} (encargos, 13º e férias); anual = 12 meses.
        {salario != null && <> As contratações usam o salário médio de {moeda(salario)}, ponderado pelos cargos que precisam de reforço;
          por cargo, o impacto é repartido pelas horas de cada um, ao salário do próprio cargo.</>}
        {" "}Horista: proporcional às horas da semana, com no máximo 80h por mês.
        {quadro && totalPessoas != null && quadro.pessoas_com_salario < totalPessoas &&
          <> Quadro atual com salário em {quadro.pessoas_com_salario} de {totalPessoas} pessoas.</>}
      </p>
    </section>
  );
}
