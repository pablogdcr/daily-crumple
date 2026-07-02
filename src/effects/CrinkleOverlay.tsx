import {
  Canvas,
  Group,
  Image as SkiaImage,
  type SkImage,
} from '@shopify/react-native-skia';
import { StyleSheet } from 'react-native';
import { useDerivedValue } from 'react-native-reanimated';
import type { CrinkleGestureState } from '../engine/usePageGestures';

interface Props {
  image: SkImage | null;
  state: CrinkleGestureState;
  width: number;
  height: number;
}

/**
 * Always-mounted Skia layer that draws the snapshotted page during a swipe.
 * Milestone 4 version: plain translate so the deck/gesture plumbing can be
 * verified before the crinkle shader replaces the draw.
 */
export function CrinkleOverlay({ image, state, width, height }: Props) {
  const opacity = useDerivedValue(() => state.active.value);
  const transform = useDerivedValue(() => [
    { translateX: state.dir.value * state.progress.value * width * 1.3 },
  ]);

  return (
    <Canvas style={styles.canvas} pointerEvents="none">
      {image ? (
        <Group opacity={opacity} transform={transform}>
          <SkiaImage image={image} x={0} y={0} width={width} height={height} fit="fill" />
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
