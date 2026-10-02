import { z } from "zod";

const optionalText = z.string().trim().min(1).max(300).nullable();
export const qualificationFieldsSchema = z.object({
  company: optionalText,
  country: optionalText,
  city: optionalText,
  projectType: optionalText,
  parkingSpaces: z.number().int().min(0).max(10_000_000).nullable(),
  products: z.array(z.string().trim().min(1).max(100)).max(12),
  intent: z.enum(["high", "medium", "low", "unknown"]),
  leadScore: z.number().int().min(0).max(100).nullable(),
  nextAction: z.string().trim().min(2).max(600),
});
export type QualificationFields = z.infer<typeof qualificationFieldsSchema>;
export const qualificationAnalysisSchema = qualificationFieldsSchema.extend({
  summary: z.string().trim().min(1).max(1200),
  evidence: z.array(z.object({
    field: z.enum(["company", "country", "city", "projectType", "parkingSpaces", "products", "intent", "leadScore"]),
    kind: z.enum(["stated", "inferred"]),
    quote: z.string().min(1).max(600),
  })).max(30),
  warnings: z.array(z.string().max(300)).max(12),
});
export type QualificationAnalysis = z.infer<typeof qualificationAnalysisSchema>;

export const createInquirySchema = z.object({
  eventId: z.string().min(1).max(180),
  conversationId: z.string().min(1).max(180),
  channel: z.enum(["website", "email", "whatsapp"]),
  displayName: z.string().trim().min(1).max(120),
  message: z.string().trim().min(1).max(6000),
  email: z.string().email().optional(),
  isTest: z.boolean().default(true),
  occurredAt: z.string().datetime(),
});
export type CreateInquiryInput = z.infer<typeof createInquirySchema>;
export interface InquiryRecord extends CreateInquiryInput {
  id: string;
  workspaceId: string;
  leadId: string;
  status: "pending" | "processing" | "waiting_external" | "analyzed" | "failed";
  analysis?: QualificationAnalysis;
  modelProvider?: string;
  error?: string;
  attempts: number;
  createdAt: string;
}

export const qualifyOpportunitySchema = z.object({
  contactReachable: z.literal(true),
  relevantNeed: z.literal(true),
  targetBuyer: z.literal(true),
  nextAction: z.string().trim().min(2).max(600),
});
export type QualifyOpportunityInput = z.infer<typeof qualifyOpportunitySchema> & {
  workspaceId: string; opportunityId: string; actorId: string;
};
export const stageChangeSchema = z.object({
  stage: z.enum(["discovery", "solution_fit", "quotation", "negotiation", "won", "lost"]),
  expectedVersion: z.number().int().nonnegative(),
});
export type StageChangeInput = z.infer<typeof stageChangeSchema> & {
  workspaceId: string; opportunityId: string; actorId: string;
};
export const applyQualificationSchema = z.object({
  fields: qualificationFieldsSchema,
  expectedRevision: z.number().int().nonnegative(),
});
