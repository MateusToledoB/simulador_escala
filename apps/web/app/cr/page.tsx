import Link from "next/link";
import SimularCR from "./SimularCR";
import "./cr.css";

export const metadata = { title: "Simular CR · Simulador de escala" };

export default function PaginaCR() {
  return (
    <main>
      <h1>Simulador de escala</h1>
      <nav className="abas" aria-label="Seções">
        <Link className="aba" href="/">Converter quadro atual</Link>
        <Link className="aba" href="/?modo=demanda">Dimensionar por demanda</Link>
        <Link className="aba" href="/relatorio">Relatório</Link>
        <Link className="aba ativa" href="/cr" aria-current="page">Simular CR</Link>
      </nav>
      <p className="sub">
        Escolha um CR da base do relatório: as jornadas de hoje viram a cobertura que o posto precisa, e o otimizador
        (Google OR-Tools) monta a escala 5x2 que cobre essa cobertura, função por função.
      </p>
      <SimularCR />
    </main>
  );
}
