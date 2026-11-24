#!/usr/bin/env bun
/**
 * Applies a brand profile to a COPY of the fork before building (brand/README.md, "build overlay").
 * Never run in the main checkout: use a disposable worktree or copy.
 *
 *   bun brand/apply.ts --src <copy> --profile brand/profiles/<name> [--report <file.json>]
 *
 * Covers the whole project: web, shared i18n, desktop (frontend, Rust, Tauri, Info.plist), mobile (app.config,
 * screens, i18n), emails, push notifications, server and runner text, setup, agent prompts, and app link schemes.
 * Exit codes: 0 on success; 1 if a check fails (changed attribution or technical identifier, unmatched fixed rule,
 * or leftover old scheme).
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { Glob } from "bun";

const args = Object.fromEntries(
  process.argv
    .slice(2)
    // biome-ignore lint/performance/noAccumulatingSpread: Preserve the existing argument parser in this text-only cleanup.
    .reduce<string[][]>((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const SRC = args.src ? resolve(args.src) : "";
const PROFILE = args.profile ? resolve(args.profile) : "";
if (!SRC || !PROFILE)
  throw new Error("Usage: bun brand/apply.ts --src <copy> --profile brand/profiles/<name> [--report <file.json>]");
if (resolve(SRC) === resolve(import.meta.dir, "..")) {
  throw new Error(
    "apply: --src must be a disposable copy, not this repository. Use brand/build.sh to create and brand a copy.",
  );
}
type Profile = {
  name: string;
  scheme?: string;
  ids?: { desktop?: string; mobile?: string };
  mobile?: { slug?: string };
  // Update, download, and sign-in destinations. Required with `scheme`: an app with its own scheme that updates
  // or signs in through upstream becomes the upstream app again (their server returns agenteschat://).
  distribution?: { updater: "off"; downloadUrl: string; defaultServer: string | null };
  mark?: string;
  assets?: Record<string, string>;
  // The built-in agent every member talks to (ADR 0137, "Lodi" upstream): its default name and handle in new
  // workspaces, and every text that names it. Existing workspaces keep the name stored on their agent.
  // `nameStory`: where its name comes from, by language ("en" required; others fall back to it).
  rightHand?: { name: string; handle: string; nameStory?: { en: string } & Record<string, string> };
  // Server env defaults (packages/config/src/schema.ts): variable -> new default, written as the schema's own
  // `.default(...)` value. Each server can still set the variable; this only changes what an unset one means.
  serverDefaults?: Record<string, string | boolean>;
  patches?: Patch[];
  // CSS appended to repo files: repo path -> profile file (a font face, a wordmark weight).
  css?: Record<string, string>;
  // Path (in the profile) of the color tokens: { "light": { "--bg": "#…" }, "dark": { … } }.
  theme?: string;
  // Whole-file replacements: repo path -> the profile's file and the SHA-256 of the upstream file it replaces.
  // A test override (a path under test/) that no longer matches upstream is skipped with a warning: the build does
  // not run tests, and a stale test override must not block a release.
  overrides?: Record<string, { file: string; upstreamSha256: string }>;
};
// `${NAME}` in brand.json is read from the environment (brand/build.sh loads the profile's brand.env, kept out of git):
// values that belong to whoever builds, such as the repository and the app ids, stay out of the profile.
const brandText = readFileSync(join(PROFILE, "brand.json"), "utf8").replace(/\$\{([A-Z][A-Z0-9_]*)\}/g, (_, key) => {
  const value = process.env[key];
  if (!value) throw new Error(`apply: brand.json needs ${key}: set it in the profile's brand.env or the environment`);
  return JSON.stringify(value).slice(1, -1);
});
const brand: Profile = JSON.parse(brandText);
const NAME = brand.name;
// English: "an agentes.chat server" becomes "a Proa server" when the name starts with a consonant sound.
const AN = /^[aeiou]/i.test(NAME)
  ? null
  : new RegExp(`\\b([Aa])n (?=${NAME.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b)`, "g");
const article = (s: string) => (AN ? s.replace(AN, "$1 ") : s);
// English files only: in German and Dutch, "an" is a preposition ("an Proa senden").
const ENGLISH_ONLY = (f: string) =>
  !/locales\/|\.lproj\/|pt-BR|\/(words|messages)\/(?!en\.ts$)|page-words|docker-compose|\.html$|\/help\/pages\.(?!en\.)/.test(
    f,
  );
// Text file language for grammar rules: "fr" in locales/fr.json, pages.fr.ts, words/fr.ts, or fr.lproj.
const langOf = (f: string) => /(?:^|[/.])(fr|it|ko|tr)(?:\.json|\.ts|\.lproj\/)/.exec(f)?.[1];

const report: Record<string, unknown> = {
  profile: PROFILE,
  name: NAME,
  rules: {},
  unresolved: [],
  pending: [],
  desync: [],
  checks: {},
};
const rules = report.rules as Record<string, { total: number; files: Record<string, number> }>;
const pending = report.pending as string[];
let failed = false;
const fail = (msg: string) => {
  failed = true;
  console.error(`apply: FAIL ${msg}`);
};

const files = (patterns: string[], exclude: RegExp[] = []) => {
  const out = new Set<string>();
  for (const p of patterns)
    for (const f of new Glob(p).scanSync({ cwd: SRC })) if (!exclude.some((r) => r.test(f))) out.add(f);
  return [...out].sort();
};
const read = (f: string) => readFileSync(join(SRC, f), "utf8");
const write = (f: string, s: string) => writeFileSync(join(SRC, f), s);
const count = (rule: string, f: string, n: number) => {
  if (!n) return;
  rules[rule] ??= { total: 0, files: {} };
  rules[rule].total += n;
  rules[rule].files[f] = (rules[rule].files[f] ?? 0) + n;
};
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const NOT_BUILT = [/node_modules\//, /\/dist\//, /\/target\//, /\/gen\//];
const TESTS = [
  /\.test\./,
  /\.spec\./,
  /\/test\//,
  /\/tests\//,
  /__tests__\//,
  /__snapshots__\//,
  /\/fixtures\//,
  /\/eval\//,
];

// ---------------------------------------------------------------------------------------------------------------
// Checks: counts that MUST NOT change (technical identifiers and NOTICE 7(b) attribution).
// Preserve invariant labels and attribution patterns verbatim as part of the invariant list.
const INVARIANTS: Record<string, RegExp> = {
  "X-Agentes-*": /X-Agentes-/g,
  "@agenteschat/*": /@agenteschat\//g,
  "chat.agentes/* (meta)": /chat\.agentes\//g,
  "secret-box (info)": /encode\("agentes\.chat secret v1"\)/g,
  "HKDF (salt)": /hkdfSync\("sha256", masterSecret, "agentes\.chat"/g,
  "/api/instance name":
    /z\.literal\("agentes\.chat"\)|name: "agentes\.chat" as const|instance\.name !== "agentes\.chat"|"name":"agentes\.chat"/g,
  "user-agent": /["']?user-agent["']?: "agentes\.chat"|USER_AGENT = "[^"]*agentes\.chat/gi,
  OpenRouter: /"X-OpenRouter-Title": "agentes\.chat"/g,
  "Postgres application_name": /application_name: "agentes\.chat"/g,
  "advisory lock": /agentes\.chat:first-account|agenteschat\.message_partitions/g,
  "marca de assinatura (git)": /SIGNATURE_MARK = "<!-- agentes\.chat -->"/g,
  "host do produto / Cloud": /PRODUCT_HOST = "agentes\.chat"|host === "agentes\.chat"|OFFICIAL_HOSTS/g,
  "origem da importação":
    /agenteschat: "agentes\.chat"|agenteschatName|agenteschat\.bundle|startsWith\("agenteschat:"\)|`agenteschat:\$\{/g,
  "nomes técnicos agenteschat_*": /agenteschat_agentes|agenteschat_events|agenteschat-chat|agenteschat_ensure/g,
  STORAGE_PREFIX: /STORAGE_PREFIX = "agenteschat"/g,
  "MCP agentes": /mcp__agentes__/g,
  "crédito AGENTESCHAT, LLC": /AGENTESCHAT, LLC/g,
  "crédito <site>agentes.chat</site>": /<site>agentes\.chat<\/site>/g,
};
const ALL_SOURCE = files(
  [
    "apps/**/*.{ts,tsx,js,mjs,json,html,rs,toml,plist,strings,nsi,yml}",
    "packages/**/*.{ts,tsx,js,mjs,json,html,sql}",
    "docker-compose.yml",
  ],
  NOT_BUILT,
);
const measure = () => {
  const m: Record<string, number> = {};
  for (const k of Object.keys(INVARIANTS)) m[k] = 0;
  for (const f of ALL_SOURCE) {
    const s = read(f);
    for (const [k, r] of Object.entries(INVARIANTS)) m[k] += s.match(r)?.length ?? 0;
  }
  return m;
};
const before = measure();

