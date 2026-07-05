import { Skia } from '@shopify/react-native-skia';

/**
 * Crinkled-paper swipe shader (backward mapping: each output pixel decides
 * where in the snapshot it reads from).
 *
 * The look: as the finger drags horizontally, the page follows - but not
 * rigidly. The row under the finger travels furthest (shear anchored on
 * uTouch.y, so a grip at the top peels the page diagonally from the top, a
 * bottom grip from the bottom - and the grip rides up and down WITH the
 * finger, dragging the page vertically too). Compression folds radiate from
 * the finger, fanning with the grip height, and a per-gesture seed shifts
 * every wobble phase so no two swipes fold the same way. Shading comes from the fold height field
 * (numeric normal → Lambert + paper sheen + valley AO), and pixels dragged off
 * the page leave a soft cast shadow over the article underneath.
 */
const SKSL = `
uniform shader uImage;
uniform float2 uRes;
uniform float2 uTouch;
uniform float2 uOrigin;
uniform float  uProgress;
uniform float  uDir;     // -1 = pulling left (next), +1 = pulling right (prev)
uniform float  uSeed;

const float PI = 3.14159265;

// fold height at page point p (page coords, dp)
float height(float2 p) {
  float2 d = p - uTouch;
  // s: distance along the drag axis (positive = trailing side of the finger)
  float s = d.x * -uDir;
  float q = d.y;

  // grab height in -1..1: top grab tilts ridges one way, bottom the other,
  // and the fan re-tilts live as the finger moves vertically
  float fan = (uTouch.y / uRes.y - 0.5) * 2.0;
  // shear the ridge coordinate so folds radiate from the grab corner
  float sr = s + fan * q * 0.55;

  // cloth wobble: ridge lines are never straight; seed varies per gesture
  float phase = 0.9 * sin(q * 0.012 + uSeed)
              + 0.5 * sin(q * 0.027 - sr * 0.006 + uSeed * 1.7);

  float freq = mix(0.024, 0.050, uProgress);        // folds tighten as you pull
  float amp  = uProgress * 34.0
             * exp(-abs(sr) / (uRes.x * 0.50))      // decay along the drag axis
             * exp(-abs(q)  / (uRes.y * 0.85));     // mild vertical envelope
  return amp * cos(sr * freq + phase);
}

half4 main(float2 p) {
  // ── cloth pull: the grabbed row tracks the finger 1:1, the rest lags ──
  // uProgress == |translationX| / width, so dragX is exactly the finger travel.
  // The pull is anchored to the finger's CURRENT row, not where the gesture
  // started - moving the finger vertically mid-swipe moves the grip with it.
  float dragX = uProgress * uRes.x;
  float rowFall = exp(-abs(p.y - uTouch.y) / (uRes.y * 0.35));
  // once the release animation runs, the lagging cloth catches up and the
  // whole page departs
  float catchup = smoothstep(0.55, 1.0, uProgress);
  float lag = mix(mix(0.22, 1.0, rowFall), 1.0, catchup);
  float pull = dragX * lag * (1.0 + 0.4 * catchup);

  // ── top/bottom pinning: the sheet stays attached to the screen's top and
  // bottom rails - vertical fold/gather offsets fade out toward the edges so
  // the page's horizontal borders never peel into view ──
  float pin = smoothstep(0.0, uRes.y * 0.16, p.y)
            * smoothstep(0.0, uRes.y * 0.16, uRes.y - p.y);

  // ── vertical grip: a bijective stretch of the sheet between the rails.
  // The row under the finger shows the row that was grabbed; the material
  // above compresses / below stretches (and vice versa). The mapping covers
  // exactly [0, h] → [0, h], so no sample ever leaves the page - nothing is
  // cut, the edges stay attached. Gated on progress so a cancel springs back
  // to the identity mapping (oy == ty ⇒ both segments have slope 1). ──
  float gate = smoothstep(0.0, 0.12, uProgress);
  float ty = clamp(uTouch.y, uRes.y * 0.08, uRes.y * 0.92);
  float oy = mix(ty, clamp(uOrigin.y, uRes.y * 0.08, uRes.y * 0.92), gate);

  float2 sp = p;
  sp.x -= uDir * pull;                     // backward map of the cloth motion
  sp.y = p.y < ty
    ? p.y * oy / ty
    : oy + (uRes.y - oy) * (p.y - ty) / (uRes.y - ty);

  // ── gather: pulled cloth draws material in toward the grabbed row ──
  float gatherK = 0.22 * uProgress * exp(-abs(p.x - uTouch.x) / (uRes.x * 0.55))
                * pin;
  sp.y = oy + (sp.y - oy) * (1.0 + gatherK);

  // ── fold displacement (compression along the drag axis, wavy silhouette) ──
  float h  = height(sp);
  sp.x -= uDir * h * 1.1;
  sp.y += 0.8 * height(sp + float2(0.0, 9.0)) * pin;

  // ── shading from the fold height field ──
  float e  = 1.5;
  float hc = height(sp);
  float hx = height(sp + float2(e, 0.0)) - hc;
  float hy = height(sp + float2(0.0, e)) - hc;
  float3 n = normalize(float3(-hx / e * 6.0, -hy / e * 6.0, 1.0));
  float3 L = normalize(float3(-0.35, -0.55, 0.75));
  float lambert = max(dot(n, L), 0.0);
  float shade = 0.74 + 0.34 * lambert;
  // paper sheen: soft specular so ridge crests catch the light
  float3 R = reflect(-L, n);
  shade += 0.10 * pow(max(R.z, 0.0), 12.0);
  // ambient occlusion in the fold valleys
  shade -= 0.16 * uProgress * smoothstep(0.0, 1.0, -hc / 18.0);

  // ── sample; outside the page = transparent + cast shadow on the under page ──
  float inside = step(0.0, sp.x) * step(sp.x, uRes.x)
               * step(0.0, sp.y) * step(sp.y, uRes.y);

  half4 c = uImage.eval(clamp(sp, float2(0.0), uRes));

  // soft moving shadow at the peeling edge, drawn where the page has left
  float2 cl = clamp(sp, float2(0.0), uRes);
  float distOut = length(sp - cl);
  float shadow = (1.0 - smoothstep(0.0, 56.0, distOut)) * 0.32 * smoothstep(0.02, 0.25, uProgress);

  half3 lit = c.rgb * shade;
  return half4(half3(lit * inside), c.a * inside) + half4(0.0, 0.0, 0.0, shadow * (1.0 - inside));
}
`;

function make() {
  try {
    const effect = Skia.RuntimeEffect.Make(SKSL);
    if (!effect) console.error('[crinkle] RuntimeEffect.Make returned null');
    return effect;
  } catch (e) {
    console.error('[crinkle] SkSL compile failed:', e);
    return null;
  }
}

export const crinkleEffect = make()!;
