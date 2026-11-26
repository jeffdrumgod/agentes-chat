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
/** Writing: round pupils low in the eyes, looking down at the logbook (not the upstream's dashes). */
export const WRITING_EYE = { w: 0.11, h: 0.11, cy: 0.57 };

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

const INK = "#102E39",
  WOOL = "#2E5573",
  OILSKIN = "#F2C14E",
  OILSKIN_BRIM = "#D9A23A",
  FLAG_BLUE = "#2C5FA8",
  SEA_MINT = "#7FD1BC";

/**
 * The approved sketches (propostas/avatares) are drawn in the 128 box of timo/icon-flat.svg; the body's box is its
 * 22..106 square. Inside the body's own space (0..1), `sketch` switches to those units for the parts drawn there.
 */
function sketch(ctx, draw) {
  ctx.save();
  ctx.scale(1 / 84, 1 / 84);
  ctx.translate(-22, -22);
  draw();
  ctx.restore();
}

/** The sail of the Proa emblem (sketch units, its own 0..52 box), filled and outlined in one color. */
function sail(ctx, x, y, k, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  path(ctx, [["M", 18, 44], ["Q", 24, 20, 42, 6], ["Q", 40, 26, 48, 44], ["Z"]], color);
  path(ctx, [["M", 18, 44], ["Q", 24, 20, 42, 6], ["Q", 40, 26, 48, 44], ["Z"]], color, true, 4);
  path(
    ctx,
    [
      ["M", 20, 51],
      ["L", 46, 51],
    ],
    color,
    true,
    5,
  );
  ctx.restore();
}

/** The knotted kerchief under the chin: coral, navy on a coral face; `big` is the scarf accessory. */
function kerchief(ctx, color, big = false) {
  ctx.save();
  if (big) {
    ctx.translate(64, 100);
    ctx.scale(1.4, 1.4);
    ctx.translate(-64, -100);
  }
  path(ctx, [["M", 48, 96], ["Q", 64, 102, 80, 96], ["L", 81, 108], ["L", 64, 103], ["L", 47, 108], ["Z"]], color);
  path(
    ctx,
    [
      ["M", 50, 98.5],
      ["Q", 64, 103, 78, 98.5],
    ],
    mixHex(color, "#ffffff", 0.25),
    true,
    1,
  );
  disc(ctx, 64, 100, 3.6, 3.6, mixHex(color, "#000000", 0.1));
  ctx.restore();
}

