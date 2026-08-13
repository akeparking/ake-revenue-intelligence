import { Inject, Injectable } from "@nestjs/common";
import type { AnalyzeRequirementInput, RequirementCommitReceipt, RequirementProfileRecord } from "@ake/contracts";
import { loadConfig } from "../config";
import { REVENUE_STORE, type RevenueStore } from "../store/store.types";

interface EngineResponse {
  turnResult: Record<string, any>;
  nextState: any;
  engineReceipt: Record<string, unknown>;
}

@Injectable()
export class RequirementsService {
  constructor(@Inject(REVENUE_STORE) private readonly store: RevenueStore) {}

  async health() {
    const config = loadConfig();
    try {
      const response = await fetch(`${config.requirementEngine.baseUrl.replace(/\/$/, "")}/health`, {
        signal: AbortSignal.timeout(Math.min(config.requirementEngine.timeoutMs, 5_000)),
      });
      if (!response.ok) return { healthy: false, status: response.status };
      return { healthy: true, ...(await response.json() as object) };
    } catch {
      return { healthy: false, service: "ake-requirement-engine" };
    }
  }

  async profile(workspaceId: string, leadId: string, conversationId?: string): Promise<RequirementProfileRecord | undefined> {
    return this.store.getRequirementProfile(workspaceId, leadId, conversationId);
  }

  async analyze(input: AnalyzeRequirementInput, workspaceId: string, actorId: string): Promise<RequirementCommitReceipt> {
    const replay = await this.store.getRequirementReceiptByEvent(workspaceId, input.eventId);
    if (replay) return replay;

    const context = await this.store.getRequirementContext(workspaceId, input.leadId, input.conversationId);
    if (!context) throw new Error("Lead not found for requirement analysis");
    const config = loadConfig();
    if (!config.requirementEngine.token) throw new Error("Requirement engine token is not configured");

    const response = await fetch(`${config.requirementEngine.baseUrl.replace(/\/$/, "")}/analyze`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-engine-key": config.requirementEngine.token },
      signal: AbortSignal.timeout(config.requirementEngine.timeoutMs),
      body: JSON.stringify({
        workspaceId,
        leadId: input.leadId,
        contactId: context.lead.personId || context.lead.id,
        conversationId: input.conversationId,
        eventId: input.eventId,
        occurredAt: input.occurredAt,
        message: input.message,
        scenario: input.scenario,
        channel: input.channel,
        currentState: context.state,
        leadContext: {
          provider: context.lead.provider,
          sourceKind: context.lead.sourceKind,
          country: context.lead.country || null,
          companyName: context.lead.companyName || null,
        },
      }),
    });
    const body = await response.json().catch(() => ({})) as Partial<EngineResponse> & { error?: string };
    if (!response.ok || !body.turnResult || !body.nextState) {
      throw new Error(body.error || `Requirement engine failed (${response.status})`);
    }
    return this.store.commitRequirementTurn({
      workspaceId,
      actorId,
      leadId: input.leadId,
      conversationId: input.conversationId,
      eventId: input.eventId,
      occurredAt: input.occurredAt,
      message: input.message,
      turnResult: body.turnResult,
      nextState: body.nextState,
    });
  }
}