// ---------------------------------------------------------------------------------------------------------------
// Translations: loaded BEFORE any replacements (English is the reference for keys).
type I18nSet = { label: string; en: [string, string]; pt: [string, string]; locales: string };
const I18N: I18nSet[] = [
  {
    label: "web",
    en: ["packages/i18n/src/en.ts", "en"],
    pt: ["packages/i18n/src/pt-BR.ts", "ptBR"],
    locales: "packages/i18n/src/locales/*.json",
  },
  {
    label: "desktop",
    en: ["apps/desktop/src/i18n/keys.en.ts", "desktopEn"],
    pt: ["apps/desktop/src/i18n/keys.pt-BR.ts", "desktopPtBR"],
    locales: "apps/desktop/src/i18n/locales/*.json",
  },
  {
    label: "mobile",
    en: ["apps/mobile/src/i18n/keys.en.ts", "mobileEn"],
    pt: ["apps/mobile/src/i18n/keys.pt-BR.ts", "mobilePtBR"],
    locales: "apps/mobile/src/i18n/locales/*.json",
  },
  {
    label: "mobile (screens)",
    en: ["apps/mobile/src/features/i18n/keys.en.ts", "featureKeysEn"],
    pt: ["apps/mobile/src/features/i18n/keys.pt-BR.ts", "featureKeysPtBR"],
    locales: "apps/mobile/src/features/i18n/locales/*.json",
  },
];
type Loc = { file: string; iberian: boolean; obj: unknown };
const loaded: { set: I18nSet; en: Record<string, unknown>; locs: Loc[] }[] = [];
for (const set of I18N) {
  const en = (await import(join(SRC, set.en[0])))[set.en[1]] as Record<string, unknown>;
  const pt = (await import(join(SRC, set.pt[0])))[set.pt[1]];
  if (!en || !pt) {
    fail(`i18n ${set.label}: export ${set.en[1]}/${set.pt[1]} not found`);
    continue;
  }
  const locs: Loc[] = [
    { file: set.en[0], iberian: false, obj: en },
    { file: set.pt[0], iberian: true, obj: pt },
    ...files([set.locales], [/\.source\.json$/]).map((file) => ({
      file,
      iberian: /\/(es|pt[^/]*)\.json$/.test(file),
      obj: JSON.parse(read(file)),
    })),
  ];
  loaded.push({ set, en, locs });
}
// Paths as lists: keys can contain dots ("issue.created"), which an "a.b.c" path would split incorrectly.
const leaves = (o: unknown, path: string[] = [], out: [string[], string][] = []) => {
  if (typeof o === "string") out.push([path, o]);
  else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) leaves(v, [...path, k], out);
  return out;
};
const get = (o: unknown, path: string[]) =>
  path.reduce<unknown>((x, k) => (x && typeof x === "object" ? (x as Record<string, unknown>)[k] : undefined), o);

// Nominative keys refer to upstream itself (feedback, problem reports, and telemetry destinations while configured
// to point there). Keep them unchanged in every language. Cloud plans ("agentes.chat plan") follow the brand name:
// they appear only with billing enabled, and emails must match the screen.
const NOMINATIVE =
  /agentes\.chat team|team's inbox|usage statistics to agentes\.chat|report to agentes\.chat|agentes\.chat didn't (answer|accept)[^.]*\.[^.]*report/;
// Keys kept by name: attribution, "Powered by", import source label, and where upstream Cloud plans are paid.
const KEPT_KEY = /^(basedOn|copyright|poweredBy|agenteschatName|billingWeb)$/;
const protectedLiterals = new Map<string, Set<string>>();
for (const { en, locs } of loaded) {
  const keys = leaves(en)
    .filter(([k, v]) => NOMINATIVE.test(v) || KEPT_KEY.test(k.at(-1) ?? ""))
    .map(([k]) => k);
  for (const loc of locs) {
    const set = protectedLiterals.get(loc.file) ?? new Set<string>();
    for (const k of keys) {
      const v = get(loc.obj, k);
      // A value containing only "agentes.chat" does not protect a line: it would match any line (e.g. `lookOurs`).
      // KEEP_LINE already preserves these keys by matching the key name on the line.
      if (typeof v === "string" && v.trim() !== "agentes.chat") set.add(JSON.stringify(v));
    }
    protectedLiterals.set(loc.file, set);
  }
}
// The build scanner (scan.ts --kept) allows these texts: they intentionally retain "agentes.chat".
const isBareName = (t: string) => /^\s*agentes\.chat\s*$/.test(t);
report.kept = [
  ...new Set([...protectedLiterals.values()].flatMap((set) => [...set].map((lit) => JSON.parse(lit) as string))),
].filter((t) => t.includes("agentes.chat") && !isBareName(t));

