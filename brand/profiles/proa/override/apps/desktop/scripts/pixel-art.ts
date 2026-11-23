/**
 * Pixel art for the installers' pictures (installer-art.ts for Windows, dmg-art.ts for the macOS .dmg), drawn from
 * the agent engine and the sky's tones so the installers show the same agent and sky as the app's cover.
 *
 * No dependencies: the wordmark is the approved Proa outline in Nunito 800, filled here, and small BMP and PNG writers.
 */
import { deflateSync } from "node:zlib";
import { render } from "../../../packages/ui/scripts/app-icons/raster.mjs";
import { canvasLayers } from "../../../packages/ui/scripts/app-icons/scenes.mjs";
import { type AgentColorName, drawAgent } from "../../../packages/ui/src/agent/engine.js";
import { SKY_TONES } from "../../../packages/ui/src/sky/math";

export type RGB = [number, number, number];

export const hex = (h: string): RGB => {
  const n = Number.parseInt(h.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
export const WHITE: RGB = [255, 255, 255];
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** The sky's run from deep to light (the cover's sky). */
export const SKY = (SKY_TONES as string[]).map(hex);

/** A picture `w`×`h` pixels, drawn in points of `k` pixels each (2 = twice the size it shows at). */
export class Picture {
  readonly px: Float64Array;
  constructor(
    readonly w: number,
    readonly h: number,
    readonly k = 2,
  ) {
    this.px = new Float64Array(w * h * 3);
  }

  /** Paints (x, y) with `c` at `alpha` over what is there. */
  blend(x: number, y: number, c: RGB, alpha = 1) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || alpha <= 0) return;
    const i = (y * this.w + x) * 3;
    for (let k = 0; k < 3; k++) this.px[i + k] = (this.px[i + k] as number) * (1 - alpha) + (c[k] as number) * alpha;
  }

  rect(x: number, y: number, w: number, h: number, c: RGB) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.blend(xx, yy, c);
  }

  /** A rect in points (rounded to whole pixels), at `alpha`. */
  box(x: number, y: number, w: number, h: number, c: RGB, alpha = 1) {
    const x0 = Math.round(x * this.k);
    const y0 = Math.round(y * this.k);
    const x1 = Math.round((x + w) * this.k);
    const y1 = Math.round((y + h) * this.k);
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) this.blend(xx, yy, c, alpha);
  }

  /** 24-bit BMP, rows bottom-up, each padded to 4 bytes. */
  bmp(): Uint8Array {
    const row = Math.ceil((this.w * 3) / 4) * 4;
    const size = 54 + row * this.h;
    const out = new Uint8Array(size);
    const v = new DataView(out.buffer);
    out[0] = 0x42; // "BM"
    out[1] = 0x4d;
    v.setUint32(2, size, true);
    v.setUint32(10, 54, true);
    v.setUint32(14, 40, true);
    v.setInt32(18, this.w, true);
    v.setInt32(22, this.h, true);
    v.setUint16(26, 1, true);
    v.setUint16(28, 24, true);
    v.setUint32(34, row * this.h, true);
    v.setInt32(38, 3780, true); // 96 dpi
    v.setInt32(42, 3780, true);
    for (let y = 0; y < this.h; y++) {
      const at = 54 + (this.h - 1 - y) * row;
      for (let x = 0; x < this.w; x++) {
        const i = (y * this.w + x) * 3;
        for (let k = 0; k < 3; k++) out[at + x * 3 + (2 - k)] = Math.round(this.px[i + k] as number); // BGR
      }
    }
    return out;
  }

  /** 8-bit RGB PNG at 72 dpi per point (a 2× picture says 144 dpi, as macOS expects of a Retina image). */
  png(): Uint8Array {
    const raw = new Uint8Array((this.w * 3 + 1) * this.h);
    for (let y = 0; y < this.h; y++) {
      const at = y * (this.w * 3 + 1); // filter byte 0 (none), then the row
      for (let x = 0; x < this.w * 3; x++) raw[at + 1 + x] = Math.round(this.px[y * this.w * 3 + x] as number);
    }
    const ihdr = new Uint8Array(13);
    const hv = new DataView(ihdr.buffer);
    hv.setUint32(0, this.w);
    hv.setUint32(4, this.h);
    ihdr.set([8, 2, 0, 0, 0], 8); // 8 bits, RGB, deflate, no filter set, not interlaced
    const phys = new Uint8Array(9);
    const pv = new DataView(phys.buffer);
    const perMeter = Math.round((72 * this.k) / 0.0254);
    pv.setUint32(0, perMeter);
    pv.setUint32(4, perMeter);
    phys[8] = 1; // meters
    const chunks = [
      chunk("IHDR", ihdr),
      chunk("pHYs", phys),
      chunk("IDAT", deflateSync(raw)),
      chunk("IEND", new Uint8Array()),
    ];
    const sig = [137, 80, 78, 71, 13, 10, 26, 10];
    const out = new Uint8Array(sig.length + chunks.reduce((n, c) => n + c.length, 0));
    out.set(sig);
    let at = sig.length;
    for (const c of chunks) {
      out.set(c, at);
      at += c.length;
    }
    return out;
  }
}

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

