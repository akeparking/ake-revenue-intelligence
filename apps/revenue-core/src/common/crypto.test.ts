import { describe, expect, it } from "vitest";
import { FieldCipher } from "./crypto";

describe("FieldCipher key formats", () => {
  it.each([
    ["hex", "ab".repeat(32)],
    ["base64", Buffer.alloc(32, 7).toString("base64")],
  ])("encrypts and decrypts with a 32-byte %s key", (_format, key) => {
    const cipher = new FieldCipher(key);
    const encrypted = cipher.encrypt("meta-lead-123");

    expect(encrypted).toMatch(/^gcm:/);
    expect(cipher.decrypt(encrypted)).toBe("meta-lead-123");
  });

  it("rejects keys that do not decode to 32 bytes", () => {
    expect(() => new FieldCipher("too-short")).toThrow(/32-byte/);
  });
});
