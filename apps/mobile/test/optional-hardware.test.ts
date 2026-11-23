import { describe, expect, test } from "bun:test";

// The config plugin is plain CommonJS (expo prebuild loads it); only its pure part is tested here.
const { withOptionalFeatures, OPTIONAL } = require("../plugins/with-optional-hardware") as {
  withOptionalFeatures: (manifest: Manifest) => Manifest;
  OPTIONAL: string[];
};

type Feature = { $: Record<string, string> };
type Manifest = { manifest: { "uses-feature"?: Feature[]; [key: string]: unknown } };

const required = (m: Manifest) =>
  Object.fromEntries((m.manifest["uses-feature"] ?? []).map((f) => [f.$["android:name"], f.$["android:required"]]));

describe("with-optional-hardware", () => {
  test("declares portrait screen and Wi-Fi optional on a manifest without features", () => {
    const out = withOptionalFeatures({ manifest: {} });
    expect(required(out)).toEqual({
      "android.hardware.screen.portrait": "false",
      "android.hardware.wifi": "false",
    });
  });

  test("turns an existing declaration optional and keeps the other features", () => {
    const out = withOptionalFeatures({
      manifest: {
        "uses-feature": [
          { $: { "android:name": "android.hardware.wifi", "android:required": "true" } },
          { $: { "android:name": "android.hardware.camera", "android:required": "false" } },
        ],
      },
    });
    expect(required(out)).toEqual({
      "android.hardware.wifi": "false",
      "android.hardware.camera": "false",
      "android.hardware.screen.portrait": "false",
    });
  });

  test("running twice adds nothing", () => {
    const once = withOptionalFeatures({ manifest: {} });
    const twice = withOptionalFeatures(structuredClone(once));
    expect(twice.manifest["uses-feature"]).toHaveLength(OPTIONAL.length);
  });
});
