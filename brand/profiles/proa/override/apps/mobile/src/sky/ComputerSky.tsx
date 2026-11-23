import type { AgentColorName } from "@agenteschat/ui/agent/engine";
import { agentTones, pixelOf, type SeaKind, seaPixels, softTones, spriteTone } from "@agenteschat/ui/sky/math";
import { Canvas, Group, Path, Skia } from "@shopify/react-native-skia";
import { useMemo, useState } from "react";
import { type LayoutChangeEvent, type StyleProp, StyleSheet, View, type ViewStyle } from "react-native";
import { type SharedValue, useDerivedValue } from "react-native-reanimated";
import { useLivePaused } from "@/agent/live";
import { rectsToSvg } from "@/agent/recorder";
import { useReducedMotion, useTheme } from "@/ui/theme";
import { useDrawingClock } from "./clock";
import { Dither } from "./Dither";
import { COMPUTER_SPRITES, type ComputerSprite } from "./math";

const PX = 4;
const CAST: readonly SeaKind[] = ["gull", "fish", "jelly", "dart"];
/** Anonymous sea life behind the computer; agent avatars and the shared animation clock are unchanged. */
export function ComputerSky({ color = "sky", style }: { color?: AgentColorName; style?: StyleProp<ViewStyle> }) {
  const { colors, scheme } = useTheme();
  const reduced = useReducedMotion();
  const paused = useLivePaused();
  const clock = useDrawingClock(!reduced && !paused);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== size.width || height !== size.height) setSize({ width, height });
  };
  const tones = scheme === "dark" ? softTones(color, colors.raised) : agentTones(color);
  const solid = spriteTone(color);
  const ghost = tones[tones.length - 2] ?? solid;
  return (
    <View
      style={style}
      onLayout={onLayout}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Dither kind="computer" tones={tones} pixel={PX} style={StyleSheet.absoluteFill} />
      {size.width > 0 && size.height > 0 ? (
        <Canvas style={StyleSheet.absoluteFill}>
          {COMPUTER_SPRITES.map((sprite, i) => (
            <Passing
              key={sprite.x}
              kind={CAST[i] ?? "fish"}
              sprite={sprite}
              clock={clock}
              moving={!reduced}
              width={size.width}
              height={size.height}
              tone={sprite.ghost ? ghost : solid}
            />
          ))}
        </Canvas>
      ) : null}
    </View>
  );
}
function Passing({
  sprite,
  kind,
  clock,
  moving,
  width,
  height,
  tone,
}: {
  sprite: ComputerSprite;
  kind: SeaKind;
  clock: SharedValue<number>;
  moving: boolean;
  width: number;
  height: number;
  tone: string;
}) {
  const paths = useMemo(() => {
    const groups = new Map<number, number[]>();
    for (const p of seaPixels(kind, pixelOf(tone), pixelOf("#FFF1D9"))) {
      const rects = groups.get(p.color) ?? [];
      rects.push(p.x * PX, p.y * PX, PX, PX);
      groups.set(p.color, rects);
    }
    return [...groups].map(([color, rects]) => ({
      path: Skia.Path.MakeFromSVGString(rectsToSvg(rects)),
      color: `rgb(${color & 255},${(color >>> 8) & 255},${(color >>> 16) & 255})`,
    }));
  }, [kind, tone]);
  const transform = useDerivedValue(() => {
    const t = moving ? clock.value / 1000 : 0;
    const phase = t * 0.3 + sprite.phase * 6.28;
    const direction = Math.cos(phase) < 0 ? -1 : 1;
    // Side lanes stay clear of the computer. Fish never rise into the sky.
    const x = Math.max(0, Math.min(width - 9 * PX, sprite.x * (width - 9 * PX) + Math.sin(phase) * 2 * PX));
    const low = kind === "gull" ? 0.12 : 0.5;
    const span = kind === "gull" ? 0.15 : 0.25;
    const y = Math.max(0, Math.min(height - 9 * PX, height * (low + sprite.phase * span)));
    return [
      { translateX: Math.round(x / PX) * PX + (direction < 0 ? 9 * PX : 0) },
      { translateY: Math.round(y / PX) * PX },
      { scaleX: direction },
    ];
  });
  return (
    <Group transform={transform}>
      {paths.map((p) => (p.path ? <Path key={p.color} path={p.path} color={p.color} /> : null))}
    </Group>
  );
}
