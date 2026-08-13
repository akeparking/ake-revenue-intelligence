import crypto from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

const stopWords = new Set(["a", "an", "and", "are", "for", "in", "is", "of", "on", "the", "to", "with"]);

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function tokens(value) {
  return [...new Set(String(value || "").normalize("NFKC").toLowerCase().split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 1 && !stopWords.has(token)))];
}

function scalar(value) {
  const text = String(value || "").trim();
  if ((text.startsWith("'") && text.endsWith("'")) || (text.startsWith('"') && text.endsWith('"'))) return text.slice(1, -1);
  return text;
}

function parseDocument(content) {
  const lines = content.split(/\r?\n/);
  const metadata = { source_refs: [] };
  let bodyStart = 0;
  if (lines[0]?.trim() === "---") {
    const end = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
    if (end > 0) {
      let sourceRefs = false;
      for (let index = 1; index < end; index += 1) {
        const line = lines[index];
        if (/^source_refs:\s*$/.test(line)) {
          sourceRefs = true;
          continue;
        }
        const item = sourceRefs ? line.match(/^\s*-\s+(.+)$/) : null;
        if (item) {
          metadata.source_refs.push(scalar(item[1]));
          continue;
        }
        sourceRefs = false;
        const field = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
        if (field) metadata[field[1]] = scalar(field[2]);
      }
      bodyStart = end + 1;
    }
  }
  const body = lines.slice(bodyStart);
  const firstMeaningful = body.findIndex((line) => line.trim());
  let lastMeaningful = body.length - 1;
  while (lastMeaningful >= 0 && !body[lastMeaningful].trim()) lastMeaningful -= 1;
  const selectedBody = body.slice(0, Math.min(body.length, 120));
  return {
    metadata,
    body: selectedBody.join("\n").trim(),
    lineStart: bodyStart + Math.max(0, firstMeaningful) + 1,
    lineEnd: bodyStart + Math.max(0, Math.min(lastMeaningful, 119)) + 1,
  };
}

function markdownFiles(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile() && entry.name.endsWith(".md")) files.push(absolute);
    }
  };
  visit(root);
  return files.slice(0, 500);
}

function scoreDocument(query, queryTokens, relativePath, document) {
  const title = String(document.metadata.title || "");
  const searchable = `${title}\n${relativePath}\n${document.body}`.toLowerCase();
  const searchableTokens = new Set(tokens(searchable));
  const overlap = queryTokens.filter((token) => searchableTokens.has(token)).length;
  const phraseBoost = searchable.includes(query.toLowerCase()) ? 4 : 0;
  const titleOverlap = queryTokens.filter((token) => tokens(title).includes(token)).length * 2;
  return overlap + phraseBoost + titleOverlap;
}

export function queryCanonicalFiles({ query, repositoryRoot, limit = 3, now = new Date().toISOString() }) {
  if (!query?.trim()) throw new Error("Knowledge query must be non-empty.");
  const canonicalRoot = resolve(repositoryRoot, "30-canonical");
  const queryTokens = tokens(query);
  const candidates = [];
  for (const absolutePath of markdownFiles(canonicalRoot)) {
    const normalizedRelative = relative(canonicalRoot, absolutePath).split(sep).join("/");
    if (normalizedRelative.startsWith("../")) continue;
    const content = readFileSync(absolutePath, "utf8");
    if (content.length > 1_000_000) continue;
    const document = parseDocument(content);
    if (document.metadata.status !== "approved") continue;
    const score = scoreDocument(query, queryTokens, normalizedRelative, document);
    candidates.push({ absolutePath, normalizedRelative, document, score });
  }
  const selected = candidates
    .sort((left, right) => right.score - left.score || left.normalizedRelative.localeCompare(right.normalizedRelative))
    .slice(0, Math.max(1, Math.min(10, limit)));
  const results = selected.map(({ normalizedRelative, document, score }) => {
    const contentHash = document.metadata.content_hash || sha256(document.body);
    return {
      docid: `#${contentHash}`,
      score,
      local_score: score,
      title: document.metadata.title || normalizedRelative,
      source_uri: `qmd://ake-canonical/${normalizedRelative}`,
      line_start: document.lineStart,
      line_end: document.lineEnd,
      exact_text: document.body,
      numbered_text: "",
      knowledge_id: document.metadata.id || "",
      status: document.metadata.status || "",
      authority: document.metadata.authority || "",
      sensitivity: document.metadata.sensitivity || "",
      review_due: document.metadata.review_due || "",
      content_hash: contentHash,
      source_refs: document.metadata.source_refs,
      usable_for_customer_answer: document.metadata.status === "approved",
      requires_source_reread: false,
    };
  });
  const material = results.map((item) => `${item.source_uri}\0${item.content_hash}`).sort().join("\n");
  return {
    adapter: "canonical-files-readonly",
    intent: "answer",
    collection: "ake-canonical",
    query: query.trim(),
    retrieval: "lexical-readonly-fallback",
    retrieved_at: now,
    aggregate_hash: sha256(`ake-canonical\n${material}`),
    answerability: results.some((item) => item.usable_for_customer_answer) ? "GROUNDING_CANDIDATES" : "NO_APPROVED_EVIDENCE",
    results,
    warnings: [],
  };
}
