/** Proa / Timo. Import-free engine, compatible with the upstream canvas and mobile recorder API. */
/** Top and bottom of each agent color. Sky is Timo's mint, the same in both themes. */
export const AGENT_GRADIENTS = {
  sky: ["#C4F0E0", "#A2E5CE"],
  indigo: ["#7d8bff", "#3f4fd6"],
  violet: ["#ae8cf7", "#6e45d1"],
  rose: ["#f58aa6", "#c9406a"],
  amber: ["#f3c25c", "#c07d0b"],
  green: ["#5fcf8b", "#1f8a4c"],
  teal: ["#4cd0c0", "#0f8f86"],
  graphite: ["#9a9a95", "#4a4a47"],
};

/** The landing's sky: what `sky` is in a workspace without an accent. */
export const DEFAULT_SKY = AGENT_GRADIENTS.sky;

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

/**
 * A color as it is drawn now, for a cache's or a memo's key: `sky` (and no color) by the pair it resolves to, which
 * follows the workspace's accent; any other color as is.
 */
export function drawnKey(color) {
  return !color || color === "sky" ? AGENT_GRADIENTS.sky.join() : color;
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

/** "#rrggbb" → [r, g, b]. */
export function rgbOf(hex) {
  const n = Number.parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** `a` → `b` by `k` (0..1), as "#rrggbb". */
export function mixHex(a, b, k) {
  const A = rgbOf(a);
  const B = rgbOf(b);
  return `#${A.map((v, i) =>
    Math.round(v + (B[i] - v) * k)
      .toString(16)
      .padStart(2, "0"),
  ).join("")}`;
}

/** Whether `v` is a custom agent color: "#rrggbb". */
export function isHexColor(v) {
  return typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);
}

/** A color's name under `look.colors.*`: a preset's own, or "custom" for a "#rrggbb". */
export function colorKey(color) {
  return isHexColor(color) ? "custom" : color;
}

/** "#rrggbb" → [hue 0..360, saturation 0..1, value 0..1] (the picker's space). */
export function hexToHsv(hex) {
  const [r, g, b] = rgbOf(hex).map((c) => c / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, max ? d / max : 0, max];
}

/** [hue 0..360, saturation 0..1, value 0..1] → "#rrggbb". */
export function hsvToHex(h, s, v) {
  const f = (n) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return `#${[f(5), f(3), f(1)]
    .map((c) =>
      Math.round(c * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

function hexToHsl(hex) {
  const [h, s, v] = hexToHsv(hex);
  const l = v * (1 - s / 2);
  return [h, l === 0 || l === 1 ? 0 : (v - l) / Math.min(l, 1 - l), l];
}

function hslToHex(h, s, l) {
  const v = l + s * Math.min(l, 1 - l);
  return hsvToHex(h, v ? 2 * (1 - l / v) : 0, v);
}

/** WCAG relative luminance of "#rrggbb" (0 black .. 1 white). */
export function luminance(hex) {
  const [r, g, b] = rgbOf(hex).map((c) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio of two "#rrggbb" (1 to 21). */
export function contrastOf(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * An agent's @mention chip in a theme: a solid tint of its color, so the chip reads the same on a page, a row or a
 * bubble, and its own color pushed toward black (or white in the dark) until the text passes WCAG AA on that tint.
 */
export function mentionTone(color, dark = false) {
  const [top, bottom] = gradientOf(color);
  const background = dark ? mixHex("#181817", bottom, 0.34) : mixHex("#ffffff", bottom, 0.16);
  const base = dark ? top : bottom;
  let ink = base;
  for (let k = 0.05; k <= 1 && contrastOf(ink, background) < 4.5; k += 0.05) {
    ink = mixHex(base, dark ? "#ffffff" : "#000000", k);
  }
  return { background, ink };
}

/**
 * A custom color's [top, bottom], built like the presets: the bottom is the color itself, its lightness held
 * between graphite's and a level where the white eyes and text still read (luminance ≤ 0.28, about 3:1 against
 * white, which also keeps it off a dark theme's background); the top is the same hue 26 points lighter.
 */
export function customGradient(hex) {
  const [h, s, l0] = hexToHsl(hex);
  let l = Math.max(0.28, Math.min(0.55, l0));
  let bottom = hslToHex(h, s, l);
  while (luminance(bottom) > 0.28 && l > 0.2) {
    l -= 0.01;
    bottom = hslToHex(h, s, l);
  }
  // The top is capped too: yellow, lime or cyan 26 points lighter would be near white, washing out the body's
  // light tones behind the eyes and vanishing on light surfaces. No custom top reads worse than amber's.
  let lt = Math.min(0.78, l + 0.26);
  let top = hslToHex(h, s, lt);
  while ((luminance(top) > 0.59 || luminance(mixHex(bottom, top, 0.5)) > 0.405) && lt > l) {
    lt -= 0.01;
    top = hslToHex(h, s, lt);
  }
  return [top, bottom];
}

/** Where the custom color picker starts: the custom color itself, or the current preset's own tone. */
export function pickerStart(color) {
  return isHexColor(color) ? color.toLowerCase() : gradientOf(color)[1];
}

/** The preset closest to a color by hue (graphite when nearly gray): for places that only have the presets' pictures. */
export function nearestPreset(color) {
  if (!isHexColor(color)) return color in AGENT_GRADIENTS ? color : "sky";
  const [h, s] = hexToHsl(color.toLowerCase());
  if (s < 0.15) return "graphite";
  let best = "sky";
  let gap = 360;
  for (const [name, [, bottom]] of Object.entries(AGENT_GRADIENTS)) {
    if (name === "graphite") continue;
    const d = Math.abs(hexToHsl(bottom)[0] - h) % 360;
    const dd = Math.min(d, 360 - d);
    if (dd < gap) [best, gap] = [name, dd];
  }
  return best;
}

/** An agent color's [top, bottom]: a preset, a custom "#rrggbb", a [top, bottom] pair as is, or sky for anything else. */
export function gradientOf(color) {
  if (Array.isArray(color)) return color;
  return AGENT_GRADIENTS[color] ?? (isHexColor(color) ? customGradient(color.toLowerCase()) : AGENT_GRADIENTS.sky);
}

/**
 * Five body tones, deep (0) to light (4). `deep` runs one step deeper, for a
 * big agent on a light halo (the landing's giant), so its top still reads.
 */
export function bodyTones(color, deep = false) {
  const [top, bottom] = gradientOf(color);
  if (deep)
    return [mixHex(bottom, "#000000", 0.5), mixHex(bottom, "#000000", 0.22), bottom, mixHex(bottom, top, 0.5), top];
  return [mixHex(bottom, "#000000", 0.38), bottom, mixHex(bottom, top, 0.5), top, mixHex(top, "#ffffff", 0.5)];
}

/** The small pixel agents' body: deep enough for white eyes (navy on the sky). */
export function spriteBody(color) {
  return (!color || color === "sky") && AGENT_GRADIENTS.sky === DEFAULT_SKY
    ? DEFAULT_SKY[1]
    : mixHex(gradientOf(color || "sky")[1], "#000000", 0.45);
}

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

/**
 * Passing expressions (a pose, not the agent's look): they replace the eye
 * style for a moment. Each eye gets a kind the renderers know how to draw.
 */
export const EXPRESSIONS = {
  closed: { w: 0.17, h: 0.08, cy: 0.5, kind: "cup" },
  happy: { w: 0.17, h: 0.1, cy: 0.45, kind: "arc" },
  dizzy: { w: 0.23, h: 0.23, cy: 0.465, kind: "spiral" },
  heart: { w: 0.2, h: 0.19, cy: 0.465, kind: "heart" },
  star: { w: 0.22, h: 0.22, cy: 0.465, kind: "star" },
  cross: { w: 0.16, h: 0.16, cy: 0.465, kind: "cross" },
  surprised: { w: 0.17, h: 0.23, cy: 0.46, kind: "ring" },
  angry: { w: 0.12, h: 0.22, cy: 0.48, kind: "slant" },
  wink: { w: 0.14, h: 0.14, cy: 0.51, kind: "pill", right: { w: 0.17, h: 0.08, cy: 0.5, kind: "cup" } },
};

/**
 * The two eyes for a style and a pose, as boxes in body fractions:
 * `{ x, y, w, h, kind, side }`. Kinds: "pill", "arc" (∩), "lid" (half),
 * "cup" (∪, closed), "spiral" (@), "heart", "star", "cross" (×), "ring" (O),
 * "slant" (angry). Pose: `writing` (dashes), `blink`, `expression` (one of
 * EXPRESSIONS), `look` [dx, dy] in fractions and `turn` [tx, ty] in -1..1:
 * the eyes slide toward the turn and the far one narrows (pseudo-3D).
 */
export function eyeShapes(style = "round", pose = {}) {
  const ex = pose.writing ? null : EXPRESSIONS[pose.expression];
  const base = pose.writing ? { ...WRITING_EYE, kind: "pill" } : (ex ?? EYE_STYLES[style] ?? EYE_STYLES.round);
  const [lx, ly] = pose.look ?? [0, 0];
  const [tx, ty] = pose.turn ?? [0, 0];
  // The face turns with the body (drawAgent); the eyes only lean a little toward where it looks.
  const dx = lx + 0.025 * tx;
  const dy = ly + 0.02 * ty;
  const spread = 1;
  return EYE_X.map((cx, side) => {
    const e = side === 1 && base.right ? base.right : base;
    const kind = e.kind ?? "pill";
    const blink = pose.blink && (kind === "pill" || kind === "ring" || kind === "slant");
    // The eye on the side the head turns to is farther away: narrower.
    const far = (side === 1 && tx > 0) || (side === 0 && tx < 0) ? Math.abs(tx) : 0;
    const w = e.w * (1 - 0.12 * far);
    const h = blink ? Math.max(0.03, e.h * 0.12) : e.h;
    const center = 0.5 + (cx - 0.5) * spread + dx;
    return { x: center - w / 2, y: e.cy - h / 2 + dy, w, h, kind: blink ? "pill" : kind, side };
  });
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

const hash = (a, b) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);

/**
 * An agent's idle life at time `t` (seconds): it turns its head toward a new
 * spot every couple of seconds (faster while `active`), blinks, breathes
 * (`squash`), and now and then shows an expression for a moment. `seed`
 * keeps several agents out of step; `every` (seconds, default 6.5) spaces the
 * expressions (each lasts 1.7 s). Returns a pose for drawAgent/eyeShapes.
 */
export function idlePose(t, seed = 0, opts = {}) {
  const period = opts.active ? 1.2 : 2.6;
  const at = t / period + seed * 3.1;
  const i = Math.floor(at);
  const target = (j) => [(hash(j, seed) * 2 - 1) * 0.85, (hash(j + 0.5, seed + 1) * 2 - 1) * 0.5];
  const a = target(i);
  const b = target(i + 1);
  const k = ease(Math.min(1, (at - i) * 2.4));
  const turn = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  const blink = (t + seed * 1.7) % 3.9 < 0.12;
  const squash = Math.sin(t * (opts.active ? 4 : 2.1) + seed) * (opts.active ? 0.7 : 0.35);
  let expression;
  const list = opts.expressions ?? Object.keys(EXPRESSIONS);
  if (list.length) {
    const every = opts.every ?? 6.5;
    const slot = Math.floor((t + seed * 5) / every);
    const phase = (t + seed * 5) % every;
    if (phase > every - 1.7) expression = list[Math.floor(hash(slot, seed + 2) * list.length)];
  }
  return { turn, blink, squash, expression };
}

/**
 * How the body sits for a pose: scale and shift (pseudo-3D turn and breath),
 * around the bottom middle. Accessories use `head` (a parallax shift in body
 * fractions, smaller than the eyes').
 */
export function bodyFrame(pose = {}) {
  const [tx, ty] = pose.turn ?? [0, 0];
  const sq = pose.squash ?? 0;
  return {
    sx: 1 + 0.035 * sq,
    sy: 1 - 0.045 * sq,
    dx: 0,
    // Accessories sit on the turning face; a touch of lean so hats feel on top of the head.
    head: [0.02 * tx, 0.015 * ty - 0.03 * sq],
  };
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
export const ACCESSORY_CHECK = { c: ["K", "k"], h: ["Y", "y"], s: ["R", "r"], m: ["N", "n"] };
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
export const ACCESSORY_REACH = { top: 9 / 16, left: 1 / 16, right: 2 / 16, bottom: 7 / 16 };
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
export const SLEEP_SPOTS = [
  [14.5, -2.6],
  [17, -4.8],
];
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

/** A sleeping agent's pose: eyes closed, the head a little down, breathing slowly (still: no breath). */
export function sleepPose(t, seed = 0) {
  return { expression: "closed", turn: [0, 0.15], squash: t === undefined ? 0 : Math.sin(t * 1.1 + seed) * 0.3 };
}