// ---------------------------------------------------------------------------------------------------------------
// Fixed rules: each replacement must match exactly once. If upstream changes the text, fail and identify the file
// instead of leaving branding incomplete. Run before pattern rules to match the original text.
const mark = readFileSync(join(PROFILE, brand.mark ?? "assets/mark.svg"), "utf8").trim();
const markUri = `data:image/svg+xml;utf8,${encodeURIComponent(mark)}`;
type Fixed = { file: string; find: RegExp | string; replace: string; rule: string };
const fixed: Fixed[] = [
  // Web and design system: the logo.
  // Keep the original mark exported under another name to avoid unused-import errors without rewriting the upstream
  // component. The exported LogoMark becomes the profile image.
  {
    rule: "logo: original mark renamed",
    file: "packages/ui/src/components/Logo.tsx",
    find: "export function LogoMark({",
    replace: "export function UpstreamLogoMark({",
  },
  {
    rule: "logo: unused domain",
    file: "packages/ui/src/components/Logo.tsx",
    find: 'const TLD = ".chat";',
    replace: 'export const TLD = ".chat";',
  },
  {
    rule: "logo: mark",
    file: "packages/ui/src/components/Logo.tsx",
    find: "\nexport interface LogoProps {",
    replace: `
const BRAND_MARK = ${JSON.stringify(markUri)};

export function LogoMark({ size, className, label }: { size?: number; className?: string; label?: string; sky?: SkyPair }) {
  return (
    <img
      src={BRAND_MARK}
      alt={label ?? ""}
      className={cx("ac-logo__mark", className)}
      style={size ? { width: size, height: size } : undefined}
      aria-hidden={label ? undefined : true}
    />
  );
}

export interface LogoProps {`,
  },
  {
    rule: "logo: expanded wordmark",
    file: "packages/ui/src/components/Logo.tsx",
    find: '<span>agentes</span>\n          <span className="ac-logo__chat">{TLD}</span>',
    replace: `<span>${NAME}</span>`,
  },
  {
    rule: "logo: wordmark",
    file: "packages/ui/src/components/Logo.tsx",
    find: '<span aria-hidden="true">agentes</span>',
    replace: `<span aria-hidden="true">${NAME}</span>`,
  },
  {
    rule: "logo: accessible name",
    file: "packages/ui/src/components/Logo.tsx",
    find: 'aria-label={expanded ? "agentes.chat" : "agentes"}',
    replace: `aria-label=${JSON.stringify(NAME)}`,
  },
  // OAuth client name on the consent screen, on retry (the provider accepts only letters, digits, hyphens, and spaces).
  {
    rule: "OAuth: name without punctuation",
    file: "packages/engine/src/connectors/oauth-mcp.ts",
    find: 'register("agentes chat")',
    replace: `register(${JSON.stringify(NAME.replace(/[^\w -]/g, " ").trim())})`,
  },
  // Server error page: the wordmark beside the symbol.
  {
    rule: "error page: name",
    file: "apps/server/src/http/error-page.ts",
    find: 'role="img" aria-label="agentes"',
    replace: `role="img" aria-label=${JSON.stringify(NAME)}`,
  },
  {
    rule: "error page: wordmark",
    file: "apps/server/src/http/error-page.ts",
    find: '</svg><span aria-hidden="true">agentes</span></span>',
    replace: `</svg><span aria-hidden="true">${NAME}</span></span>`,
  },
  // Emails: logo alt text (the image comes from the profile).
  {
    rule: "email: logo alt text",
    file: "packages/engine/src/email/layout.ts",
    find: 'alt: "agentes.chat" } as const;',
    replace: `alt: ${JSON.stringify(NAME)} } as const;`,
  },
  // Desktop: main window title and cover wordmark.
  {
    rule: "desktop: title",
    file: "apps/desktop/index.html",
    find: "<title>agentes</title>",
    replace: `<title>${NAME}</title>`,
  },
  {
    rule: "desktop: cover wordmark",
    file: "apps/desktop/cover.html",
    find: ">agentes<span>.chat</span></p>",
    replace: `>${NAME}</p>`,
  },
  // Mobile: app name and splash wordmark.
  {
    rule: "mobile: app name",
    file: "apps/mobile/app.config.ts",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: Match the source template literally, without interpolation.
    find: 'name: variant === "production" ? "agentes" : `agentes ${variant}`',
    replace: `name: variant === "production" ? ${JSON.stringify(NAME)} : \`${NAME} \${variant}\``,
  },
  {
    rule: "mobile: splash wordmark",
    file: "apps/mobile/src/features/launch/LaunchSplash.tsx",
    find: /(\n\s*)agentes\n\s*<RNText allowFontScaling=\{false\} style=\{styles\.dot\}>\n\s*\.chat\n\s*<\/RNText>/,
    replace: `$1${NAME}`,
  },
];
if (brand.scheme) {
  const s = brand.scheme;
  fixed.push(
    {
      rule: "scheme: desktop (Rust)",
      file: "apps/desktop/src-tauri/src/deep_link.rs",
      find: 'pub const SCHEME: &str = "agenteschat";',
      replace: `pub const SCHEME: &str = "${s}";`,
    },
    {
      rule: "scheme: desktop (Tauri)",
      file: "apps/desktop/src-tauri/tauri.conf.json",
      find: '"schemes": ["agenteschat"]',
      replace: `"schemes": ["${s}"]`,
    },
    {
      rule: "scheme: mobile (Expo)",
      file: "apps/mobile/app.config.ts",
      find: 'scheme: "agenteschat",',
      replace: `scheme: "${s}",`,
    },
    {
      rule: "scheme: mobile (config)",
      file: "apps/mobile/src/config.ts",
      find: 'export const SCHEME = "agenteschat";',
      replace: `export const SCHEME = "${s}";`,
    },
    {
      rule: "scheme: desktop (argument)",
      file: "apps/desktop/src-tauri/src/deep_link.rs",
      find: 'a.starts_with("agenteschat:")',
      replace: `a.starts_with("${s}:")`,
    },
  );
  const d = brand.distribution;
  if (!d)
    fail(
      "profile has scheme but no distribution (updater, downloadUrl, defaultServer): the app would update and sign in through upstream",
    );
  else {
    fixed.push(
      // Updates disabled, as in the fork release: the endpoint does not respond and the version check finds nothing.
      {
        rule: "desktop: updates disabled (Tauri)",
        file: "apps/desktop/src-tauri/tauri.conf.json",
        find: /"https:\/\/app\.agentes\.chat\/api\/desktop\/update\?[^"]*"/,
        replace: '"https://127.0.0.1:9/updates-disabled"',
      },
      {
        rule: "desktop: version check disabled",
        file: "apps/desktop/src/control/version.ts",
        find: "export const SITE_URL = CLOUD_SERVER;",
        replace:
          'export const UPSTREAM_SITE_URL = CLOUD_SERVER;\nexport const SITE_URL: string = "https://127.0.0.1:9";',
      },
      {
        rule: "app download",
        file: "packages/i18n/src/docs.ts",
        // biome-ignore lint/suspicious/noTemplateCurlyInString: Match the source template literally, without interpolation.
        find: "export const DOWNLOAD_URL = `${DOCS_SITE}/download`;",
        replace: `export const DOWNLOAD_URL = ${JSON.stringify(d.downloadUrl)};`,
      },
      {
        rule: "mobile: default server",
        file: "apps/mobile/app.config.ts",
        find: 'const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? "https://app.agentes.chat";',
        replace: d.defaultServer
          ? `const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? ${JSON.stringify(d.defaultServer)};`
          : // No default server: the app asks for one on its first screen (local/mobile-ask-server), unless the build sets one.
            'const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? "";',
      },
      {
        rule: "mobile: default server (EAS)",
        file: "apps/mobile/eas.json",
        find: /"env": \{\s*"EXPO_PUBLIC_API_URL": "https:\/\/app\.agentes\.chat"\s*\}/,
        replace: `"env": { "EXPO_PUBLIC_API_URL": ${JSON.stringify(d.defaultServer ?? "")} }`,
      },
    );
    if (d.updater === "off")
      pending.push("distribution: desktop automatic updates disabled (new version = download from downloadUrl)");
  }
  pending.push(
    "distribution: install.sh and npx @agenteschat/setup install the upstream server (ghcr.io/agentes-chat image; override with AGENTES_IMAGE)",
    "distribution: the 'agentes.chat Cloud' option on desktop and mobile opens their server, which returns agenteschat:// (social login and connectors do not return to the app)",
  );
} else pending.push("profile has no scheme: the app keeps agenteschat://");
if (brand.rightHand)
  fixed.push(
    {
      rule: "right hand: handle",
      file: "packages/engine/src/right-hand.ts",
      find: 'handle: "lodi",',
      replace: `handle: ${JSON.stringify(brand.rightHand.handle)},`,
    },
    {
      // The apps' own copy of its default look, shown before the workspace's row loads (onboarding).
      rule: "right hand: name (apps)",
      file: "packages/client/src/lib/right-hand.ts",
      find: 'name: "Lodi",',
      replace: `name: ${JSON.stringify(brand.rightHand.name)},`,
    },
  );
