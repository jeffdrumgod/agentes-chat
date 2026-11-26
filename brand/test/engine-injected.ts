import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The agent engine is the upstream's file with the profile's drawing injected (brand.json: patches that move the
// upstream's drawing out of the way, then agent/proa-agent.js appended), rebuilt here from the repository itself.
export const REPO = new URL("../../", import.meta.url).pathname;
export const ENGINE = "packages/ui/src/agent/engine.js";
export const PROFILE = join(REPO, "brand/profiles/proa");
export const upstream = readFileSync(join(REPO, ENGINE), "utf8");
export const proa = readFileSync(join(PROFILE, "agent/proa-agent.js"), "utf8");
export const brand = JSON.parse(readFileSync(join(PROFILE, "brand.json"), "utf8"));
export const enginePatches: { find: string; replace: string; count?: number }[] = brand.patches.filter(
  (p: { file?: string }) => p.file === ENGINE,
);

/** The engine as the apply leaves it: the profile's patches, then its appended files. */
export function injected() {
  let src = upstream;
  for (const p of enginePatches) src = src.split(p.find).join(p.replace);
  for (const f of [brand.append[ENGINE]].flat()) src += `\n\n${readFileSync(join(PROFILE, f), "utf8")}`;
  return src;
}

/** The injected engine, imported from a temporary file. */
export async function injectedEngine() {
  const file = join(mkdtempSync(join(tmpdir(), "proa-engine-")), "engine.js");
  writeFileSync(file, injected());
  return import(file);
}