/** One PNG chunk: length, type, data and the CRC of type + data. */
function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const v = new DataView(out.buffer);
  v.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  let c = 0xffffffff;
  for (let i = 4; i < 8 + data.length; i++) c = (CRC[(c ^ (out[i] as number)) & 255] as number) ^ (c >>> 8);
  v.setUint32(8 + data.length, (c ^ 0xffffffff) >>> 0);
  return out;
}

/* ---------- The sky: ordered dither over a run of tones ---------- */

/** Dithers `tones` over the picture in cells of `cell` points; `at(u, v)` (0..1) picks along the tones. */
export function dither(p: Picture, tones: RGB[], at: (u: number, v: number) => number, cell = 2) {
  const size = cell * p.k;
  const cw = Math.ceil(p.w / size);
  const ch = Math.ceil(p.h / size);
  for (let y = 0; y < ch; y++)
    for (let x = 0; x < cw; x++) {
      const val = Math.max(0, Math.min(0.999, at((x + 0.5) / cw, (y + 0.5) / ch))) * (tones.length - 1);
      const lo = Math.floor(val);
      const th = ((BAYER[(y & 3) * 4 + (x & 3)] as number) + 0.5) / 16;
      const tone = tones[val - lo > th ? Math.min(lo + 1, tones.length - 1) : lo] as RGB;
      p.rect(x * size, y * size, size, size, tone);
    }
}

/** A small pixel cloud (the landing's), at (x, y) in points, `cell` points per block. */
export function cloud(p: Picture, x: number, y: number, cell: number, tone: RGB) {
  const shape = ["..XXX...", ".XXXXXX.", "XXXXXXXX"];
  shape.forEach((line, j) => {
    [...line].forEach((c, i) => {
      if (c === "X") p.rect((x + i * cell) * p.k, (y + j * cell) * p.k, cell * p.k, cell * p.k, tone);
    });
  });
}

/* ---------- The agent: the engine's body, tones and eyes, still ---------- */

/** Installers reuse the same smooth Timo portrait as the avatars. */
export function agent(p: Picture, x: number, y: number, size: number, happy = false, color = "sky", _n = 12) {
  const s = Math.round(size * p.k),
    ox = Math.round(x * p.k),
    oy = Math.round(y * p.k);
  const layers = canvasLayers((ctx) =>
    drawAgent(ctx, 0, 0, s, { color: color as AgentColorName, pose: happy ? { expression: "happy" } : {} }),
  );
  const N = Math.ceil(s * 1.1),
    { px } = render(N, layers);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const i = (y * N + x) * 4,
        a = px[i + 3] ?? 0;
      if (a) p.blend(ox + x, oy + y, [(px[i] ?? 0) / a, (px[i + 1] ?? 0) / a, (px[i + 2] ?? 0) / a], a);
    }
}

