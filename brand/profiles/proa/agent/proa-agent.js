/* ---------------------------------------------------------------------------------------------------------------
 * Proa: Timo, the agent's drawing (brand/profiles/proa/agent/proa-agent.js). brand/apply.ts appends this file to
 * packages/ui/src/agent/engine.js after the profile's patches move the upstream's drawing out of the way
 * (`function upstreamDrawAgent`, `const UPSTREAM_ACCESSORIES`, ...): the upstream's colors, poses, expressions and
 * helpers stay theirs, and what draws the agent is this. Same module: it reads `mixHex`, `gradientOf`, `contrastOf`,
 * `bodyFrame` and `eyeShapes` as they are. No imports; only the 2D context subset the phone records (engine.d.ts
 * `Ctx2D`: no gradient, no image, no global alpha); the upstream's exported names and signatures (engine.d.ts stays
 * theirs). brand/test/engine-exports.test.ts holds the list of exports and who draws each.
 * ------------------------------------------------------------------------------------------------------------- */

/**
 * A workspace's accent (ADR 0193) is its default agent color: while one is shown, `sky` (every agent with no color of
 * its own, and the sky art) resolves to the accent's [top, bottom], or back to Timo's mint with null. Set by the
 * apps' workspace shell, which also tells the canvases to repaint.
 */
export function setSkyColors(pair) {
  // The Proa theme's light agent2/agent pair is the default workspace accent.
  // Keep the mascot mint for that palette; an explicitly customized accent still wins.
  const defaultAccent = pair?.[0]?.toLowerCase() === "#2a8a7f" && pair?.[1]?.toLowerCase() === "#14635c";
  AGENT_GRADIENTS.sky = !pair || defaultAccent ? DEFAULT_SKY : pair;
}

/** Timo's default ink; drawAgent chooses cream on dark faces. */
export const EYE_COLOR = "#102E39";
export const BODY_RADIUS = 0.37;
export const BODY_CUT = 0;
export const EYE_X = [1 / 3, 2 / 3];
export const EYE_STYLES = {
  round: { w: 0.14, h: 0.14, cy: 0.51 },
  dots: { w: 0.1, h: 0.1, cy: 0.51 },
  wide: { w: 0.18, h: 0.18, cy: 0.51 },
  happy: { w: 0.17, h: 0.07, cy: 0.51, kind: "arc" },
  sleepy: { w: 0.15, h: 0.075, cy: 0.53, kind: "lid" },
};
export const WRITING_EYE = { w: 0.15, h: 0.04, cy: 0.53 };

/** Kept positive for consumers that divide a box into cells; Timo never dithers. */
export function ditherCells(_px) {
  return 32;
}

