import { expect, spyOn, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

// Runs against a branded copy: TIMO_VERIFY_ROOT=<dir made by brand/build.sh> bun test brand/test. Skipped otherwise.
const ROOT = process.env.TIMO_VERIFY_ROOT;
const root = resolve(ROOT ?? ".");
const load = (p: string) => (ROOT ? import(`${root}/${p}`) : Promise.resolve({}));
const M = await load("packages/ui/src/sky/math.ts");
const { setupDom } = await load("packages/ui/testing/dom.ts");
const { canvasPage } = await load("packages/ui/testing/frames.ts");
const { startSky, redrawSkies } = await load("packages/ui/src/sky/engine.ts");
const { Picture } = await load("apps/desktop/scripts/pixel-art.ts");
if (ROOT) setupDom();
const seeded = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

test.skipIf(!ROOT)("sea silhouettes fit the existing grid; fish dominate and shark/sail are rare", () => {
  for (const grid of Object.values(M.SEA_SPRITES) as string[][]) {
    expect(grid.length).toBe(9);
    expect(grid.every((line) => line.length === 9 && /^[.X+o]+$/.test(line))).toBe(true);
  }
  const kinds = Array.from({ length: 1000 }, (_, i) => M.seaKind(i / 1000));
  expect(kinds.filter((k) => ["fish", "dart", "reef"].includes(k))).toHaveLength(650);
  expect(kinds.filter((k) => k === "shark")).toHaveLength(40);
  expect(kinds.filter((k) => k === "sail")).toHaveLength(30);
  expect(M.SPRITE).not.toEqual(M.SEA_SPRITES.fish);
});

test.skipIf(!ROOT)("all creatures mirror exactly, clip safely and honor clear pixels", () => {
  for (const kind of Object.keys(M.SEA_SPRITES)) {
    const a = { w: 18, h: 18, buf: new Uint32Array(324) };
    const b = { ...a, buf: new Uint32Array(324) };
    M.drawSeaSprite(a, 0, 0, 2, M.pixelOf("#A2E5CE"), M.pixelOf("#FFF1D9"), kind, 1);
    M.drawSeaSprite(b, 0, 0, 2, M.pixelOf("#A2E5CE"), M.pixelOf("#FFF1D9"), kind, -1);
    expect(a.buf.some(Boolean)).toBe(true);
    for (let y = 0; y < 18; y++) for (let x = 0; x < 18; x++) expect(a.buf[y * 18 + x]).toBe(b.buf[y * 18 + 17 - x]);
    b.buf.fill(0);
    M.drawSeaSprite(b, -5, -3, 2, 1, 2, kind, 1, (x: number) => x < 8);
    expect(b.buf.filter((v: number, i: number) => i % 18 < 8 && v !== 0)).toHaveLength(0);
  }
});

test.skipIf(!ROOT)("habitats separate sky and water; sail base stays on the surface", () => {
  for (const k of [1, 2]) {
    const [g0, g1] = M.seaBand("gull", 75, k, 22.5);
    expect(g0).toBeGreaterThanOrEqual(22.5);
    expect(g1).toBeLessThanOrEqual(35);
    for (const kind of ["fish", "dart", "reef", "jelly", "shark", "bubbles"]) {
      expect(M.seaBand(kind, 75, k, 22.5)).toEqual([35, 75]);
    }
    expect(M.seaBand("sail", 75, k)[0] + 7 * k).toBe(35);
  }
});

test.skipIf(!ROOT)("real sky loop keeps reduced motion still, resumes movement and renders horizon previews", () => {
  for (const dark of [false, true]) {
    const rand = spyOn(Math, "random").mockImplementation(seeded(274));
    const page = canvasPage({ width: 1280, height: 300, reduced: true });
    const tones = M.softTones("sky", dark ? "#102625" : "#f6f5ef");
    const stop = startSky(page.canvas, () => ({
      pixel: 4,
      palette: tones,
      body: M.spriteTone("sky"),
      near: 0,
      faint: 0,
      ceil: 0.3,
      light: 0,
      // Expanded cast for the preview sheet; production callers keep their own counts (AuthHorizon: 6).
      sprites: 18,
      base: (u: number, v: number, t: number) => {
        const s = Math.max(0, (v - 0.2) / 0.8),
          e = s * s * (3 - 2 * s);
        return 0.78 * e + 0.05 * Math.sin(u * 4 + t * 0.4) * e;
      },
    }));
    try {
      const first = page.image();
      expect(first).not.toBeNull();
      redrawSkies();
      page.frames(500);
      expect(page.image().pixels).toEqual(first.pixels);
      expect(page.pending()).toBe(0);
      if (process.env.SEA_PREVIEW_DIR) {
        const p = new Picture(1280, 300, 1);
        first.pixels.forEach((color: number, i: number) => {
          p.box((i % first.w) * 4, Math.floor(i / first.w) * 4, 4, 4, [
            color & 255,
            (color >>> 8) & 255,
            (color >>> 16) & 255,
          ]);
        });
        writeFileSync(resolve(process.env.SEA_PREVIEW_DIR, `sky-horizon-${dark ? "dark" : "light"}.png`), p.png());
      }
      page.motion(false);
      page.frames(1000);
      expect(page.image().pixels).not.toEqual(first.pixels);
      page.motion(true);
      page.frames(100);
      const still = page.image().pixels;
      page.frames(1000);
      expect(page.image().pixels).toEqual(still);
    } finally {
      stop();
      page.close();
      rand.mockRestore();
    }
  }
});
