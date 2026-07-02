import {
  BlurMask,
  Canvas,
  Group,
  ImageShader,
  Oval,
  Vertices,
  vec,
  type SkImage,
} from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { useDerivedValue } from 'react-native-reanimated';
import { TrashBin, binGeometry } from '../components/TrashBin';
import type { CrumpleState } from '../engine/useCrumpleGesture';
import { buildPaperBallMesh } from './paperBallMesh';

interface Props {
  image: SkImage | null;
  state: CrumpleState;
  width: number;
  height: number;
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
 * The whole crumple is ONE representation: 80 page scraps (mesh facets whose
 * texture coords tile the page exactly). At t=0 they reassemble the page
 * pixel-perfectly; as the drag progresses the page gathers toward the finger
 * (same wrap math the old 2D shader used, now driven by fold progress) while
 * each scrap folds — staggered — onto its facet of the displaced icosphere.
 * No 2D→3D handoff exists: the paper you see folding IS the ball. The throw
 * then tumbles the finished ball along a Bézier arc into the bin.
 */
export function CrumpleOverlay({ image, state, width, height }: Props) {
  const mesh = useMemo(
    () => (image ? buildPaperBallMesh(Math.random(), width / height) : null),
    [image, width, height],
  );

  const cx = width / 2;
  const cy = height / 2;
  const ballR = 0.145 * width;
  // the throw drops the ball into the mouth of the bin risen at the bottom;
  // the target sits below the rim so the ball ends fully inside the can
  const bin = binGeometry(width, height);
  const tgtX = bin.cx;
  const tgtY = bin.mouthY + bin.ry + ballR;
  // control point above the chord — a small up-toss before the drop
  const ctrlX = cx + 26;
  const ctrlY = cy - 0.17 * height;

  const opacity3D = useDerivedValue(() => state.active.value);

  // ── the folding page: gather, fold, light, depth-sort, project per frame ──
  const ball = useDerivedValue(() => {
    const u = state.throwU.value;
    const tt = state.t.value;
    // u ≥ 0.985: the ball has sunk below the bin's rim, fully hidden by its
    // front wall — stop drawing so it doesn't reappear when the bin sinks
    if (!mesh || u >= 0.985 || (u <= 0.001 && state.active.value < 0.5))
      return EMPTY_BALL;

    // fold progress spans the WHOLE gesture: 0 = the exact flat page
    const m = Math.min(Math.max(tt, 0), 1);
    // continuous gather of the un-folded paper toward the finger — identity
    // at m=0 (k=1, R=E), tight wrap by m=1: same math as the old 2D shader
    const gather = m * (2 - m);
    const KINV = 1 / (1 - 0.48 * gather);

    const iu = 1 - u;
    // before the throw the ball sits under the finger (cx/cy settle to the
    // screen center during the confirm animation), then flies the Bézier arc
    const bx = u > 0.001 ? iu * iu * cx + 2 * iu * u * ctrlX + u * u * tgtX : state.cx.value;
    const by = u > 0.001 ? iu * iu * cy + 2 * iu * u * ctrlY + u * u * tgtY : state.cy.value;
    // slight shrink only — the can is near the viewer, not across the room
    const pr = ballR * (1 - 0.3 * u);

    // tumble: fixed axis, angle driven by the flight ONLY — during the fold
    // the wrap stays oriented to the viewer (page centre on the front pole)
    const angle = u * 5.5;
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
      // staggered fold: each scrap starts crumpling at its own moment
      const dl = mesh.stagger[f];
      let mf = Math.min(Math.max((m - dl) / (1 - dl), 0), 1);
      mf = mf * mf * (3 - 2 * mf);

      const rp: number[][] = [];
      for (let i = 0; i < 3; i++) {
        const o = (f * 3 + i) * 3;
        const x = pos[o];
        const y = pos[o + 1];
        const z = pos[o + 2];
        // fold target: Rodrigues-rotated ball vertex
        const dotkv = kx * x + ky * y + kz * z;
        const crx = ky * z - kz * y;
        const cry = kz * x - kx * z;
        const crz = kx * y - ky * x;
        const rx = x * ca + crx * sa + kx * dotkv * (1 - ca);
        const ry = y * ca + cry * sa + ky * dotkv * (1 - ca);
        const rz = z * ca + crz * sa + kz * dotkv * (1 - ca);

        // fold origin: this vertex's spot on the page, gathered toward the
        // center exactly as the 2D wrap draws it at the handoff instant
        const o2 = (f * 3 + i) * 2;
        let dxp = uvs[o2] * width - bx;
        let dyp = uvs[o2 + 1] * height - by;
        const rs = Math.hypot(dxp, dyp) || 1;
        dxp /= rs;
        dyp /= rs;
        const ex = dxp > 1e-4 ? (width - bx) / dxp : dxp < -1e-4 ? -bx / dxp : 1e8;
        const ey = dyp > 1e-4 ? (height - by) / dyp : dyp < -1e-4 ? -by / dyp : 1e8;
        const E = Math.max(Math.min(ex, ey), 1);
        const R = E + (ballR - E) * gather;
        const rStart = R * Math.pow(Math.min(rs / E, 1), KINV);
        const sx = (dxp * rStart) / pr;
        const sy = (dyp * rStart) / pr;

        rp.push([sx + (rx - sx) * mf, sy + (ry - sy) * mf, rz * mf]);
      }
      // face normal — two-sided while folding (a scrap may show its back)
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
      if (nz <= 0.02 && m > 0.999) continue; // backface-cull the finished ball only
      if (nz < 0) {
        nx = -nx;
        ny = -ny;
        nz = -nz;
      }

      // paper bounces light — high ambient floor, d² for facet contrast on
      // top; scraps still flat on the page keep the page's own brightness
      const d = Math.max((nx * lx + ny * ly + nz * lz) / ll, 0);
      const facetLight = Math.min(1, 0.58 + 0.5 * d * d);
      const light = 1 + (facetLight - 1) * mf;
      const g = GRAYS[Math.round(light * 100)];
      // facets catching the light wash toward blank paper — print fades there
      const wash = Math.min(Math.max((light - 0.78) * 2.2, 0), 0.6) * mf;
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
  }, [mesh, width, height]);

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
      u > 0.001 ? iu * iu * cx + 2 * iu * u * ctrlX + u * u * tgtX : state.cx.value;
    const by =
      u > 0.001 ? iu * iu * cy + 2 * iu * u * ctrlY + u * u * tgtY : state.cy.value;
    const pr = ballR * (1 - 0.3 * u);
    const r = pr * 1.02;
    return {
      x: bx - r + pr * 0.16,
      y: by - r * 0.95 + pr * 0.34,
      width: 2 * r,
      height: 1.9 * r,
    };
  });
  const shadowOpacity = useDerivedValue(() => {
    // shadow deepens as the paper lifts off the page and balls up —
    // a flat page shouldn't cast a ball's shadow; it fades out entirely
    // during the throw (the ball leaves the page for the bin)
    const fold = Math.min(Math.max((state.t.value - 0.35) / 0.65, 0), 1);
    const u = state.throwU.value;
    return state.active.value * fold * 0.25 * (1 - u) * (1 - u);
  });

  return (
    <Canvas style={styles.canvas} pointerEvents="none">
      {image ? (
        <>
          <Oval rect={shadowRect} color="black" opacity={shadowOpacity}>
            <BlurMask blur={16} style="normal" />
          </Oval>
          {/* the can's interior renders behind the ball, its body in front —
              the ball visibly drops INSIDE */}
          <TrashBin
            part="back"
            rise={state.binRise}
            pulse={state.binScale}
            width={width}
            height={height}
          />
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
          <TrashBin
            part="front"
            rise={state.binRise}
            pulse={state.binScale}
            width={width}
            height={height}
          />
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
