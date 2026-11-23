/** Render the real engine through the repository's dependency-free icon rasterizer. */
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Usage: bun brand/preview-timo.ts <branded copy made by brand/build.sh>
if (!process.argv[2]) throw new Error("usage: bun brand/preview-timo.ts <branded copy>");
const root = resolve(process.argv[2]);
const E = await import(`${root}/packages/ui/src/agent/engine.js`);
const { canvasLayers } = await import(`${root}/packages/ui/scripts/app-icons/scenes.mjs`);
const { render, png } = await import(`${root}/packages/ui/scripts/app-icons/raster.mjs`);
const colors = [...Object.keys(E.AGENT_GRADIENTS), "#101820"];
const cols = [
  ...Object.keys(E.EYE_STYLES).map((eyes) => ({ label: eyes, eyes })),
  ...E.ACCESSORY_NAMES.map((accessory) => ({ label: accessory, accessory })),
  ...["idle", "thinking", "writing", "waiting", "sleeping"].map((state) => ({ label: state, state })),
];
const width = cols.length * 150 + 120,
  height = colors.length * 205 + 65;
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#F5F3EC"/><g font-family="sans-serif" fill="#102E39" font-size="12"><text x="12" y="20">Timo · 96 / 24 px</text>`;
cols.forEach((c, i) => {
  svg += `<text x="${125 + i * 150}" y="48">${c.label}</text>`;
});
colors.forEach((color, r) => {
  svg += `<text x="8" y="${r * 205 + 110}">${color}</text>`;
  cols.forEach((c, i) => {
    for (const size of [96, 24]) {
      const N = size === 96 ? 144 : 40;
      const pose =
        c.state === "sleeping"
          ? E.sleepPose()
          : c.state === "writing"
            ? { writing: true }
            : c.state === "waiting"
              ? { look: [0, -0.1], turn: [0, -0.25] }
              : c.state === "thinking"
                ? { look: [-0.06, -0.05], turn: [-0.3, -0.2] }
                : {};
      const layers = canvasLayers((ctx) =>
        E.drawAgent(ctx, 8, size === 96 ? 36 : 10, size, {
          color,
          eyes: c.eyes,
          pose,
          after: (ctx, s, f) => {
            E.drawAccessory(ctx, s, c.accessory, f);
            if (c.state === "sleeping") E.drawSleep(ctx, s, f, E.EYE_COLOR);
          },
        }),
      );
      const bytes = png(render(N, layers));
      svg += `<image x="${115 + i * 150}" y="${r * 205 + (size === 96 ? 50 : 200)}" width="${N}" height="${N}" href="data:image/png;base64,${bytes.toString("base64")}"/>`;
    }
  });
});
svg += "</g></svg>";
mkdirSync("brand/.preview", { recursive: true });
const sheet = join(tmpdir(), "proa-timo-sheet.svg");
writeFileSync(sheet, svg);
const result = Bun.spawnSync(["rsvg-convert", sheet, "-o", process.argv[3] ?? "brand/.preview/timo-engine.png"]);
if (result.exitCode) throw Error(result.stderr.toString());
