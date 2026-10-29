export const metadata = { title: "Entrar · Simulador de escala" };

export default async function Entrar({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  return (
    <main className="entrar">
      <form className="card" method="post" action="/acesso">
        <h1>Simulador de escala</h1>
        <p className="muted">Informe a senha para acessar.</p>
        <input type="password" name="senha" placeholder="Senha" aria-label="Senha" autoFocus required />
        {erro && <div className="erro-msg">Senha incorreta.</div>}
        <button className="primario" type="submit">Entrar</button>
      </form>
    </main>
  );
}
