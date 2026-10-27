import type { Metadata } from "next";
import "./globals.css";
import Rodape from "./Rodape";

export const metadata: Metadata = {
  title: "Simulador de escala",
  description: "Simula a escala 5x2 de 42h a partir do quadro da PEC e sugere contratações para cobrir o rombo.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        {children}
        <Rodape />
      </body>
    </html>
  );
}
