/**
 * The app icons a person can pick (ADR 0179), drawn from the agent engine: the same body, dither and eyes as the
 * avatar and the logo. Each icon is a 1024 scene on a grid of 32 cells (one dither cell of the agent = one cell of
 * its sky), in light and dark, plus its favicon drawn pixel by pixel at 16 and 32 px (a 1024 drawing scaled down
 * blurs there). Layers: `mask`/`color` (see raster.mjs), `bg` for what Android puts on the icon's back layer, and
 * `part` ("agent", "eyes", "moon", "accessory") for the one-color icon.
 *
 * Besides those, the icons a person makes on their phone (`madeScene`): a sky, a color and either a face or an
 * accessory, every combination drawn when the phone app is built.
 */
import {
  ACCESSORIES,
  AGENT_GRADIENTS,
  bodyTones,
  drawAccessory,
  drawAgent,
  EYE_STYLES,
  EYE_X,
  eyeShapes,
  inBody,
  toneAt,
} from "../../src/agent/engine.js";

/** The ids, in the order the pickers show them; the first is the icon the apps ship with. */
export const APP_ICON_IDS = ["night", "moon", "sky", "peekNight", "peekSky"];
/** The icon the phone ships with (packages/client's `PHONE_APP_ICON`); the web and desktop ship the first. */
export const PHONE_APP_ICON_ID = "peekNight";

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const by = (x, y) => BAYER[(x & 3) + (y & 3) * 4];
const pick = (list, i) => list[Math.max(0, Math.min(list.length - 1, i))];

const SKY_T = bodyTones("sky");
/** The sky's small agents are navy (`spriteBody`); this is that navy in five tones, deep to light. */
const NAVY_T = SKY_T; // Legacy scene name; every default icon now wears Timo's mint.
const NIGHT = ["#03101f", "#061a31", "#0a2645", "#0f345c"];
const DAY = ["#4693e8", "#8cc3ff", "#c6e1ff", "#e8f2ff"];
const NAVY_TILE = "#06192f";
const SPRITE_NAVY = "#06264a";
const BLACK_NIGHT = "#03070d";
const WHITE = "#ffffff";

/* ---------- Layers in the 1024 scene ---------- */

