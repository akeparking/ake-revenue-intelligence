import { NextResponse, type NextRequest } from "next/server";
import { validSession, SESSION_COOKIE } from "./lib/auth";

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path === "/" || path === "/login" || path === "/api/session" || path.startsWith("/_next/") || path === "/icon.svg" || path.startsWith("/showcase/")) return NextResponse.next();
  if (validSession(request.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  if (path.startsWith("/api/")) return NextResponse.json({ message: "Sign in to the demo workspace." }, { status: 401 });
  return NextResponse.redirect(new URL(`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/login`, request.url));
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
