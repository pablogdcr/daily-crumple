import {
  Canvas,
  Fill,
  Group,
  ImageShader,
  Shader,
  type SkImage,
} from '@shopify/react-native-skia';
import { StyleSheet } from 'react-native';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { overscrollEffect } from './overscrollShader';

/** Scroll state written by the current page's animated scroll handler. */
export interface OverscrollWiring {
  /** Live contentOffset.y. */
  y: SharedValue<number>;
  /** contentSize - viewport (≥ 0). */
  max: SharedValue<number>;
  /** Bitmask set at drag start: 1 = began at top edge, 2 = at bottom edge. */
  armed: SharedValue<number>;
  /** Per-drag fold seed. */
  seed: SharedValue<number>;
}

/** Signed overscroll in px: > 0 pulled down at the top, < 0 pulled up at the bottom. */
export function overscrollAmount(w: OverscrollWiring): number {
  'worklet';
  const y = w.y.value;
  const m = w.max.value;
  if (w.armed.value & 1 && y < -0.5) return -y;
  if (w.armed.value & 2 && y > m + 0.5) return m - y;
  return 0;
}

interface Props {
  image: SkImage | null;
  wiring: OverscrollWiring;
  width: number;
  height: number;
}

/**
 * Overscroll crumple layer. Drawn only while the native rubber band is past
 * an edge on a drag that STARTED at that edge (so the touch-down snapshot
 * matches the frozen content exactly). Because the effect is driven by the
 * live scroll offset, it follows the native bounce physics out and back —
 * when the offset re-enters bounds the layer vanishes and the live page
 * (sitting at the edge, identical to the snapshot) shows again seamlessly.
 */
export function OverscrollOverlay({ image, wiring, width, height }: Props) {
  const opacity = useDerivedValue(() =>
    overscrollAmount(wiring) !== 0 ? 1 : 0,
  );

  const uniforms = useDerivedValue(() => ({
    uRes: [width, height],
    uOver: overscrollAmount(wiring),
    uSeed: wiring.seed.value,
  }));

  return (
    <Canvas style={styles.canvas} pointerEvents="none">
      {image ? (
        <Group opacity={opacity}>
          <Fill>
            <Shader source={overscrollEffect} uniforms={uniforms}>
              <ImageShader
                image={image}
                fit="fill"
                rect={{ x: 0, y: 0, width, height }}
              />
            </Shader>
          </Fill>
        </Group>
      ) : null}
    </Canvas>
  );
}

const styles = StyleSheet.create({
  canvas: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});
