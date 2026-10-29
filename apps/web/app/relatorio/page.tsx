import Link from "next/link";
import Radar from "./Radar";
import "./radar.css";

export const metadata = { title: "Relatório · Simulador de escala" };

export default function Relatorio() {
  return (
    <main className="largo">
      <h1>Simulador de escala</h1>
      <nav className="abas" aria-label="Seções">
        <Link className="aba" href="/">Converter quadro atual</Link>
        <Link className="aba" href="/?modo=demanda">Dimensionar por demanda</Link>
        <Link className="aba ativa" href="/relatorio" aria-current="page">Relatório</Link>
        <Link className="aba" href="/cr">Simular CR</Link>
      </nav>
      <Radar />
    </main>
  );
}
