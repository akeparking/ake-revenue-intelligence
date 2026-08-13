import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export class FieldCipher {
  private readonly key?: Buffer;

  constructor(encodedKey?: string) {
    if (!encodedKey) return;
    const key = /^[0-9a-f]{64}$/i.test(encodedKey)
      ? Buffer.from(encodedKey, "hex")
      : Buffer.from(encodedKey, "base64");
    if (key.length !== 32) {
      throw new Error("FIELD_ENCRYPTION_KEY must be a 32-byte base64 or 64-character hex key");
    }
    this.key = key;
  }

  encrypt(value: string): string {
    if (!this.key) return `plain:${value}`;
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `gcm:${Buffer.concat([iv, tag, encrypted]).toString("base64")}`;
  }

  decrypt(value: string): string {
    if (value.startsWith("plain:")) return value.slice(6);
    if (!this.key || !value.startsWith("gcm:")) throw new Error("Encrypted field cannot be decrypted");
    const payload = Buffer.from(value.slice(4), "base64");
    const iv = payload.subarray(0, 12);
    const tag = payload.subarray(12, 28);
    const encrypted = payload.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  }
}
