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

export function buildPaperBallMesh(seed: number): PaperBallMesh {
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

  // ── crumple: radial displacement per unique vertex (facets stay welded),
  // plus a few deep dents so the silhouette is lumpy, not spherical ──
  const radii = verts.map(() => 1 + (rand() - 0.5) * 0.72);
  for (let d = 0; d < 4; d++) {
    radii[Math.floor(rand() * radii.length)] *= 0.62;
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
  // seeded shuffle: which scrap of the page lands on which facet of the ball
  for (let i = pageTris.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pageTris[i], pageTris[j]] = [pageTris[j], pageTris[i]];
  }

  const positions: number[] = [];
  const uvs: number[] = [];
  const stagger: number[] = [];
  faces.forEach((face, f) => {
    // rotate the scrap↔facet vertex correspondence so text lands at varied
    // angles on the finished ball
    const rot = Math.floor(rand() * 3);
    for (let i = 0; i < 3; i++) {
      const [x, y, z] = displaced[face[i]];
      positions.push(x, y, z);
      const [u, v] = pageTris[f][(i + rot) % 3];
      uvs.push(u, v);
    }
    stagger.push(rand() * 0.35);
  });

  return { positions, uvs, stagger, faceCount: faces.length };
}
