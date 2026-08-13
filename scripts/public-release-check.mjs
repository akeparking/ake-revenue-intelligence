import crypto from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const excludedDirectories = new Set([".git", ".next", "node_modules", "dist", "coverage", "backups"]);
const forbiddenFileNames = new Set([".env", ".env.local"]);
const forbiddenExtensions = new Set([".dump", ".sqlite", ".sqlite3", ".db"]);
const forbiddenPatterns = [
  { label: "WSL home path", pattern: /\/home\/[A-Za-z0-9._-]+\// },
  { label: "mounted drive path", pattern: /\/mnt\/[a-z]\//i },
  { label: "Windows user path", pattern: /[A-Za-z]:\\Users\\/i },
  { label: "machine-local Codex path", pattern: new RegExp("Codex" + "Local|Codex" + "Work", "i") },
  { label: "GitHub token", pattern: /\b(?:gho|ghp|github_pat)_[A-Za-z0-9_]+/ },
  { label: "private key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { label: "Moltbook credential", pattern: /MOLTBOOK_API_KEY\s*=\s*\S+/ },
];

function walk(directory, output = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) walk(absolute, output);
    else if (entry.isFile()) output.push(absolute);
  }
  return output;
}

const failures = [];
const files = walk(root);
for (const absolute of files) {
  const relativePath = relative(root, absolute).split(sep).join("/");
  if (forbiddenFileNames.has(relativePath) || forbiddenFileNames.has(relativePath.split("/").at(-1))) {
    failures.push({ path: relativePath, reason: "forbidden environment file" });
    continue;
  }
  if (forbiddenExtensions.has(relativePath.slice(relativePath.lastIndexOf(".")))) {
    failures.push({ path: relativePath, reason: "forbidden data or database artifact" });
    continue;
  }
  if (statSync(absolute).size > 5 * 1024 * 1024) {
    failures.push({ path: relativePath, reason: "unexpected file larger than 5 MiB" });
    continue;
  }
  const content = readFileSync(absolute, "utf8");
  for (const check of forbiddenPatterns) {
    if (check.pattern.test(content)) failures.push({ path: relativePath, reason: check.label });
  }
}

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures }, null, 2));
  process.exit(1);
}

const aggregate = crypto.createHash("sha256");
for (const absolute of files.sort()) {
  aggregate.update(relative(root, absolute));
  aggregate.update("\0");
  aggregate.update(readFileSync(absolute));
}
console.log(JSON.stringify({
  ok: true,
  scannedFiles: files.length,
  excludedDirectories: [...excludedDirectories],
  aggregateHash: aggregate.digest("hex"),
}, null, 2));
