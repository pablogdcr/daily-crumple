/**
 * Geometry for the 3D crumpled paper ball: an icosphere whose vertices are
 * radially displaced by seeded noise, with a few deep dents. Each face keeps
 * its own copy of the vertices (flat shading — hard creases between facets,
 * like real crumpled paper).
 *
 * The page is partitioned into exactly as many triangular scraps as the ball
 * has facets (5×8 grid of quads → 80 triangles). Each facet is assigned one
 * scrap: the scrap's page coordinates are BOTH its texture mapping and its
 * fold start position, so at fold=0 the facets reassemble the complete page,
 * and during the fold each scrap of paper visibly travels from its spot on
 * the page to its place on the ball. Nothing is swapped or faded — the page
 * itself folds into the ball. Built once per delete gesture on the JS
 * thread; per-frame folding/rotation/projection happens in a worklet.
 */

export interface PaperBallMesh {
  /** Per-face vertex positions, unit-ish radius: [f0v0x, f0v0y, f0v0z, f0v1x, ...] */
  positions: number[];
  /** Per-face page-scrap coords in 0..1 page space — texture AND fold origin. */
  uvs: number[];
  /** Per-face fold delay (0..0.35) — scraps crumple in staggered, not in lockstep. */
  stagger: number[];
  faceCount: number;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** @param aspect page width / height — used to measure page angles in screen space */
export function buildPaperBallMesh(seed: number, aspect: number): PaperBallMesh {
  const rand = mulberry32(Math.floor(seed * 1e6) + 1);

  // ── icosahedron ──
  const t = (1 + Math.sqrt(5)) / 2;
  const raw: number[][] = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ].map(([x, y, z]) => {
    const l = Math.hypot(x, y, z);
    return [x / l, y / l, z / l];
  });
  let faces: number[][] = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];

  // ── one subdivision: 20 → 80 faces (≈40 visible facets — chunky like real) ──
  const verts = raw.slice();
  const midCache = new Map<string, number>();
  const midpoint = (a: number, b: number) => {
    const key = a < b ? `${a}_${b}` : `${b}_${a}`;
    const hit = midCache.get(key);
    if (hit !== undefined) return hit;
    const [ax, ay, az] = verts[a];
    const [bx, by, bz] = verts[b];
    const mx = (ax + bx) / 2;
    const my = (ay + by) / 2;
    const mz = (az + bz) / 2;
    const l = Math.hypot(mx, my, mz);
    verts.push([mx / l, my / l, mz / l]);
    midCache.set(key, verts.length - 1);
    return verts.length - 1;
  };
  const next: number[][] = [];
  for (const [a, b, c] of faces) {
    const ab = midpoint(a, b);
    const bc = midpoint(b, c);
    const ca = midpoint(c, a);
    next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
  }
  faces = next;

  // ── crumple: radial displacement per unique vertex (facets stay welded).
  // Kept shallow — a paper ball is ROUND with many small creases; deep
  // displacement reads as a rock. A couple of soft dents break the sphere.
  const radii = verts.map(() => 1 + (rand() - 0.5) * 0.26);
  for (let d = 0; d < 3; d++) {
    radii[Math.floor(rand() * radii.length)] *= 0.86;
  }
  const displaced = verts.map(([x, y, z], i) => [
    x * radii[i],
    y * radii[i],
    z * radii[i],
  ]);

  // ── page partition: 5×8 grid of quads → 80 triangles, one per facet ──
  const pageTris: [number, number][][] = [];
  for (let j = 0; j < 8; j++) {
    for (let i = 0; i < 5; i++) {
      const x0 = i / 5;
      const x1 = (i + 1) / 5;
      const y0 = j / 8;
      const y1 = (j + 1) / 8;
      pageTris.push([[x0, y0], [x1, y0], [x0, y1]]);
      pageTris.push([[x1, y1], [x0, y1], [x1, y0]]);
    }
  }

  // ── coherent wrap assignment: the page rolls onto the sphere ──
  // Page center → front pole, page rim → wraps to the back. Neighbouring
  // scraps land on neighbouring facets, so mid-fold the sheet stays
  // contiguous (thin creases, not holes) — like wrapping paper round a ball.
  // Angles are measured in screen space (v scaled by 1/aspect).
  const rhoMax = Math.hypot(0.5, 0.5 / aspect);
  const pageInfo = pageTris.map((tri, idx) => {
    const cu = (tri[0][0] + tri[1][0] + tri[2][0]) / 3 - 0.5;
    const cv = ((tri[0][1] + tri[1][1] + tri[2][1]) / 3 - 0.5) / aspect;
    return { idx, theta: Math.atan2(cv, cu), rho: Math.hypot(cu, cv) / rhoMax };
  });
  const facetInfo = faces.map((face, idx) => {
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (const vi of face) {
      cx += verts[vi][0];
      cy += verts[vi][1];
      cz += verts[vi][2];
    }
    const l = Math.hypot(cx, cy, cz) || 1;
    return {
      idx,
      theta: Math.atan2(cy / l, cx / l),
      rho: Math.acos(Math.max(-1, Math.min(1, cz / l))) / Math.PI,
    };
  });
  // greedy nearest-match, front facets first (they claim the page center)
  facetInfo.sort((a, b) => a.rho - b.rho);
  const taken = new Array<boolean>(pageTris.length).fill(false);
  const assigned = new Array<number>(faces.length).fill(0);
  for (const fi of facetInfo) {
    let best = -1;
    let bestCost = Infinity;
    for (const pi of pageInfo) {
      if (taken[pi.idx]) continue;
      let dth = Math.abs(pi.theta - fi.theta);
      if (dth > Math.PI) dth = 2 * Math.PI - dth;
      const avgRho = (pi.rho + fi.rho) / 2;
      const cost = (pi.rho - fi.rho) ** 2 + ((dth / Math.PI) * avgRho) ** 2;
      if (cost < bestCost) {
        bestCost = cost;
        best = pi.idx;
      }
    }
    taken[best] = true;
    assigned[fi.idx] = best;
  }

  const positions: number[] = [];
  const uvs: number[] = [];
  const stagger: number[] = [];
  faces.forEach((face, f) => {
    for (let i = 0; i < 3; i++) {
      const [x, y, z] = displaced[face[i]];
      positions.push(x, y, z);
    }
    const tri = pageTris[assigned[f]];
    // pick the corner correspondence (cyclic — no mirroring) that minimises
    // how much the scrap spins while it travels to its facet
    const pcu = (tri[0][0] + tri[1][0] + tri[2][0]) / 3;
    const pcv = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
    const pAng = tri.map(([u, v]) => Math.atan2((v - pcv) / aspect, u - pcu));
    let fcx = 0;
    let fcy = 0;
    for (const vi of face) {
      fcx += verts[vi][0];
      fcy += verts[vi][1];
    }
    const fAng = face.map((vi) => Math.atan2(verts[vi][1] - fcy / 3, verts[vi][0] - fcx / 3));
    let bestRot = 0;
    let bestCost = Infinity;
    for (let rot = 0; rot < 3; rot++) {
      let cost = 0;
      for (let i = 0; i < 3; i++) {
        let da = Math.abs(fAng[i] - pAng[(i + rot) % 3]);
        if (da > Math.PI) da = 2 * Math.PI - da;
        cost += da;
      }
      if (cost < bestCost) {
        bestCost = cost;
        bestRot = rot;
      }
    }
    for (let i = 0; i < 3; i++) {
      const [u, v] = tri[(i + bestRot) % 3];
      uvs.push(u, v);
    }
    // scraps fold in the order the peel reaches them, sweeping from the
    // grabbed corner. The 0.12 floor keeps the drag's start a pure page flip;
    // spread and jitter stay small so neighbours travel near-together —
    // otherwise the sheet opens gaps and reads as cut, not crumpled
    const dCorner =
      Math.hypot(pcu - 1, pcv / aspect) / Math.hypot(1, 1 / aspect);
    stagger.push(0.12 + 0.3 * dCorner + 0.02 * rand());
  });

  return { positions, uvs, stagger, faceCount: faces.length };
}
