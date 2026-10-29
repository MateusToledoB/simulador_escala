import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { COOKIE, DURACAO, senhaCorreta, tokenDe } from "@/lib/acesso";

// redirecionamento relativo: atrás do proxy do servidor, request.url pode ter o endereço interno
const ir = (destino: string) => new NextResponse(null, { status: 303, headers: { Location: destino } });

/** Formulário de /entrar: senha certa grava o cookie de acesso e volta ao site; errada, volta para /entrar. */
export async function POST(request: NextRequest) {
  const senha = String((await request.formData()).get("senha") ?? "");
  if (!senhaCorreta(senha)) return ir("/entrar?erro=1");
  const resposta = ir("/");
  resposta.cookies.set(COOKIE, tokenDe(senha), {
    httpOnly: true,
    sameSite: "lax",
    secure: (request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "")) === "https",
    maxAge: DURACAO,
    path: "/",
  });
  return resposta;
}
