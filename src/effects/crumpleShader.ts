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

half4 main(float2 p) {
  float t = uT;
  float ts = smoothstep(0.0, 1.0, t);

  // ── contract toward the crumple center ──
  float scale = mix(1.0, 0.42, ts);
  float2 rp = uCenter + (p - uCenter) / scale;   // undisplaced shrink coords

  // ── noise folds: paper gathers unevenly as it compacts ──
  float nf = mix(0.006, 0.016, t);
  float n1 = fbm(rp * nf + uSeed);
  float n2 = fbm(rp * nf + uSeed + 19.3);
  float2 sp = rp + (float2(n1, n2) - 0.5) * (t * 110.0);

  // ── facet shading from a noise height field, quantized as it compacts ──
  float hs = mix(0.020, 0.012, t);
  float h  = fbm(sp * hs + uSeed);
  float e  = 2.0;
  float hx = fbm((sp + float2(e, 0.0)) * hs + uSeed) - h;
  float hy = fbm((sp + float2(0.0, e)) * hs + uSeed) - h;
  float3 n = normalize(float3(-hx * 140.0 * t, -hy * 140.0 * t, 1.0));
  float q = mix(64.0, 6.0, t);
  n = normalize(float3(floor(n.xy * q) / q, n.z));
  float3 L = normalize(float3(-0.4, -0.5, 0.75));
  float shade = 0.66 + 0.42 * max(dot(n, L), 0.0);
  shade = mix(1.0, shade, smoothstep(0.0, 0.25, t));

  // ── silhouette: noisy disc eats the page rectangle ──
  float insideRect = step(0.0, rp.x) * step(rp.x, uRes.x)
                   * step(0.0, rp.y) * step(rp.y, uRes.y);
  float ang = atan(p.y - uCenter.y, p.x - uCenter.x);
  float rn = (vnoise(float2(ang * 2.5 + uSeed * 3.0, uSeed)) - 0.5) * 70.0 * t;
  float R  = mix(1.6 * length(uRes), 0.185 * uRes.x, pow(t, 0.75));
  float dc = length(p - uCenter);
  float m  = 1.0 - smoothstep(R + rn - 10.0, R + rn + 10.0, dc);

  half4 c = uImage.eval(clamp(sp, float2(0.0), uRes));
  float alpha = insideRect * m;
  return half4(c.rgb * shade * alpha, alpha);
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
