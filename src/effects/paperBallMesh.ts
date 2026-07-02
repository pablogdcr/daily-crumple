/**
 * Geometry for the 3D crumpled paper ball: an icosphere whose vertices are
 * radially displaced by seeded noise. Each face keeps its own copy of the
 * vertices (flat shading — hard creases between facets, like real crumpled
 * paper) and maps to a patch of the article page via spherical UVs, so the
 * print wraps around the ball. Built once per delete gesture on the JS thread;
 * per-frame rotation/projection happens in a worklet.
 */

export interface PaperBallMesh {
  /** Per-face vertex positions, unit-ish radius: [f0v0x, f0v0y, f0v0z, f0v1x, ...] */
  positions: number[];
  /** Per-face texture coords in 0..1 page space: [f0v0u, f0v0v, f0v1u, ...] */
  uvs: number[];
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

  // ── crumple: radial displacement per unique vertex (facets stay welded) ──
  const radii = verts.map(() => 1 + (rand() - 0.5) * 0.5);
  const displaced = verts.map(([x, y, z], i) => [
    x * radii[i],
    y * radii[i],
    z * radii[i],
  ]);

  // ── spherical UVs from the undisplaced directions (page wraps the ball) ──
  const uvOf = (i: number): [number, number] => {
    const [x, y, z] = verts[i];
    const u = 0.5 + Math.atan2(z, x) / (2 * Math.PI);
    const v = Math.acos(Math.max(-1, Math.min(1, y))) / Math.PI;
    return [u, v];
  };

  const positions: number[] = [];
  const uvs: number[] = [];
  for (const face of faces) {
    // fix UV seam: if the face straddles the atan2 wrap, shift the low side
    const fuv = face.map(uvOf);
    const us = fuv.map(([u]) => u);
    const wrap = Math.max(...us) - Math.min(...us) > 0.5;
    for (let i = 0; i < 3; i++) {
      const [x, y, z] = displaced[face[i]];
      positions.push(x, y, z);
      let [u, v] = fuv[i];
      if (wrap && u < 0.5) u += 1;
      uvs.push(Math.min(u, 1), v);
    }
  }

  return { positions, uvs, faceCount: faces.length };
}
