import { describe, expect, it } from "vitest";
import { demoFixtures, qualificationAnalysisSchema } from "@ake/contracts";
import { mockQualification, validateAnalysis } from "./qualification";

describe("qualification evidence and uncertainty", () => {
  it("distinguishes the three portfolio scenarios", () => {
    expect(demoFixtures.map((item) => validateAnalysis(mockQualification(item.message), item.message).intent)).toEqual(["high", "medium", "low"]);
  });
  it("keeps explicit zero and unknown company separate", () => {
    const result = mockQualification("We are in Manila with 0 parking spaces confirmed and exploring ANPR.");
    expect(result.parkingSpaces).toBe(0);
    expect(result.company).toBeNull();
    expect(result.evidence.find((item) => item.field === "country")?.kind).toBe("inferred");
  });
  it("rejects invented evidence and strips unsupported model actions", () => {
    const result = mockQualification(demoFixtures[0].message);
    expect(() => validateAnalysis({ ...result, evidence: [{ field: "company", kind: "stated", quote: "Invented buyer" }] }, demoFixtures[0].message)).toThrow(/source message/);
    expect(qualificationAnalysisSchema.parse({ ...result, autoSend: true })).not.toHaveProperty("autoSend");
    expect(() => qualificationAnalysisSchema.parse({ ...result, leadScore: 101 })).toThrow();
  });
});
