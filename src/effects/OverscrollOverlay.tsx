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
  /**
   * 1 once a fresh edge snapshot landed for a momentum overscroll (a fling
   * coasting into the edge with no finger down). Cleared when back in bounds.
   */
  ready: SharedValue<number>;
  /** Warp ease-in (0→1) masking the momentum takeover; 1 for armed drags. */
  ramp: SharedValue<number>;
  /** Per-drag fold seed. */
  seed: SharedValue<number>;
  /**
   * Signed overscroll owned by the release spring. On drag end the ScrollView
   * is settled at the edge instantly (a native rubber-band return swallows any
   * touch landing during it) and this springs the crumple flat instead. While
   * non-zero it owns the warp.
   */
  release: SharedValue<number>;
}

/** Signed overscroll in px: > 0 pulled down at the top, < 0 pulled up at the bottom. */
export function overscrollAmount(w: OverscrollWiring): number {
  'worklet';
  const y = w.y.value;
  const m = w.max.value;
  if (y < -0.5) return -y;
  if (y > m + 0.5) return m - y;
  return 0;
}

/** 1 while the crumple layer should draw (and the live page hide). */
export function overscrollShowing(w: OverscrollWiring): number {
  'worklet';
  if (w.release.value !== 0) return 1; // relax spring still flattening the paper
  const over = overscrollAmount(w);
  if (over === 0) return 0;
  if (w.ready.value) return 1; // momentum: fresh edge snapshot landed
  if (over > 0 && w.armed.value & 1) return 1;
  if (over < 0 && w.armed.value & 2) return 1;
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
 * live scroll offset, it follows the native bounce physics out and back -
 * when the offset re-enters bounds the layer vanishes and the live page
 * (sitting at the edge, identical to the snapshot) shows again seamlessly.
 */
export function OverscrollOverlay({ image, wiring, width, height }: Props) {
  const opacity = useDerivedValue(() => overscrollShowing(wiring));

  const uniforms = useDerivedValue(() => ({
    uRes: [width, height],
    // ramp eases the warp in when a momentum snapshot takes over mid-bounce;
    // after drag end the release spring owns the warp (offset is already
    // settled at the edge, so the live amount reads 0)
    uOver:
      wiring.release.value !== 0
        ? wiring.release.value
        : overscrollAmount(wiring) * wiring.ramp.value,
    uSeed: wiring.seed.value,
  }));

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
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

