import { expect, test } from "bun:test";
import { resolve } from "node:path";

// Runs against a branded copy (brand/build.sh --target none --out <dir>): TIMO_VERIFY_ROOT=<dir> bun test brand/test.
// Without it (the repository's own test run) the file is skipped.
const ROOT = process.env.TIMO_VERIFY_ROOT;
const root = resolve(ROOT ?? ".");
const E = ROOT ? await import(`${root}/packages/ui/src/agent/engine.js`) : {};
const upstream = await import(new URL("../../packages/ui/src/agent/engine.js", import.meta.url).href);
const { RecordingContext } = ROOT
  ? await import(`${root}/apps/mobile/src/agent/recorder.ts`)
  : { RecordingContext: null };
test.skipIf(!ROOT)("Timo preserves every public export and stored appearance id", () => {
  // drawPorthole is the profile's own (the porthole's ring), declared in engine.d.ts by a patch.
  expect(Object.keys(E).sort()).toEqual([...Object.keys(upstream), "drawPorthole"].sort());
  expect(E.ACCESSORY_NAMES).toEqual(upstream.ACCESSORY_NAMES);
  expect(Object.keys(E.EYE_STYLES)).toEqual(Object.keys(upstream.EYE_STYLES));
  expect(E.BODY_CUT).toBe(0);
  expect(E.bodyPath()).toContain("Q");
  for (const a of Object.values(E.ACCESSORIES))
    for (const row of a.rows)
      for (const ch of row) {
        expect(ch === " " || ch in E.ACCESSORY_PALETTE || ch in E.ACCESSORY_CHECK).toBe(true);
        expect(ch).not.toBe("A");
      }
});
test.skipIf(!ROOT)(
  "all looks and expressions record with the mobile subset, finite coordinates and balanced saves",
  () => {
    for (const color of [...Object.keys(E.AGENT_GRADIENTS), "#101820"])
      for (const eyes of Object.keys(E.EYE_STYLES))
        for (const accessory of E.ACCESSORY_NAMES)
          for (const expression of [undefined, ...Object.keys(E.EXPRESSIONS)]) {
            const ctx = new RecordingContext();
            E.drawAgent(ctx, 0, 0, 24, {
              color,
              eyes,
              pose: { expression, turn: [0.5, -0.2] },
              after: (ctx, s, f) => E.drawAccessory(ctx, s, accessory, f),
            });
            expect(ctx.commands.filter((c) => c.op === "save").length).toBe(
              ctx.commands.filter((c) => c.op === "restore").length,
            );
            expect(JSON.stringify(ctx.commands)).not.toMatch(/NaN|Infinity|null/);
            // The kerchief: coral, navy on the coral face.
            const kerchief = color === "rose" ? "#183A55" : "#FA7C66";
            expect(ctx.commands.some((c) => c.op === "fill" && c.color === kerchief)).toBe(true);
          }
  },
);
test.skipIf(!ROOT)("progress, contrast and sleeping keep their contracts", () => {
  for (const [color, ink] of [
    [["#050505", "#050505"], "#FFF1D9"],
    [["#eeeeee", "#cccccc"], "#102E39"],
  ]) {
    const rec = new RecordingContext();
    E.drawAgent(rec, 0, 0, 96, { color });
    expect(rec.commands.some((c) => c.op === "fill" && c.color === ink)).toBe(true);
  }
  for (const progress of [0, 0.5, 1]) {
    let calls = 0;
    const rec = new RecordingContext();
    E.drawAgent(rec, 0, 0, 96, {
      progress,
      after: () => {
        calls++;
      },
    });
    expect(calls).toBe(progress === 1 ? 1 : 0);
  }
  expect(E.sleepPose().expression).toBe("closed");
  const rec = new RecordingContext();
  E.drawSleep(rec, 96, undefined, E.EYE_COLOR);
  // A gold crescent outlined in the page's ink, and its star.
  expect(rec.commands.filter((c) => c.op === "stroke" && c.color === E.EYE_COLOR)).toHaveLength(1);
  expect(rec.commands.filter((c) => c.op === "fill" && c.color === "#FFD477")).toHaveLength(2);
});

test.skipIf(!ROOT)("default workspace accent stays mint; custom workspace accents still win", async () => {
  const { accentSky, DEFAULT_ACCENT, DEFAULT_ACCENT_PALETTE } = await import(`${root}/packages/tokens/src/accent.ts`);
  expect(E.DEFAULT_SKY).toEqual(["#C4F0E0", "#A2E5CE"]);
  expect(DEFAULT_ACCENT).toBe("#14635c");
  const own = [DEFAULT_ACCENT_PALETTE.light.agent2, DEFAULT_ACCENT_PALETTE.light.agent];
  expect(accentSky(DEFAULT_ACCENT)).toEqual(own);
  try {
    for (const pair of [null, own, own.map((c) => c.toUpperCase()), accentSky("invalid")]) {
      E.setSkyColors(pair);
      expect(E.gradientOf("sky")).toEqual(E.DEFAULT_SKY);
      expect(E.drawnKey()).toBe(E.DEFAULT_SKY.join());
      const rec = new RecordingContext();
      E.drawAgent(rec, 0, 0, 96);
      expect(rec.commands.some((c) => c.op === "fill" && c.color === "#102E39")).toBe(true);
    }
    for (const custom of ["#7c3aed", "#ae3344", "#0063d1", "#14635d"]) {
      const pair = accentSky(custom);
      E.setSkyColors(pair);
      expect(E.gradientOf("sky")).toEqual(pair);
      expect(E.gradientOf("rose")).toEqual(E.AGENT_GRADIENTS.rose);
    }
  } finally {
    E.setSkyColors(null);
  }
});

test.skipIf(!ROOT)("the head exactly preserves the approved pear path and its tapered chin", () => {
  expect(E.bodyPath(22, 22, 84)).toBe("M33 52Q32 33 64 32Q96 33 95 52L95 70Q95 93 64 101Q33 93 33 70Z");
  const width = (v) => Array.from({ length: 1000 }, (_, i) => E.inBody((i + 0.5) / 1000, v)).filter(Boolean).length;
  expect(width(0.9)).toBeLessThan(width(0.6) * 0.6);
  expect(E.inBody(0.5, 0.92)).toBe(true);
  expect(E.inBody(0.15, 0.92)).toBe(false);
});

test.skipIf(!ROOT)("both desktop wordmark entry points use the approved Nunito 800 Proa outline", async () => {
  const { WORDMARK, Picture, wordmark, dottedWordmark } = await import(`${root}/apps/desktop/scripts/pixel-art.ts`);
  expect(WORDMARK.bb).toEqual({ x1: 8.52, y1: -84.6, x2: 250.55999999999995, y2: 1.3199999999999998 });
  expect(new Bun.CryptoHasher("sha256").update(WORDMARK.d).digest("hex")).toBe(
    "72b66dd465284f195c13b63d12b6d6aac5210d73285b7369837aa3ba33b11815",
  );
  const a = new Picture(160, 60, 1),
    b = new Picture(160, 60, 1);
  wordmark(a, 80, 45, 48);
  dottedWordmark(b, 80, 45, 48);
  expect(a.png()).toEqual(b.png());
  expect(a.px.some((value) => value > 0)).toBe(true);
});
