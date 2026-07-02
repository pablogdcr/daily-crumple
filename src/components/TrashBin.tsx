import {
  Group,
  Image as BinImage,
  Skia,
  useImage,
  vec,
} from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';

// rim ellipse of the wire-mesh basket photo, measured in the cropped
// asset's own pixel grid (assets/bin.png, white background keyed out so
// the mesh holes are transparent)
const IMG_W = 264;
const IMG_H = 301;
const RIM_CX = 132;
const RIM_CY = 51;
const RIM_RX = 130;
const RIM_RY = 50;

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
  const rx = width * 0.31;
  const ry = (RIM_RY * rx) / RIM_RX;
  const mouthY = height - width * 0.32;
  return { cx: width / 2, mouthY, rx, ry, hiddenY: height - (mouthY - ry) + 12 };
}

interface Props {
  /** back = behind the ball (rim + far wall), front = the near wall. */
  part: 'back' | 'front';
  /** 0 = below the screen, 1 = risen into view. */
  rise: SharedValue<number>;
  /** Scale pulse on ball arrival. */
  pulse: SharedValue<number>;
  width: number;
  height: number;
}

/**
 * The wire-mesh wastebasket photo, split around the paper ball by a clip
 * along the near edge of the rim: everything below that curve is the
 * basket's near wall and renders in front of the ball, the rest behind it.
 * The mesh holes are transparent, so a ball inside stays visible through
 * the weave. Only the top of the basket rises above the bottom screen edge.
 */
export function TrashBin({ part, rise, pulse, width, height }: Props) {
  const img = useImage(require('../../assets/bin.png'));
  const g = useMemo(() => binGeometry(width, height), [width, height]);

  const transform = useDerivedValue(() => [
    { translateY: (1 - rise.value) * g.hiddenY },
    { scale: pulse.value },
  ]);

  // near wall = everything below the inner rim's near (lower) edge
  const frontClip = useMemo(() => {
    const rxIn = g.rx * 0.92;
    const ryIn = g.ry * 0.86;
    const bottom = height + g.hiddenY + 20;
    return Skia.Path.MakeFromSVGString(
      `M ${g.cx - rxIn} ${g.mouthY} A ${rxIn} ${ryIn} 0 0 0 ${g.cx + rxIn} ${g.mouthY} ` +
        `L ${g.cx + rxIn} ${bottom} L ${g.cx - rxIn} ${bottom} Z`,
    );
  }, [g, height]);

  if (!img || !frontClip) return null;

  const s = g.rx / RIM_RX;
  const rect = {
    x: g.cx - RIM_CX * s,
    y: g.mouthY - RIM_CY * s,
    width: IMG_W * s,
    height: IMG_H * s,
  };

  return (
    <Group transform={transform} origin={vec(g.cx, height)}>
      {part === 'back' ? (
        <Group clip={frontClip} invertClip>
          <BinImage image={img} fit="fill" {...rect} />
        </Group>
      ) : (
        <Group clip={frontClip}>
          <BinImage image={img} fit="fill" {...rect} />
        </Group>
      )}
    </Group>
  );
}
