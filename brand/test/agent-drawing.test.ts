import { expect, test } from "bun:test";
import { join } from "node:path";
import { injectedEngine, REPO } from "./engine-injected";

// The agent as drawn, kept as a snapshot: the commands the phone records (and the web's canvas receives) for every
// color × eyes × accessory × state × size, one hash per color and accessory. The drawing is the profile's, but it
// reads upstream helpers (eyeShapes, bodyFrame, sleepPose, the colors' math): a change on either side shows here.
// A deliberate change of the drawing: `bun test brand/test --update-snapshots`, then look at the sheets
// (brand/agent-sheet.ts) before committing.
const E = await injectedEngine();
const { RecordingContext, compile } = await import(join(REPO, "apps/mobile/src/agent/recorder.ts"));

const STATES: Record<string, object> = {
  idle: {},
  thinking: { turn: [-0.3, -0.2], look: [-0.06, -0.05] },
  writing: { writing: true, turn: [0.15, 0.1] },
  waiting: { turn: [0.05, -0.32], look: [0, -0.12], waiting: true },
  sleeping: E.sleepPose(),
  happy: { expression: "happy" },
  wink: { expression: "wink" },
  heart: { expression: "heart" },
  surprised: { expression: "surprised" },
};

test("the agent's drawing, every look, state and size", () => {
  const hashes: Record<string, string> = {};
  for (const color of [...Object.keys(E.AGENT_GRADIENTS), "#7c3aed", "#101820"])
    for (const accessory of E.ACCESSORY_NAMES) {
      const h = new Bun.CryptoHasher("sha256");
      for (const eyes of Object.keys(E.EYE_STYLES))
        for (const [state, pose] of Object.entries(STATES))
          for (const s of [18, 24, 36, 56, 112]) {
            const rec = new RecordingContext();
            E.drawAgent(rec, 0, 0, s, {
              color,
              eyes,
              pose,
              after: (ctx: unknown, side: number, frame: unknown) => {
                E.drawAccessory(ctx, side, accessory, frame, 0, false);
                if (state === "sleeping") E.drawSleep(ctx, side, frame, E.EYE_COLOR);
              },
            });
            h.update(JSON.stringify(compile(rec.commands)));
          }
      hashes[`${color} ${accessory}`] = h.digest("hex").slice(0, 16);
    }
  expect(hashes).toMatchSnapshot();
});