// Where the right hand's name comes from: the upstream one tells lodestar's story, which a renamed one must not.
// With `nameStory` the profile tells its own (English for the languages it doesn't list); without it, none is told.
if (brand.rightHand) {
  const story = brand.rightHand.nameStory;
  if (!story)
    fixed.push({
      rule: "right hand: no upstream name story",
      file: "packages/client/src/lib/right-hand.ts",
      find: "isRightHand(agent) && agent?.name === RIGHT_HAND_DEFAULT.name;",
      replace: "false && isRightHand(agent) && agent?.name === RIGHT_HAND_DEFAULT.name;",
    });
  else {
    fixed.push(
      {
        rule: "right hand: name story (en)",
        file: "packages/i18n/src/en.ts",
        find: /nameStory: "The name comes from lodestar[^"\n]*",/,
        replace: `nameStory: ${JSON.stringify(story.en)},`,
      },
      {
        rule: "right hand: name story (pt-BR)",
        file: "packages/i18n/src/pt-BR.ts",
        find: /nameStory: "O nome vem de lodestar[^"\n]*",/,
        replace: `nameStory: ${JSON.stringify(story["pt-BR"] ?? story.en)},`,
      },
    );
    for (const file of readdirSync(join(SRC, "packages/i18n/src/locales")).filter(
      (f) => f.endsWith(".json") && !f.endsWith(".source.json"),
    ))
      fixed.push({
        rule: `right hand: name story (${file})`,
        file: `packages/i18n/src/locales/${file}`,
        find: /"nameStory": "(?:[^"\\\n]|\\.)*"/,
        replace: `"nameStory": ${JSON.stringify(story[file.replace(/\.json$/, "")] ?? story.en)}`,
      });
  }
}
if (brand.ids?.desktop) {
  fixed.push(
    {
      rule: "id: desktop (Tauri)",
      file: "apps/desktop/src-tauri/tauri.conf.json",
      find: '"identifier": "chat.agentes.desktop"',
      replace: `"identifier": "${brand.ids.desktop}"`,
    },
    {
      rule: "id: desktop (Linux)",
      file: "apps/desktop/src-tauri/src/graphics.rs",
      find: 'const IDENTIFIER: &str = "chat.agentes.desktop";',
      replace: `const IDENTIFIER: &str = "${brand.ids.desktop}";`,
    },
  );
} else
  pending.push("profile has no ids.desktop: desktop keeps chat.agentes.desktop (TRADEMARKS requires a separate ID)");
