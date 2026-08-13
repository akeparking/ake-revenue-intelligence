import { Inject, Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import type { IngestLeadInput } from "@ake/contracts";
import { loadConfig } from "../config";
import { ConversionService } from "../conversion/conversion.service";
import { IngestionService } from "../ingestion/ingestion.service";
import { REVENUE_STORE, type RevenueStore } from "../store/store.types";

@Injectable()
export class DemoSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(DemoSeeder.name);

  constructor(
    private readonly ingestion: IngestionService,
    private readonly conversions: ConversionService,
    @Inject(REVENUE_STORE) private readonly store: RevenueStore,
  ) {}

  async onApplicationBootstrap() {
    const config = loadConfig();
    if (!config.demoSeed) return;
    const dashboard = await this.store.getDashboard(config.defaultWorkspaceId);
    if (dashboard.leads.length) return;

    const now = Date.now();
    const seeds: IngestLeadInput[] = [
      {
        workspaceId: config.defaultWorkspaceId,
        provider: "meta",
        sourceKind: "instant_form",
        externalLeadId: "demo-meta-lead-1001",
        displayName: "Omar Al-Nuaimi",
        email: "omar@example.ae",
        phone: "+971501234567",
        companyName: "Gulf Axis Mobility",
        country: "AE",
        isTest: true,
        attribution: {
          provider: "meta",
          sourceKind: "instant_form",
          occurredAt: new Date(now - 27 * 60 * 1000).toISOString(),
          identifiers: [
            { type: "meta_leadgen_id", value: "demo-meta-lead-1001" },
            { type: "page_id", value: "page-392001" },
            { type: "form_id", value: "form-uae-project" },
            { type: "campaign_id", value: "cmp-meta-gcc-01" },
            { type: "ad_set_id", value: "adset-uae-developer" },
            { type: "ad_id", value: "ad-case-study-03" },
          ],
          consentStatus: "granted",
        },
      },
      {
        workspaceId: config.defaultWorkspaceId,
        provider: "google",
        sourceKind: "website",
        externalLeadId: "demo-site-form-2001",
        displayName: "Marta Kovačević",
        email: "marta@example.hr",
        phone: "+385911234567",
        companyName: "Adriatic Access Systems",
        country: "HR",
        isTest: true,
        attribution: {
          provider: "google",
          sourceKind: "website",
          occurredAt: new Date(now - 91 * 60 * 1000).toISOString(),
          identifiers: [
            { type: "google_gclid", value: "demo-gclid-croatia-2001" },
            { type: "campaign_id", value: "cmp-google-eu-07" },
          ],
          utm: { source: "google", medium: "cpc", campaign: "automated-parking-eu" },
          landingUrl: "https://example.com/automated-parking",
          consentStatus: "granted",
        },
      },
      {
        workspaceId: config.defaultWorkspaceId,
        provider: "meta",
        sourceKind: "ctwa",
        externalLeadId: "chatwoot:demo-3001",
        displayName: "Faisal Al-Harbi",
        phone: "+966551234567",
        waId: "966551234567",
        companyName: "Desert Gate Developments",
        country: "SA",
        isTest: true,
        attribution: {
          provider: "meta",
          sourceKind: "ctwa",
          occurredAt: new Date(now - 3 * 60 * 60 * 1000).toISOString(),
          identifiers: [
            { type: "meta_ctwa_clid", value: "demo-ctwa-click-3001" },
            { type: "meta_fbc", value: "fb.1.demo.ctwa.3001" },
            { type: "ad_id", value: "ad-whatsapp-sa-09" },
          ],
          consentStatus: "granted",
        },
      },
      {
        workspaceId: config.defaultWorkspaceId,
        provider: "google",
        sourceKind: "instant_form",
        externalLeadId: "demo-google-lead-4001",
        displayName: "Samuel Okafor",
        email: "samuel@example.ng",
        companyName: "Meridian Build Africa",
        country: "NG",
        isTest: true,
        attribution: {
          provider: "google",
          sourceKind: "instant_form",
          occurredAt: new Date(now - 6 * 60 * 60 * 1000).toISOString(),
          identifiers: [
            { type: "google_lead_id", value: "demo-google-lead-4001" },
            { type: "google_gcl_id", value: "demo-gcl-click-4001" },
            { type: "form_id", value: "asset-form-africa-02" },
            { type: "campaign_id", value: "cmp-google-africa-04" },
            { type: "ad_group_id", value: "adgroup-nigeria-b2b" },
          ],
          consentStatus: "granted",
        },
      },
      {
        workspaceId: config.defaultWorkspaceId,
        provider: "organic",
        sourceKind: "chat",
        externalLeadId: "chatwoot:demo-5001",
        displayName: "Elena Rossi",
        email: "elena@example.it",
        companyName: "Orizzonte Mobility",
        country: "IT",
        isTest: true,
        attribution: {
          provider: "organic",
          sourceKind: "chat",
          occurredAt: new Date(now - 22 * 60 * 60 * 1000).toISOString(),
          identifiers: [],
          consentStatus: "unknown",
        },
      },
    ];

    const leads = [];
    for (const seed of seeds) leads.push(await this.ingestion.ingest(seed, { demo: true, externalLeadId: seed.externalLeadId }, "demo_seed"));
    for (const lead of leads.slice(0, 2)) {
      await this.store.createOpportunity({
        workspaceId: config.defaultWorkspaceId,
        personId: lead.personId,
        companyId: lead.companyId,
        primarySourceLeadId: lead.id,
        name: `${lead.companyName || lead.displayName} parking project`,
        direction: "Automated parking solution",
        country: lead.country || "Unknown",
        ownerId: config.defaultUserId,
        nextAction: "Confirm site drawings and project schedule",
        expectedTimeline: "Within 30 days",
        currency: "USD",
      });
    }
    await this.conversions.processBatch(10);
    this.logger.log(`Seeded ${leads.length} demo leads and 2 qualified opportunities`);
  }
}
