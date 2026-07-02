import {
  Canvas,
  Fill,
  Group,
  ImageShader,
  Oval,
  Shader,
  vec,
  type SkImage,
} from '@shopify/react-native-skia';
import { StyleSheet } from 'react-native';
import { useDerivedValue } from 'react-native-reanimated';
import type { CrumpleState } from '../engine/useCrumpleGesture';
import { crumpleEffect } from './crumpleShader';

interface Props {
  image: SkImage | null;
  state: CrumpleState;
  width: number;
  height: number;
  binX: number;
  binY: number;
}

/**
 * Draws the crumpling page / paper ball. During the drag the crumple shader
 * runs full-screen (identity at t=0). During the throw the same shader (frozen
 * at t=1, ball at screen center) is flown along a quadratic Bézier to the bin
 * by a Group transform — translate + spin + shrink around the ball's center —
 * with a soft drop shadow tracking beneath the arc.
 */
export function CrumpleOverlay({ image, state, width, height, binX, binY }: Props) {
  const opacity = useDerivedValue(() => state.active.value);

  const uniforms = useDerivedValue(() => ({
    uRes: [width, height],
    uCenter: [state.cx.value, state.cy.value],
    uT: state.t.value,
    uSeed: state.seed.value,
  }));

  const cx = width / 2;
  const cy = height / 2;
  // control point up and left of the chord — the arc of the throw
  const ctrlX = (cx + binX) / 2 - 40;
  const ctrlY = (cy + binY) / 2 - 170;

  const throwTransform = useDerivedValue(() => {
    const u = state.throwU.value;
    if (u <= 0) return [];
    const iu = 1 - u;
    const bx = iu * iu * cx + 2 * iu * u * ctrlX + u * u * binX;
    const by = iu * iu * cy + 2 * iu * u * ctrlY + u * u * binY;
    return [
      { translateX: bx - cx },
      { translateY: by - cy },
      { rotate: u * 5.06 },
      { scale: 1 - 0.84 * u },
    ];
  });

  const ballR = 0.19 * width;
  const shadowRect = useDerivedValue(() => {
    const u = state.throwU.value;
    const iu = 1 - u;
    // shadow follows the straight chord (the "floor" under the arc)
    const sx = iu * cx + u * binX;
    const sy = iu * cy + u * binY;
    const r = ballR * (1 - 0.7 * u);
    return { x: sx - r, y: sy + ballR * 0.9, width: 2 * r, height: r * 0.45 };
  });
  const shadowOpacity = useDerivedValue(() => {
    const u = state.throwU.value;
    return u > 0 ? 0.22 * (1 - 0.6 * u) : 0;
  });

  return (
    <Canvas style={styles.canvas} pointerEvents="none">
      {image ? (
        <Group opacity={opacity}>
          <Oval rect={shadowRect} color="black" opacity={shadowOpacity} />
          <Group transform={throwTransform} origin={vec(cx, cy)}>
            <Fill>
              <Shader source={crumpleEffect} uniforms={uniforms}>
                <ImageShader
                  image={image}
                  fit="fill"
                  rect={{ x: 0, y: 0, width, height }}
                />
              </Shader>
            </Fill>
          </Group>
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
