import { describe, expect, it } from "vitest";
import { createOpportunitySchema, maskEmail, normalizePhone } from "./index";

describe("contracts", () => {
  it("requires a qualified opportunity to have a customer and next step", () => {
    const result = createOpportunitySchema.safeParse({
      primarySourceLeadId: "lead-1",
      name: "GCC tower parking upgrade",
      direction: "Parking guidance",
      country: "AE",
      ownerId: "sales-1",
    });
    expect(result.success).toBe(false);
  });

  it("normalizes phone and masks email", () => {
    expect(normalizePhone("+971 50 123 9876")).toBe("+971501239876");
    expect(maskEmail("Sales@Example.com")).toBe("sa***@example.com");
  });
});