if (brand.ids?.mobile) {
  const quoted = read("apps/mobile/app.config.ts").includes('"chat.agentes.app"');
  fixed.push({
    rule: "id: mobile",
    file: "apps/mobile/app.config.ts",
    find: quoted ? '"chat.agentes.app"' : /chat\.agentes\.app(?=\$\{suffix\}`)/g,
    replace: quoted ? `"${brand.ids.mobile}"` : brand.ids.mobile,
  });
} else pending.push("profile has no ids.mobile: mobile uses APP_ID from the environment or chat.agentes.app");
if (brand.mobile?.slug)
  fixed.push({
    rule: "mobile: slug (EAS)",
    file: "apps/mobile/app.config.ts",
    find: 'slug: "agentes",',
    replace: `slug: "${brand.mobile.slug}",`,
  });
else pending.push("profile has no mobile.slug: the EAS slug remains agentes");

for (const r of fixed) {
  if (!existsSync(join(SRC, r.file))) {
    fail(`rule "${r.rule}": ${r.file} does not exist`);
    continue;
  }
  const s = read(r.file);
  const many = r.find instanceof RegExp && r.find.flags.includes("g");
  const n =
    typeof r.find === "string" ? s.split(r.find).length - 1 : (s.match(new RegExp(r.find.source, "g"))?.length ?? 0);
  if (!n || (!many && n !== 1)) {
    fail(`rule "${r.rule}" matched ${n} times in ${r.file} (expected ${many ? "≥1" : 1})`);
    continue;
  }
  write(r.file, typeof r.find === "string" ? s.split(r.find).join(r.replace) : s.replace(r.find, r.replace));
  count(r.rule, r.file, n);
}

// ---------------------------------------------------------------------------------------------------------------
// Pattern rule 1: standalone "agentes" as the product name in translations (web, desktop, mobile).
// English is the reference: a key with standalone "agentes" in English refers to the product (the common English
// word is "agents"). Replace the same key's value in other languages. In Portuguese and Spanish, "agentes" is also
// a common word: replace it only after a singular article/preposition ("o agentes", "no agentes", "el agentes"),
// "app", or a quotation mark, or when the entire value is "agentes".
const BARE = /(?<![\w./@-])agentes(?![\w./@:-])/g;
const IBERIAN_BARE =
  /(?<=(?:^|(?:^|\s)(?:o|O|no|No|do|Do|ao|Ao|pelo|num|el|El|del|al|en|Ir a|app|app de|aplicativo|aplicación|aplicación de|Abrir|abrir|Abra|Abre|Atualize|atualize|Actualiza|actualiza)\s|[“"«]))agentes(?![\w./@:-])/g;
// Keys where "agentes" is a technical identifier, not a display name: the registered MCP server is named "agentes"
// (mcp__agentes__* tools), so the instruction to select "agentes" must keep that name. Preserve matched keys verbatim.
const TECHNICAL_KEYS = new Set(["apps.dialog.claudeCode.step2", "apps.consent.error.app_desconhecidoText"]);
report.technicalKeys = [...TECHNICAL_KEYS];
const bareKeys: Record<string, string[]> = {};
for (const { set, en, locs } of loaded) {
  const keys = leaves(en)
    .filter(([k, v]) => new RegExp(BARE.source).test(v) && !TECHNICAL_KEYS.has(k.join(".")))
    .map(([k]) => k);
  bareKeys[set.label] = keys.map((k) => k.join(" › "));
  for (const loc of locs) {
    let s = read(loc.file);
    let n = 0;
    const done = new Set<string>();
    for (const key of keys) {
      const v = get(loc.obj, key);
      if (typeof v !== "string") {
        if (loc.file === set.en[0])
          (report.unresolved as string[]).push(`${loc.file} ${key.join(" › ")}: key not found`);
        continue;
      }
      const nv = loc.iberian
        ? v.trim() === "agentes"
          ? v.replace("agentes", NAME)
          : v.replace(IBERIAN_BARE, NAME)
        : loc.file === set.en[0]
          ? article(v.replace(BARE, NAME))
          : v.replace(BARE, NAME);
      if (nv === v) {
        if (new RegExp(BARE.source).test(v))
          (report.unresolved as string[]).push(`${loc.file} ${key.join(" › ")}: ${v.slice(0, 90)}`);
        continue;
      }
      const lit = JSON.stringify(v);
      if (done.has(lit)) continue;
      // Match only values (after ":" or at the start of a wrapped long value), never key names.
      const at = new RegExp(`(?<=(?::\\s*|^\\s*))${esc(lit)}(?!\\s*:)`, "gm");
      const hits = s.match(at)?.length ?? 0;
      if (!hits) {
        (report.unresolved as string[]).push(`${loc.file} ${key.join(" › ")}: value not found in file`);
        continue;
      }
      s = s.replace(at, () => JSON.stringify(nv));
      done.add(lit);
      n += hits;
    }
    if (n) write(loc.file, s);
    count("name: agentes (standalone)", loc.file, n);
  }
}
report.bareKeys = bareKeys;

// ---------------------------------------------------------------------------------------------------------------
// Pattern rule 2: "agentes.chat" as the product name, line by line, in files users see or agents read.
// Excludes URLs and domains (app.agentes.chat, https://agentes.chat/...), emails, comments, attribution, copyright,
// "Powered by", upstream Cloud, actual upstream references (feedback, reports, telemetry, plans), and technical
// identifiers (user-agent, application_name, Postgres locks, signature marks, etc.).
// Also excludes API descriptions (OpenAPI) in apps/server/src/routes and variable documentation (packages/config).
const TEXT = files(
  [
    // Web and shared code
    "packages/i18n/src/*.ts",
    "packages/i18n/src/help/*.ts",
    "packages/i18n/src/locales/*.json",
    "packages/ui/src/**/*.{ts,tsx}",
    "packages/client/src/lib/app-clients*.ts",
    "packages/client/src/lib/import/*.ts",
    "apps/web/*.html",
    "apps/web/public/*.{html,js}",
    "apps/web/src/**/*.{ts,tsx}",
    // Desktop
    "apps/desktop/*.html",
    "apps/desktop/src/**/*.{ts,tsx}",
    "apps/desktop/src/i18n/locales/*.json",
    "apps/desktop/src-tauri/tauri.conf.json",
    "apps/desktop/src-tauri/Cargo.toml",
    "apps/desktop/src-tauri/Info.plist",
    "apps/desktop/src-tauri/locales/*.lproj/InfoPlist.strings",
    "apps/desktop/src-tauri/src/**/*.rs",
    // Mobile
    "apps/mobile/app/**/*.{ts,tsx}",
    "apps/mobile/src/**/*.{ts,tsx}",
    "apps/mobile/src/i18n/locales/*.json",
    "apps/mobile/src/features/i18n/locales/*.json",
    // Emails, push notifications, agent prompts, and engine messages
    "packages/engine/src/**/*.ts",
    "packages/adapters/src/**/*.ts",
    // Server (visible text), runner, and setup
    "apps/server/src/{app,auth,native,start}.ts",
    "apps/server/src/http/*.ts",
    "apps/server/src/surface/*.ts",
    "apps/server/src/operator/app.ts",
    "apps/server/src/routes/**/*.ts",
    "apps/server/runner/**/*.ts",
    "packages/setup/src/*.ts",
    "packages/setup/package.json",
    "packages/config/src/index.ts",
    "docker-compose.yml",
    "install.sh",
  ],
  [/\.source\.json$/, ...TESTS, ...NOT_BUILT],
);
// Also replace comments in files shipped as-is to installers (the installer and compose), and term-sh.ts,
// which a test keeps identical to the snippet embedded in install.sh.
const FULL = new Set(["install.sh", "docker-compose.yml", "packages/setup/src/term-sh.ts"]);
// A hyphen followed by a letter after the name forms a compound ("agentes.chat-App", "-Konto"), not a domain.
const PRODUCT = /(?<![\w./@-])agentes\.chat(?![\w/]|-(?![\p{L}]))/gu;
// Comments by file type: in .ts/.tsx/.js, a line with "#" occurs only inside a string (embedded shell).
const COMMENT_BY_EXT: [RegExp, RegExp][] = [
  [/\.(ts|tsx|js|mjs|rs)$/, /^\s*(\/\/|\*|\/\*)/],
  [/\.(ya?ml|sh|toml)$/, /^\s*#(?!!)/],
  [/\.nsi$/, /^\s*;/],
  [/\.(html|plist)$/, /^\s*<!--/],
  [/\.strings$/, /^\s*(\/\/|\/\*)/],
];
const isComment = (f: string, line: string) => COMMENT_BY_EXT.some(([ext, c]) => ext.test(f) && c.test(line));
// biome-ignore lint/correctness/noUnusedVariables: Preserve the existing regex unchanged in this text-only cleanup.
const COMMENT = /^\s*(\/\/|\*|\/\*|#(?![![{])|;|<!--)/;
// API descriptions (OpenAPI) in apps/server/src/routes are documentation and retain the upstream name.
// Error messages in those routes (shown in the app) follow the replacements.
const isRouteDoc = (f: string, line: string, prev: string) =>
  f.startsWith("apps/server/src/routes/") &&
  (/\b(description|summary)\s*:/.test(line) || /\b(description|summary)\s*:\s*$/.test(prev));
const KEEP_LINE = new RegExp(
  [
    // Attribution, nominative references, upstream Cloud
    "basedOn|copyright|AGENTESCHAT|poweredBy|Powered by agentes\\.chat|agentes\\.chat Cloud|CLOUD_SERVER|serversCloud|server_name\\(|Acme · agentes\\.chat", // Last pattern: Rust test in workspaces.rs, Cloud label; preserve matched fixture text.
    "agentes\\.chat team|team's inbox|usage statistics to agentes|usage statistics: sent to agentes|agentes\\.chat anonymous usage statistics|TELEMETRY|telemetry|problem report|FEEDBACK",
    // Import source (the file exported by agentes.chat)
    'agenteschat: "agentes\\.chat"|agenteschatName',
    // Technical identifiers
    "user-agent|User-Agent|USER_AGENT|HTTP-Referer|X-OpenRouter|application_name|advisory|secret v1|hkdf|SIGNATURE_MARK|PRODUCT_HOST|OFFICIAL_HOSTS",
    'z\\.literal|name: "agentes\\.chat" as const|[!=]== ?["`]agentes\\.chat["`]|"\\.agentes\\.chat"|DEVICE_NAME|INTEGRATION_NAME|"name":\\s*"agentes\\.chat"|^\\s*name: "agentes\\.chat",?\\s*$|storage check',
  ].join("|"),
);
// Texts intentionally retaining "agentes.chat" on preserved lines, for the build scanner to recognize.
// Exclude bare "agentes.chat" (it would allow any leftover): technical uses have their own patterns in scan.ts.
const keptTexts = new Set<string>();
const keepLiterals = (line: string) => {
  for (const m of line.matchAll(/"((?:[^"\\]|\\.)*)"|`([^`]*)`|'((?:[^'\\]|\\.)*)'/g)) {
    let t = m[1] ?? m[2] ?? m[3] ?? "";
    if (m[1] !== undefined) {
      try {
        t = JSON.parse(`"${m[1]}"`);
      } catch {}
    }
    for (const part of t.split(/\$\{[^}]*\}/))
      if (new RegExp(PRODUCT.source, "u").test(part) && !isBareName(part)) keptTexts.add(part);
  }
};
// Variable documentation intentionally stays in English with the upstream name (routes: see isRouteDoc).
for (const f of files(["packages/config/src/schema.ts"], [...TESTS, ...NOT_BUILT]))
  for (const line of read(f).split("\n")) if (!isComment(f, line)) keepLiterals(line);
// Grammar affected by the name: French and Italian elision (d'agentes.chat -> de Proa), Korean particles (depending
// on a vowel ending), and Turkish suffixes (vowel harmony). Only in that language's files, adjacent to the name.
const N = esc(NAME);
const vowelStart = /^[aeiouhàâéèêîôûAEIOUH]/.test(NAME);
const vowelEnd = /[aeiouy]$/i.test(NAME);
const trLast = [...NAME.toLowerCase()].reverse().find((c) => "aeıioöuü".includes(c)) ?? "e";
const trBack = "aıou".includes(trLast);
const I4 = { a: "ı", ı: "ı", o: "u", u: "u", e: "i", i: "i", ö: "ü", ü: "ü" }[trLast] ?? "i";
const A2 = trBack ? "a" : "e";
const trHard = /[fstkçşhp]$/i.test(NAME);
const D = trHard ? "t" : "d";
const TR: Record<string, string> = vowelEnd
  ? {
      i: `y${I4}`,
      ı: `y${I4}`,
      e: `y${A2}`,
      a: `y${A2}`,
      in: `n${I4}n`,
      ın: `n${I4}n`,
      iniz: `n${I4}z`,
      ınız: `n${I4}z`,
    }
  : { i: I4, ı: I4, e: A2, a: A2, in: `${I4}n`, ın: `${I4}n`, iniz: `${I4}n${I4}z`, ınız: `${I4}n${I4}z` };
