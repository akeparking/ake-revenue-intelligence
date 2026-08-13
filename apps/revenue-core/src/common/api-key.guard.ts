import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { loadConfig } from "../config";

@Injectable()
export class ApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const config = loadConfig();
    if (config.apiAuthMode === "demo") return true;
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined>; url: string }>();
    if (request.url === "/health" || request.url === "/metrics" || request.url === "/openapi.json" || request.url.startsWith("/webhooks/")) return true;
    if (!config.apiKey || request.headers["x-api-key"] !== config.apiKey) {
      throw new UnauthorizedException("Invalid API key");
    }
    return true;
  }
}
