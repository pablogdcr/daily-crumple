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
// additive paper-white by intensity - lit facets wash toward blank paper.
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
 * each scrap folds - staggered - onto its facet of the displaced icosphere.
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
  // the target sits just below the rim - the ball stays visible through the
  // transparent holes of the wire mesh
  const bin = binGeometry(width, height);
  const tgtX = bin.cx;
  const tgtY = bin.mouthY + bin.ry + ballR * 0.6;
  // control point above the chord - a small up-toss before the drop
  const ctrlX = cx + 26;
  const ctrlY = cy - 0.17 * height;

  const opacity3D = useDerivedValue(() => state.active.value);

  // ── the folding page: gather, fold, light, depth-sort, project per frame ──
  const ball = useDerivedValue(() => {
    const u = state.throwU.value;
    const tt = state.t.value;
    if (!mesh || (u <= 0.001 && state.active.value < 0.5)) return EMPTY_BALL;

    // fold progress spans the WHOLE gesture: 0 = the exact flat page
    const m = Math.min(Math.max(tt, 0), 1);
    // gather the un-balled paper toward the finger - keeps half-folded
    // scraps compact around the ball instead of shredding across the page
    const gather = m * (2 - m);
    const KINV = 1 / (1 - 0.48 * gather);
    // corner peel: a crease advances from the grabbed corner along the pull
    // diagonal at half the pull (fold mechanics), and the paper behind it
    // flips over - the page turns like a pulled corner before it balls up
    const diag = Math.hypot(width, height);
    const pdx = -width / diag; // pull direction: top-right → bottom-left
    const pdy = height / diag;
    const crease = m * diag * 0.24;
    const curlR = 0.125 * width;

    const iu = 1 - u;
    // before the throw the ball sits under the finger (cx/cy settle to the
    // screen center during the confirm animation), then flies the Bézier arc
    const bx = u > 0.001 ? iu * iu * cx + 2 * iu * u * ctrlX + u * u * tgtX : state.cx.value;
    let by = u > 0.001 ? iu * iu * cy + 2 * iu * u * ctrlY + u * u * tgtY : state.cy.value;
    // once landed, the ball rides the sinking basket down (it stays visible
    // through the mesh) and leaves the screen with it
    if (u > 0.99) by += (1 - state.binRise.value) * bin.hiddenY;
    // slight shrink only - the can is near the viewer, not across the room
    const pr = ballR * (1 - 0.3 * u);

    // tumble: fixed axis, angle driven by the flight ONLY - during the fold
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
      let peelAcc = 0;
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

        // fold origin: this vertex's spot on the page, rotated about the
        // advancing crease and capped at a full fold-over - near the crease
        // the paper is mid-turn, further back it lies flat, turned over
        const o2 = (f * 3 + i) * 2;
        const px = uvs[o2] * width;
        const py = uvs[o2 + 1] * height;
        const a = (px - width) * pdx + py * pdy;
        const wPeel = crease - a;
        let qx = px;
        let qy = py;
        let qz = 0;
        if (wPeel > 0) {
          const th = Math.min(wPeel / curlR, Math.PI);
          const shift = wPeel - wPeel * Math.cos(th);
          qx += pdx * shift;
          qy += pdy * shift;
          // the flat flipped-over part keeps a hair of lift so the painter
          // sort draws it above the un-peeled sheet beneath
          qz = wPeel * Math.sin(th) + 6 * (th / Math.PI);
          peelAcc += th;
        }
        // wrap the peeled sheet around the forming ball
        let dxp = qx - bx;
        let dyp = qy - by;
        const rs = Math.hypot(dxp, dyp) || 1;
        dxp /= rs;
        dyp /= rs;
        const exq = dxp > 1e-4 ? (width - bx) / dxp : dxp < -1e-4 ? -bx / dxp : 1e8;
        const eyq = dyp > 1e-4 ? (height - by) / dyp : dyp < -1e-4 ? -by / dyp : 1e8;
        const E = Math.max(Math.min(exq, eyq), 1);
        const R = E + (ballR - E) * gather;
        const rStart = R * Math.pow(Math.min(rs / E, 1), KINV);
        const sx = (dxp * rStart) / pr;
        const sy = (dyp * rStart) / pr;
        const sz = (qz * (1 - 0.85 * gather)) / pr;

        rp.push([sx + (rx - sx) * mf, sy + (ry - sy) * mf, sz + (rz - sz) * mf]);
      }
      // mid-blend a scrap's edges leave its neighbours' (different facets) -
      // inflate about the centroid so paper overlaps instead of opening
      // slits; tapers to 0 at both ends so page and ball stay exact
      const infl = 1.55 * mf * (1 - mf);
      if (infl > 0.001) {
        const gx = (rp[0][0] + rp[1][0] + rp[2][0]) / 3;
        const gy = (rp[0][1] + rp[1][1] + rp[2][1]) / 3;
        const gz = (rp[0][2] + rp[1][2] + rp[2][2]) / 3;
        for (let i = 0; i < 3; i++) {
          rp[i][0] += (rp[i][0] - gx) * infl;
          rp[i][1] += (rp[i][1] - gy) * infl;
          rp[i][2] += (rp[i][2] - gz) * infl;
        }
      }
      // face normal - two-sided while folding (a scrap may show its back)
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

      // high ambient floor + d² facet contrast; peeled-but-not-yet-balled
      // scraps take facet lighting too, so the turning flap shades like paper
      const pf = Math.min(peelAcc / (3 * Math.PI), 1);
      const fs = Math.max(mf, pf * 0.85);
      const d = Math.max((nx * lx + ny * ly + nz * lz) / ll, 0);
      const facetLight = Math.min(1, 0.58 + 0.5 * d * d);
      const light = 1 + (facetLight - 1) * fs;
      const g = GRAYS[Math.round(light * 100)];
      // facets catching the light wash toward blank paper - print fades there
      const wash = Math.min(Math.max((light - 0.78) * 2.2, 0), 0.6) * fs;
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

  // soft near-circle drop shadow behind the ball, offset down-right
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
    // deepens as the paper balls up, fades out during the throw
    const fold = Math.min(Math.max((state.t.value - 0.35) / 0.65, 0), 1);
    const u = state.throwU.value;
    return state.active.value * fold * 0.25 * (1 - u) * (1 - u);
  });

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      {image ? (
        <>
          <Oval rect={shadowRect} color="black" opacity={shadowOpacity}>
            <BlurMask blur={16} style="normal" />
          </Oval>
          {/* the can's interior renders behind the ball, its body in front -
              the ball visibly drops INSIDE */}
          <TrashBin
            part="back"
            rise={state.binRise}
            pulse={state.binScale}
            width={width}
            height={height}
          />
          <Group opacity={opacity3D}>
            {/* pass 1: the article texture mapped onto the facets, unlit -
                Vertices' own colors+blendMode combine unreliably, so lighting
                is applied by the follow-up passes over the same triangles */}
            <Vertices vertices={ballVerts} textures={ballTexs}>
              <ImageShader
                image={image}
                fit="fill"
                rect={{ x: 0, y: 0, width, height }}
              />
            </Vertices>
            {/* pass 2: multiply per-facet grays - the crease shading */}
            <Group blendMode="multiply">
              <Vertices vertices={ballVerts} colors={ballCols} />
            </Group>
            {/* pass 3: additive white - lit facets wash toward blank paper */}
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