for (const loc of ["te", "de", "ta", "da"]) TR[loc] = `${D}${A2}`;
for (const abl of ["ten", "den", "tan", "dan"]) TR[abl] = `${D}${A2}n`;
for (const k of ["teki", "deki", "taki", "daki"]) TR[k] = `${D}${A2}ki`;
const KO: Record<string, string> = vowelEnd
  ? { 을: "를", 은: "는", 과: "와", 으로: "로", 이: "가" }
  : { 를: "을", 는: "은", 와: "과", 로: "으로", 가: "이" };
const FR_ELIDED: Record<string, string> = {
  d: "de",
  D: "De",
  qu: "que",
  Qu: "Que",
  l: "le",
  L: "Le",
  j: "je",
  J: "Je",
  s: "se",
};
const IT_ELIDED: Record<string, string> = {
  d: "di",
  D: "Di",
  l: "il",
  L: "Il",
  all: "a",
  All: "A",
  dell: "di",
  Dell: "Di",
  nell: "in",
  Nell: "In",
  dall: "da",
  Dall: "Da",
  sull: "su",
  Sull: "Su",
};
const grammar = (f: string, text: string) => {
  const lang = langOf(f);
  let n = 0;
  let out = text;
  if ((lang === "fr" || lang === "it") && !vowelStart) {
    const map = lang === "fr" ? FR_ELIDED : IT_ELIDED;
    out = out.replace(
      new RegExp(`(?<![\\p{L}])(${Object.keys(map).join("|")})['’](?=${N}(?![\\p{L}]))`, "gu"),
      // biome-ignore lint/complexity/noCommaOperator: Preserve the existing replacement counter and return value.
      (_m, w: string) => (n++, `${map[w]} `),
    );
  }
  if (lang === "ko")
    out = out.replace(new RegExp(`(?<=${N})(으로|을|를|은|는|과|와|로|이|가)(?=[\\s.,!?)"'’”<]|$)`, "gmu"), (m) =>
      // biome-ignore lint/complexity/noCommaOperator: Preserve the existing replacement counter and return value.
      KO[m] ? (n++, KO[m]) : m,
    );
  if (lang === "tr")
    out = out.replace(
      new RegExp(
        `(?<=${N})['’](iniz|ınız|teki|deki|taki|daki|ten|den|tan|dan|in|ın|te|de|ta|da|i|ı|e|a)(?![\\p{L}])`,
        "gu",
      ),
      // biome-ignore lint/complexity/noCommaOperator: Preserve the existing replacement counter and return value.
      (m, sfx: string) => (TR[sfx] ? (n++, `${m[0]}${TR[sfx]}`) : m),
    );
  count("name grammar", f, n);
  return out;
};
const changedLiterals = new Map<string, string>(); // original literal -> file (for the mismatch check)
let rhCount = 0;
for (const f of TEXT) {
  const s = read(f);
  const prot = protectedLiterals.get(f);
  let n = 0;
  const lines = s.split("\n");
  const out = lines
    .map((line, i) => {
      if (
        KEEP_LINE.test(line) ||
        (prot && [...prot].some((lit) => line.includes(lit))) ||
        isRouteDoc(f, line, lines[i - 1] ?? "")
      ) {
        keepLiterals(line);
        return line;
      }
      if (!FULL.has(f) && isComment(f, line)) return line;
      const before = n;
      // The Mac app follows productName ("/Applications/Proa.app"), as does the standalone runner name ("agentes runner").
      line = line
        // biome-ignore lint/complexity/noCommaOperator: Preserve the existing replacement counter and return value.
        .replaceAll("/Applications/agentes.chat.app", () => (n++, `/Applications/${NAME}.app`))
        // biome-ignore lint/complexity/noCommaOperator: Preserve the existing replacement counter and return value.
        .replace(/(?<![\w./@-])agentes runner\b/g, () => (n++, `${NAME} runner`));
      if (brand.ids?.desktop)
        // biome-ignore lint/complexity/noCommaOperator: Preserve the existing replacement counter and return value.
        line = line.replace(/(?<![\w.])chat\.agentes\.desktop(?![\w])/g, () => (n++, brand.ids?.desktop ?? ""));
      if (brand.rightHand) {
        const rh = brand.rightHand;
        line = line
          .replace(/(?<![\w@])Lodi(?![\w])/g, () => {
            rhCount++;
            return rh.name;
          })
          .replace(/@lodi\b/g, () => {
            rhCount++;
            return `@${rh.handle}`;
          });
      }
      const next = line.replace(PRODUCT, (_m, at: number) => {
        n++;
        // Capture the changed surrounding literal (quotes/backticks); an unchanged copy elsewhere suggests a mismatch.
        // The apostrophe in "isn't" does not open a literal.
        const apos = line.lastIndexOf("'", at - 1);
        const open = Math.max(
          line.lastIndexOf('"', at - 1),
          line.lastIndexOf("`", at - 1),
          apos > 0 && /\w/.test(line[apos - 1]) ? -1 : apos,
        );
        const q = open >= 0 ? line[open] : "";
        const close = q ? line.indexOf(q, at + 12) : -1;
        if (open >= 0 && close > 0) {
          const lit = line.slice(open, close + 1);
          if (lit !== `${q}agentes.chat${q}` && lit.length <= 80 && !lit.includes("${") && !lit.includes("{{"))
            changedLiterals.set(lit, f);
        }
        return NAME;
      });
      return n > before && ENGLISH_ONLY(f) ? article(next) : next;
    })
    .join("\n");
  if (n || rhCount) write(f, grammar(f, out));
  count("name: agentes.chat", f, n);
  if (rhCount) count("right hand name", f, rhCount);
  rhCount = 0;
}

