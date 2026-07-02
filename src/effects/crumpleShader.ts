import { Skia } from '@shopify/react-native-skia';

/**
 * Crumple-to-ball shader for the delete gesture. Progress-driven (uT 0→1):
 * the page contracts toward uCenter, multi-octave value noise folds it with
 * rising frequency, facet shading (quantized normals) hardens as the paper
 * compacts, and a noisy shrinking disc eats the rectangular silhouette so the
 * edges read as folding inward. At uT=0 the output is exactly the flat page —
 * the live→shader handoff is invisible. Never true 3D; it just reads that way.
 */
const SKSL = `
uniform shader uImage;
uniform float2 uRes;
uniform float2 uCenter;
uniform float  uT;
uniform float  uSeed;

float hash(float2 p) {
  return fract(sin(dot(p, float2(127.1, 311.7))) * 43758.5453);
}

float vnoise(float2 p) {
  float2 i = floor(p);
  float2 f = fract(p);
  float2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + float2(1.0, 0.0)), u.x),
             mix(hash(i + float2(0.0, 1.0)), hash(i + float2(1.0, 1.0)), u.x), u.y);
}

float fbm(float2 p) {
  return 0.55 * vnoise(p) + 0.28 * vnoise(p * 2.13 + 7.7) + 0.17 * vnoise(p * 4.31 + 3.1);
}

float2 hash2(float2 p) {
  return fract(sin(float2(dot(p, float2(127.1, 311.7)),
                          dot(p, float2(269.5, 183.3)))) * 43758.5453);
}

// Voronoi facets: returns (cell id, F1, F2). Cell borders are the creases.
float4 voronoi(float2 p) {
  float2 i = floor(p);
  float2 f = fract(p);
  float F1 = 8.0;
  float F2 = 8.0;
  float2 bestId = float2(0.0);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      float2 g = float2(float(x), float(y));
      float2 o = hash2(i + g);
      float2 rv = g + o - f;
      float ds = dot(rv, rv);
      if (ds < F1) {
        F2 = F1;
        F1 = ds;
        bestId = i + g;
      } else if (ds < F2) {
        F2 = ds;
      }
    }
  }
  return float4(bestId, sqrt(F1), sqrt(F2));
}

half4 main(float2 p) {
  float t = uT;
  float2 d = p - uCenter;
  float r = max(length(d), 0.0001);
  float2 dirv = d / r;   // (cos θ, sin θ) — used directly, no atan wrap issues

  // ── distance from the crumple center to the page edge along this ray ──
  float ex = abs(dirv.x) > 0.0001
           ? (dirv.x > 0.0 ? uRes.x - uCenter.x : uCenter.x) / abs(dirv.x) : 1e8;
  float ey = abs(dirv.y) > 0.0001
           ? (dirv.y > 0.0 ? uRes.y - uCenter.y : uCenter.y) / abs(dirv.y) : 1e8;
  float E = max(min(ex, ey), 1.0);

  // ── silhouette: the page outline itself morphs rectangle → noisy ball ──
  // At t=0 the "ball radius" along every ray IS the page edge (identity).
  // As t grows it collapses toward the final ball size — corners (largest E)
  // travel furthest, so the corners visibly fold in first, like real hands.
  float Rf = 0.19 * uRes.x;
  float morph = smoothstep(0.0, 0.9, t);
  // rim: soft wobble + occasional sharp pokes (paper corners sticking out)
  float rimN = (fbm(dirv * 3.0 + uSeed) - 0.5) * 0.26 * t
             + (pow(fbm(dirv * 6.0 + uSeed * 1.7), 3.0) - 0.12) * 0.45 * t;
  float R = mix(E, Rf, morph) * (1.0 + rimN);
  float rr = r / R;

  // crisp edge: ~2px anti-aliasing band only, no soft fade
  float band = 1.0 / R;
  float alpha = 1.0 - smoothstep(1.0 - band, 1.0 + band, rr);

  // ── wrap: the whole page along this ray is swallowed into radius R, and
  // material bunches toward the rim like paper wrapping a ball ──
  float k = mix(1.0, 0.52, smoothstep(0.15, 1.0, t));
  float rs = E * pow(clamp(rr, 0.0, 1.0), k);
  float2 sp = uCenter + dirv * rs;

  // ── facet structure: Voronoi cells are flat paper faces, borders are creases ──
  float facetize = smoothstep(0.12, 0.7, t);
  float cellSize = mix(190.0, 105.0, t);
  float4 v = voronoi(sp / cellSize + uSeed);
  float2 cid = v.xy;
  float border = v.w - v.z;                    // → 0 at a crease line
  float2 frnd  = hash2(cid + uSeed);
  float2 frnd2 = hash2(cid + uSeed + 17.3);

  // each facet is a shifted piece of the page — text breaks at the creases
  sp += (frnd2 - 0.5) * 34.0 * facetize;
  // micro-wrinkles inside a facet
  float nf = mix(0.012, 0.02, t);
  sp += (float2(fbm(sp * nf + uSeed), fbm(sp * nf + uSeed + 19.3)) - 0.5) * (t * 22.0);
  sp = clamp(sp, float2(0.0), uRes);

  // ── lighting: flat per-facet normals, sharp dark creases, white highlights ──
  float3 L = normalize(float3(-0.4, -0.5, 0.75));
  float tilt = mix(0.3, 1.0, t);
  float3 fn = normalize(float3((frnd - 0.5) * 2.0 * tilt, 1.0));
  float facetLight = max(dot(fn, L), 0.0);
  float facetShade = 0.68 + 0.5 * facetLight;
  // crease valleys: darken near the cell borders, thin bright ridge beside them
  float valley = smoothstep(0.0, 0.14, border);
  float ridge  = smoothstep(0.14, 0.28, border) - smoothstep(0.28, 0.5, border);
  facetShade *= mix(0.55, 1.0, valley);
  facetShade += ridge * 0.2;
  float shade = mix(1.0, facetShade, facetize);

  // ── spherical falloff so it reads as a lit ball ──
  float nz = sqrt(max(1.0 - rr * rr, 0.0));
  float3 ns = normalize(float3(dirv * rr, nz + 0.2));
  float sphere = 0.62 + 0.48 * max(dot(ns, L), 0.0);
  shade *= mix(1.0, sphere, smoothstep(0.3, 0.9, t));

  half4 c = uImage.eval(sp);
  // light-facing facets wash toward paper-white (print hides in the crumple)
  half3 paper = half3(0.97, 0.94, 0.88);
  half wash = half(facetize * clamp(facetLight * 1.2 - 0.2, 0.0, 0.85));
  half3 col = mix(c.rgb, paper, wash) * half(shade);
  return half4(col * half(alpha), c.a * half(alpha));
}
`;

function make() {
  try {
    const effect = Skia.RuntimeEffect.Make(SKSL);
    if (!effect) console.error('[crumple] RuntimeEffect.Make returned null');
    return effect;
  } catch (e) {
    console.error('[crumple] SkSL compile failed:', e);
    return null;
  }
}

export const crumpleEffect = make()!;
