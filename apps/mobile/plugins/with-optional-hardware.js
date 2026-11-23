/**
 * Expo config plugin: hardware the app can do without, declared optional in the Android manifest. Google Play infers
 * required features from what the libraries bring, and these two keep the app off devices it runs on:
 * - `android.hardware.screen.portrait`: ML Kit's code and document scanner activities are fixed in portrait
 *   (play-services-code-scanner, play-services-mlkit-document-scanner);
 * - `android.hardware.wifi`: `ACCESS_WIFI_STATE`, from expo-network.
 * Play's pre-review check flags both ("required hardware features restrict the app's availability"): tablets in
 * landscape, Chromebooks, Android XR and devices without Wi-Fi. The app doesn't need either: a scan works in any
 * orientation the device has, and the network check works on any connection.
 */
const { withAndroidManifest } = require("expo/config-plugins");

const OPTIONAL = ["android.hardware.screen.portrait", "android.hardware.wifi"];

/** The manifest (as Expo parses it) with each feature of `OPTIONAL` declared `required="false"`. */
function withOptionalFeatures(manifest) {
  const root = manifest.manifest;
  const features = root["uses-feature"] ?? [];
  for (const name of OPTIONAL) {
    const found = features.find((f) => f.$?.["android:name"] === name);
    if (found) found.$["android:required"] = "false";
    else features.push({ $: { "android:name": name, "android:required": "false" } });
  }
  root["uses-feature"] = features;
  return manifest;
}

module.exports = (config) =>
  withAndroidManifest(config, (cfg) => {
    cfg.modResults = withOptionalFeatures(cfg.modResults);
    return cfg;
  });

module.exports.withOptionalFeatures = withOptionalFeatures;
module.exports.OPTIONAL = OPTIONAL;
