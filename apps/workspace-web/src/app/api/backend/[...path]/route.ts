import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { validSession, SESSION_COOKIE } from "../../../../lib/auth";

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  if (!validSession(request.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.json({ message: "Authentication required" }, { status: 401 });
  const { path } = await context.params;
  const route = path.join("/");
  const read = /^api\/v1\/(dashboard|inbox|audit|leads|opportunities|persons|companies|orders|tasks|notes|conversion-deliveries|integrations\/status|ai\/health|requirements\/[A-Za-z0-9_-]+)$/;
  const write = /^api\/v1\/(inbox|opportunities|tasks|notes|requirements\/analyze|leads\/[A-Za-z0-9_-]+\/review|conversion-deliveries\/(process|[A-Za-z0-9_-]+\/replay))$/;
  // Exact route allowlist: the operator proxy cannot access webhooks or bridge imports.
  const allowedWrite = write.test(route) || /^api\/v1\/opportunities\/[A-Za-z0-9_-]+\/(stage|qualify)$/.test(route);
  if (request.method === "GET" ? !read.test(route) : !allowedWrite) return NextResponse.json({ message: "Route not available" }, { status: 404 });
  if (request.method !== "GET") {
    const expectedOrigin = process.env.WORKSPACE_PUBLIC_ORIGIN || request.nextUrl.origin;
    if (request.headers.get("origin") !== expectedOrigin) return NextResponse.json({ message: "Invalid origin" }, { status: 403 });
  }
  const baseUrl = process.env.SERVER_API_URL || "http://127.0.0.1:4100";
  const target = new URL(route, `${baseUrl}/`);
  target.search = request.nextUrl.search;
  try {
    const response = await fetch(target, {
      method: request.method, signal: AbortSignal.timeout(45_000),
      headers: {
        "content-type": "application/json",
        "x-workspace-id": process.env.DEFAULT_WORKSPACE_ID || "ake-demo",
        "x-user-id": process.env.DEFAULT_USER_ID || "demo-operator",
        ...(process.env.API_KEY ? { "x-api-key": process.env.API_KEY } : {}),
      },
      body: request.method === "GET" ? undefined : await request.text(), cache: "no-store",
    });
    return new NextResponse(await response.text(), { status: response.status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  } catch { return NextResponse.json({ message: "Revenue Core is unavailable. Please retry." }, { status: 502 }); }
}
export const GET = proxy;
export const POST = proxy;
