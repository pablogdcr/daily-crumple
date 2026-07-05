import {
  Canvas,
  Fill,
  Group,
  ImageShader,
  Shader,
  type SkImage,
} from '@shopify/react-native-skia';
import { StyleSheet } from 'react-native';
import { useDerivedValue } from 'react-native-reanimated';
import type { CrinkleGestureState } from '../engine/usePageGestures';
import { crinkleEffect } from './crinkleShader';

interface Props {
  image: SkImage | null;
  state: CrinkleGestureState;
  width: number;
  height: number;
}

/**
 * Always-mounted Skia layer that draws the snapshotted page through the
 * crinkle shader during a swipe. Invisible when idle (opacity gated on the
 * gesture's `active` shared value) — the live page shows through beneath.
 */
export function CrinkleOverlay({ image, state, width, height }: Props) {
  const opacity = useDerivedValue(() => state.active.value);

  const uniforms = useDerivedValue(() => ({
    uRes: [width, height],
    uTouch: [state.touchX.value, state.touchY.value],
    uOrigin: [state.originX.value, state.originY.value],
    uProgress: state.progress.value,
    uDir: state.dir.value,
    uSeed: state.seed.value,
  }));

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      {image ? (
        <Group opacity={opacity}>
          <Fill>
            <Shader source={crinkleEffect} uniforms={uniforms}>
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

