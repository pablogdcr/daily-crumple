import {
  Canvas,
  Fill,
  Group,
  ImageShader,
  Oval,
  Shader,
  Vertices,
  vec,
  type SkImage,
} from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { useDerivedValue } from 'react-native-reanimated';
import type { CrumpleState } from '../engine/useCrumpleGesture';
import { crumpleEffect } from './crumpleShader';
import { buildPaperBallMesh } from './paperBallMesh';

interface Props {
  image: SkImage | null;
  state: CrumpleState;
  width: number;
  height: number;
  binX: number;
  binY: number;
}

// grayscale lookup so the per-frame worklet never builds color strings
const GRAYS = Array.from({ length: 101 }, (_, i) => {
  const v = Math.round((i / 100) * 255)
    .toString(16)
    .padStart(2, '0');
  return `#${v}${v}${v}`;
});

const EMPTY_BALL = {
  v: [vec(0, 0), vec(0, 0), vec(0, 0)],
  t: [vec(0, 0), vec(0, 0), vec(0, 0)],
  c: ['#ffffff', '#ffffff', '#ffffff'],
};

/**
 * Draws the crumpling page (interactive drag — 2D crumple shader) and, once
 * the throw starts, a real 3D crumpled ball: an icosphere mesh with seeded
 * vertex displacement, flat per-face lighting, the article texture wrapped
 * around it, tumbling in true 3D along a Bézier arc into the bin. The 2D
 * shader crossfades into the mesh over the first ~12% of the throw.
 */
export function CrumpleOverlay({ image, state, width, height, binX, binY }: Props) {
  const mesh = useMemo(
    () => (image ? buildPaperBallMesh(Math.random()) : null),
    [image],
  );

  const cx = width / 2;
  const cy = height / 2;
  // control point up and left of the chord — the arc of the throw
  const ctrlX = (cx + binX) / 2 - 40;
  const ctrlY = (cy + binY) / 2 - 170;
  const ballR = 0.19 * width;

  const uniforms = useDerivedValue(() => ({
    uRes: [width, height],
    uCenter: [state.cx.value, state.cy.value],
    uT: state.t.value,
    uSeed: state.seed.value,
  }));

  // 2D crumple visible while dragging, fades out as the 3D ball takes over
  const opacity2D = useDerivedValue(() => {
    const k = Math.min(Math.max(state.throwU.value / 0.12, 0), 1);
    return state.active.value * (1 - k);
  });
  const opacity3D = useDerivedValue(() =>
    state.active.value * Math.min(Math.max(state.throwU.value / 0.12, 0), 1),
  );

  // ── 3D ball: rotate, light, cull, depth-sort, project — per frame ──
  const ball = useDerivedValue(() => {
    const u = state.throwU.value;
    if (!mesh || u <= 0.001) return EMPTY_BALL;

    const iu = 1 - u;
    const bx = iu * iu * cx + 2 * iu * u * ctrlX + u * u * binX;
    const by = iu * iu * cy + 2 * iu * u * ctrlY + u * u * binY;
    const pr = ballR * (1 - 0.84 * u);

    // tumble: fixed axis, angle driven by the flight
    const angle = u * 5.5 + state.seed.value;
    const al = Math.hypot(0.3, 1, 0.25);
    const kx = 0.3 / al;
    const ky = 1 / al;
    const kz = 0.25 / al;
    const ca = Math.cos(angle);
    const sa = Math.sin(angle);

    const lx = -0.4;
    const ly = -0.5;
    const lz = 0.75;
    const ll = Math.hypot(lx, ly, lz);

    const pos = mesh.positions;
    const uvs = mesh.uvs;
    const kept: {
      z: number;
      p: { x: number; y: number }[];
      t: { x: number; y: number }[];
      g: string;
    }[] = [];

    for (let f = 0; f < mesh.faceCount; f++) {
      const rp: number[][] = [];
      for (let i = 0; i < 3; i++) {
        const o = (f * 3 + i) * 3;
        const x = pos[o];
        const y = pos[o + 1];
        const z = pos[o + 2];
        // Rodrigues rotation
        const dotkv = kx * x + ky * y + kz * z;
        const crx = ky * z - kz * y;
        const cry = kz * x - kx * z;
        const crz = kx * y - ky * x;
        rp.push([
          x * ca + crx * sa + kx * dotkv * (1 - ca),
          y * ca + cry * sa + ky * dotkv * (1 - ca),
          z * ca + crz * sa + kz * dotkv * (1 - ca),
        ]);
      }
      // face normal (z toward viewer)
      const ax = rp[1][0] - rp[0][0];
      const ay = rp[1][1] - rp[0][1];
      const az = rp[1][2] - rp[0][2];
      const bx2 = rp[2][0] - rp[0][0];
      const by2 = rp[2][1] - rp[0][1];
      const bz2 = rp[2][2] - rp[0][2];
      let nx = ay * bz2 - az * by2;
      let ny = az * bx2 - ax * bz2;
      let nz = ax * by2 - ay * bx2;
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl;
      ny /= nl;
      nz /= nl;
      if (nz <= 0.02) continue; // backface

      const light = Math.min(
        1,
        0.5 + 0.55 * Math.max((nx * lx + ny * ly + nz * lz) / ll, 0),
      );
      const g = GRAYS[Math.round(light * 100)];

      const p: { x: number; y: number }[] = [];
      const t: { x: number; y: number }[] = [];
      let zsum = 0;
      for (let i = 0; i < 3; i++) {
        const [x, y, z] = rp[i];
        zsum += z;
        const persp = 1 / (1 - z * 0.18);
        p.push({ x: bx + x * pr * persp, y: by + y * pr * persp });
        const o = (f * 3 + i) * 2;
        t.push({ x: uvs[o] * width, y: uvs[o + 1] * height });
      }
      kept.push({ z: zsum / 3, p, t, g });
    }

    kept.sort((a, b) => a.z - b.z); // painter: far faces first

    const v: { x: number; y: number }[] = [];
    const t: { x: number; y: number }[] = [];
    const c: string[] = [];
    for (const face of kept) {
      v.push(face.p[0], face.p[1], face.p[2]);
      t.push(face.t[0], face.t[1], face.t[2]);
      c.push(face.g, face.g, face.g);
    }
    return { v, t, c };
  }, [mesh, width, height, binX, binY]);

  const ballVerts = useDerivedValue(() => ball.value.v);
  const ballTexs = useDerivedValue(() => ball.value.t);
  const ballCols = useDerivedValue(() => ball.value.c);

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
        <>
          <Oval rect={shadowRect} color="black" opacity={shadowOpacity} />
          <Group opacity={opacity2D}>
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
          <Group opacity={opacity3D}>
            <Vertices
              vertices={ballVerts}
              textures={ballTexs}
              colors={ballCols}
              blendMode="modulate"
            >
              <ImageShader
                image={image}
                fit="fill"
                rect={{ x: 0, y: 0, width, height }}
              />
            </Vertices>
          </Group>
        </>
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
