import { Canvas, Group, Line, RoundedRect, vec } from '@shopify/react-native-skia';
import { StyleSheet } from 'react-native';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { colors } from '../theme';

export const BIN_SIZE = 64;

interface Props {
  lidAngle: SharedValue<number>; // degrees, 0 closed / -75 open
  binScale: SharedValue<number>;
}

/**
 * Line-art waste bin in the newspaper's ink, drawn in Skia so the lid can
 * swing open (hinge at its right edge) and the whole bin can pulse when the
 * paper ball lands.
 */
export function BinIcon({ lidAngle, binScale }: Props) {
  const lidTransform = useDerivedValue(() => [
    { rotate: (lidAngle.value * Math.PI) / 180 },
  ]);
  const rootTransform = useDerivedValue(() => [{ scale: binScale.value }]);

  return (
    <Canvas style={styles.canvas} pointerEvents="none">
      <Group transform={rootTransform} origin={vec(32, 36)}>
        {/* body */}
        <RoundedRect
          x={17.5}
          y={26}
          width={29}
          height={28}
          r={4}
          style="stroke"
          strokeWidth={2.5}
          color={colors.ink}
        />
        {/* ribs */}
        <Line p1={vec(26, 32)} p2={vec(26, 48)} strokeWidth={2} color={colors.ink} />
        <Line p1={vec(32, 32)} p2={vec(32, 48)} strokeWidth={2} color={colors.ink} />
        <Line p1={vec(38, 32)} p2={vec(38, 48)} strokeWidth={2} color={colors.ink} />
        {/* lid, hinged at its right edge */}
        <Group transform={lidTransform} origin={vec(50, 19)}>
          <RoundedRect
            x={14}
            y={16}
            width={36}
            height={6.5}
            r={2}
            style="stroke"
            strokeWidth={2.5}
            color={colors.ink}
          />
          <RoundedRect
            x={27}
            y={11.5}
            width={10}
            height={4.5}
            r={1.5}
            style="stroke"
            strokeWidth={2.2}
            color={colors.ink}
          />
        </Group>
      </Group>
    </Canvas>
  );
}

const styles = StyleSheet.create({
  canvas: { width: BIN_SIZE, height: BIN_SIZE },
});