/** A hand (the waiting wave, the flag, the logbook): a disc in the face's ear tone with a soft edge. */
function hand(ctx, x, y, r, tone) {
  disc(ctx, x, y, r, r, tone);
  ctx.beginPath();
  ctx.ellipse(x, y, r, r, 0, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(16,46,57,0.28)";
  ctx.lineWidth = 1.1;
  ctx.stroke();
}

/**
 * The agent being drawn, read by its accessory and its sleep inside drawAgent's `after`: its colors, and its sailor
 * cap until whatever goes on the head says whether it stays. One item per head: a hat takes the cap's place
 * (`HATS`), the rest is worn with it.
 */
let drawing = null;
const HATS = new Set(["hat", "cap", "beanie", "crown"]);
function wearCap(ctx) {
  if (drawing?.ctx !== ctx || !drawing.cap) return;
  const put = drawing.cap;
  drawing.cap = null;
  put();
}
const tonesNow = () => drawing ?? { top: DEFAULT_SKY[0], bottom: DEFAULT_SKY[1], volume: true, detail: true };

/**
 * Timo, vector all the way (no dither), in the body's box: ears, head with soft volume (concentric ellipses: the
 * phone's recorder has no gradient), kerchief, eyes and smile, the sailor cap. Poses: `writing` looks down at the
 * logbook it writes in, `waiting` raises a hand, the expressions are the upstream's (eyeShapes).
 */
export function drawAgent(ctx, x, y, s, opts = {}) {
  if (s <= 0 || (opts.progress ?? 1) <= 0) return;
  const pose = opts.pose ?? {},
    frame = bodyFrame(pose),
    progress = Math.max(0, Math.min(1, opts.progress ?? 1));
  const [top, bottom] = gradientOf(opts.color);
  const volume = s >= 28;
  // Below this the logbook is only a pencil's tip: at a list's size the open book is a blur.
  const detail = s >= 40;
  const face = mixHex(top, bottom, 0.51);
  const ink = contrastOf(EYE_COLOR, face) >= contrastOf(CREAM, face) ? EYE_COLOR : CREAM;
  const earTone = mixHex(top, bottom, 0.7);
  // The kerchief is coral, navy on a coral face (the rose preset, or a custom color of that hue).
  const [hue, sat] = hexToHsv(face);
  const coralFace = Math.min(Math.abs(hue - 9), 360 - Math.abs(hue - 9)) < 28 && sat > 0.25;
  const scarfColor = opts.color === "rose" || coralFace ? NAVY : CORAL;
  const outer = drawing;
  drawing = { ctx, top, bottom, ink, earTone, scarfColor, volume, detail, cap: null };
  try {
    ctx.save();
    ctx.translate(x + s / 2, y + s);
    ctx.scale(frame.sx, frame.sy);
    ctx.translate(-s / 2, -s);
    if (progress < 1) {
      ctx.beginPath();
      ctx.roundRect(-s * 0.1, s * (1 - progress), s * 1.2, s * progress * 1.2, 0);
      ctx.clip();
    }
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
    // Waiting on someone: a hand up beside the head (behind it), waving.
    if (pose.waiting && progress > 0.92)
      sketch(ctx, () => {
        path(
          ctx,
          [
            ["M", 98, 96],
            ["Q", 110, 84, 109, 64],
          ],
          mixHex(bottom, INK, 0.12),
          true,
          6,
        );
        hand(ctx, 109, 58, 6.5, earTone);
        if (detail)
          for (const [a, b, c] of [
            [103, 47, 115],
            [105.5, 42, 112.5],
          ])
            path(
              ctx,
              [
                ["M", a, b + 3],
                ["Q", (a + c) / 2, b - 1, c, b + 3],
              ],
              "rgba(16,46,57,0.45)",
              true,
              1.8,
            );
      });
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
    sketch(ctx, () => kerchief(ctx, scarfColor));
    ctx.restore();
    if (opts.withEyes !== false && progress > 0.92) {
      drawEyes(ctx, 0, 0, s, eyeShapes(opts.eyes, pose), ink);
      if (s >= 28) {
        ctx.save();
        ctx.scale(s, s);
        sketch(ctx, () => {
          if (pose.waiting || pose.expression === "surprised") disc(ctx, 66, 81, 2.6, 2.2, ink);
          else if (pose.writing)
            path(
              ctx,
              [
                ["M", 60, 82],
                ["Q", 65, 84, 70, 81],
              ],
              ink,
              true,
              2.7,
            );
          else
            path(
              ctx,
              [
                ["M", 59.4, 79.5],
                ["Q", 66.5, 83.7, 72, 76.6],
              ],
              ink,
              true,
              2.7,
            );
        });
        ctx.restore();
      }
    }
    drawing.cap = () => {
      ctx.save();
      ctx.scale(s, s);
      cap(ctx, CREAM, 0, volume);
      ctx.restore();
    };
    if (opts.after && progress > 0.92) opts.after(ctx, s, frame);
    wearCap(ctx);
    if (pose.writing && progress > 0.92) {
      ctx.save();
      ctx.scale(s, s);
      sketch(ctx, () => logbook(ctx, earTone, detail));
      ctx.restore();
    }
    ctx.restore();
  } finally {
    drawing = outer;
  }
}

/** Writing: the logbook (the sail on its page) and the pencil; small, only the pencil's tip. */
function logbook(ctx, tone, detail) {
  ctx.save();
  ctx.translate(0, -5);
  if (detail) {
    path(
      ctx,
      [["M", 33, 98], ["L", 64, 102], ["L", 95, 98], ["L", 97, 120], ["L", 64, 124], ["L", 31, 120], ["Z"]],
      NAVY,
    );
    path(
      ctx,
      [["M", 36, 97], ["L", 64, 100.5], ["L", 92, 97], ["L", 93, 117], ["L", 64, 121], ["L", 35, 117], ["Z"]],
      CREAM,
    );
    path(
      ctx,
      [
        ["M", 64, 100.5],
        ["L", 64, 121],
      ],
      "rgba(24,58,85,0.5)",
      true,
      1.2,
    );
    for (let i = 0; i < 3; i++)
      path(
        ctx,
        [
          ["M", 40, 104 + i * 3.4],
          ["L", 58, 105 + i * 3.4],
        ],
        "rgba(24,58,85,0.35)",
        true,
        1.2,
      );
    sail(ctx, 71, 103, 0.22, "#103D42");
  }
  path(
    ctx,
    [
      ["M", 80, 112],
      ["L", 94, 95],
    ],
    GOLD,
    true,
    detail ? 3.4 : 5,
  );
  path(
    ctx,
    [
      ["M", 80, 112],
      ["L", 78.6, 114],
    ],
    INK,
    true,
    detail ? 2 : 3,
  );
  if (detail) hand(ctx, 88, 104, 5, tone);
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

/**
 * The accessories on the body's 16×16 grid, for what still draws them in pixels (the brain's portrait, the code
 * home's cubes): a coarse picture of each one. The avatars draw the curves of drawAccessory.
 */
export const ACCESSORY_PALETTE = {
  K: NAVY,
  k: INK,
  W: CREAM,
  R: CORAL,
  r: CORAL,
  Y: OILSKIN,
  y: OILSKIN_BRIM,
  P: CORAL,
  p: CORAL,
  B: FLAG_BLUE,
  G: GOLD,
  g: GOLD,
  N: WOOL,
  n: WOOL,
  V: SEA_MINT,
  F: CREAM,
  f: CREAM,
  O: GOLD,
  M: NAVY,
  L: "#14635C",
};
export const ACCESSORIES = {
  hat: { ox: 1, oy: -1, rows: ["   WWWWWWWW   ", " WWWWWGWWWWWW ", "KKKKKKKKKKKKKK", " kkkkkkkkkkkk "] },
  cap: { ox: 1, oy: -1, rows: ["   KKKKKKKK   ", " KKKKKKKKKKKK ", "KKRRRRRRRRRRKK", "kkkkkkkk      "] },
  headphones: { ox: 0, oy: 0, rows: ["  KKKKKKKKKKKK  ", " KK          KK ", "KK            KK"] },
  bow: { ox: 15, oy: 3, rows: ["BBB", "BWB", "BBB", "K  ", "K  ", "K  "] },
  crown: {
    ox: 0,
    oy: -2,
    rows: ["    YYYYYYYY    ", "   YYYYYYYYYY   ", "  YYYYYYYYYYYY  ", "yyyyyyyyyyyyyyyy", " yyy        yyy "],
  },
  antenna: { ox: 3, oy: 6, rows: [" KKK  KKK ", "K   KK   K", "K   KK   K", " KKK  KKK "] },
  headset: { ox: 13, oy: 7, rows: [" RRR", "RRRR", " RRR", "  K ", " K  ", "K   "] },
  beanie: {
    ox: 1,
    oy: -2,
    rows: ["    NNNNNN    ", "  NNNNNNNNNN  ", " NNNNNNNNNNNN ", "KKKKKKKKKKKKKK", "KKKKKKKKKKKKKK"],
  },
  party: { ox: 0, oy: -2, rows: ["  RkYkVkRkYkV   ", "  R Y V R Y V   "] },
  flower: { ox: 11, oy: 7, rows: ["    yy", "  YYyy", "YYYY  "] },
  scarf: { ox: 4, oy: 14, rows: ["RRRRRRRR", "  RRRR  ", " RR  RR "] },
};
export const ACCESSORY_NAMES = ["none", ...Object.keys(ACCESSORIES)];

/**
 * What a crew member wears for its job on board, in the body's own space (inside drawAgent's `after`), with the head's
 * parallax: `hat` the captain's cap with the gold sail, `cap` the deck cap, `headphones` the radio's, `headset` the
 * engineer's, `antenna` round glasses (research), `beanie` the fisherman's wool cap, `crown` the sou'wester, `bow` the
 * "P" flag ("all aboard"), `party` bunting, `flower` the spyglass (lookout), `scarf` a big kerchief. A hat takes the
 * sailor cap's place; the rest is worn with it. Everything stays inside the porthole's circle and the upstream's
 * ACCESSORY_REACH (the room an unframed avatar's canvas leaves).
 */
export function drawAccessory(ctx, s, name, frame, _t = 0, _active = false) {
  if (!ACCESSORIES[name]) return;
  if (HATS.has(name)) {
    if (drawing?.ctx === ctx) drawing.cap = null;
  } else wearCap(ctx);
  const now = tonesNow();
  const earTone = now.earTone ?? mixHex(now.top, now.bottom, 0.7);
  const scarfColor = now.scarfColor ?? CORAL;
  const { volume, detail } = now;
  ctx.save();
  ctx.translate((frame?.head?.[0] ?? 0) * s, (frame?.head?.[1] ?? 0) * s);
  ctx.scale(s, s);
  if (name === "headphones") {
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
    disc(ctx, 0.925, 0.54, 0.065, 0.13, NAVY);
    if (volume) {
      disc(ctx, 0.085, 0.53, 0.03, 0.08, CORAL);
      disc(ctx, 0.915, 0.53, 0.03, 0.08, CORAL);
    }
    ctx.restore();
    return;
  }
  sketch(ctx, () => {
    if (name === "hat") {
      path(ctx, [["M", 27, 37], ["Q", 28, 17, 64, 15], ["Q", 100, 17, 101, 37], ["Q", 64, 44, 27, 37], ["Z"]], CREAM);
      if (volume)
        path(
          ctx,
          [
            ["M", 36, 27],
            ["Q", 60, 17, 88, 24],
          ],
          "rgba(255,255,255,0.6)",
          true,
          2,
        );
      ctx.beginPath();
      ctx.roundRect(33, 34, 62, 13, 3);
      ctx.fillStyle = NAVY;
      ctx.fill();
      path(ctx, [["M", 34, 47], ["Q", 64, 60, 94, 47], ["Q", 64, 52, 34, 47], ["Z"]], INK);
      if (detail) {
        path(
          ctx,
          [
            ["M", 36, 41],
            ["Q", 64, 45, 92, 41],
          ],
          GOLD,
          true,
          1.6,
        );
        sail(ctx, 56.5, 18.5, 0.26, GOLD);
      } else disc(ctx, 64, 26, 3.4, 3.4, GOLD);
    } else if (name === "cap") {
      path(ctx, [["M", 29, 46], ["Q", 28, 17, 64, 15], ["Q", 100, 17, 99, 46], ["Z"]], NAVY);
      if (volume)
        path(
          ctx,
          [
            ["M", 38, 30],
            ["Q", 52, 19, 68, 19],
          ],
          "rgba(255,255,255,0.22)",
          true,
          3,
        );
      ctx.beginPath();
      ctx.roundRect(29, 37, 70, 7, 2);
      ctx.fillStyle = CORAL;
      ctx.fill();
      disc(ctx, 64, 15.5, 3, 2.2, CORAL);
      path(ctx, [["M", 22, 47], ["Q", 40, 57, 70, 49], ["Q", 46, 50, 29, 44], ["Z"]], INK);
    } else if (name === "beanie") {
      path(ctx, [["M", 28, 47], ["Q", 26, 14, 64, 12], ["Q", 102, 14, 100, 47], ["Z"]], WOOL);
      if (volume)
        path(
          ctx,
          [
            ["M", 40, 30],
            ["Q", 52, 20, 66, 20],
          ],
          "rgba(255,255,255,0.25)",
          true,
          3,
        );
      ctx.beginPath();
      ctx.roundRect(28, 40, 72, 14, 6);
      ctx.fillStyle = NAVY;
      ctx.fill();
      if (detail)
        for (let i = 0; i < 10; i++)
          path(
            ctx,
            [
              ["M", 35 + i * 6.4, 42.5],
              ["L", 35 + i * 6.4, 51.5],
            ],
            "#31546b",
            true,
            2,
          );
    } else if (name === "crown") {
      path(ctx, [["M", 31, 43], ["Q", 29, 12, 64, 11], ["Q", 99, 12, 97, 43], ["Z"]], OILSKIN);
      if (volume)
        path(
          ctx,
          [
            ["M", 44, 26],
            ["Q", 54, 17, 67, 17],
          ],
          "rgba(255,255,255,0.45)",
          true,
          3,
        );
      path(
        ctx,
        [
          ["M", 19, 46],
          ["Q", 64, 31, 109, 46],
          ["Q", 112, 55, 103, 58],
          ["Q", 64, 44, 25, 58],
          ["Q", 17, 55, 19, 46],
          ["Z"],
        ],
        OILSKIN_BRIM,
      );
    } else if (name === "headset") {
      disc(ctx, 98, 67, 10, 10, CORAL);
      ctx.beginPath();
      ctx.ellipse(98, 67, 10, 10, 0, 0, Math.PI * 2);
      ctx.strokeStyle = NAVY;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      path(
        ctx,
        [
          ["M", 98, 76],
          ["Q", 97, 89, 80, 90],
        ],
        NAVY,
        true,
        2.6,
      );
      disc(ctx, 78, 90, 3.6, 2.6, NAVY);
    } else if (name === "antenna") {
      for (const cx of [50, 78]) {
        disc(ctx, cx, 66, 9.5, 9.5, "rgba(255,255,255,0.18)");
        ctx.beginPath();
        ctx.ellipse(cx, 66, 9.5, 9.5, 0, 0, Math.PI * 2);
        ctx.strokeStyle = NAVY;
        ctx.lineWidth = 2.4;
        ctx.stroke();
      }
      for (const line of [
        [
          ["M", 59.5, 64],
          ["Q", 64, 61, 68.5, 64],
        ],
        [
          ["M", 40.5, 64],
          ["L", 33, 61],
        ],
        [
          ["M", 87.5, 64],
          ["L", 95, 61],
        ],
      ])
        path(ctx, line, NAVY, true, 2.2);
    } else if (name === "bow") {
      hand(ctx, 99, 99, 6, earTone);
      path(
        ctx,
        [
          ["M", 100, 101],
          ["L", 104, 40],
        ],
        NAVY,
        true,
        2.2,
      );
      path(ctx, [["M", 104, 40], ["L", 116, 41.5], ["L", 115.5, 53], ["L", 104, 52], ["Z"]], FLAG_BLUE);
      path(ctx, [["M", 107.2, 43.4], ["L", 112.6, 44.1], ["L", 112.4, 49.6], ["L", 107.1, 49], ["Z"]], "#ffffff");
    } else if (name === "party") {
      const at = (t) => [
        (1 - t) ** 2 * 22 + 2 * (1 - t) * t * 64 + t * t * 106,
        (1 - t) ** 2 * 34 + 2 * (1 - t) * t * -18 + t * t * 34,
      ];
      path(
        ctx,
        [
          ["M", 22, 34],
          ["Q", 64, -18, 106, 34],
        ],
        "rgba(16,46,57,0.55)",
        true,
        1.3,
      );
      const colors = [CORAL, GOLD, SEA_MINT, FLAG_BLUE];
      for (let i = 0; i < 7; i++) {
        const [ax, ay] = at(0.12 + i * 0.125 - 0.035);
        const [bx, by] = at(0.12 + i * 0.125 + 0.035);
        path(
          ctx,
          [["M", ax, ay], ["L", bx, by], ["L", (ax + bx) / 2, Math.max(ay, by) + 7], ["Z"]],
          colors[i % colors.length],
        );
      }
    } else if (name === "flower") {
      hand(ctx, 96, 72, 5.5, earTone);
      for (const [x0, y0, x1, y1, w, c] of [
        [79, 66, 90, 61.5, 6, OILSKIN_BRIM],
        [90, 61.5, 101, 57, 8, GOLD],
        [101, 57, 111, 53, 10, OILSKIN_BRIM],
      ])
        path(
          ctx,
          [
            ["M", x0, y0],
            ["L", x1, y1],
          ],
          c,
          true,
          w,
        );
      if (detail)
        for (const [x, y, r] of [
          [90, 61.5, 4.4],
          [101, 57, 5.4],
        ])
          path(
            ctx,
            [
              ["M", x - r * 0.38, y - r * 0.92],
              ["L", x + r * 0.38, y + r * 0.92],
            ],
            NAVY,
            true,
            1.6,
          );
      disc(ctx, 111.5, 52.8, 2.2, 4.6, NAVY);
    } else if (name === "scarf") kerchief(ctx, scarfColor, true);
  });
  ctx.restore();
}

/**
 * A sleeping agent (paused until its plan or budget is back): a gold crescent moon over the head's right side in the
 * body's own space, outlined in `color` (the page's ink), and a small star that comes and goes with `t` (still frames
 * and reduced motion show both).
 */
export function drawSleep(ctx, s, frame, color, t) {
  wearCap(ctx);
  ctx.save();
  ctx.translate((frame?.head?.[0] ?? 0) * s, (frame?.head?.[1] ?? 0) * s);
  ctx.scale(s, s);
  sketch(ctx, () => {
    const [cx, cy, r] = [96, 22, 8];
    const moon = [];
    for (let i = 0; i <= 16; i++) {
      const a = Math.PI / 2 + (i / 16) * Math.PI;
      moon.push([i ? "L" : "M", cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    for (let i = 16; i >= 0; i--) {
      const a = Math.PI / 2 + (i / 16) * Math.PI;
      moon.push(["L", cx + 0.45 * r + Math.cos(a) * r * 0.82, cy - 0.08 * r + Math.sin(a) * r * 0.86]);
    }
    moon.push(["Z"]);
    path(ctx, moon, GOLD);
    path(ctx, moon, color, true, 1.1);
    const rising = t !== undefined && Math.floor(t / 0.8) % 3 === 0;
    if (!rising) {
      path(
        ctx,
        [
          ["M", 108, 28],
          ["L", 109, 31],
          ["L", 112, 32],
          ["L", 109, 33],
          ["L", 108, 36],
          ["L", 107, 33],
          ["L", 104, 32],
          ["L", 107, 31],
          ["Z"],
        ],
        GOLD,
      );
    }
  });
  ctx.restore();
}

/**
 * The porthole around an agent's tile of side `s` (the tile is clipped round by its view): a navy ring at the edge and
 * a fine gold line inside it, thinner on a small tile. Drawn over the agent, after drawAgent, by the web's framed
 * avatar (live.ts) and the phone's (AgentAvatar.tsx). Profile-only export (engine.d.ts declares it by patch).
 */
export function drawPorthole(ctx, s) {
  const ring = Math.max(1.5, s * 0.036);
  const line = Math.max(0.7, s * 0.012);
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(s / 2, s / 2, s / 2 - ring / 2, s / 2 - ring / 2, 0, 0, Math.PI * 2);
  ctx.strokeStyle = NAVY;
  ctx.lineWidth = ring;
  ctx.stroke();
  const r = s / 2 - ring - line / 2 - s * 0.008;
  ctx.beginPath();
  ctx.ellipse(s / 2, s / 2, r, r, 0, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,212,119,0.8)";
  ctx.lineWidth = line;
  ctx.stroke();
  ctx.restore();
}
