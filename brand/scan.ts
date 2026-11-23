#!/usr/bin/env bun
/**
 * Scans a branded build (or code with --source) for leftover upstream branding
 * (brand/README.md, "safeguards").
 *
 *   bun brand/scan.ts <dir> [--kept <apply-report.json>] [--source] [--report <file.json>]
 *
 * `--kept`: texts intentionally preserved by apply.ts are allowed (upstream team references: feedback, reports,
 * telemetry; variable documentation). Reject entries containing only the name ("agentes.chat"):
 * they would allow any leftover.
 * `--source`: scans code that is not bundled (mobile, desktop Rust), skipping comments and tests.
 *
 * Classifies each "agentes.chat" as allowed (URL/domain, attribution, upstream Cloud, "Powered by", technical,
 * intentionally kept) or LEFTOVER. Exits with 1 if leftovers exist.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Glob } from "bun";

const argv = process.argv.slice(2);
const dir = argv[0];
const opt = (name: string) => {
  const i = argv.indexOf(name);
  return i > 0 ? argv[i + 1] : undefined;
};
const SOURCE = argv.includes("--source");
if (!dir || dir.startsWith("--"))
  throw new Error("Usage: bun brand/scan.ts <dir> [--kept <apply-report.json>] [--source] [--report <file.json>]");

const keptFile = opt("--kept");
const kept: string[] = keptFile ? (JSON.parse(readFileSync(keptFile, "utf8")).kept ?? []) : [];
const bare = kept.filter((t) => /^\s*agentes\.chat\s*$/.test(t));
if (bare.length)
  throw new Error(
    `scan: --kept contains ${bare.length} entry/entries with only "agentes.chat": this would allow any leftover`,
  );
// Each text as it appears in a bundle: raw (template literal), escaped (JSON.parse of a block), or ASCII-escaped
// (the server bundle writes "é" as \xE9 and "チ" as チ).
const ascii = (t: string) =>
  JSON.stringify(t)
    .slice(1, -1)
    // biome-ignore lint/suspicious/noControlCharactersInRegex: This range intentionally detects non-ASCII characters.
    .replace(/[^\x00-\x7f]/g, (c) => {
      const h = c.charCodeAt(0).toString(16).toUpperCase();
      return c.charCodeAt(0) < 0x100 ? `\\x${h.padStart(2, "0")}` : `\\u${h.padStart(4, "0")}`;
    });
const keptForms = [...new Set(kept.flatMap((t) => [t, JSON.stringify(t).slice(1, -1), ascii(t)]))];

// Each category checks a small window around the match: `near` (the name and a few characters on each side)
// or `ctx` (40 on each side). A wide window would allow a leftover just because it is near a URL.
type Rule = { kind: string; near?: RegExp; ctx?: RegExp };
const ALLOWED: Rule[] = [
  { kind: "url/domain", near: /[\w/.@-]agentes\.chat|agentes\.chat(?:[\w/]|-(?!\p{L}))/u },
  { kind: "comment", near: /\/\/ agentes\.chat|\* agentes\.chat/ },
  { kind: "import source", ctx: /agenteschat:\s*["`]agentes\.chat["`]|agenteschatName/ },
  { kind: "attribution", ctx: /<site>agentes\.chat<\/site>|AGENTESCHAT/ },
  { kind: "upstream Cloud", near: /agentes\.chat Cloud/ },
  // Server label for upstream Cloud (app.agentes.chat): "agentes.chat" is the correct name there.
  {
    kind: "upstream Cloud",
    ctx: /app\.agentes\.chat["`]\s*\?\s*["`]agentes\.chat|CLOUD_SERVER\s*\?\s*["`]agentes\.chat|server_name\(server, "agentes\.chat"/,
  },
  { kind: "Powered by", ctx: /Powered by agentes\.chat|poweredBy/ },
  {
    kind: "technical",
    ctx: /secret v1|hkdf|instance\.name|z\.literal|[!=]== ?["`]agentes\.chat["`]|application_name|user-agent|advisory|problem report|X-OpenRouter-Title|storage check|DEVICE_NAME|INTEGRATION_NAME|PRODUCT_HOST|SIGNATURE_MARK|OFFICIAL_HOSTS|"app\.agentes\.chat", "agentes\.chat", "www\.agentes\.chat"|literal\("agentes\.chat"\)|name: ?["`]agentes\.chat["`],? ?(version|as const)|"name":\s*"agentes\.chat"/i,
  },
];
const COMMENT_BY_EXT: [RegExp, RegExp][] = [
  [/\.(ts|tsx|js|mjs|rs|kt|swift)$/, /^\s*(\/\/|\*|\/\*)/],
  [/\.(ya?ml|sh|toml)$/, /^\s*#(?!!)/],
  [/\.(html|plist|xml)$/, /^\s*<!--/],
  [/\.strings$/, /^\s*(\/\/|\/\*)/],
];
const TESTS = /\.test\.|\.spec\.|\/test\/|\/tests\/|__tests__\/|__snapshots__\/|\/fixtures\//;
// Upstream Cloud Terms and Privacy are their contract: keep them unchanged (they only appear in Cloud).
const LEGAL_FILE = /LegalPage|legal[-/]/;

const found: Record<string, number> = {};
const leftovers: Record<string, number> = {};
const add = (bag: Record<string, number>, k: string) => (bag[k] = (bag[k] ?? 0) + 1);
const pattern = SOURCE
  ? "**/*.{ts,tsx,js,rs,json,plist,strings,xml,kt,swift}"
  : "**/*.{js,html,css,json,txt,webmanifest}";
