import { NextResponse, type NextRequest } from "next/server";
import { newSession, safeEqual, SESSION_COOKIE } from "../../../lib/auth";

const attempts = new Map<string, { count: number; at: number }>();
export async function POST(request: NextRequest) {
  const base = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const origin = process.env.WORKSPACE_PUBLIC_ORIGIN || request.nextUrl.origin;
  if (request.headers.get("origin") !== origin) return NextResponse.json({ message: "Invalid origin" }, { status: 403 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "local";
  const recent = attempts.get(ip);
  if (recent && Date.now() - recent.at < 60_000 && recent.count >= 8) return NextResponse.json({ message: "Please wait a minute before trying again." }, { status: 429 });
  attempts.set(ip, { count: recent && Date.now() - recent.at < 60_000 ? recent.count + 1 : 1, at: Date.now() });
  for (const [key, value] of attempts) if (Date.now() - value.at > 60_000) attempts.delete(key);
  const data = await request.formData();
  if (!process.env.WORKSPACE_PASSWORD || !safeEqual(String(data.get("password") || ""), process.env.WORKSPACE_PASSWORD)) return NextResponse.redirect(new URL(`${base}/login?error=1`, origin), 303);
  const response = NextResponse.redirect(new URL(`${base}/workspace`, origin), 303);
  response.cookies.set(SESSION_COOKIE, newSession(), { httpOnly: true, secure: origin.startsWith("https:"), sameSite: "strict", path: base || "/", maxAge: 8 * 60 * 60 });
  response.headers.set("cache-control", "no-store");
  return response;
}
