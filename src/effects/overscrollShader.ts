import { Skia } from '@shopify/react-native-skia';

/**
 * Overscroll crumple (backward mapping, like the crinkle swipe but vertical).
 *
 * The native ScrollView rubber band drives uOver (px past the edge, signed:
 * positive = pulled down at the top, negative = pulled up at the bottom).
 * A virtual grip row is dragged with the rubber band while both screen edges
 * stay pinned — the mapping is a bijection of the page onto itself, so no
 * sample ever leaves the page and nothing shows "behind" the paper: the sheet
 * just stretches on one side, compresses on the other, and crumples with
 * horizontal ridges around the grip. Shading matches the crinkle shader
 * (Lambert + sheen + valley AO from the fold height field).
 */
const SKSL = `
uniform shader uImage;
uniform float2 uRes;
uniform float  uOver;
uniform float  uSeed;

float height(float2 p, float gripY, float amp) {
  float s = p.y - gripY;                    // distance along the pull axis
  float q = p.x - uRes.x * 0.5;
  // ridge lines are never straight — wobble along x, seeded per drag
  float phase = 0.9 * sin(q * 0.014 + uSeed)
              + 0.5 * sin(q * 0.030 + s * 0.008 + uSeed * 1.7);
  return amp * cos(s * 0.05 + phase) * exp(-abs(s) / (uRes.y * 0.35));
}

half4 main(float2 p) {
  float v = uOver;
  float av = min(abs(v) / 150.0, 1.0);      // fold intensity 0..1

  // virtual grip: a row dragged with the rubber band, both edges pinned
  float grip0 = v > 0.0 ? uRes.y * 0.38 : uRes.y * 0.62;
  float ty = clamp(grip0 + v * 0.85, uRes.y * 0.08, uRes.y * 0.92);
  float oy = grip0;

  float2 sp = p;
  sp.y = p.y < ty
    ? p.y * oy / ty
    : oy + (uRes.y - oy) * (p.y - ty) / (uRes.y - ty);

  // fold displacement, pinned so the top/bottom rails never detach
  float pin = smoothstep(0.0, uRes.y * 0.14, p.y)
            * smoothstep(0.0, uRes.y * 0.14, uRes.y - p.y);
  float amp = av * 16.0;
  sp.y += 0.9 * height(sp, oy, amp) * pin;
  sp.x += 0.5 * height(sp + float2(11.0, 0.0), oy, amp);

  // shading from the fold height field
  float e  = 1.5;
  float hc = height(sp, oy, amp);
  float hx = height(sp + float2(e, 0.0), oy, amp) - hc;
  float hy = height(sp + float2(0.0, e), oy, amp) - hc;
  float3 n = normalize(float3(-hx / e * 6.0, -hy / e * 6.0, 1.0));
  float3 L = normalize(float3(-0.35, -0.55, 0.75));
  float shade = 0.78 + 0.30 * max(dot(n, L), 0.0);
  shade += 0.08 * pow(max(reflect(-L, n).z, 0.0), 12.0);
  shade -= 0.14 * av * smoothstep(0.0, 1.0, -hc / 14.0);

  half4 c = uImage.eval(clamp(sp, float2(0.0), uRes));
  return half4(c.rgb * shade, c.a);
}
`;

function make() {
  try {
    const effect = Skia.RuntimeEffect.Make(SKSL);
    if (!effect) console.error('[overscroll] RuntimeEffect.Make returned null');
    return effect;
  } catch (e) {
    console.error('[overscroll] SkSL compile failed:', e);
    return null;
  }
}

export const overscrollEffect = make()!;