for (const f of new Glob(pattern).scanSync({ cwd: dir })) {
  // Tauri permission descriptions (capabilities/ and the generated copy in gen/) are not shown to anyone.
  if (SOURCE && /(^|\/)(capabilities|gen)\//.test(f)) continue;
  if (/node_modules\/|(^|\/)target\/|(^|\/)dist\//.test(f) || (SOURCE && (TESTS.test(f) || /\.source\.json$/.test(f))))
    continue;
  let s = readFileSync(join(dir, f), "utf8");
  if (LEGAL_FILE.test(f)) {
    found["Cloud legal text"] = (found["Cloud legal text"] ?? 0) + (s.match(/agentes\.chat/g)?.length ?? 0);
    continue;
  }
  if (SOURCE) {
    // Rust: the test module at the end of the file is not included in the app.
    const tests = s.indexOf("#[cfg(test)]");
    if (f.endsWith(".rs") && tests >= 0) s = s.slice(0, tests);
    const comment = COMMENT_BY_EXT.find(([ext]) => ext.test(f))?.[1];
    if (comment)
      s = s
        .split("\n")
        .map((line) => (comment.test(line) ? "" : line))
        .join("\n");
  }
  // Ranges of intentionally kept texts.
  const keptRanges: [number, number][] = [];
  for (const t of keptForms)
    for (let at = s.indexOf(t); at >= 0; at = s.indexOf(t, at + 1)) keptRanges.push([at, at + t.length]);
  for (const m of s.matchAll(/agentes\.chat/g)) {
    const i = m.index ?? 0;
    if (keptRanges.some(([a, b]) => i >= a && i < b)) {
      add(found, "intentionally kept");
      continue;
    }
    const near = s.slice(Math.max(0, i - 3), i + 14);
    const ctx = s.slice(Math.max(0, i - 40), i + 52).replace(/\s+/g, " ");
    const kind = ALLOWED.find((r) => r.near?.test(near) || r.ctx?.test(ctx))?.kind;
    if (kind) add(found, kind);
    else add(leftovers, `${f}: …${s.slice(Math.max(0, i - 60), i + 72).replace(/\s+/g, " ")}…`);
  }
}
const total = Object.values(leftovers).reduce((a, b) => a + b, 0);
console.log("scan: allowed", found);
console.log(`scan: leftovers: ${total}`);
for (const [k, n] of Object.entries(leftovers).slice(0, 40)) console.log(`  ${n}× ${k.slice(0, 220)}`);
const reportFile = opt("--report");
if (reportFile) writeFileSync(reportFile, JSON.stringify({ allowed: found, leftovers }, null, 2));
process.exit(total ? 1 : 0);
