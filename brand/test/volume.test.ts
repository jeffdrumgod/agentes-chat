import { expect, test } from "bun:test";
import { createRequire } from "node:module";
import { resolve } from "node:path";

// Runs against a branded copy: TIMO_VERIFY_ROOT=<dir made by brand/build.sh> bun test brand/test. Skipped otherwise.
const ROOT = process.env.TIMO_VERIFY_ROOT;
const root = resolve(ROOT ?? ".");
const E = ROOT ? await import(`${root}/packages/ui/src/agent/engine.js`) : {};
const { RecordingContext } = ROOT ? await import(`${root}/apps/mobile/src/agent/recorder.ts`) : {};
const { canvasLayers } = ROOT ? await import(`${root}/packages/ui/scripts/app-icons/scenes.mjs`) : {};
const require = createRequire(ROOT ? `${root}/packages/ui/package.json` : import.meta.url);
const React = ROOT ? require("react") : null;
const { renderToStaticMarkup } = ROOT ? require("react-dom/server") : { renderToStaticMarkup: null };
const { EmptyState } = ROOT ? await import(`${root}/packages/ui/src/components/Surfaces.tsx`) : {};

test.skipIf(!ROOT)("small portraits stay flat; large ones record soft volume without new mobile calls", () => {
  const small = new RecordingContext(),
    large = new RecordingContext();
  E.drawAgent(small, 0, 0, 24, {});
  E.drawAgent(large, 0, 0, 96, {});
  const colors = (c: typeof small) =>
    c.commands.filter((x: { op: string }) => x.op === "fill").map((x: { color: string }) => x.color);
  expect(colors(small).some((c: string) => c.startsWith("rgba"))).toBe(false);
  expect(new Set(colors(small)).size).toBeLessThan(12);
  expect(new Set(colors(large)).size).toBeGreaterThan(60);
  expect(colors(large)).toContain("rgba(16,46,57,0.025)");
  expect(large.commands.filter((c: { op: string }) => c.op === "save").length).toBe(
    large.commands.filter((c: { op: string }) => c.op === "restore").length,
  );
});
test.skipIf(!ROOT)("the icon raster bridge preserves translucent sheen and analytic circles", () => {
  const [layer] = canvasLayers((ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = "rgba(16,46,57,0.25)";
    ctx.beginPath();
    ctx.ellipse(10, 10, 5, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  });
  expect(layer.color(10, 10)).toBe("#102e39");
  expect(layer.alpha(10, 10)).toBe(0.25);
  expect(layer.mask(10, 10)).toBe(true);
  expect(layer.mask(16, 10)).toBe(false);
});
test.skipIf(!ROOT)("large empty states pick approved decorative images and retain inline behavior", () => {
  for (const [icon, file] of [
    [undefined, "timo-acenando"],
    ["search", "timo-luneta"],
    ["bell", "facho-parado"],
  ]) {
    const html = renderToStaticMarkup(
      React.createElement(EmptyState, { size: "page", agent: true, icon, title: "Aqui" }),
    );
    expect(html).toContain(`/brand/3d/${file}.webp`);
    expect(html).toContain('alt=""');
    expect(html).toContain('width="128"');
  }
  const html = renderToStaticMarkup(React.createElement(EmptyState, { size: "inline", agent: true, title: "Aqui" }));
  expect(html).not.toContain("/brand/3d/");
});
