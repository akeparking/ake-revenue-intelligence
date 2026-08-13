import { describe, expect, it } from "vitest";
import { normalizeOkkiLead } from "./okki.service";

describe("OKKI read-only importer", () => {
  it("preserves real Meta identifiers without treating OKKI ID as an ads ID", () => {
    const lead = normalizeOkkiLead({
      lead_id: "okki-100",
      serial_id: "serial-1",
      name: "Parking inquiry",
      company_name: "Gulf Systems",
      country: "AE",
      create_time: "2026-08-12T01:00:00Z",
      origin_name: "Facebook Lead",
      customers: [{ name: "Omar", email: "OMAR@example.ae", main_customer_flag: 1 }],
      relate_info: { facebook_lead_id: "meta-lead-900", facebook_form_id: "form-8", facebook_ad_id: "ad-7" },
    }, "active", "ake-demo");
    expect(lead.provider).toBe("meta");
    expect(lead.externalLeadId).toBe("meta-lead-900");
    expect(lead.attribution.identifiers).toContainEqual({ type: "meta_leadgen_id", value: "meta-lead-900" });
    expect(lead.attribution.metadata?.okkiLeadId).toBe("okki-100");
  });

  it("imports unattributed OKKI inquiries without fabricating ad identifiers", () => {
    const lead = normalizeOkkiLead({ lead_id: "okki-200", name: "Manual inquiry", origin_name: "Manual", customers: [] }, "converted", "ake-demo");
    expect(lead.provider).toBe("organic");
    expect(lead.externalLeadId).toBe("okki:okki-200");
    expect(lead.attribution.identifiers).toEqual([]);
  });
});
