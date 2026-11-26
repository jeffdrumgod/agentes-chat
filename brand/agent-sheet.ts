#!/usr/bin/env bun
/**
 * Sheets of every agent look as the apps draw it, from a branded copy (brand/build.sh --target none):
 *
 *   bun brand/agent-sheet.ts <branded copy> <out dir> [--only web|phone]
 *
 * - web: the kit's own `Avatar` (packages/ui) with the kit's CSS, bundled from the copy and drawn by headless Chrome
 *   with reduced motion (still frames), light and dark. Needs Google Chrome (CHROME=<binary> to choose one).
 * - phone: the phone's `agentFrame` (apps/mobile/src/agent/AgentAvatar.tsx, its React Native imports stubbed out)
 *   recorded and replayed on Skia (CanvasKit, the same library react-native-skia draws with), as skia-ctx.ts does,
 *   with the tile's clip and edge the way AgentAvatar's view sets them.
 *
 * Writes <out>/{web,phone}-{looks,states,eyes,sizes}-{light,dark}.png and <out>/web-all-{light,dark}.png (every
 * color × accessory × state). Nothing in the copy changes but `apps/web/.brand-sheet/`.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Glob } from "bun";

const argv = process.argv.slice(2);
const only = argv.includes("--only") ? argv[argv.indexOf("--only") + 1] : undefined;
const [rootArg, outArg] = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--only");
if (!rootArg || !outArg) throw new Error("usage: bun brand/agent-sheet.ts <branded copy> <out dir> [--only web|phone]");
const ROOT = resolve(rootArg);
const OUT = resolve(outArg);
mkdirSync(OUT, { recursive: true });

const E = await import(`${ROOT}/packages/ui/src/agent/engine.js`);
const COLORS: string[] = [...Object.keys(E.AGENT_GRADIENTS), "#7c3aed", "#101820"];
const EYES: string[] = Object.keys(E.EYE_STYLES);
const ACCESSORIES: string[] = E.ACCESSORY_NAMES;
const STATES = ["idle", "thinking", "writing", "waiting", "sleeping"] as const;
const EXPRESSIONS: string[] = Object.keys(E.EXPRESSIONS);
const THEMES = ["light", "dark"] as const;

type Cell = {
  color: string;
  eyes?: string;
  accessory?: string;
  state?: string;
  expression?: string;
  presence?: string;
  size: number;
};
// The presence badge (ADR 0084) on the eyes sheet, one per column: its shape is the profile's too.
const PRESENCES = ["online", "busy", "away", "working", "waiting"];
type Sheet = { name: string; title: string; cols: string[]; rows: { label: string; cells: Cell[] }[] };

const SHEETS: Sheet[] = [
  {
    name: "looks",
    title: "Cores × acessórios (56 px, parado)",
    cols: ACCESSORIES,
    rows: COLORS.map((color) => ({
      label: color,
      cells: ACCESSORIES.map((accessory) => ({ color, accessory, size: 56 })),
    })),
  },
  {
    name: "states",
    title: "Estados e expressões (56 px)",
    cols: [...STATES, ...EXPRESSIONS],
    rows: ACCESSORIES.map((accessory, i) => {
      const color = COLORS[i % 8] as string;
      return {
        label: `${accessory} · ${color}`,
        cells: [
          ...STATES.map((state) => ({ color, accessory, state, size: 56 })),
          ...EXPRESSIONS.map((expression) => ({ color, accessory, expression, size: 56 })),
        ],
      };
    }),
  },
  {
    name: "eyes",
    title: "Cores × olhos (36 px), com o badge de presença",
    cols: EYES,
    rows: COLORS.map((color) => ({
      label: color,
      cells: EYES.map((eyes, j) => ({ color, eyes, size: 36, presence: PRESENCES[j % PRESENCES.length] })),
    })),
  },
  {
    name: "sizes",
    title: "Tamanhos de uso: 18, 24, 36, 56 e 112 px",
    cols: ["18", "24", "36", "56", "112"],
    rows: ACCESSORIES.flatMap((accessory, i) =>
      (["idle", "writing", "sleeping"] as const).map((state) => ({
        label: `${accessory} · ${state}`,
        cells: [18, 24, 36, 56, 112].map((size) => ({ color: COLORS[i % 8] as string, accessory, state, size })),
      })),
    ),
  },
];
// Every color × accessory × state, at the list's 36 px, plus the profile's 56 px idle.
const ALL: Sheet = {
  name: "all",
  title: "Todas as combinações: cor × acessório × estado (36 px) e 56 px parado",
  cols: [...STATES, "56 px"],
  rows: COLORS.flatMap((color) =>
    ACCESSORIES.map((accessory) => ({
      label: `${color} · ${accessory}`,
      cells: [...STATES.map((state) => ({ color, accessory, state, size: 36 })), { color, accessory, size: 56 }],
    })),
  ),
};

const PAGE = { light: "#F5F3EC", dark: "#0D252A" };
const INK = { light: "#102E39", dark: "#E8F1F0" };
const PITCH = (s: Sheet) => Math.max(...s.rows.flatMap((r) => r.cells.map((c) => c.size))) + 40;
const LABEL_W = 170;

// ---------------------------------------------------------------------------------------------------------------
// Web: the kit's Avatar in headless Chrome.
async function web() {
  const chrome =
    process.env.CHROME ??
    [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/usr/bin/google-chrome",
      "/usr/bin/chromium",
    ].find((p) => existsSync(p));
  if (!chrome) throw new Error("agent-sheet: no Chrome found (set CHROME)");
  // Inside apps/web, so React resolves from the web app's own dependencies.
  const dir = join(ROOT, "apps/web/.brand-sheet");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "entry.tsx"),
    `import "../../../packages/ui/src/styles/index.css";
import { createRoot } from "react-dom/client";
import { Avatar } from "../../../packages/ui/src/components/Avatar";
const sheet = (window as any).SHEET;
const theme = (window as any).THEME;
function Sheet() {
  return (
    <div style={{ padding: 16, fontFamily: "Helvetica, Arial, sans-serif" }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10, color: "var(--ink)" }}>{sheet.title} · web · {theme}</div>
      <div style={{ display: "grid", gridTemplateColumns: \`${LABEL_W}px repeat(\${sheet.cols.length}, \${sheet.pitch}px)\`, alignItems: "center" }}>
        <div />
        {sheet.cols.map((c: string) => <div key={c} style={{ fontSize: 11, color: "var(--muted)", paddingBottom: 6 }}>{c}</div>)}
        {sheet.rows.map((r: any) => [
          <div key={r.label} style={{ fontSize: 11, color: "var(--muted)" }}>{r.label}</div>,
          ...r.cells.map((c: any, i: number) => (
            <div key={r.label + i} style={{ height: sheet.pitch, display: "grid", placeItems: "center" }}>
              <Avatar kind="agent" name={r.label + i} size={({ 18: "xs", 24: "sm", 36: "md", 56: "lg", 112: "xl" } as any)[c.size]}
                appearance={{ color: c.color, eyes: c.eyes ?? "round", accessory: c.accessory ?? "none" }}
                state={c.state} expression={c.expression} presence={c.presence} />
            </div>
          )),
        ])}
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<Sheet />);
`,
  );
  const built = await Bun.build({
    entrypoints: [join(dir, "entry.tsx")],
    outdir: dir,
    target: "browser",
    minify: false,
  });
  if (!built.success) throw new Error(`agent-sheet: web bundle failed\n${built.logs.join("\n")}`);
  const js = built.outputs.find((o) => o.path.endsWith(".js"))?.path;
  const css = built.outputs.find((o) => o.path.endsWith(".css"))?.path;
  for (const sheet of [...SHEETS, ALL]) {
    const pitch = PITCH(sheet);
    for (const theme of THEMES) {
      const html = join(dir, `${sheet.name}-${theme}.html`);
      const data = { ...sheet, pitch };
      writeFileSync(
        html,
        `<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8">${css ? `<link rel="stylesheet" href="${css}">` : ""}
<style>body{margin:0;background:${PAGE[theme]}}</style></head>
<body><div data-theme="${theme}"><div id="root"></div></div><script>window.SHEET=${JSON.stringify(data)};window.THEME=${JSON.stringify(theme)}</script>
<script type="module" src="${js}"></script></body></html>`,
      );
      const width = LABEL_W + sheet.cols.length * pitch + 40;
      const height = sheet.rows.length * pitch + 90;
      const png = join(OUT, `web-${sheet.name}-${theme}.png`);
      const run = Bun.spawnSync([
        chrome,
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        "--force-prefers-reduced-motion",
        "--allow-file-access-from-files",
        "--force-device-scale-factor=2",
        "--virtual-time-budget=8000",
        `--window-size=${width},${height}`,
        `--screenshot=${png}`,
        `file://${html}`,
      ]);
      if (!existsSync(png)) throw new Error(`agent-sheet: Chrome wrote no ${png}\n${run.stderr.toString()}`);
      console.log(`agent-sheet: ${png}`);
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Phone: AgentAvatar's agentFrame on Skia (CanvasKit). React Native's modules are stubbed: only the drawing runs.
async function phone() {
  const STUB = new Proxy(function stub() {}, {
    get: (_t, k) => (k === "hairlineWidth" ? 0.5 : k === "__esModule" ? false : STUB),
    apply: () => STUB,
  });
  const stubs = ["Canvas", "Picture", "createPicture", "memo", "useMemo", "useTranslation", "StyleSheet", "View"];
  const exports = Object.fromEntries(
    [
      ...stubs,
      "useReducedMotion",
      "useTheme",
      "useFrameTime",
      "jsx",
      "jsxs",
      "jsxDEV",
      "Fragment",
      "createContext",
      "useCallback",
      "useContext",
      "useEffect",
      "useLayoutEffect",
      "useRef",
      "useState",
      "useSyncExternalStore",
      "AppState",
      "Platform",
      "ClipOp",
      "PaintStyle",
      "Skia",
      "StrokeCap",
      "StrokeJoin",
    ].map((k) => [k, STUB]),
  );
  Bun.plugin({
    name: "agent-sheet-stubs",
    setup(build) {
      for (const id of [
        "@shopify/react-native-skia",
        "react-native",
        "react-i18next",
        "react",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@/ui/theme",
      ])
        build.module(id, () => ({ loader: "object", exports: { default: STUB, ...exports } }));
    },
  });
  const { agentFrame } = await import(`${ROOT}/apps/mobile/src/agent/AgentAvatar.tsx`);
  const { framedByDefault, STILL_T } = await import(`${ROOT}/apps/mobile/src/agent/poses.ts`);
  const { rectsToSvg } = await import(`${ROOT}/apps/mobile/src/agent/recorder.ts`);
  const { light: NATIVE_LIGHT, dark: NATIVE_DARK } = await import(`${ROOT}/packages/tokens/src/index.ts`);
  const ckDir = [
    ...new Glob("node_modules/.bun/canvaskit-wasm@*/node_modules/canvaskit-wasm").scanSync({
      cwd: ROOT,
      onlyFiles: false,
    }),
  ][0];
  if (!ckDir) throw new Error("agent-sheet: canvaskit-wasm not installed in the copy (bun install)");
  const CanvasKitInit = (await import(join(ROOT, ckDir, "bin/canvaskit.js"))).default;
  const CK = await CanvasKitInit({ locateFile: (f: string) => join(ROOT, ckDir, "bin", f) });
  // How AgentAvatar's view sets the tile (border radius and edge), read from the copy so the profile's patches show.
  const avatarSrc = readFileSync(join(ROOT, "apps/mobile/src/agent/AgentAvatar.tsx"), "utf8");
  const radiusExpr = /borderRadius: radius \?\? ([^,\n]+),/.exec(avatarSrc)?.[1] ?? "size * 0.3";
  const edgeExpr = /borderWidth: ([^,\n]+),/.exec(avatarSrc)?.[1] ?? "StyleSheet.hairlineWidth";
  const edgeColorExpr = /borderColor: ([^,\n]+),/.exec(avatarSrc)?.[1] ?? "c.line";
  const evalWith = (expr: string, size: number, c: Record<string, string>) =>
    // The copy's own style expression (trusted: the repository's file, as patched by the profile).
    new Function("size", "StyleSheet", "c", `return (${expr});`)(size, { hairlineWidth: 0.5 }, c);

  const paint = (color: string, stroke?: { width: number; cap: string; join: string }) => {
    const p = new CK.Paint();
    p.setAntiAlias(true);
    p.setColor(CK.parseColorString(color));
    if (stroke) {
      p.setStyle(CK.PaintStyle.Stroke);
      p.setStrokeWidth(stroke.width);
      p.setStrokeCap({ butt: CK.StrokeCap.Butt, round: CK.StrokeCap.Round, square: CK.StrokeCap.Square }[stroke.cap]);
      p.setStrokeJoin(
        { miter: CK.StrokeJoin.Miter, round: CK.StrokeJoin.Round, bevel: CK.StrokeJoin.Bevel }[stroke.join],
      );
    } else p.setStyle(CK.PaintStyle.Fill);
    return p;
  };
  // skia-ctx.ts buildPath, on CanvasKit's PathBuilder (the same Skia path builder).
  // biome-ignore lint/suspicious/noExplicitAny: CanvasKit loads untyped here (no @types in the copy).
  const build = (cmds: any[]) => {
    const p = new CK.PathBuilder();
    for (const c of cmds) {
      if (c.k === "M") p.moveTo(c.x, c.y);
      else if (c.k === "L") p.lineTo(c.x, c.y);
      else if (c.k === "C") p.cubicTo(c.x1, c.y1, c.x2, c.y2, c.x, c.y);
      else if (c.k === "Q") p.quadTo(c.x1, c.y1, c.x, c.y);
      else if (c.k === "Z") p.close();
      else if (c.k === "RR") {
        const [tl, tr, br, bl] = c.r;
        p.addRRect(Float32Array.of(c.x, c.y, c.x + c.w, c.y + c.h, tl, tl, tr, tr, br, br, bl, bl));
      } else if (c.k === "A") {
        const oval = CK.LTRBRect(c.x, c.y, c.x + c.w, c.y + c.h);
        if (Math.abs(c.sweep) >= 360) {
          const half = c.sweep > 0 ? 180 : -180;
          p.arcToOval(oval, c.start, half, false);
          p.arcToOval(oval, c.start + half, half, false);
        } else p.arcToOval(oval, c.start, c.sweep, false);
      }
    }
    return p.detachAndDelete();
  };
  // skia-ctx.ts replay.
  // biome-ignore lint/suspicious/noExplicitAny: CanvasKit loads untyped here (no @types in the copy).
  const replay = (canvas: any, ops: any[]) => {
    for (const op of ops) {
      if (op.op === "save") canvas.save();
      else if (op.op === "restore") canvas.restore();
      else if (op.op === "translate") canvas.translate(op.x, op.y);
      else if (op.op === "scale") canvas.scale(op.x, op.y);
      else if (op.op === "rotate") canvas.rotate(op.degrees, 0, 0);
      else if (op.op === "rects") canvas.drawPath(CK.Path.MakeFromSVGString(rectsToSvg(op.rects)), paint(op.color));
      else if (op.op === "fill") canvas.drawPath(build(op.path), paint(op.color));
      else if (op.op === "stroke") canvas.drawPath(build(op.path), paint(op.color, op));
      else if (op.op === "clip") canvas.clipPath(build(op.path), CK.ClipOp.Intersect, true);
    }
  };
  const MODE: Record<string, string> = {
    idle: "idle",
    thinking: "think",
    writing: "run",
    waiting: "think",
    sleeping: "sleep",
  };
  const SCALE = 2;
  for (const sheet of [...SHEETS, ALL]) {
    const pitch = PITCH(sheet);
    for (const theme of THEMES) {
      const dark = theme === "dark";
      const palette = (dark ? NATIVE_DARK : NATIVE_LIGHT) as Record<string, string>;
      const w = sheet.cols.length * pitch;
      const h = sheet.rows.length * pitch;
      const surface = CK.MakeSurface(w * SCALE, h * SCALE);
      const canvas = surface.getCanvas();
      canvas.clear(CK.parseColorString(PAGE[theme]));
      canvas.scale(SCALE, SCALE);
      sheet.rows.forEach((row, r) => {
        row.cells.forEach((cell, i) => {
          const size = cell.size;
          const tile = framedByDefault(size);
          const ops = agentFrame(
            { color: cell.color, eyes: cell.eyes ?? "round", accessory: cell.accessory ?? "none" },
            size,
            MODE[cell.state ?? "idle"],
            STILL_T,
            1.3,
            true,
            tile ? { dark } : undefined,
            cell.expression,
            dark,
          );
          canvas.save();
          canvas.translate(i * pitch + (pitch - size) / 2, r * pitch + (pitch - size) / 2);
          const radius = tile ? evalWith(radiusExpr, size, palette) : 0;
          if (tile)
            canvas.clipRRect(CK.RRectXY(CK.LTRBRect(0, 0, size, size), radius, radius), CK.ClipOp.Intersect, true);
          replay(canvas, ops);
          canvas.restore();
          if (tile) {
            const edge = evalWith(edgeExpr, size, palette);
            const color = evalWith(edgeColorExpr, size, palette);
            canvas.save();
            canvas.translate(i * pitch + (pitch - size) / 2, r * pitch + (pitch - size) / 2);
            canvas.drawRRect(
              CK.RRectXY(
                CK.LTRBRect(edge / 2, edge / 2, size - edge / 2, size - edge / 2),
                radius - edge / 2,
                radius - edge / 2,
              ),
              paint(color, { width: edge, cap: "butt", join: "miter" }),
            );
            canvas.restore();
          }
        });
      });
      const bytes = surface.makeImageSnapshot().encodeToBytes();
      const cells = join(tmpdir(), `agent-sheet-phone-${sheet.name}-${theme}.png`);
      writeFileSync(cells, bytes);
      // Labels around the Skia picture (CanvasKit has no font here).
      const W = LABEL_W + w + 30;
      const H = h + 70;
      let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="${PAGE[theme]}"/>`;
      svg += `<g font-family="Helvetica, Arial, sans-serif" fill="${INK[theme]}"><text x="16" y="24" font-size="15" font-weight="700">${sheet.title} · celular (Skia) · ${theme}</text>`;
      sheet.cols.forEach((c, i) => {
        svg += `<text x="${LABEL_W + i * pitch + 4}" y="54" font-size="11" opacity=".7">${c}</text>`;
      });
      sheet.rows.forEach((row, r) => {
        svg += `<text x="16" y="${64 + r * pitch + pitch / 2}" font-size="11" opacity=".7">${row.label}</text>`;
      });
      svg += `</g><image x="${LABEL_W}" y="60" width="${w}" height="${h}" href="data:image/png;base64,${Buffer.from(bytes).toString("base64")}"/></svg>`;
      const svgFile = join(tmpdir(), `agent-sheet-phone-${sheet.name}-${theme}.svg`);
      writeFileSync(svgFile, svg);
      const png = join(OUT, `phone-${sheet.name}-${theme}.png`);
      const run = Bun.spawnSync(["rsvg-convert", "-z", String(SCALE), svgFile, "-o", png]);
      if (run.exitCode) throw new Error(`agent-sheet: rsvg-convert failed\n${run.stderr.toString()}`);
      console.log(`agent-sheet: ${png}`);
    }
  }
}

if (only !== "phone") await web();
if (only !== "web") await phone();
