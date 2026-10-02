import { Body, Controller, Get, Inject, Param, Post, Req, UnauthorizedException } from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import { applyQualificationSchema, createInquirySchema, qualificationAnalysisSchema } from "@ake/contracts";
import type { Request } from "express";
import { requestUser, requestWorkspace } from "../common/http";
import { REVENUE_STORE, type RevenueStore } from "../store/store.types";
import { InboxService } from "./inbox.service";
import { loadConfig } from "../config";

@Controller("api/v1")
export class InboxController {
  constructor(private readonly inbox: InboxService, @Inject(REVENUE_STORE) private readonly store: RevenueStore) {}
  @Get("inbox")
  list(@Req() req: Request) { return this.store.listInquiries(requestWorkspace(req)); }
  @Get("integrations/status")
  async status(@Req() req: Request) {
    const inquiries = await this.store.listInquiries(requestWorkspace(req));
    const codex = inquiries.some((item) => item.modelProvider === "codex" && item.status === "analyzed");
    const config = loadConfig();
    return [
      { name: "Website / Chatwoot", state: codex ? "Inbound verified" : process.env.INBOX_BRIDGE_KEY ? "Configured · awaiting receipt" : "Local demo", detail: "Signed website messages remain linked to the original conversation." },
      { name: "AI qualification", state: codex ? "Codex receipt verified" : config.ai.provider === "mock" ? "Mock" : "Configured · not probed", detail: "Draft suggestions and source evidence; sales controls qualification." },
      { name: "Meta Ads", state: config.adsMode === "mock" ? "Mock" : "Live configured", detail: "Separate event adapter. Receipt and platform matching are different states." },
      { name: "Google Ads", state: config.adsMode === "mock" ? "Mock" : "Live configured", detail: "Conversion adapter with an independent delivery ledger." },
      { name: "Email", state: "Mock", detail: "Fictional inquiry fixtures; no mailbox is connected." },
      { name: "WhatsApp", state: "Mock", detail: "Fictional inquiry fixtures; no business number is connected." },
      { name: "OKKI / Feishu", state: "Not connected", detail: "This demo writes only to its own CRM database." },
      { name: "LinkedIn / TikTok", state: "Coming later", detail: "Outside the v0.1 demonstration." },
    ];
  }
  @Post("inbox")
  create(@Body() body: unknown, @Req() req: Request) { return this.inbox.receive(requestWorkspace(req), createInquirySchema.parse(body)); }
  @Post("inbox/import")
  receiveAnalysis(@Body() body: any, @Req() req: Request) {
    const expected = process.env.INBOX_BRIDGE_KEY || "";
    const supplied = String(req.headers["x-inbox-bridge-key"] || "");
    if (!expected || expected.length !== supplied.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))) throw new UnauthorizedException("Bridge authentication required");
    return this.inbox.receive(requestWorkspace(req), createInquirySchema.parse(body), body.analysis ? { analysis: qualificationAnalysisSchema.parse(body.analysis), provider: "codex" } : { provider: "unavailable", error: "Live analysis unavailable or human takeover active. Review the original inquiry." });
  }
  @Post("leads/:id/review")
  apply(@Param("id") id: string, @Body() body: unknown, @Req() req: Request) {
    const input = applyQualificationSchema.parse(body);
    return this.store.applyQualification(requestWorkspace(req), id, requestUser(req), input.fields, input.expectedRevision);
  }
}