/* ---------- Proa: approved Nunito 800 outlines, 120px, baseline y = 0 ---------- */
/** Exact approved outline and bounds, embedded so generators need no font or external reference file. */
export const WORDMARK = {
  d: "M17.88 1.08L17.88 1.08Q13.32 1.08 10.92-1.44Q8.52-3.96 8.52-8.52L8.52-8.52L8.52-75.12Q8.52-79.80 10.98-82.20Q13.44-84.60 18-84.60L18-84.60L47.16-84.60Q61.32-84.60 69-77.46Q76.68-70.32 76.68-57.60L76.68-57.60Q76.68-44.88 69-37.68Q61.32-30.48 47.16-30.48L47.16-30.48L27.12-30.48L27.12-8.52Q27.12-3.96 24.78-1.44Q22.44 1.08 17.88 1.08ZM27.12-70.08L27.12-44.88L44.04-44.88Q51.24-44.88 55.02-48.12Q58.80-51.36 58.80-57.60L58.80-57.60Q58.80-63.84 55.02-66.96Q51.24-70.08 44.04-70.08L44.04-70.08L27.12-70.08ZM92.40 1.08L92.40 1.08Q87.84 1.08 85.44-1.32Q83.04-3.72 83.04-8.16L83.04-8.16L83.04-50.76Q83.04-55.20 85.38-57.54Q87.72-59.88 91.92-59.88L91.92-59.88Q96.24-59.88 98.52-57.54Q100.80-55.20 100.80-50.76L100.80-50.76L100.80-48.60Q102.48-52.92 105.96-55.68L105.96-55.68Q110.88-59.64 118.68-60.12L118.68-60.12Q121.68-60.36 123.30-58.62Q124.92-56.88 125.04-52.92L125.04-52.92Q125.28-49.20 123.54-47.04Q121.80-44.88 117.72-44.40L117.72-44.40L114.96-44.16Q108.12-43.56 104.82-40.20Q101.52-36.84 101.52-30.48L101.52-30.48L101.52-8.16Q101.52-3.72 99.18-1.32Q96.84 1.08 92.40 1.08ZM157.32 1.32L157.32 1.32Q147.84 1.32 140.82-2.40Q133.80-6.12 129.96-13.08Q126.12-20.04 126.12-29.52L126.12-29.52Q126.12-36.60 128.28-42.24Q130.44-47.88 134.58-51.90Q138.72-55.92 144.48-58.02Q150.24-60.12 157.32-60.12L157.32-60.12Q166.80-60.12 173.82-56.40Q180.84-52.68 184.74-45.84Q188.64-39 188.64-29.52L188.64-29.52Q188.64-22.32 186.42-16.68Q184.20-11.04 180.12-6.96Q176.04-2.88 170.22-0.78Q164.40 1.32 157.32 1.32ZM157.32-12.24L157.32-12.24Q161.28-12.24 164.16-14.16Q167.04-16.08 168.72-19.86Q170.40-23.64 170.40-29.52L170.40-29.52Q170.40-38.28 166.80-42.42Q163.20-46.56 157.32-46.56L157.32-46.56Q153.48-46.56 150.54-44.76Q147.60-42.96 145.98-39.18Q144.36-35.40 144.36-29.52L144.36-29.52Q144.36-20.76 147.96-16.50Q151.56-12.24 157.32-12.24ZM217.20 1.32L217.20 1.32Q210.72 1.32 205.56-1.20Q200.40-3.72 197.52-8.04Q194.64-12.36 194.64-17.76L194.64-17.76Q194.64-24.24 198.00-28.02Q201.36-31.80 208.92-33.42Q216.48-35.04 228.96-35.04L228.96-35.04L233.28-35.04L233.28-37.08Q233.28-42.36 230.88-44.58Q228.48-46.80 222.72-46.80L222.72-46.80Q219.48-46.80 215.70-46.02Q211.92-45.24 207.36-43.44L207.36-43.44Q204.72-42.24 202.68-42.90Q200.64-43.56 199.56-45.30Q198.48-47.04 198.48-49.14Q198.48-51.24 199.68-53.22Q200.88-55.20 203.64-56.16L203.64-56.16Q209.28-58.44 214.26-59.28Q219.24-60.12 223.44-60.12L223.44-60.12Q232.68-60.12 238.62-57.42Q244.56-54.72 247.56-49.14Q250.56-43.56 250.56-34.80L250.56-34.80L250.56-8.16Q250.56-3.72 248.40-1.32Q246.24 1.08 242.16 1.08Q238.08 1.08 235.86-1.32Q233.64-3.72 233.64-8.16L233.64-8.16L233.64-8.76Q232.80-6.60 231.48-4.92L231.48-4.92Q229.08-1.92 225.48-0.30Q221.88 1.32 217.20 1.32ZM233.28-23.28L233.28-25.68L229.08-25.68Q222.96-25.68 219.18-25.02Q215.40-24.36 213.78-22.80Q212.16-21.24 212.16-18.48L212.16-18.48Q212.16-15.12 214.50-12.96Q216.84-10.80 221.28-10.80L221.28-10.80Q224.76-10.80 227.46-12.42Q230.16-14.04 231.72-16.86Q233.28-19.68 233.28-23.28L233.28-23.28Z",
  bb: { x1: 8.52, y1: -84.6, x2: 250.55999999999995, y2: 1.3199999999999998 },
  width: 242.03999999999994,
};
// Retain the old exported slot for scripts that import it; no suffix is drawn.
export const DOTTED_CHAT = { width: 0, d: "" };

type Edge = [number, number, number, number];

