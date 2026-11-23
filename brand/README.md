# brand/: build this fork under your own name and look

This folder rebrands the app at build time. It never edits upstream files in the repository: `build.sh` copies the
tree, `apply.ts` applies a **profile** to the copy, and the copy is built and scanned. The repository stays identical to
upstream outside `brand/`, so syncing with upstream is a fast-forward with no conflicts.

## Use

```bash
brand/build.sh --profile brand/profiles/<name> --out ../<name>-build              # web app + server
brand/build.sh --profile brand/profiles/<name> --out ../<name>-build --target desktop
brand/build.sh --profile brand/profiles/<name> --out ../<name>-build --target mobile
brand/build.sh --profile brand/profiles/<name> --out ../<name>-build --target none   # apply only
```

- `--out` must be outside the repository. It is wiped and recreated.
- `--dirty` copies the working tree (tracked and untracked files) instead of the committed `HEAD`.
- `--env <file>` sets the values `brand.json` reads as `${NAME}` (default: the profile's `brand.env`, ignored by git;
  start from its `brand.env.example`). A missing value fails the apply. In GitHub Actions `BRAND_REPO` defaults to
  the repository running the workflow.
- `BRAND_VERSION=X.Y.Z` (optional) sets the desktop and phone apps' version. The server keeps upstream's version,
  which compatibility checks read.
- There is no build without a profile: building the plain tree ships the upstream brand.
- `apply.ts` refuses to run on the repository itself.

## Profile

`brand/profiles/<name>/brand.json`:

| Key | What it does |
|---|---|
| `name` | Product name in every UI text, email, notification, server message and agent prompt, with each language's grammar fixed (articles, elision, particles) |
| `scheme` | App link scheme (`<scheme>://`) for the desktop and phone apps and the server. Requires `distribution` |
| `distribution` | `updater: "off"`; `downloadUrl` for the desktop downloads; `defaultServer` for the phone app (`null` = each build sets `EXPO_PUBLIC_API_URL`) |
| `ids` | `desktop` and `mobile` bundle identifiers. They must be your own: app stores tie an id to one account |
| `mobile.slug` | EAS slug |
| `assets` | Repo path → file in the profile, copied as is (favicon, icons, email logos, splash) |
| `theme` | Color tokens, `{ "light": { "--bg": "#…" }, "dark": { … } }`. Written to both copies of `tokens.css` and to `packages/tokens` (the phone), which upstream tests keep equal. Optional `replaceHex`/`replaceHexIn` recolor upstream palette literals in listed files |
| `overrides` | Whole-file replacements, `{ "<repo path>": { "file": "<profile path>", "upstreamSha256": "<sha>" } }`. The apply fails when upstream changes that file, so the override gets reviewed instead of silently dropping upstream's change |

`brand/profiles/example` is a minimal profile to start from.

## What the apply checks

- **Fixed rules:** each one must match. When upstream rewrites one of those lines, the apply fails and names it.
- **Invariants:** technical identifiers that must not change. Their counts are compared before and after: package scope, storage keys, crypto labels, API names, the attribution.
- **Desync:** the same text changed in one language file and not in the others.
- **Outside rules:** files that still name the upstream product and are not covered. New upstream folders show up here.
- **Pending:** what the profile does not cover yet, such as assets it does not provide.

`scan.ts` reads the built output (`--source` for code that is not bundled: the phone app and the desktop's Rust). It
fails on any upstream name left outside the allowed places: URLs, the attribution, the upstream's own Cloud and
technical identifiers.

## Syncing with upstream

1. Fast-forward `main` from upstream. Rebase this branch (only `brand/` differs, so there are no conflicts).
2. Run `brand/build.sh` for each target. A failure names the rule, invariant or override to review.
3. Fix the profile or the rule. Then build, check visually, and release.

## License and trademarks

- The code is AGPL-3.0-only (see `LICENSE` and `NOTICE`). If you run or distribute a branded build, offer its source,
  including `brand/` and your profile.
- Keep the attribution required by `NOTICE`: "Based on agentes.chat by AGENTESCHAT, LLC" on the About screen.
  `apply.ts` never changes it, and an invariant checks that it is still there.
- The upstream names and logo are not licensed (`TRADEMARKS.md`). Use your own name, icons and app identifiers, and
  never present a build as the official one.
