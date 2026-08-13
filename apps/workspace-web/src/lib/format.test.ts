import { describe, expect, it } from "vitest";
import { conversionRate, formatRelative } from "./format";

describe("workspace formatting", () => {
  it("keeps an unavailable conversion denominator blank", () => {
    expect(conversionRate(0, 0)).toBe("—");
  });

  it("formats recent activity compactly", () => {
    expect(formatRelative("2026-08-12T01:00:00.000Z", Date.parse("2026-08-12T02:30:00.000Z"))).toBe("1h ago");
  });
});