/** M/L/Q/Z path data (absolute, as the outlines above) to line edges, curves flattened. */
export function edges(d: string, scale: number, dx: number, dy: number): Edge[] {
  const out: Edge[] = [];
  const tokens = d.match(/[MLQZ]|-?\d*\.?\d+/g) ?? [];
  let i = 0;
  let cmd = "";
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  const num = () => Number(tokens[i++]);
  const P = (px: number, py: number): [number, number] => [dx + px * scale, dy + py * scale];
  while (i < tokens.length) {
    const t = tokens[i] as string;
    if (/[MLQZ]/.test(t)) {
      cmd = t;
      i++;
      if (cmd === "Z") {
        out.push([...P(x, y), ...P(sx, sy)]);
        x = sx;
        y = sy;
      }
      continue;
    }
    if (cmd === "M") {
      x = sx = num();
      y = sy = num();
      cmd = "L";
    } else if (cmd === "L") {
      const nx = num();
      const ny = num();
      out.push([...P(x, y), ...P(nx, ny)]);
      x = nx;
      y = ny;
    } else if (cmd === "Q") {
      const cx = num();
      const cy = num();
      const nx = num();
      const ny = num();
      let px = x;
      let py = y;
      for (let k = 1; k <= 8; k++) {
        const s = k / 8;
        const qx = (1 - s) ** 2 * x + 2 * (1 - s) * s * cx + s * s * nx;
        const qy = (1 - s) ** 2 * y + 2 * (1 - s) * s * cy + s * s * ny;
        out.push([...P(px, py), ...P(qx, qy)]);
        px = qx;
        py = qy;
      }
      x = nx;
      y = ny;
    } else i++;
  }
  return out;
}

/** Coverage (0..1) per pixel of the shapes in `e` (non-zero winding), 4×4 samples. */
export function coverage(e: Edge[], w: number, h: number): Float64Array {
  const cov = new Float64Array(w * h);
  const n = 4;
  for (let row = 0; row < h * n; row++) {
    const sy = (row + 0.5) / n;
    const hits: [number, number][] = [];
    for (const [x0, y0, x1, y1] of e) {
      if (y0 === y1 || sy < Math.min(y0, y1) || sy >= Math.max(y0, y1)) continue;
      hits.push([x0 + ((sy - y0) / (y1 - y0)) * (x1 - x0), y1 > y0 ? 1 : -1]);
    }
    hits.sort((a, b) => a[0] - b[0]);
    for (let col = 0; col < w * n; col++) {
      const sx = (col + 0.5) / n;
      let wind = 0;
      for (const [hx, dir] of hits) {
        if (hx > sx) break;
        wind += dir;
      }
      if (wind !== 0) cov[Math.floor(row / n) * w + Math.floor(col / n)] += 1 / (n * n);
    }
  }
  return cov;
}

/** A soft shadow under a coverage mask: box-blurred three times, `radius` px. */
export function blur(src: Float64Array, w: number, h: number, radius: number): Float64Array {
  let a = src;
  for (let pass = 0; pass < 3; pass++) {
    const b = new Float64Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let sum = 0;
        for (let k = -radius; k <= radius; k++) sum += a[y * w + Math.min(w - 1, Math.max(0, x + k))] as number;
        b[y * w + x] = sum / (2 * radius + 1);
      }
    const c = new Float64Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let sum = 0;
        for (let k = -radius; k <= radius; k++) sum += b[Math.min(h - 1, Math.max(0, y + k)) * w + x] as number;
        c[y * w + x] = sum / (2 * radius + 1);
      }
    a = c;
  }
  return a;
}

/** The cover's text shadow under `mask` (rgba(4,32,63,.5), 8 points of blur, 1 point down), then `mask` in white. */
function whiteWithShadow(p: Picture, layers: [Float64Array, number][]) {
  const both = (layers[0] as [Float64Array, number])[0].map((_, i) =>
    Math.min(
      1,
      layers.reduce((s, [m, a]) => s + (m[i] as number) * a, 0),
    ),
  );
  const shadow = blur(both, p.w, p.h, Math.round((8 * p.k) / 3));
  for (let yy = 0; yy < p.h; yy++)
    for (let xx = 0; xx < p.w; xx++) {
      const s = (shadow[Math.max(0, yy - p.k) * p.w + xx] as number) * 0.5;
      if (s > 0.002) p.blend(xx, yy, [4, 32, 63], s);
    }
  for (let i = 0; i < p.w * p.h; i++) {
    const x = i % p.w;
    const yy = Math.floor(i / p.w);
    for (const [m, a] of layers) p.blend(x, yy, WHITE, (m[i] as number) * a);
  }
}

/** Proa centered by its ink bounds, original baseline retained; size is the nominal font size. */
export function wordmark(p: Picture, cx: number, y: number, size: number) {
  const scale = (size * p.k) / 120;
  const dx = cx * p.k - ((WORDMARK.bb.x1 + WORDMARK.bb.x2) / 2) * scale;
  const main = coverage(edges(WORDMARK.d, scale, dx, y * p.k), p.w, p.h);
  whiteWithShadow(p, [[main, 1]]);
}

/** The DMG's historical entry point now draws the same complete Proa wordmark. */
export function dottedWordmark(p: Picture, cx: number, y: number, size: number) {
  wordmark(p, cx, y, size);
}
