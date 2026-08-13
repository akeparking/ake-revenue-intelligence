import type { Request } from "express";
import { loadConfig } from "../config";

export function requestWorkspace(request: Request): string {
  return String(request.headers["x-workspace-id"] || loadConfig().defaultWorkspaceId);
}
export function requestUser(request: Request): string {
  return String(request.headers["x-user-id"] || loadConfig().defaultUserId);
}

export function redactPayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactPayload);
  if (!value || typeof value !== "object") return value;
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (/token|secret|emailAddress|phoneNumber|\bem\b|\bph\b/i.test(key)) {
      result[key] = Array.isArray(child) ? child.map(() => "[redacted]") : "[redacted]";
    } else {
      result[key] = redactPayload(child);
    }
  }
  return result;
}
