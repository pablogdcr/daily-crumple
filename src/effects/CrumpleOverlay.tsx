import {
  BlurMask,
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

// color lookups so the per-frame worklet never builds color strings
const GRAYS = Array.from({ length: 101 }, (_, i) => {
  const v = Math.round((i / 100) * 255)
    .toString(16)
    .padStart(2, '0');
  return `#${v}${v}${v}`;
});
// additive paper-white by intensity — lit facets wash toward blank paper.
// Drawn with blendMode="plus": black adds nothing, so unlit faces are no-ops.
const WHITES = Array.from({ length: 101 }, (_, i) => {
  const k = i / 100;
  const c = (v: number) =>
    Math.round(v * k)
      .toString(16)
      .padStart(2, '0');
  return `#${c(250)}${c(244)}${c(232)}`;
});

const EMPTY_BALL = {
  v: [vec(0, 0), vec(0, 0), vec(0, 0)],
  t: [vec(0, 0), vec(0, 0), vec(0, 0)],
  c: ['#ffffff', '#ffffff', '#ffffff'],
  w: ['#ffffff00', '#ffffff00', '#ffffff00'],
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
    () => (image ? buildPaperBallMesh(Math.random(), width / height) : null),
    [image, width, height],
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

  // 2D crumple owns the drag; at the end of the crumple the mesh ball fades
  // in FAST as a flattened wad that matches the 2D shader's loose-crumple
  // look, then folds shut into the ball (the morph in the `ball` worklet).
  // The crossfade hides inside that motion instead of reading as a dissolve.
  const handoff = useDerivedValue(() => {
    const throwK = Math.min(Math.max(state.throwU.value / 0.12, 0), 1);
    const crumpleK = Math.min(Math.max((state.t.value - 0.78) / 0.08, 0), 1);
    return Math.max(throwK, crumpleK);
  });
  const opacity2D = useDerivedValue(() => {
    const throwK = Math.min(Math.max(state.throwU.value / 0.12, 0), 1);
    const fadeK = Math.min(Math.max((state.t.value - 0.78) / 0.12, 0), 1);
    return state.active.value * (1 - Math.max(throwK, fadeK));
  });
  const opacity3D = useDerivedValue(() => state.active.value * handoff.value);

  // ── 3D ball: rotate, light, cull, depth-sort, project — per frame ──
  const ball = useDerivedValue(() => {
    const u = state.throwU.value;
    if (!mesh || (u <= 0.001 && state.t.value < 0.775)) return EMPTY_BALL;

    // fold-shut morph: the wad starts wide and flat (view space) and
    // contracts into the tight ball as the crumple completes
    const m = Math.min(Math.max((state.t.value - 0.78) / 0.22, 0), 1);
    const sxy = 1 + 0.55 * (1 - m);
    const sz = 0.3 + 0.7 * m;

    const iu = 1 - u;
    // before the throw the ball sits under the finger (cx/cy settle to the
    // screen center during the confirm animation), then flies the Bézier arc
    const bx = u > 0.001 ? iu * iu * cx + 2 * iu * u * ctrlX + u * u * binX : state.cx.value;
    const by = u > 0.001 ? iu * iu * cy + 2 * iu * u * ctrlY + u * u * binY : state.cy.value;
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
      w: string;
    }[] = [];

    for (let f = 0; f < mesh.faceCount; f++) {
      const rp: number[][] = [];
      for (let i = 0; i < 3; i++) {
        const o = (f * 3 + i) * 3;
        const x = pos[o];
        const y = pos[o + 1];
        const z = pos[o + 2];
        // Rodrigues rotation, then the fold-shut scale in view space
        const dotkv = kx * x + ky * y + kz * z;
        const crx = ky * z - kz * y;
        const cry = kz * x - kx * z;
        const crz = kx * y - ky * x;
        rp.push([
          (x * ca + crx * sa + kx * dotkv * (1 - ca)) * sxy,
          (y * ca + cry * sa + ky * dotkv * (1 - ca)) * sxy,
          (z * ca + crz * sa + kz * dotkv * (1 - ca)) * sz,
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

      // paper bounces light — high ambient floor, d² for facet contrast on top
      const d = Math.max((nx * lx + ny * ly + nz * lz) / ll, 0);
      const light = Math.min(1, 0.58 + 0.5 * d * d);
      const g = GRAYS[Math.round(light * 100)];
      // facets catching the light wash toward blank paper — print fades there
      const wash = Math.min(Math.max((light - 0.78) * 2.2, 0), 0.6);
      const w = WHITES[Math.round(wash * 100)];

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
      kept.push({ z: zsum / 3, p, t, g, w });
    }

    kept.sort((a, b) => a.z - b.z); // painter: far faces first

    const v: { x: number; y: number }[] = [];
    const t: { x: number; y: number }[] = [];
    const c: string[] = [];
    const w: string[] = [];
    for (const face of kept) {
      v.push(face.p[0], face.p[1], face.p[2]);
      t.push(face.t[0], face.t[1], face.t[2]);
      c.push(face.g, face.g, face.g);
      w.push(face.w, face.w, face.w);
    }
    return { v, t, c, w };
  }, [mesh, width, height, binX, binY]);

  const ballVerts = useDerivedValue(() => ball.value.v);
  const ballTexs = useDerivedValue(() => ball.value.t);
  const ballCols = useDerivedValue(() => ball.value.c);
  const ballWash = useDerivedValue(() => ball.value.w);

  // rounded drop shadow just under the ball itself — the ball floats toward
  // the viewer over the page, so its shadow is a soft near-circle behind it,
  // offset down-right (light comes from the top-left)
  const shadowRect = useDerivedValue(() => {
    const u = state.throwU.value;
    const iu = 1 - u;
    const bx =
      u > 0.001 ? iu * iu * cx + 2 * iu * u * ctrlX + u * u * binX : state.cx.value;
    const by =
      u > 0.001 ? iu * iu * cy + 2 * iu * u * ctrlY + u * u * binY : state.cy.value;
    const pr = ballR * (1 - 0.84 * u);
    const r = pr * 1.02;
    return {
      x: bx - r + pr * 0.16,
      y: by - r * 0.95 + pr * 0.34,
      width: 2 * r,
      height: 1.9 * r,
    };
  });
  const shadowOpacity = useDerivedValue(
    () => state.active.value * handoff.value * 0.25 * (1 - 0.45 * state.throwU.value),
  );

  return (
    <Canvas style={styles.canvas} pointerEvents="none">
      {image ? (
        <>
          <Oval rect={shadowRect} color="black" opacity={shadowOpacity}>
            <BlurMask blur={16} style="normal" />
          </Oval>
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
            {/* pass 1: the article texture mapped onto the facets, unlit —
                Vertices' own colors+blendMode combine unreliably, so lighting
                is applied by the follow-up passes over the same triangles */}
            <Vertices vertices={ballVerts} textures={ballTexs}>
              <ImageShader
                image={image}
                fit="fill"
                rect={{ x: 0, y: 0, width, height }}
              />
            </Vertices>
            {/* pass 2: multiply per-facet grays — the crease shading */}
            <Group blendMode="multiply">
              <Vertices vertices={ballVerts} colors={ballCols} />
            </Group>
            {/* pass 3: additive white — lit facets wash toward blank paper */}
            <Group blendMode="plus">
              <Vertices vertices={ballVerts} colors={ballWash} />
            </Group>
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
