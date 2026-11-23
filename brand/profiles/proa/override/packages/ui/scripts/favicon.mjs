/** Timo at favicon scale, keeping the engine's colors, pear and circular eyes. */
import { writeFileSync } from "node:fs";
import { bodySvg, EYE_COLOR, eyeShapes, gradientOf } from "../src/agent/engine.js";

const inner = bodySvg("sky", 84)
  .replace(/^<svg[^>]*>/, "")
  .replace(/<\/svg>$/, "");
const eyes = eyeShapes("round")
  .map(
    (e) =>
      `<ellipse cx="${(e.x + e.w / 2) * 84}" cy="${(e.y + e.h / 2) * 84}" rx="${e.w * 42}" ry="${e.h * 42}" fill="${EYE_COLOR}"/>`,
  )
  .join("");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="-5 -5 94 100"><title>Proa</title><g fill="${gradientOf("sky")[1]}"><ellipse cx="8" cy="44" rx="8" ry="10"/><ellipse cx="76" cy="44" rx="8" ry="10"/></g>${inner}<path d="M25 76Q42 83 59 76L59 84L42 81L25 87Z" fill="#FA7C66"/><path d="M10 19Q42 16 74 19L74 29Q42 25 10 29Z" fill="#183A55"/><path d="M9 20Q0 10 19 7Q39 -7 60 7Q83 7 76 20Z" fill="#FFF1D9"/>${eyes}<path d="M37 58Q45 62 50 55" fill="none" stroke="${EYE_COLOR}" stroke-width="2.5" stroke-linecap="round"/></svg>\n`;
writeFileSync(new URL("../../../apps/web/public/favicon.svg", import.meta.url), svg);
console.log(`Timo favicon: ${svg.length} bytes`);