// ---------------------------------------------------------------------------------------------------------------
// Pattern rule 3: app link scheme (agenteschat://) throughout the code, including the server (which generates OAuth,
// QR code, and Live Activity return links). Leave the import source (`agenteschat:${org}`) unchanged.
const SCHEME_USE = /\bagenteschat(?=:(?:\/\/|\\\/\\\/))/g;
// Check with a different expression from the replacement: any "agenteschat:/" or escaped slash, and scheme
// declarations (SCHEME, schemes, scheme:) retaining the old value.
const SCHEME_LEFT =
  /agenteschat:(?:\/|\\\/)|(?:SCHEME[^=\n]*=|"schemes":\s*\[|scheme:)\s*"agenteschat"|starts_with\("agenteschat:"\)/g;
if (brand.scheme) {
  for (const f of ALL_SOURCE) {
    const s = read(f);
    const n = s.match(SCHEME_USE)?.length ?? 0;
    if (!n) continue;
    write(f, s.replace(SCHEME_USE, brand.scheme));
    count("link scheme", f, n);
  }
  let left = 0;
  for (const f of ALL_SOURCE) left += read(f).match(SCHEME_LEFT)?.length ?? 0;
  (report.checks as Record<string, unknown>)["old scheme leftovers"] = left;
  if (left) fail(`scheme agenteschat:// still appears ${left} times`);
}

// ---------------------------------------------------------------------------------------------------------------
// Mismatch check: a name literal changed in one file but unchanged in another (outside tests) may be compared at
// runtime (a title to look up or a name to check). Include it in the report.
const CODE = ALL_SOURCE.filter((f) => !TESTS.some((r) => r.test(f)) && !/\.source\.json$/.test(f));
const contents = new Map(CODE.map((f) => [f, read(f)]));
for (const [lit, from] of changedLiterals) {
  for (const [f, s] of contents) {
    if (!s.includes(lit)) continue;
    if (s.split("\n").some((line) => line.includes(lit) && !isComment(f, line)))
      (report.desync as string[]).push(`${lit} (changed in ${from}, kept in ${f})`);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Outside the rules: non-test code files still saying "agentes.chat" outside comments, absent from TEXT.
// New upstream directories appear here. Intentionally excluded: variable documentation, Cloud legal text,
// and maintenance scripts.
const BY_DESIGN = [
  /^packages\/config\/src\/schema\.ts$/,
  /^apps\/desktop\/src-tauri\/capabilities\//,
  /^packages\/i18n\/glossary\.json$/,
  /^packages\/i18n\/src\/legal\//,
  /^scripts\//,
  /^apps\/server\/scripts\//,
  /\.source\.json$/,
  /^packages\/db\/migrations\//,
];
const inText = new Set(TEXT);
const outside: Record<string, number> = {};
for (const [f, s] of contents) {
  if (inText.has(f) || BY_DESIGN.some((r) => r.test(f))) continue;
  const hits = s
    .split("\n")
    .filter(
      (line) => !isComment(f, line) && !KEEP_LINE.test(line) && new RegExp(PRODUCT.source, "u").test(line),
    ).length;
  if (hits) outside[f] = hits;
}
report.outside = outside;

// ---------------------------------------------------------------------------------------------------------------
// Assets (copied by path). Missing profile assets are listed as pending.
const WANTED = [
  "apps/web/public/favicon.svg",
  "apps/web/public/favicon.ico",
  "apps/web/public/apple-touch-icon.png",
  "apps/web/public/icon-512.png",
  "apps/web/public/og.png",
  "apps/web/public/push-badge.png",
  "apps/web/public/email/logo-ink.png",
  "apps/web/public/email/logo-ink-tile.png",
  "apps/web/public/email/logo-bone.png",
  "apps/web/public/email/mark.png",
  "apps/mobile/assets/images/splash-icon.png",
  "apps/mobile/assets/images/notification-icon.png",
];
for (const target of WANTED) {
  const from = brand.assets?.[target];
  if (!from) {
    pending.push(`asset: ${target}`);
    continue;
  }
  mkdirSync(dirname(join(SRC, target)), { recursive: true });
  copyFileSync(join(PROFILE, from), join(SRC, target));
  count("asset copied", target, 1);
}
if (brand.serverDefaults) {
  const SCHEMA = "packages/config/src/schema.ts";
  let s = read(SCHEMA);
  for (const [name, value] of Object.entries(brand.serverDefaults)) {
    const start = s.indexOf(`\n  ${name}: {`);
    const end = start < 0 ? -1 : s.indexOf("\n  },", start);
    const at = start < 0 ? -1 : s.indexOf(".default(", start);
    if (start < 0 || at < 0 || at > end) {
      fail(`server default: ${name} not found in ${SCHEMA}`);
      continue;
    }
    // The default's argument: up to the matching parenthesis.
    let depth = 0;
    let close = at + ".default".length;
    for (; close < s.length; close++) {
      if (s[close] === "(") depth++;
      else if (s[close] === ")" && --depth === 0) break;
    }
    s = `${s.slice(0, at)}.default(${JSON.stringify(value)}${s.slice(close)}`;
    count("server default", `${SCHEMA} ${name}`, 1);
  }
  write(SCHEMA, s);
}

// Any other asset the profile maps (fonts, extra images) is copied too; "_" keys are the profile's own.
for (const [target, from] of Object.entries(brand.assets ?? {})) {
  if (target.startsWith("_") || WANTED.includes(target)) continue;
  mkdirSync(dirname(join(SRC, target)), { recursive: true });
  copyFileSync(join(PROFILE, from), join(SRC, target));
  count("asset copied", target, 1);
}
for (const [target, from] of Object.entries(brand.css ?? {})) {
  if (!existsSync(join(SRC, target))) {
    fail(`css: ${target} no longer exists upstream`);
    continue;
  }
  write(target, `${read(target).trimEnd()}\n${readFileSync(join(PROFILE, from), "utf8")}`);
  count("css appended", target, 1);
}
pending.push(
  "generated artwork: mobile icons (apps/mobile/assets/app-icons, plugins/with-app-icons.js, ADR 0179)",
  "generated artwork: desktop icon and tray (apps/desktop/scripts/icons.ts)",
  "generated artwork: desktop dmg and installer with the agentes.chat wordmark (scripts/dmg-art.ts, installer-art.ts, pixel-art.ts)",
  "artwork: 'agentes' mascot on sign-in screens (AgentAvatar/BrandFace) and error page mark",
);

// ---------------------------------------------------------------------------------------------------------------
// Theme: color tokens from the profile's theme file ({ "light": { "--bg": "#…" }, "dark": { … } }).
// tokens.css has two copies kept equal by a test (packages/ui/test/design-source.test.ts), and the phone reads the
// same values from packages/tokens/src/index.ts (packages/tokens/test/tokens.test.ts): all three change together.
if (brand.theme) {
  const theme: {
    light?: Record<string, string>;
    dark?: Record<string, string>;
    replaceHex?: Record<string, string>;
    replaceHexIn?: string[];
  } = JSON.parse(readFileSync(join(PROFILE, brand.theme), "utf8"));
  const BLOCKS = { light: ':root,\n[data-theme="light"] {', dark: '[data-theme="dark"] {' } as const;
  for (const css of ["docs/design/design-system/tokens.css", "packages/ui/src/styles/tokens.css"]) {
    let s = read(css);
    for (const mode of ["light", "dark"] as const) {
      const start = s.indexOf(BLOCKS[mode]);
      const end = s.indexOf("\n}", start);
      if (start < 0 || end < 0) {
        fail(`theme: ${mode} block not found in ${css}`);
        continue;
      }
      let block = s.slice(start, end);
      for (const [name, value] of Object.entries(theme[mode] ?? {})) {
        const re = new RegExp(`(\\n\\s*${name.replace(/[-]/g, "\\-")}:\\s*)[^;]+;`);
        if (!re.test(block)) fail(`theme: ${name} not found in the ${mode} block of ${css}`);
        block = block.replace(re, (_m, head: string) => `${head}${value};`);
      }
      s = s.slice(0, start) + block + s.slice(end);
    }
    write(css, s);
    count("theme", css, Object.keys(theme.light ?? {}).length + Object.keys(theme.dark ?? {}).length);
  }
  const TS = "packages/tokens/src/index.ts";
  let ts = read(TS);
  const camel = (n: string) => n.replace(/^--/, "").replace(/-(\w)/g, (_m, c: string) => c.toUpperCase());
  // The v1 aliases and the focus ring are written out in the TS objects; they follow their source token.
  const ALIASES: Record<string, string> = {
    surface: "bg",
    surfaceRaised: "raised",
    surfaceSunken: "sunken",
    inkMuted: "muted",
    action: "ink",
    onAction: "bg",
    attention: "warn",
    onAttention: "onWarn",
    attentionSoft: "warnSoft",
    success: "ink",
    focusColor: "lineStrong",
  };
  for (const mode of ["light", "dark"] as const) {
    const start = ts.indexOf(`export const ${mode}: ThemeColors = {`);
    const end = ts.indexOf("\n};", start);
    if (start < 0 || end < 0) {
      fail(`theme: ${mode} object not found in ${TS}`);
      continue;
    }
    let obj = ts.slice(start, end);
    const values: Record<string, string> = {};
    for (const [name, value] of Object.entries(theme[mode] ?? {})) {
      const key = camel(name);
      if (new RegExp(`\\n\\s*${key}: "`).test(obj)) values[key] = value;
    }
    for (const [alias, source] of Object.entries(ALIASES)) if (values[source]) values[alias] = values[source];
    for (const [key, value] of Object.entries(values))
      obj = obj.replace(
        new RegExp(`(\\n\\s*${key}: )"[^"]*"`),
        (_m, head: string) => `${head}${JSON.stringify(value)}`,
      );
    ts = ts.slice(0, start) + obj + ts.slice(end);
  }
  write(TS, ts);
  // The accent test pins the upstream's default color by value; it follows the profile's.
  const ACCENT_TEST = "packages/tokens/test/accent.test.ts";
  const upstreamAgent = /accentPalette\("(#[0-9A-F]{6})"\)/.exec(read(ACCENT_TEST))?.[1];
  const ourAgent = theme.light?.["--agent"];
  if (upstreamAgent && ourAgent) write(ACCENT_TEST, read(ACCENT_TEST).replace(upstreamAgent, ourAgent.toUpperCase()));
  // Hex literals of the upstream palette written outside the tokens (a stroke in components.css, the phone's
  // notification color, the presence badge): each listed file must hold at least one of them.
  for (const f of theme.replaceHexIn ?? []) {
    let s = read(f);
    let n = 0;
    for (const [from, to] of Object.entries(theme.replaceHex ?? {}))
      s = s.replace(new RegExp(from, "gi"), () => {
        n++;
        return to;
      });
    if (!n) fail(`theme: no upstream palette color left in ${f}`);
    write(f, s);
    count("theme color literal", f, n);
  }
} else pending.push("theme: colors still the upstream's (profile has no theme)");

// Patches: small edits where a whole-file override would be too much to review on every sync. `find` is exact text
// (`pattern` a regular expression, `replace` may use $1); `file` is one path or `files` a list of globs. Every patch
// must change each of its files, so an upstream rewrite of those lines fails the apply and names the patch.
type Patch = {
  why: string;
  file?: string;
  files?: string[];
  find?: string;
  pattern?: string;
  replace: string;
};
for (const p of brand.patches ?? []) {
  const targets = p.file
    ? [p.file]
    : (p.files ?? []).flatMap((g) => [...new Bun.Glob(g).scanSync({ cwd: SRC, onlyFiles: true })]);
  if (!targets.length || (!p.find && !p.pattern)) {
    fail(`patch "${p.why}": no files or nothing to find`);
    continue;
  }
  for (const target of targets) {
    if (!existsSync(join(SRC, target))) {
      fail(`patch "${p.why}": ${target} no longer exists upstream`);
      continue;
    }
    const s = read(target);
    let n = 0;
    const out = p.pattern
      ? s.replace(new RegExp(p.pattern, "g"), (...m) => {
          n++;
          return p.replace.replace(/\$(\d)/g, (_, i) => m[Number(i)] ?? "");
        })
      : s.split(p.find as string).join(p.replace);
    if (!p.pattern) n = s.split(p.find as string).length - 1;
    if (!n) {
      fail(`patch "${p.why}": upstream changed ${target}; review the patch`);
      continue;
    }
    write(target, out);
    count(`patch: ${p.why}`, target, n);
  }
}

// The apps' own version (BRAND_VERSION, set by whoever builds a release): desktop and phone. The server keeps
// upstream's version, which its health check and the apps' compatibility checks read. X.Y.Z with X and Y up to 255
// and Z up to 65535, the limits of a Windows installer's version.
const version = process.env.BRAND_VERSION;
if (version) {
  const parts = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)?.slice(1).map(Number);
  if (!parts || parts[0] > 255 || parts[1] > 255 || parts[2] > 65535)
    fail(`version: BRAND_VERSION ${version} is not X.Y.Z (X and Y up to 255, Z up to 65535)`);
  else {
    for (const f of ["apps/desktop/package.json", "apps/desktop/src-tauri/tauri.conf.json"]) {
      const before = read(f);
      const after = before.replace(/^(  "version": )"[^"]*"/m, `$1"${version}"`);
      if (after === before) fail(`version: no "version" in ${f}`);
      else write(f, after), count("version: desktop", f, 1);
    }
    const cargo = "apps/desktop/src-tauri/Cargo.toml";
    const toml = read(cargo).replace(/^version = "[^"]*"/m, `version = "${version}"`);
    if (toml === read(cargo)) fail(`version: no version in ${cargo}`);
    else write(cargo, toml), count("version: desktop", cargo, 1);
    const phone = "apps/mobile/versions.json";
    write(phone, `${JSON.stringify({ ...JSON.parse(read(phone)), ios: version, android: version }, null, 2)}\n`);
    count("version: phone", phone, 1);
  }
}

// Overrides: whole files the profile replaces (a drawing engine, a generator script). Each one records the SHA-256 of
// the upstream file it was written against; when upstream changes that file the apply fails, so the override is
// reviewed against the new version instead of silently dropping upstream's change.
for (const [target, o] of Object.entries(brand.overrides ?? {})) {
  // An override kept under a test's own name is a test file of the repo: `bun test apps/mobile/test` (CI) takes its
  // argument as a path filter and runs it from the profile, where its imports don't resolve. Name it `*.override-test.*`.
  if (/(\.|_)(test|spec)(\.|_)/.test(basename(o.file))) {
    fail(
      `override: ${o.file} has a test file's name; rename it to *.override-test.* (bun test would run it from the profile)`,
    );
    continue;
  }
  if (!existsSync(join(SRC, target))) {
    fail(`override: ${target} no longer exists upstream`);
    continue;
  }
  const sha = new Bun.CryptoHasher("sha256").update(readFileSync(join(SRC, target))).digest("hex");
  if (sha !== o.upstreamSha256) {
    const msg = `override: upstream changed ${target} (now ${sha}); review ${o.file} and update upstreamSha256`;
    if (/(^|\/)test\//.test(target)) {
      console.warn(`apply: WARNING ${msg} (test file: skipped, upstream's version kept)`);
      pending.push(msg);
    } else fail(msg);
    continue;
  }
  copyFileSync(join(PROFILE, o.file), join(SRC, target));
  count("override", target, 1);
}

// ---------------------------------------------------------------------------------------------------------------
const after = measure();
for (const k of Object.keys(INVARIANTS)) {
  (report.checks as Record<string, unknown>)[k] = { before: before[k], after: after[k] };
  if (before[k] !== after[k]) fail(`invariant "${k}" changed: ${before[k]} -> ${after[k]}`);
}
report.kept = [...new Set([...(report.kept as string[]), ...keptTexts])].filter((t) => !isBareName(t));
if (args.report) writeFileSync(args.report, JSON.stringify(report, null, 2));
for (const [k, v] of Object.entries(rules))
  console.log(`apply: ${k}: ${v.total} in ${Object.keys(v.files).length} files`);
console.log(
  `apply: keys with standalone "agentes" (English): ${Object.entries(bareKeys)
    .map(([k, v]) => `${k} ${v.length}`)
    .join(", ")}; unresolved replacements: ${(report.unresolved as string[]).length}`,
);
console.log(`apply: possible mismatches: ${(report.desync as string[]).length}`);
console.log(`apply: files outside the rules containing the name: ${Object.keys(outside).length}`);
console.log(`apply: pending items in profile: ${pending.length}`);
console.log(`apply: invariants ${failed ? "FAILED" : "unchanged before and after"}`);
process.exit(failed ? 1 : 0);
