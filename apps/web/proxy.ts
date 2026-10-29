import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { COOKIE, tokenValido } from "@/lib/acesso";

/** Sem o cookie de acesso, a página vai para /entrar e a API responde 401. */
export function proxy(request: NextRequest) {
  if (tokenValido(request.cookies.get(COOKIE)?.value)) return NextResponse.next();
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ detail: "Acesso expirado. Recarregue a página e entre com a senha." }, { status: 401 });
  }
  const entrar = request.nextUrl.clone();
  entrar.pathname = "/entrar";
  entrar.search = "";
  return NextResponse.redirect(entrar);
}

export const config = {
  // tudo, menos a tela de senha, o login e os arquivos do Next
  matcher: ["/((?!entrar|acesso|_next/static|_next/image|favicon.ico).*)"],
};
