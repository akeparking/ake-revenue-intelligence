import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const baseUrl = process.env.SERVER_API_URL || "http://127.0.0.1:4100";
  const target = new URL(path.join("/"), `${baseUrl}/`);
  target.search = request.nextUrl.search;
  const response = await fetch(target, {
    method: request.method,
    headers: {
      "content-type": request.headers.get("content-type") || "application/json",
      "x-workspace-id": process.env.DEFAULT_WORKSPACE_ID || "ake-demo",
      "x-user-id": process.env.DEFAULT_USER_ID || "ake-admin",
      ...(process.env.API_KEY ? { "x-api-key": process.env.API_KEY } : {}),
    },
    body: ["GET", "HEAD"].includes(request.method) ? undefined : await request.text(),
    cache: "no-store",
  });
  const body = await response.text();
  return new NextResponse(body, { status: response.status, headers: { "content-type": response.headers.get("content-type") || "application/json" } });
}

export const GET = proxy;
export const POST = proxy;