const always = () => true;
const fill = (hex) => ({ bg: true, mask: always, color: () => hex });
function grid(cols, colorAt) {
  const c = 1024 / cols;
  return { bg: true, mask: always, color: (x, y) => colorAt(Math.floor(x / c), Math.floor(y / c), cols) };
}
function cells(cols, list, extra = {}) {
  const c = 1024 / cols;
  const at = new Map(list.map(([i, j, col]) => [i * 4096 + j, col]));
  const color = (x, y) => at.get(Math.floor(x / c) * 4096 + Math.floor(y / c));
  return { bg: true, mask: (x, y) => color(x, y) !== undefined, color, ...extra };
}
/** Pixel art from rows of "X". */
function shape(cols, rows, ox, oy, col) {
  const list = [];
  for (const [j, row] of rows.entries())
    for (const [i, ch] of [...row].entries()) if (ch === "X") list.push([ox + i, oy + j, col]);
  return cells(cols, list);
}
/** A crescent: the cells inside one circle and outside another (in cells). */
function moon(cols, [cx, cy, r], [cx2, cy2, r2], col) {
  const list = [];
  for (let j = 0; j < cols; j++)
    for (let i = 0; i < cols; i++) {
      const x = i + 0.5;
      const y = j + 0.5;
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r && (x - cx2) ** 2 + (y - cy2) ** 2 > r2 * r2) list.push([i, j, col]);
    }
  return cells(cols, list, { bg: false, part: "moon" });
}
export function inRound(x, y, x0, y0, w, h, r) {
  if (x < x0 || y < y0 || x > x0 + w || y > y0 + h) return false;
  const cx = Math.min(Math.max(x, x0 + r), x0 + w - r);
  const cy = Math.min(Math.max(y, y0 + r), y0 + h - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}
/** A line of `width` through `points`, its ends and corners round (the canvas's round caps and joins). */
function stroke(points, width) {
  const r = width / 2;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const box = [Math.min(...xs) - r, Math.min(...ys) - r, Math.max(...xs) + r, Math.max(...ys) + r];
  return (X, Y) => {
    if (X < box[0] || Y < box[1] || X > box[2] || Y > box[3]) return false;
    for (let i = 1; i < points.length; i++) {
      const [ax, ay] = points[i - 1];
      const [bx, by_] = points[i];
      const dx = bx - ax;
      const dy = by_ - ay;
      const len = dx * dx + dy * dy;
      const k = len ? Math.max(0, Math.min(1, ((X - ax) * dx + (Y - ay) * dy) / len)) : 0;
      if ((X - ax - k * dx) ** 2 + (Y - ay - k * dy) ** 2 <= r * r) return true;
    }
    return false;
  };
}
/** The inside of a closed outline. */
function polygon(points) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  return (X, Y) => {
    if (X < box[0] || Y < box[1] || X > box[2] || Y > box[3]) return false;
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const [xi, yi] = points[i];
      const [xj, yj] = points[j];
      if (yi > Y !== yj > Y && X < ((xj - xi) * (Y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
}
const CURVE = 24;
/** Points along an ellipse's arc, from angle `a0` to `a1` (y down, as a canvas). */
const arc = (cx, cy, rx, ry, a0, a1) =>
  Array.from({ length: CURVE + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / CURVE;
    return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry];
  });
const cubic = ([x0, y0], [x1, y1], [x2, y2], [x3, y3]) =>
  Array.from({ length: CURVE + 1 }, (_, i) => {
    const t = i / CURVE;
    const u = 1 - t;
    return [
      u ** 3 * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t ** 3 * x3,
      u ** 3 * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t ** 3 * y3,
    ];
  });
const quad = ([x0, y0], [x1, y1], [x2, y2]) =>
  Array.from({ length: CURVE + 1 }, (_, i) => {
    const t = i / CURVE;
    const u = 1 - t;
    return [u * u * x0 + 2 * u * t * x1 + t * t * x2, u * u * y0 + 2 * u * t * y1 + t * t * y2];
  });
/**
 * One eye's shape, as the engine's `drawEyes` draws each kind on a canvas: `e` is its box in the scene's units and
 * `s` the body's side (the line's width follows it).
 */
function turned(layer, { deg, about: [ax, ay] }) {
  const cos = Math.cos((deg * Math.PI) / 180);
  const sin = Math.sin((deg * Math.PI) / 180);
  const back = (f) => (X, Y) => f(ax + (X - ax) * cos + (Y - ay) * sin, ay - (X - ax) * sin + (Y - ay) * cos);
  return { ...layer, mask: back(layer.mask), color: back(layer.color) };
}
/**
 * The agent: its body (the engine's shape, dithered in `tones` or one `solid` color) and its white eyes, both leaning
 * with `turn`.
 */
function agent({ x, y, s, tones, solid, style = "round", pose = {}, turn, accessory: wear }) {
  const layers = canvasLayers((ctx) =>
    drawAgent(ctx, x, y, s, {
      color: solid ? [solid, solid] : [tones[3], tones[1]],
      eyes: style,
      pose,
      after: wear ? (ctx, side, frame) => drawAccessory(ctx, side, wear, frame) : undefined,
    }),
  );
  const eyes = eyeShapes(style, pose);
  for (const l of layers)
    if (
      ["#102E39", "#FFF1D9"].includes(l.color(0, 0)) &&
      eyes.some((e) => l.mask(x + (e.x + e.w / 2) * s, y + (e.y + e.h / 2) * s))
    )
      l.part = "eyes";
  return turn ? layers.map((l) => turned(l, turn)) : layers;
}

function nightAt(halo) {
  return (i, j, cols) => {
    const u = (i + 0.5) / cols;
    const v = (j + 0.5) / cols;
    let val = 0.18 + 0.28 * v;
    if (halo) val += 2.4 * Math.max(0, 1 - Math.hypot(u - 0.5, v - 0.47) / 0.6) ** 1.6;
    return pick(NIGHT, Math.floor(val + by(i, j)));
  };
}
const dayAt = (i, j, cols) => pick(DAY, Math.floor(((j + 0.5) / cols) * 2.7 + by(i, j)));

/** The agent on the 32-cell grid: cells 7..24 × 6..23, one dither cell = one cell of the sky. */
const AG = { x: 224, y: 192, s: 576, n: 18 };
/** Smaller and to the left, so the moon fits: cells 6..22 × 8..24. */
const AG_MOON = { x: 192, y: 256, s: 544, n: 17 };
/**
 * Big, leaning in from the bottom right corner and looking up: 30 cells a side, turned around the middle of its eyes,
 * so its cells lean with it and no longer sit on the sky's.
 */
const PEEK = { x: 170, y: 202, s: 960, n: 30, pose: { look: [-0.035, -0.045] }, turn: { deg: -18, about: [650, 600] } };
const LOOK_UP_RIGHT = { look: [0.035, -0.05] };

const STARS = [
  [4, 4, "#c6e1ff"],
  [27, 5, "#8cc3ff"],
  [16, 2, "#4693e8"],
  [3, 18, "#4693e8"],
  [28, 25, "#c6e1ff"],
  [9, 28, "#8cc3ff"],
  [22, 28, "#4693e8"],
];
const STARS_MOON = [
  [4, 4, "#c6e1ff"],
  [11, 3, "#8cc3ff"],
  [16, 5, "#4693e8"],
  [3, 14, "#4693e8"],
  [28, 17, "#8cc3ff"],
  [27, 26, "#c6e1ff"],
  [4, 27, "#8cc3ff"],
  [26, 12, "#4693e8"],
];
/** The stars around the leaning agent: over it and down its left side. */
const STARS_PEEK = [
  [4, 3, "#c6e1ff"],
  [24, 1, "#8cc3ff"],
  [16, 2, "#4693e8"],
  [9, 6, "#4693e8"],
  [2, 15, "#c6e1ff"],
  [4, 25, "#8cc3ff"],
];
const CLOUD_A = ["..XX...", ".XXXXX.", "XXXXXXX"];
const CLOUD_B = [".XXX.", "XXXXX"];
/** What is behind the leaning agent: the night's stars or the day's clouds, clear of it. */
const PEEK_BACK = {
  night: () => [grid(32, nightAt(false)), cells(32, STARS_PEEK)],
  sky: () => [grid(32, dayAt), shape(32, CLOUD_A, 3, 2, WHITE), shape(32, CLOUD_B, 17, 1, WHITE)],
};
const MOON = [
  [25, 5.2, 3.3],
  [26.6, 4.2, 2.7],
];

/* ---------- Favicons, in pixels ---------- */

const tile = (N, r, color) => ({
  mask: (x, y) => inRound(x, y, 0, 0, N, N, r),
  color: typeof color === "function" ? color : () => color,
});
const body = (bx, by_, bs, color) => ({
  mask: (x, y) => inBody((x - bx) / bs, (y - by_) / bs),
  color: typeof color === "function" ? color : () => color,
});
const clipped = (N, r, layer) => ({ ...layer, mask: (x, y) => inRound(x, y, 0, 0, N, N, r) && layer.mask(x, y) });
/** The body dithered in cells of `cell` pixels. */
const dith = (bx, by_, bs, cell, tones) => (x, y) =>
  tones[toneAt(Math.floor((x - bx) / cell), Math.floor((y - by_) / cell), bs / cell)];
/** The body in three flat bands, light to deep (at 16 px a dither is noise). */
function bands(bx, by_, bs, tones) {
  const set = [tones[1], tones[2], tones[3]];
  return (x, y) => {
    const u = (x - bx) / bs;
    const v = (y - by_) / bs;
    return pick(set, Math.floor((0.92 - 0.75 * v - 0.12 * u) * set.length));
  };
}
/** Eyes on whole pixels and mirrored around the body's middle, so both are the same. */
function snapEyes(bx, by_, bs, { style = "round", look = [0, 0] } = {}) {
  const base = EYE_STYLES[style];
  const W = Math.max(1, Math.round(base.w * bs));
  const H = Math.max(2, Math.round(base.h * bs));
  const xL = Math.round(bx + EYE_X[0] * bs - W / 2);
  const xR = Math.round(2 * bx + bs - xL - W);
  const y = Math.round(by_ + base.cy * bs - H / 2);
  const dx = Math.round(look[0] * bs);
  const dy = Math.round(look[1] * bs);
  const rects = [
    [xL + dx, y + dy],
    [xR + dx, y + dy],
  ];
  return {
    mask: (px, py) => rects.some(([ex, ey]) => px >= ex && px < ex + W && py >= ey && py < ey + H),
    color: () => WHITE,
  };
}
const pixels = (list, color) => ({
  mask: (x, y) => list.some(([i, j]) => Math.floor(x) === i && Math.floor(y) === j),
  color: () => color,
});
const crescent = ([cx, cy, r], [cx2, cy2, r2], color) => ({
  mask: (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r && (x - cx2) ** 2 + (y - cy2) ** 2 > r2 * r2,
  color: () => color,
});
/** The day sky at 32 px: dithered in 2-pixel cells. */
const skyTile32 = (x, y) => pick(DAY, Math.floor(((Math.floor(y) + 0.5) / 32) * 2.2 + by(x >> 1, y >> 1)));

/* ---------- The icons ---------- */

export const SCENES = {
  /** Noite: the night sky, a glow in dither around the agent (the landing's giant), loose stars. */
  night: {
    light: () => [grid(32, nightAt(true)), cells(32, STARS), ...agent({ ...AG, tones: SKY_T })],
    dark: () => [fill(BLACK_NIGHT), cells(32, STARS), ...agent({ ...AG, tones: SKY_T })],
    favicon: (N) =>
      N === 32
        ? [tile(32, 7, NAVY_TILE), body(5, 5, 22, dith(5, 5, 22, 2, SKY_T)), snapEyes(5, 5, 22)]
        : [tile(16, 3.5, NAVY_TILE), body(2, 2, 12, bands(2, 2, 12, SKY_T)), snapEyes(2, 2, 12, { style: "wide" })],
  },
  /** Lua: a pixel moon in the corner and the agent looking up at it. */
  moon: {
    light: () => [
      grid(32, nightAt(false)),
      cells(32, STARS_MOON),
      moon(32, MOON[0], MOON[1], "#e8f2ff"),
      ...agent({ ...AG_MOON, tones: SKY_T, pose: LOOK_UP_RIGHT }),
    ],
    dark: () => [
      fill(BLACK_NIGHT),
      cells(32, STARS_MOON),
      moon(32, MOON[0], MOON[1], "#c6e1ff"),
      ...agent({ ...AG_MOON, tones: SKY_T, pose: LOOK_UP_RIGHT }),
    ],
    favicon: (N) =>
      N === 32
        ? [
            tile(32, 7, NAVY_TILE),
            crescent([26.5, 5.5, 3.6], [28, 4.3, 3], "#e8f2ff"),
            body(3, 7, 22, dith(3, 7, 22, 2, SKY_T)),
            snapEyes(3, 7, 22, LOOK_UP_RIGHT),
          ]
        : [
            tile(16, 3.5, NAVY_TILE),
            pixels(
              [
                [12, 1],
                [13, 1],
                [12, 2],
                [13, 2],
              ],
              "#e8f2ff",
            ),
            body(2, 3, 12, bands(2, 3, 12, SKY_T)),
            snapEyes(2, 3, 12, { style: "wide", ...LOOK_UP_RIGHT }),
          ],
  },
  /** Céu: the landing's sky by day, two pixel clouds and the navy agent of the sky's sprites; at night, the night. */
  sky: {
    light: () => [
      grid(32, dayAt),
      shape(32, CLOUD_A, 3, 2, WHITE),
      shape(32, CLOUD_B, 26, 12, WHITE),
      ...agent({ ...AG, tones: NAVY_T }),
    ],
    dark: () => [grid(32, nightAt(false)), cells(32, STARS), ...agent({ ...AG, tones: SKY_T })],
    favicon: (N) =>
      N === 32
        ? [tile(32, 7, skyTile32), body(5, 6, 22, dith(5, 6, 22, 2, NAVY_T)), snapEyes(5, 6, 22)]
        : [tile(16, 3.5, "#8cc3ff"), body(2, 3, 12, SPRITE_NAVY), snapEyes(2, 3, 12, { style: "wide" })],
  },
  /** Espiando à noite: the agent big, coming up from the bottom edge and looking up, under the night's stars. */
  peekNight: {
    light: () => [...PEEK_BACK.night(), ...agent({ ...PEEK, tones: SKY_T })],
    dark: () => [fill(BLACK_NIGHT), cells(32, STARS_PEEK), ...agent({ ...PEEK, tones: SKY_T })],
    favicon: (N) =>
      N === 32
        ? [
            tile(32, 7, NAVY_TILE),
            clipped(32, 7, body(-2, 9, 36, dith(-2, 9, 36, 2, SKY_T))),
            snapEyes(-2, 9, 36, PEEK.pose),
          ]
        : [
            tile(16, 3.5, NAVY_TILE),
            clipped(16, 3.5, body(-1, 5, 18, bands(-1, 5, 18, SKY_T))),
            snapEyes(-1, 5, 18, PEEK.pose),
          ],
  },
  /** Espiando no céu: the same, in the day sky with clouds, the agent navy. */
  peekSky: {
    light: () => [...PEEK_BACK.sky(), ...agent({ ...PEEK, tones: NAVY_T })],
    dark: () => [...PEEK_BACK.night(), ...agent({ ...PEEK, tones: SKY_T })],
    favicon: (N) =>
      N === 32
        ? [
            tile(32, 7, skyTile32),
            clipped(32, 7, body(-2, 9, 36, dith(-2, 9, 36, 2, NAVY_T))),
            snapEyes(-2, 9, 36, PEEK.pose),
          ]
        : [tile(16, 3.5, "#8cc3ff"), clipped(16, 3.5, body(-1, 5, 18, SPRITE_NAVY)), snapEyes(-1, 5, 18, PEEK.pose)],
  },
};

/* ---------- The icons a person makes on their phone ---------- */

/** What a made icon is made of. The phone's plugin and the apps' list name the same (tests keep them equal). */
export const MADE_SKIES = ["night", "sky"];
export const MADE_COLORS = Object.keys(AGENT_GRADIENTS);
/** The eye styles, then the expressions that hold as a still picture. */
export const MADE_FACES = ["round", "dots", "wide", "happy", "sleepy", "wink", "heart", "star", "surprised", "angry"];
export const MADE_ACCESSORIES = Object.keys(ACCESSORIES);
/** A face or an accessory, never both: a build carries every combination, and both together would be 1,920 icons. */
export const MADE_LOOKS = [...MADE_FACES, ...MADE_ACCESSORIES];
/** Facing, as the shipped icon, or leaning in from the corner as the Peeking ones (a face only: nothing it wears fits). */
export const MADE_POSES = ["front", "peek"];
export const madeId = ({ sky, color, look, pose }) => `made-${sky}-${color}-${look}${pose === "peek" ? "-peek" : ""}`;
export const madeIcons = () =>
  MADE_POSES.flatMap((pose) =>
    MADE_SKIES.flatMap((sky) =>
      MADE_COLORS.flatMap((color) =>
        (pose === "peek" ? MADE_FACES : MADE_LOOKS).map((look) => ({ sky, color, look, pose })),
      ),
    ),
  );

/** Wearing something, the agent is smaller and lower so it fits: cells 8..23 × 13..28 (as the web draws it). */
const AG_WEARING = { x: 256, y: 416, s: 512, n: 16 };

/**
 * A made icon's 1024 scene: the Night's sky or the day's, and the agent in its color with its face or accessory,
 * or leaning in with its face as the Peeking icons' agent.
 */
export function madeScene({ sky, color, look, pose = "front" }) {
  const wears = Object.hasOwn(ACCESSORIES, look);
  const face = wears ? "round" : look;
  if (pose === "peek") {
    const leaning = EYE_STYLES[face] ? { style: face } : { pose: { ...PEEK.pose, expression: face } };
    return [...PEEK_BACK[sky](), ...agent({ ...PEEK, tones: bodyTones(color), ...leaning })];
  }
  const eyes = EYE_STYLES[face] ? { style: face } : { pose: { expression: face } };
  const at = wears ? AG_WEARING : AG;
  const back =
    sky === "night"
      ? [grid(32, nightAt(true)), cells(32, STARS)]
      : [grid(32, dayAt), shape(32, CLOUD_A, 3, 2, WHITE), shape(32, CLOUD_B, 26, 12, WHITE)];
  return [...back, ...agent({ ...at, tones: bodyTones(color), ...eyes, accessory: wears ? look : undefined })];
}

/* ---------- The same scene for each place ---------- */

/** Android's back layer: what is drawn behind the agent. */
export const backLayers = (layers) => layers.filter((l) => l.bg);
/** Android's front layer: the agent (and the moon), on nothing. */
export const frontLayers = (layers) => layers.filter((l) => !l.bg);
/** Android 13's one-color icon: the agent's shape (and the moon) with the eyes cut out. */
export const monoLayers = (layers) =>
  layers
    .filter((l) => l.part)
    .map((l) => (l.part === "eyes" ? { mask: l.mask, erase: true } : { mask: l.mask, color: () => WHITE }));

/** The scene cut to a rounded square (r in the scene's units): the browser's and Windows' icons. */
export const tiled = (layers, r = 225) =>
  layers.map((l) => ({ ...l, mask: (x, y) => inRound(x, y, 0, 0, 1024, 1024, r) && l.mask(x, y) }));

/** macOS's shape: a superellipse of 824 in the 1024 canvas (Apple's grid), with a soft shadow under it. */
const MAC = { at: 100, size: 824, n: 5 };
function squircleF(x, y, dy = 0) {
  const a = MAC.size / 2;
  const c = MAC.at + a;
  return (Math.abs((x - c) / a) ** MAC.n + Math.abs((y - c - dy) / a) ** MAC.n) ** (1 / MAC.n);
}
export function macLayers(layers) {
  const a = MAC.size / 2;
  const k = 1024 / MAC.size;
  const shadow = {
    mask: always,
    alpha: (x, y) => {
      const d = (squircleF(x, y, 10) - 1) * a;
      return d <= 0 ? 0.3 : 0.3 * Math.max(0, 1 - d / 26) ** 2;
    },
    color: () => "#000000",
  };
  const inside = (x, y) => squircleF(x, y) <= 1;
  const toScene = (f) => (x, y) => f((x - MAC.at) * k, (y - MAC.at) * k);
  return [
    shadow,
    ...layers.map((l) => ({
      ...l,
      mask: (x, y) => inside(x, y) && toScene(l.mask)(x, y),
      color: toScene(l.color),
      ...(l.alpha ? { alpha: toScene(l.alpha) } : {}),
    })),
  ];
}

/** Adapt the engine's recorder-safe canvas subset to the existing dependency-free icon rasterizer. */
export function canvasLayers(draw) {
  const layers = [];
  let m = [1, 1, 0, 0],
    clips = [],
    paths = [],
    current = [];
  const saved = [];
  let ellipseMask = null;
  const point = (x, y) => [x * m[0] + m[2], y * m[1] + m[3]];
  const bounds = (pts) => {
    const xs = pts.map((p) => p[0]),
      ys = pts.map((p) => p[1]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  };
  function maskOf(stroked = false, width = 1) {
    if (!stroked && ellipseMask && paths.length === 1) return ellipseMask;
    const tests = paths.map((pts) => (stroked ? stroke(pts, width) : polygon(pts)));
    const box = bounds(paths.flat()),
      half = stroked ? width / 2 : 0;
    return (x, y) =>
      x >= box[0] - half &&
      x <= box[2] + half &&
      y >= box[1] - half &&
      y <= box[3] + half &&
      tests.some((f) => f(x, y));
  }
  function layer(mask, color) {
    const cuts = [...clips];
    const rgba = /^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/.exec(color);
    const hex = rgba
      ? `#${rgba
          .slice(1, 4)
          .map((v) => Number(v).toString(16).padStart(2, "0"))
          .join("")}`
      : color;
    layers.push({
      part: "agent",
      mask: (x, y) => mask(x, y) && cuts.every((f) => f(x, y)),
      color: () => hex,
      ...(rgba ? { alpha: () => Number(rgba[4]) } : {}),
    });
  }
  const ctx = {
    fillStyle: "#000000",
    strokeStyle: "#000000",
    lineWidth: 1,
    lineCap: "round",
    lineJoin: "round",
    save() {
      saved.push([m, clips, this.fillStyle, this.strokeStyle, this.lineWidth]);
    },
    restore() {
      [m, clips, this.fillStyle, this.strokeStyle, this.lineWidth] = saved.pop();
    },
    translate(x, y) {
      m = [m[0], m[1], m[2] + x * m[0], m[3] + y * m[1]];
    },
    scale(x, y) {
      m = [m[0] * x, m[1] * y, m[2], m[3]];
    },
    beginPath() {
      ellipseMask = null;
      paths = [];
      current = [];
    },
    moveTo(x, y) {
      ellipseMask = null;
      current = [point(x, y)];
      paths.push(current);
    },
    lineTo(x, y) {
      ellipseMask = null;
      current.push(point(x, y));
    },
    closePath() {
      if (current.length) current.push(current[0]);
    },
    quadraticCurveTo(x1, y1, x, y) {
      const a = current.at(-1),
        b = point(x1, y1),
        c = point(x, y);
      current.push(...quad(a, b, c).slice(1));
    },
    bezierCurveTo(x1, y1, x2, y2, x, y) {
      const a = current.at(-1);
      current.push(...cubic(a, point(x1, y1), point(x2, y2), point(x, y)).slice(1));
    },
    ellipse(x, y, rx, ry, _rotation, start, end) {
      const span = end > start ? end - start : end - start + Math.PI * 2;
      current = arc(x, y, rx, ry, start, start + span).map(([a, b]) => point(a, b));
      paths.push(current);
      if (paths.length === 1 && Math.abs(span - Math.PI * 2) < 0.0001 && rx > 0 && ry > 0) {
        const [cx, cy] = point(x, y),
          ax = rx * m[0],
          ay = ry * m[1];
        ellipseMask = (X, Y) => ((X - cx) / ax) ** 2 + ((Y - cy) / ay) ** 2 <= 1;
      }
    },
    roundRect(x, y, w, h, r = 0) {
      const rr = Array.isArray(r) ? r : [r, r, r, r];
      current = [];
      for (const [cx, cy, rad, a] of [
        [x + w - rr[1], y + rr[1], rr[1], -Math.PI / 2],
        [x + w - rr[2], y + h - rr[2], rr[2], 0],
        [x + rr[3], y + h - rr[3], rr[3], Math.PI / 2],
        [x + rr[0], y + rr[0], rr[0], Math.PI],
      ])
        current.push(...arc(cx, cy, rad, rad, a, a + Math.PI / 2).map(([a, b]) => point(a, b)));
      paths.push(current);
    },
    fill() {
      layer(maskOf(), this.fillStyle);
    },
    stroke() {
      layer(maskOf(true, this.lineWidth * m[0]), this.strokeStyle);
    },
    clip() {
      // Radial shading shares a clip across many layers. Reuse the rasterizer's few pixel samples.
      const mask = maskOf();
      const samples = new Map();
      clips = [
        ...clips,
        (x, y) => {
          const key = `${x},${y}`;
          if (samples.has(key)) return samples.get(key);
          const inside = mask(x, y);
          if (samples.size >= 64) samples.clear();
          samples.set(key, inside);
          return inside;
        },
      ];
    },
    fillRect(x, y, w, h) {
      const [a, b] = point(x, y),
        [c, d] = point(x + w, y + h);
      layer((x, y) => x >= a && x <= c && y >= b && y <= d, this.fillStyle);
    },
  };
  draw(ctx);
  return layers;
}

// Tiny icons use the same smooth portrait, preserving the cap and circular eyes.
for (const [id, scene] of Object.entries(SCENES)) {
  scene.favicon = (N) => [
    tile(N, N * 0.22, id.includes("Sky") || id === "sky" ? "#8cc3ff" : NAVY_TILE),
    ...agent({ x: N * 0.12, y: N * 0.1, s: N * 0.76, tones: SKY_T }),
  ];
}
