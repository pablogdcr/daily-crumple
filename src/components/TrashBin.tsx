import { Group, Oval, Path, vec } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { colors } from '../theme';

export interface BinGeometry {
  /** Mouth center. */
  cx: number;
  mouthY: number;
  /** Mouth ellipse radii. */
  rx: number;
  ry: number;
  /** translateY that puts the whole bin below the screen edge. */
  hiddenY: number;
}

/** Shared between the bin drawing and the ball's throw target. */
export function binGeometry(width: number, height: number): BinGeometry {
  const rx = width * 0.3;
  const ry = width * 0.085;
  const mouthY = height - width * 0.32;
  return { cx: width / 2, mouthY, rx, ry, hiddenY: width * 0.32 + ry + 14 };
}

interface Props {
  /** back = interior + far rim (behind the ball), front = body + near rim. */
  part: 'back' | 'front';
  /** 0 = below the screen, 1 = risen into view. */
  rise: SharedValue<number>;
  /** Scale pulse on ball arrival. */
  pulse: SharedValue<number>;
  width: number;
  height: number;
}

/**
 * A realistic ribbed garbage can in the newspaper's etched-ink style, drawn
 * in two halves so the paper ball can fall between them: the dark interior
 * and far rim render behind the ball, the tapered body and near rim in
 * front — the ball visibly sinks INTO the can. Only the top of the can rises
 * above the bottom screen edge.
 */
export function TrashBin({ part, rise, pulse, width, height }: Props) {
  const g = useMemo(() => binGeometry(width, height), [width, height]);

  const transform = useDerivedValue(() => [
    { translateY: (1 - rise.value) * g.hiddenY },
    { scale: pulse.value },
  ]);

  const paths = useMemo(() => {
    const { cx, mouthY, rx, ry } = g;
    const bottom = height + 14;
    const taper = 0.9;
    const bl = cx - rx * taper;
    const br = cx + rx * taper;
    // vertical ribs follow the body taper
    const ribXs = [-0.66, -0.32, 0.32, 0.66].map((k) => ({
      top: cx + rx * k,
      bot: cx + rx * k * taper,
    }));
    // horizontal bands echo the mouth's curvature, shallower with depth
    const bandAt = (f: number) => {
      const y = mouthY + (bottom - mouthY) * f;
      const r = rx * (1 - (1 - taper) * f);
      return `M ${cx - r} ${y} A ${r} ${ry * 0.9} 0 0 0 ${cx + r} ${y}`;
    };
    return {
      backRim: `M ${cx - rx} ${mouthY} A ${rx} ${ry} 0 0 1 ${cx + rx} ${mouthY}`,
      body: `M ${cx - rx} ${mouthY} L ${bl} ${bottom} L ${br} ${bottom} L ${cx + rx} ${mouthY} A ${rx} ${ry} 0 0 1 ${cx - rx} ${mouthY} Z`,
      frontRim: `M ${cx - rx - 5} ${mouthY} A ${rx + 5} ${ry + 3} 0 0 0 ${cx + rx + 5} ${mouthY} L ${cx + rx} ${mouthY} A ${rx} ${ry} 0 0 1 ${cx - rx} ${mouthY} Z`,
      ribs: ribXs
        .map((r) => `M ${r.top} ${mouthY + ry + 8} L ${r.bot} ${bottom}`)
        .join(' '),
      bands: `${bandAt(0.3)} ${bandAt(0.62)}`,
    };
  }, [g, height]);

  return (
    <Group transform={transform} origin={vec(g.cx, height)}>
      {part === 'back' ? (
        <>
          <Oval
            rect={{
              x: g.cx - g.rx,
              y: g.mouthY - g.ry,
              width: 2 * g.rx,
              height: 2 * g.ry,
            }}
            color="#2a2318"
          />
          <Path
            path={paths.backRim}
            style="stroke"
            strokeWidth={3}
            color={colors.ink}
          />
        </>
      ) : (
        <>
          <Path path={paths.body} color="#e2d6b8" />
          <Path
            path={paths.bands}
            style="stroke"
            strokeWidth={2}
            color={colors.ink}
            opacity={0.35}
          />
          <Path
            path={paths.ribs}
            style="stroke"
            strokeWidth={2}
            color={colors.ink}
            opacity={0.45}
          />
          <Path
            path={paths.body}
            style="stroke"
            strokeWidth={2.5}
            color={colors.ink}
          />
          <Path path={paths.frontRim} color="#ece2c6" />
          <Path
            path={paths.frontRim}
            style="stroke"
            strokeWidth={2.5}
            color={colors.ink}
          />
        </>
      )}
    </Group>
  );
}
