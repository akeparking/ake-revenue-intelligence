import { createHmac, createHash, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "sales_workspace_session";
export const authRequired = () => process.env.NODE_ENV === "production" || !!process.env.WORKSPACE_PASSWORD;
export function safeEqual(left: string, right: string) {
  return timingSafeEqual(createHash("sha256").update(left).digest(), createHash("sha256").update(right).digest());
}
export function newSession() {
  if (!process.env.WORKSPACE_SESSION_SECRET || process.env.WORKSPACE_SESSION_SECRET.length < 32) throw new Error("Session secret is not configured");
  const value = String(Date.now() + 8 * 60 * 60 * 1000);
  return `${value}.${createHmac("sha256", process.env.WORKSPACE_SESSION_SECRET).update(value).digest("hex")}`;
}
export function validSession(value?: string) {
  if (!authRequired()) return true;
  if (!value || !process.env.WORKSPACE_SESSION_SECRET || !process.env.WORKSPACE_PASSWORD) return false;
  const [expires, signature] = value.split(".");
  if (!signature || !/^\d{13}$/.test(expires) || Number(expires) < Date.now()) return false;
  return safeEqual(signature, createHmac("sha256", process.env.WORKSPACE_SESSION_SECRET).update(expires).digest("hex"));
}
