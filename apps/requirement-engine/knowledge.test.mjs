import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { queryCanonicalFiles } from "./knowledge.mjs";

test("read-only Canonical fallback returns approved exact evidence", () => {
  const root = mkdtempSync(join(tmpdir(), "ake-canonical-test-"));
  try {
    const products = join(root, "30-canonical", "products");
    mkdirSync(products, { recursive: true });
    writeFileSync(join(products, "guidance.md"), [
      "---",
      "id: AKE-TEST-1",
      "title: Parking Guidance Systems",
      "status: approved",
      "authority: source_summary",
      "sensitivity: public_candidate",
      "content_hash: abc123",
      "source_refs:",
      "- AKE-SRC-1",
      "---",
      "",
      "# Parking Guidance Systems",
      "",
      "Approved ultrasonic and camera guidance categories.",
    ].join("\n"));
    writeFileSync(join(products, "draft.md"), "---\ntitle: Draft\nstatus: draft\n---\nParking guidance draft");

    const receipt = queryCanonicalFiles({ query: "parking guidance", repositoryRoot: root, now: "2026-08-13T00:00:00.000Z" });
    assert.equal(receipt.adapter, "canonical-files-readonly");
    assert.equal(receipt.answerability, "GROUNDING_CANDIDATES");
    assert.equal(receipt.results.length, 1);
    assert.equal(receipt.results[0].title, "Parking Guidance Systems");
    assert.equal(receipt.results[0].content_hash, "abc123");
    assert.match(receipt.results[0].source_uri, /^qmd:\/\/ake-canonical\//);
    assert.ok(receipt.results[0].line_end >= receipt.results[0].line_start);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