// The reference icon-flat.svg head, translated from viewBox 128 into the avatar box.
// One path feeds canvas, SVG and the point-in-shape compatibility API.
const HEAD = [
  ["M", 33, 52],
  ["Q", 32, 33, 64, 32],
  ["Q", 96, 33, 95, 52],
  ["L", 95, 70],
  ["Q", 95, 93, 64, 101],
  ["Q", 33, 93, 33, 70],
  ["Z"],
];
const ux = (x) => (x - 22) / 84;
const uy = (y) => (y - 22) / 84;
function head(ctx, s) {
  ctx.beginPath();
  for (const [op, ...v] of HEAD) {
    const p = v.map((n, i) => (i % 2 ? uy(n) : ux(n)) * s);
    if (op === "M") ctx.moveTo(...p);
    else if (op === "L") ctx.lineTo(...p);
    else if (op === "Q") ctx.quadraticCurveTo(...p);
    else ctx.closePath();
  }
}
export function bodyPath(x = 0, y = 0, s = 1) {
  return HEAD.map(
    ([op, ...v]) => op + v.map((n, i) => Number((i % 2 ? y + uy(n) * s : x + ux(n) * s).toFixed(4))).join(" "),
  ).join("");
}
const outline = [];
let last = [0, 0];
for (const [op, ...v] of HEAD) {
  if (op === "Q") {
    const start = last;
    for (let j = 1; j <= 32; j++) {
      const t = j / 32,
        a = 1 - t;
      outline.push([
        ux(a * a * start[0] + 2 * a * t * v[0] + t * t * v[2]),
        uy(a * a * start[1] + 2 * a * t * v[1] + t * t * v[3]),
      ]);
    }
    last = v.slice(2);
  } else if (op !== "Z") {
    last = v;
    outline.push([ux(v[0]), uy(v[1])]);
  }
}
export function inBody(u, v) {
  let inside = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const [xi, yi] = outline[i],
      [xj, yj] = outline[j];
    if (yi > v !== yj > v && u < ((xj - xi) * (v - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export function toneAt(x, y, n, turn) {
  return Math.max(
    0,
    Math.min(4, Math.round(4 * (0.95 - (0.7 * (y + 0.5)) / n - (0.18 * (x + 0.5)) / n - (turn?.[0] ?? 0) * 0.05))),
  );
}
export function bodySvg(color, n, deep = false) {
  const [top, bottom] = gradientOf(color);
  const hi = deep ? top : mixHex(top, "#ffffff", 0.12);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" preserveAspectRatio="none"><defs><linearGradient id="timo-body" x2=".8" y2="1"><stop stop-color="${hi}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs><path d="${bodyPath(0, 0, n)}" fill="url(#timo-body)"/></svg>`;
}

/** Draws the eyes on a 2D canvas for a body at (x, y), side `s`. */
export function drawEyes(ctx, x, y, s, shapes, color = EYE_COLOR) {
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(0.65, s * 0.027);
  for (const e of shapes) {
    const ex = x + e.x * s;
    const ey = y + e.y * s;
    const w = e.w * s;
    const h = e.h * s;
    const cx = ex + w / 2;
    const cy = ey + h / 2;
    const lw = ctx.lineWidth;
    ctx.beginPath();
    switch (e.kind) {
      case "arc":
        ctx.ellipse(cx, ey + h, Math.max(0.5, w / 2 - lw / 2), h, 0, Math.PI, 0);
        ctx.stroke();
        break;
      case "cup":
        ctx.ellipse(cx, ey, Math.max(0.5, w / 2 - lw / 2), h, 0, 0, Math.PI);
        ctx.stroke();
        break;
      case "lid":
        ctx.ellipse(cx, ey, w / 2, h, 0, 0, Math.PI);
        ctx.fill();
        break;
      case "spiral": {
        // @: one and a half turns from a small core, a thinner line so it stays open.
        const turns = 1.6;
        ctx.lineWidth = lw * 0.75;
        const r = Math.min(w, h) / 2 - lw / 2;
        for (let i = 0; i <= 48; i++) {
          const a = (i / 48) * turns * Math.PI * 2;
          const rr = r * (0.18 + 0.82 * (i / 48));
          const px = cx + Math.cos(a) * rr;
          const py = cy + Math.sin(a) * rr;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
        ctx.lineWidth = lw;
        break;
      }
      case "heart": {
        const t = ey + h * 0.3;
        ctx.moveTo(cx, ey + h);
        ctx.bezierCurveTo(ex - w * 0.1, ey + h * 0.55, ex, ey - h * 0.1, cx, t);
        ctx.bezierCurveTo(ex + w, ey - h * 0.1, ex + w * 1.1, ey + h * 0.55, cx, ey + h);
        ctx.fill();
        break;
      }
      case "star": {
        const r = Math.min(w, h) / 2;
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
          const rr = i % 2 ? r * 0.32 : r;
          const px = cx + Math.cos(a) * rr;
          const py = cy + Math.sin(a) * rr;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        break;
      }
      case "cross":
        ctx.moveTo(ex + lw / 2, ey + lw / 2);
        ctx.lineTo(ex + w - lw / 2, ey + h - lw / 2);
        ctx.moveTo(ex + w - lw / 2, ey + lw / 2);
        ctx.lineTo(ex + lw / 2, ey + h - lw / 2);
        ctx.stroke();
        break;
      case "ring":
        ctx.ellipse(cx, cy, Math.max(0.5, w / 2 - lw / 2), Math.max(0.5, h / 2 - lw / 2), 0, 0, Math.PI * 2);
        ctx.stroke();
        break;
      case "slant": {
        // A pill with its top cut down toward the middle (brows pulled in).
        const inner = e.side === 0 ? ex + w : ex;
        const outer = e.side === 0 ? ex : ex + w;
        ctx.moveTo(outer, ey);
        ctx.lineTo(inner, ey + h * 0.38);
        ctx.lineTo(inner, ey + h - w / 2);
        ctx.quadraticCurveTo(inner, ey + h, cx, ey + h);
        ctx.quadraticCurveTo(outer, ey + h, outer, ey + h - w / 2);
        ctx.closePath();
        ctx.fill();
        break;
      }
      default:
        ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        if (s >= 28 && h >= w * 0.7) {
          sheen(ctx, cx - w * 0.17, cy - h * 0.21, w * 0.22, h * 0.22, 0.055);
          disc(ctx, cx - w * 0.17, cy - h * 0.21, w * 0.12, h * 0.12, "#ffffff");
          disc(ctx, cx + w * 0.17, cy + h * 0.21, w * 0.055, h * 0.055, "rgba(255,255,255,0.35)");
          ctx.fillStyle = color;
        }
    }
  }
}

const NAVY = "#183A55",
  CREAM = "#FFF1D9",
  CORAL = "#FA7C66",
  GOLD = "#FFD477";
function disc(ctx, x, y, rx, ry, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}
function path(ctx, commands, color, stroke = false, width = 0.025) {
  ctx.beginPath();
  for (const [op, ...v] of commands) {
    if (op === "M") ctx.moveTo(...v);
    else if (op === "L") ctx.lineTo(...v);
    else if (op === "Q") ctx.quadraticCurveTo(...v);
    else if (op === "C") ctx.bezierCurveTo(...v);
    else ctx.closePath();
  }
  if (stroke) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
  } else {
    ctx.fillStyle = color;
    ctx.fill();
  }
}
// Concentric opaque ellipses approximate a radial gradient on Canvas and the mobile recorder alike.
function radial(ctx, cx, cy, rx, ry, outside, inside, steps = 40) {
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1),
      r = 1 - t * 0.98;
    disc(ctx, cx, cy, rx * r, ry * r, mixHex(outside, inside, t * t * (3 - 2 * t)));
  }
}
function sheen(ctx, x, y, rx, ry, strength = 0.045) {
  for (let i = 0; i < 8; i++) {
    const r = 1 - i / 9;
    disc(ctx, x, y, rx * r, ry * r, `rgba(255,255,255,${strength})`);
  }
}
// Same cap contours as icon-flat.svg; all headwear replacements cover this envelope.
const CAP = [
  ["M", 0.107, 0.244],
  ["Q", 0, 0.116, 0.226, 0.081],
  ["Q", 0.464, -0.081, 0.714, 0.081],
  ["Q", 0.988, 0.081, 0.905, 0.244],
  ["Z"],
];
function cap(ctx, color = CREAM, tilt = 0, volume = true) {
  ctx.save();
  const tilted = (commands) =>
    commands.map(([op, ...values]) => [op, ...values.map((v, i) => (i % 2 ? v + tilt * (values[i - 1] - 0.5) : v))]);
  path(
    ctx,
    tilted([["M", 0.12, 0.23], ["Q", 0.5, 0.19, 0.88, 0.23], ["L", 0.88, 0.35], ["Q", 0.5, 0.3, 0.12, 0.35], ["Z"]]),
    NAVY,
  );
  if (volume) {
    ctx.save();
    ctx.clip();
    radial(ctx, 0.35, 0.22, 0.7, 0.24, mixHex(NAVY, "#000000", 0.28), mixHex(NAVY, "#ffffff", 0.22), 24);
    ctx.restore();
  }
  path(ctx, tilted(CAP), volume ? mixHex(color, "#6c5644", 0.23) : color);
  if (volume) {
    ctx.save();
    ctx.clip();
    radial(ctx, 0.36, 0.03, 0.72, 0.38, mixHex(color, "#6c5644", 0.23), mixHex(color, "#ffffff", 0.42));
    sheen(ctx, 0.31, 0.055, 0.22, 0.045, 0.035);
    ctx.restore();
    path(
      ctx,
      tilted([
        ["M", 0.12, 0.239],
        ["Q", 0.5, 0.215, 0.89, 0.239],
      ]),
      "rgba(16,46,57,0.22)",
      true,
      0.018,
    );
  }
  ctx.restore();
}
function scarf(ctx, big = false) {
  const k = big ? 1.25 : 1;
  ctx.save();
  ctx.translate(0.5, 0.93);
  ctx.scale(k, k);
  path(
    ctx,
    [["M", -0.2, -0.05], ["Q", 0, 0.03, 0.2, -0.05], ["L", 0.2, 0.05], ["Q", 0, 0.1, -0.2, 0.05], ["Z"]],
    CORAL,
  );
  path(
    ctx,
    [
      ["M", 0, 0.02],
      ["Q", -0.18, 0.02, -0.2, 0.15],
      ["Q", -0.02, 0.13, 0, 0.05],
      ["Q", 0.18, 0.17, 0.2, 0.15],
      ["Q", 0.18, 0.02, 0, 0.02],
    ],
    CORAL,
  );
  disc(ctx, 0, 0.04, 0.048, 0.05, "#f98b75");
  ctx.restore();
}
/** Smooth vector portrait. Fine shading uses clipped solid strips supported by the mobile recorder. */
export function drawAgent(ctx, x, y, s, opts = {}) {
  if (s <= 0 || (opts.progress ?? 1) <= 0) return;
  const pose = opts.pose ?? {},
    frame = bodyFrame(pose),
    progress = Math.max(0, Math.min(1, opts.progress ?? 1));
  const [top, bottom] = gradientOf(opts.color);
  ctx.save();
  ctx.translate(x + s / 2, y + s);
  ctx.scale(frame.sx, frame.sy);
  ctx.translate(-s / 2, -s);
  if (progress < 1) {
    ctx.beginPath();
    ctx.roundRect(-s * 0.1, s * (1 - progress), s * 1.2, s * progress * 1.2, 0);
    ctx.clip();
  }
  const volume = s >= 28;
  ctx.save();
  ctx.scale(s, s);
  if (volume) {
    for (let i = 0; i < 8; i++) {
      const r = 1 - i / 10;
      disc(ctx, 0.5, 1.13, 0.24 * r, 0.045 * r, "rgba(16,46,57,0.025)");
    }
  }
  for (const [ex, k] of [
    [0.095, 0.65],
    [0.905, 0.75],
  ]) {
    const ear = mixHex(top, bottom, k);
    disc(ctx, ex, 0.525, 0.095, 0.115, volume ? mixHex(ear, "#102E39", 0.2) : ear);
    if (volume) {
      ctx.save();
      ctx.clip();
      radial(ctx, ex - 0.02, 0.49, 0.12, 0.15, mixHex(ear, "#102E39", 0.2), mixHex(ear, "#ffffff", 0.2), 12);
      ctx.restore();
    }
  }
  ctx.restore();
  ctx.save();
  head(ctx, s);
  ctx.fillStyle = volume ? mixHex(bottom, "#102E39", 0.18) : bottom;
  ctx.fill();
  ctx.clip();
  if (volume) {
    ctx.scale(s, s);
    radial(ctx, 0.31, 0.34, 0.87, 0.83, mixHex(bottom, "#102E39", 0.18), mixHex(top, "#ffffff", 0.27), 56);
    sheen(ctx, 0.25, 0.37, 0.075, 0.11, 0.035);
    // A restrained reflected edge on the shaded side of the vinyl head.
    head(ctx, 1);
    ctx.strokeStyle = "rgba(255,255,255,0.17)";
    ctx.lineWidth = 0.016;
    ctx.stroke();
  }
  ctx.restore();
  ctx.save();
  ctx.scale(s, s);
  scarf(ctx);
  ctx.restore();
  if (opts.withEyes !== false && progress > 0.92) {
    const face = mixHex(top, bottom, 0.51);
    const ink = contrastOf(EYE_COLOR, face) >= contrastOf(CREAM, face) ? EYE_COLOR : CREAM;
    drawEyes(ctx, 0, 0, s, eyeShapes(opts.eyes, pose), ink);
    if (s >= 28) {
      ctx.save();
      ctx.scale(s, s);
      path(
        ctx,
        [
          ["M", 0.445, 0.685],
          ["Q", 0.53, 0.735, 0.595, 0.65],
        ],
        ink,
        true,
        0.032,
      );
      ctx.restore();
    }
  }
  ctx.save();
  ctx.scale(s, s);
  cap(ctx, CREAM, 0, volume);
  ctx.restore();
  if (opts.after && progress > 0.92) opts.after(ctx, s, frame);
  ctx.restore();
}

/**
 * A small pixel agent for the skies: n×n rows of "X" (body), "o" (eye) and
 * "." (empty), from the same shape and eyes (n = 9 gives the classic sprite).
 */
export function spriteGrid(n = 9, style = "round") {
  const eyes = eyeShapes(style);
  const rows = [];
  for (let y = 0; y < n; y++) {
    let row = "";
    for (let x = 0; x < n; x++) {
      const u = (x + 0.5) / n;
      const v = (y + 0.5) / n;
      if (v < 0.24 && u > 0.12 && u < 0.88) row += "o";
      else if (!inBody(u, v)) row += ".";
      else row += eyes.some((e) => u >= e.x && u <= e.x + e.w && v >= e.y && v <= e.y + e.h) ? "o" : "X";
    }
    rows.push(row);
  }
  return rows;
}

/** Legacy grid metadata remains valid for older icon consumers; live artwork uses curves below. */
export const ACCESSORY_PALETTE = {
  K: NAVY,
  k: NAVY,
  W: CREAM,
  R: CORAL,
  r: CORAL,
  Y: GOLD,
  y: GOLD,
  P: CORAL,
  p: CORAL,
  B: NAVY,
  G: NAVY,
  g: NAVY,
  N: CORAL,
  n: CORAL,
  V: "#ae8cf7",
  F: CREAM,
  f: CREAM,
  O: GOLD,
  M: NAVY,
  L: "#14635C",
};

export const ACCESSORIES = {
  hat: { ox: 2, oy: 0, rows: ["    KKKK    ", " KKKKYYKKKK ", "KKKKKKKKKKKK"] },
  cap: { ox: 2, oy: 0, rows: ["   WWWWWW   ", "WWWWWWWWWWWW", " KKKKKKKKKK "] },
  headphones: { ox: 0, oy: 0, rows: ["  KKKKKKKKKKKK  ", " KK          KK ", "KK            KK"] },
  bow: { ox: 10, oy: 1, rows: ["RR RR", " RRR ", "RR RR"] },
  crown: { ox: 4, oy: -2, rows: ["Y  YY  Y", "YY YY YY", "YYYYYYYY"] },
  antenna: { ox: 3, oy: 6, rows: [" KKK  KKK ", "K   KK   K", "K   KK   K", " KKK  KKK "] },
  headset: { ox: 0, oy: 5, rows: ["KK", "KK", "KK", " KKKK"] },
  beanie: { ox: 2, oy: 0, rows: ["   KKKKKK   ", " KKKKKKKKKK ", "KKKKKKKKKKKK"] },
  party: { ox: 5, oy: -3, rows: ["  Y  ", " VVV ", "VVVVV", "YYYYY"] },
  flower: { ox: 11, oy: 1, rows: [" W ", "WYW", " W "] },
  scarf: { ox: 4, oy: 14, rows: ["RRRRRRRR", "  RRRR  ", " RR  RR "] },
};
export const ACCESSORY_NAMES = ["none", ...Object.keys(ACCESSORIES)];

export function drawAccessory(ctx, s, name, frame, _t = 0, _active = false) {
  if (!ACCESSORIES[name]) return;
  ctx.save();
  ctx.translate((frame?.head?.[0] ?? 0) * s, (frame?.head?.[1] ?? 0) * s);
  ctx.scale(s, s);
  if (name === "hat" || name === "beanie") {
    cap(ctx, NAVY, 0, s >= 28);
    if (name === "hat") {
      path(ctx, [["M", 0.2, 0.31], ["Q", 0.5, 0.44, 0.8, 0.31], ["Z"]], NAVY);
      if (s >= 28) {
        path(
          ctx,
          [["M", 0.52, 0.055], ["Q", 0.4, 0.1, 0.43, 0.19], ["L", 0.59, 0.19], ["Q", 0.53, 0.13, 0.52, 0.055], ["Z"]],
          GOLD,
        );
        path(
          ctx,
          [
            ["M", 0.42, 0.225],
            ["L", 0.6, 0.225],
          ],
          GOLD,
          true,
          0.018,
        );
      }
    } else if (s >= 28)
      for (let i = 0; i < 7; i++)
        path(
          ctx,
          [
            ["M", 0.23 + i * 0.09, 0.14],
            ["L", 0.23 + i * 0.09, 0.23],
          ],
          "#31546b",
          true,
          0.012,
        );
  } else if (name === "cap") cap(ctx, CREAM, -0.07, s >= 28);
  else if (name === "headphones" || name === "headset") {
    path(
      ctx,
      [
        ["M", 0.07, 0.55],
        ["L", 0.07, 0.28],
        ["Q", 0.12, -0.035, 0.5, -0.035],
        ["Q", 0.88, -0.035, 0.93, 0.28],
        ["L", 0.93, 0.55],
      ],
      NAVY,
      true,
      0.045,
    );
    disc(ctx, 0.075, 0.54, 0.065, 0.13, NAVY);
    if (name === "headphones") disc(ctx, 0.925, 0.54, 0.065, 0.13, NAVY);
    else {
      path(
        ctx,
        [
          ["M", 0.08, 0.61],
          ["Q", 0.12, 0.76, 0.4, 0.73],
        ],
        NAVY,
        true,
        0.026,
      );
      disc(ctx, 0.4, 0.73, 0.055, 0.035, NAVY);
    }
  } else if (name === "antenna") {
    for (const x of EYE_X) {
      ctx.beginPath();
      ctx.ellipse(x, 0.51, 0.125, 0.13, 0, 0, Math.PI * 2);
      ctx.strokeStyle = NAVY;
      ctx.lineWidth = 0.024;
      ctx.stroke();
    }
    path(
      ctx,
      [
        ["M", 0.46, 0.5],
        ["Q", 0.5, 0.47, 0.54, 0.5],
      ],
      NAVY,
      true,
      0.025,
    );
  } else if (name === "bow") {
    path(
      ctx,
      [
        ["M", 0.73, 0.16],
        ["Q", 0.57, -0.01, 0.61, 0.2],
        ["Q", 0.61, 0.28, 0.73, 0.16],
        ["Q", 0.9, 0.02, 0.85, 0.23],
        ["Q", 0.8, 0.28, 0.73, 0.16],
      ],
      CORAL,
    );
    disc(ctx, 0.73, 0.16, 0.04, 0.04, CORAL);
  } else if (name === "crown") {
    path(
      ctx,
      [
        ["M", 0.29, 0.15],
        ["L", 0.25, -0.09],
        ["L", 0.41, 0.025],
        ["L", 0.5, -0.13],
        ["L", 0.59, 0.025],
        ["L", 0.75, -0.09],
        ["L", 0.71, 0.15],
        ["Z"],
      ],
      GOLD,
    );
  } else if (name === "party") {
    path(ctx, [["M", 0.27, 0.22], ["L", 0.52, -0.31], ["L", 0.76, 0.22], ["Z"]], "#ae8cf7");
    path(
      ctx,
      [
        ["M", 0.35, 0.05],
        ["L", 0.67, 0.05],
      ],
      GOLD,
      true,
      0.055,
    );
    disc(ctx, 0.52, -0.3, 0.045, 0.045, GOLD);
  } else if (name === "flower") {
    for (let i = 0; i < 5; i++) {
      const a = (i * Math.PI * 2) / 5;
      disc(ctx, 0.77 + Math.cos(a) * 0.055, 0.24 + Math.sin(a) * 0.055, 0.045, 0.045, CREAM);
    }
    disc(ctx, 0.77, 0.24, 0.033, 0.033, GOLD);
  } else if (name === "scarf") scarf(ctx, true);
  ctx.restore();
}

export function drawSleep(ctx, s, frame, color, t) {
  ctx.save();
  ctx.translate((frame?.head?.[0] ?? 0) * s, (frame?.head?.[1] ?? 0) * s);
  ctx.scale(s / 16, s / 16);
  const rising = t !== undefined && Math.floor(t / 0.8) % 3 === 0;
  SLEEP_SPOTS.forEach(([x, y], i) => {
    if (!rising || i === 0)
      path(
        ctx,
        [
          ["M", x, y],
          ["L", x + 2, y],
          ["L", x, y + 2.5],
          ["L", x + 2, y + 2.5],
        ],
        color,
        true,
        0.48,
      );
  });
  ctx.restore();
}
