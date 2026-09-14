import { NextResponse, type NextRequest } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData } from "@/lib/session";

const ROTAS_PUBLICAS = ["/login"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    ROTAS_PUBLICAS.some((rota) => pathname.startsWith(rota)) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/uploads") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const response = NextResponse.next();
  const session = await getIronSession<SessionData>(request, response, sessionOptions);

  if (!session.usuario) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|uploads).*)"],
};
