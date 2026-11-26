import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { ENGINE, enginePatches, injectedEngine, proa, REPO, upstream } from "./engine-injected";

/**
 * Every export of the upstream engine and who draws it now. "proa": the profile renames the upstream's one and
 * agent/proa-agent.js defines it. "upstream": kept as is (colors, poses, expressions, helpers). A new upstream export
 * fails here on purpose: if it draws the agent (a shape, an outline, a sprite), the upstream symbol would come back
 * unnoticed, so decide which side it belongs to and add it.
 */
const EXPORTS: Record<string, "proa" | "upstream"> = {
  AGENT_GRADIENTS: "upstream",
  DEFAULT_SKY: "upstream",
  setSkyColors: "proa",
  drawnKey: "upstream",
  EYE_COLOR: "proa",
  BODY_RADIUS: "proa",
  BODY_CUT: "proa",
  EYE_X: "proa",
  EYE_STYLES: "proa",
  WRITING_EYE: "proa",
  rgbOf: "upstream",
  mixHex: "upstream",
  isHexColor: "upstream",
  colorKey: "upstream",
  hexToHsv: "upstream",
  hsvToHex: "upstream",
  luminance: "upstream",
  contrastOf: "upstream",
  mentionTone: "upstream",
  customGradient: "upstream",
  pickerStart: "upstream",
  nearestPreset: "upstream",
  gradientOf: "upstream",
  bodyTones: "upstream",
  spriteBody: "upstream",
  ditherCells: "proa",
  inBody: "proa",
  bodyPath: "proa",
  toneAt: "proa",
  bodySvg: "proa",
  EXPRESSIONS: "upstream",
  eyeShapes: "upstream",
  drawEyes: "proa",
  idlePose: "upstream",
  bodyFrame: "upstream",
  drawAgent: "proa",
  spriteGrid: "proa",
  ACCESSORY_PALETTE: "proa",
  ACCESSORY_CHECK: "upstream",
  ACCESSORIES: "proa",
  ACCESSORY_NAMES: "proa",
  ACCESSORY_REACH: "upstream",
  drawAccessory: "proa",
  SLEEP_SPOTS: "upstream",
  drawSleep: "proa",
  sleepPose: "upstream",
};
const exportsOf = (src: string) => [...src.matchAll(/^export (?:const|let|function|class) (\w+)/gm)].map((m) => m[1]);
describe("the agent engine: upstream file, Proa drawing", () => {
  test("every upstream export is listed with who draws it", () => {
    expect(exportsOf(upstream).sort()).toEqual(Object.keys(EXPORTS).sort());
  });

  test("each Proa export moves the upstream's out of the way once and is defined by agent/proa-agent.js", () => {
    const ours = Object.keys(EXPORTS).filter((k) => EXPORTS[k] === "proa");
    expect(exportsOf(proa).sort()).toEqual(ours.sort());
    for (const name of ours) {
      const head = new RegExp(`^export (?:const ${name} =|function ${name}\\()`, "m").exec(upstream)?.[0];
      expect(head, name).toBeDefined();
      const moved = enginePatches.filter((p) => p.find === head || p.find.startsWith(`${head}`));
      expect(moved, name).toHaveLength(1);
      expect(moved[0]?.count, name).toBe(1);
      expect(moved[0]?.replace.startsWith("export"), name).toBe(false);
    }
    for (const p of enginePatches) expect(upstream.split(p.find).length - 1, p.find).toBe(p.count ?? 1);
  });

  test("the injected engine loads as one module with the upstream's exports and appearance ids", async () => {
    const E = await injectedEngine();
    const U = await import(join(REPO, ENGINE));
    expect(Object.keys(E).sort()).toEqual(Object.keys(U).sort());
    expect(E.ACCESSORY_NAMES).toEqual(U.ACCESSORY_NAMES);
    expect(Object.keys(E.EYE_STYLES)).toEqual(Object.keys(U.EYE_STYLES));
    expect(Object.keys(E.AGENT_GRADIENTS)).toEqual(Object.keys(U.AGENT_GRADIENTS));
    // The upstream's shape is gone: no cut corner, no square body.
    expect(E.BODY_CUT).toBe(0);
    expect(E.inBody(0.02, 0.98)).toBe(false);
    expect(E.inBody(0.98, 0.02)).toBe(false);
  });
});
