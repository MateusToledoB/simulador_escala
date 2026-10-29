// Senha de acesso ao site. A senha não fica no código: só o hash dela e o do token da sessão (cookie).
// A variável de ambiente SENHA_ACESSO, se definida, substitui a senha padrão.
import { createHash, timingSafeEqual } from "node:crypto";

export const COOKIE = "acesso";
export const DURACAO = 60 * 60 * 24 * 30; // segundos: 30 dias

const PADRAO = {
  senha: "2fe54cd5d81b6abb6e1d9d3fa45b4ba94cab436d2acbd3f55a303c8312e4ff8d",
  token: "4a1be452ca5b01f11247058004ddc16c6b2494ec50f087997592d37fda312680",
};

const sha256 = (texto: string) => createHash("sha256").update(texto).digest("hex");

const iguais = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Token gravado no cookie depois do login: só quem sabe a senha consegue gerá-lo. */
export const tokenDe = (senha: string) => sha256("sessao:" + senha);

export function senhaCorreta(senha: string) {
  const env = process.env.SENHA_ACESSO;
  return iguais(sha256(senha), env ? sha256(env) : PADRAO.senha);
}

export function tokenValido(token: string | undefined) {
  if (!token) return false;
  const env = process.env.SENHA_ACESSO;
  return iguais(sha256(token), env ? sha256(tokenDe(env)) : PADRAO.token);
}
