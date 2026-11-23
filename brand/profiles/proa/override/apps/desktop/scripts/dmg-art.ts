/**
 * Draws the background of the macOS .dmg's window (tauri.macos.conf.json `bundle.macOS.dmg`): daybreak in the
 * landing's sky, clouds, a few agents far away, the wordmark, and a pixel hop from the app to Applications. Run by
 * CI before `tauri build` on macOS (`bun apps/desktop/scripts/dmg-art.ts`).
 *
 * The window is 660×400 points, the app at (180, 170) and Applications at (480, 170). Finder draws the icons and
 * their names over the picture, black on a light Mac and white on a dark one: the sky under them is a mid blue,
 * where both read. No text but the wordmark, so it suits any language the Mac is in.
 *
 * Outputs (ignored by git): src-tauri/dmg/background.png (660×400) and background@2x.png (1320×800), joined on
 * macOS into src-tauri/dmg/background.tiff (both sizes in one file, for Retina and non-Retina screens).
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gradientOf } from "../../../packages/ui/src/agent/engine.js";

import { pixelOf, type SeaKind, seaPixels } from "../../../packages/ui/src/sky/math";
import { dither, dottedWordmark, Picture, type RGB, SKY, WHITE } from "./pixel-art";

function creature(p: Picture, kind: SeaKind, x: number, y: number, size: number, color: string, direction = 1) {
  for (const cell of seaPixels(kind, pixelOf(color), pixelOf("#FFF1D9"))) {
    const rgb: RGB = [cell.color & 255, (cell.color >>> 8) & 255, (cell.color >>> 16) & 255];
    p.box(x + (direction < 0 ? 8 - cell.x : cell.x) * size, y + cell.y * size, size, size, rgb);
  }
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The window and the icons' centers, in points (tauri.macos.conf.json). */
const W = 660;
const H = 400;
const APP = [180, 170] as const;
const APPS = [480, 170] as const;

const gauss = (x: number, y: number, cx: number, cy: number, sx: number, sy: number) =>
  Math.exp(-(((x - cx) / sx) ** 2 + ((y - cy) / sy) ** 2));

/** A pixel cloud with a lit top edge, `cell` points per block. */
function cloud(p: Picture, x: number, y: number, cell: number, body: RGB, lit: RGB) {
  const shape = ["....XXX.......", "..XXXXXXX.XX..", ".XXXXXXXXXXXXX", "XXXXXXXXXXXXXXX"];
  shape.forEach((line, j) => {
    [...line].forEach((c, i) => {
      if (c !== "X") return;
      const top = j === 0 || shape[j - 1]?.[i] !== "X";
      p.box(x + i * cell, y + j * cell, cell, cell, top ? lit : body);
    });
  });
}

/** The hop from the app to Applications: a dotted pixel arc, growing and brighter, then a ">" head. */
function hop(p: Picture, color: RGB, alpha: number, cell = 4) {
  const x0 = APP[0] + 78;
  const x1 = APPS[0] - 84;
  const y0 = APP[1] - 6;
  const peak = APP[1] - 52;
  const at = (t: number): [number, number] => [
    x0 + (x1 - x0) * t,
    (1 - t) ** 2 * y0 + 2 * (1 - t) * t * peak + t * t * y0,
  ];
  for (let i = 0; i <= 9; i++) {
    const t = i / 10;
    const [x, y] = at(t);
    const s = cell * (i < 3 ? 1 : i < 7 ? 1.5 : 2);
    p.box(Math.round((x - s / 2) / 2) * 2, Math.round((y - s / 2) / 2) * 2, s, s, color, alpha * (0.35 + 0.65 * t));
  }
  const [hx, hy] = at(1);
  const head = [
    [-1, 0],
    [0, 1],
    [1, 2],
    [0, 3],
    [-1, 4],
    [-2, 0],
    [-1, 1],
    [0, 2],
    [-1, 3],
    [-2, 4],
  ];
  for (const [dx, dy] of head)
    p.box(hx + (dx as number) * cell, hy - 2 * cell + (dy as number) * cell, cell, cell, color, alpha);
}

function background(k: number): Picture {
  const p = new Picture(W * k, H * k, k);
  // Deep at the top, two soft light patches, lighter toward the bottom; a mid blue around the icons.
  dither(
    p,
    SKY,
    (u, v) => {
      const x = u * W;
      const y = v * H;
      return (
        0.04 +
        0.5 * v ** 1.25 +
        0.05 * Math.sin(x / 70 + v * 3) +
        0.3 * gauss(x, y, 120, 70, 160, 60) +
        0.22 * gauss(x, y, 560, 330, 200, 80)
      );
    },
    3,
  );
  const tone = (i: number) => SKY[i] as RGB;
  cloud(p, 26, 92, 4, tone(4), tone(6));
  cloud(p, 520, 54, 3, tone(3), tone(5));
  // Anonymous coastal life; the actual app icon remains Timo.
  creature(p, "gull", 90, 42, 2, "#FFF1D9");
  creature(p, "gull", 600, 72, 2, "#FFF1D9", -1);
  creature(p, "sail", 565, 202, 3, "#FFF1D9");
  creature(p, "fish", 50, 270, 2, gradientOf("rose")[0]);
  creature(p, "dart", 120, 320, 2, gradientOf("amber")[0], -1);
  creature(p, "reef", 455, 295, 2, gradientOf("sky")[1]);
  creature(p, "jelly", 590, 310, 2, gradientOf("violet")[0]);
  creature(p, "shark", 295, 345, 3, "#183A55", -1);
  creature(p, "bubbles", 480, 268, 2, "#A2E5CE");
  dottedWordmark(p, W / 2, 64, 34);
  hop(p, WHITE, 0.95);
  return p;
}

const dir = join(root, "src-tauri", "dmg");
mkdirSync(dir, { recursive: true });
const one = join(dir, "background.png");
const two = join(dir, "background@2x.png");
writeFileSync(one, background(1).png());
writeFileSync(two, background(2).png());
if (process.platform === "darwin") {
  // One TIFF with both sizes: Finder picks the one the screen needs.
  const tiff = spawnSync("tiffutil", ["-cathidpicheck", one, two, "-out", join(dir, "background.tiff")], {
    stdio: "inherit",
  });
  if (tiff.status !== 0) throw new Error("tiffutil could not join the .dmg backgrounds");
  console.log("dmg art: background.png, background@2x.png and background.tiff written");
} else {
  console.log("dmg art: background.png and background@2x.png written (the .tiff is joined on macOS)");
}
