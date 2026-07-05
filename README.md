# 🗞️ The Daily Crumple

A newspaper app where the paper is real.

Every page of this fake broadsheet behaves like an actual sheet of
newsprint - it folds, stretches, and crumples under your finger, all
rendered in real time. No videos, no Lottie: the live page is snapshotted
at touch-down and pushed through **Skia shaders** and a **hand-rolled 3D
paper mesh**, driven frame-by-frame from the UI thread by **Reanimated**.

- **Swipe between articles** and the page peels off the stack like pulled
  cloth, folding around your finger. The fold pattern depends on where you
  grab - top, middle, and bottom swipes all crease differently, and a
  per-gesture seed means no two swipes ever fold the same.
- **Scroll past either end** and the sheet stretches into a wavy crumple
  against the edge, then relaxes flat when you let go.
- **Don't like an article?** Tear the top-right corner along the
  perforation. The page flips over an advancing crease like a real pulled
  corner, gathers into a crumpled ball of newsprint, and flies into a wire
  wastebasket that rises to catch it. The article beneath is revealed as
  if the pages were stacked.

The paper ball is not a canned animation: the page is partitioned into 80
triangular scraps mapped one-to-one onto the facets of a noise-displaced
icosphere. Each scrap travels from its spot on the page to its facet on the
ball - rotated, lit, depth-sorted, and perspective-projected in a worklet
every frame, then drawn as a single textured triangle list.

## How it works

| File | What it does |
| --- | --- |
| [`src/effects/crinkleShader.ts`](src/effects/crinkleShader.ts) | The swipe fold: an SkSL height field of travelling creases anchored to the grab point, with numeric normals for lighting and a cast shadow on the page beneath. |
| [`src/effects/overscrollShader.ts`](src/effects/overscrollShader.ts) | The edge stretch: scroll offset drives a wave warp of the pinned snapshot. |
| [`src/effects/paperBallMesh.ts`](src/effects/paperBallMesh.ts) | Ball geometry: subdivided icosphere + seeded radial noise, and the page-to-facet assignment that keeps neighbouring scraps together mid-fold. |
| [`src/effects/CrumpleOverlay.tsx`](src/effects/CrumpleOverlay.tsx) | The delete: corner peel over an advancing crease, gather-to-ball blend, facet lighting, painter-sorted `Vertices` passes, the Bézier throw. |
| [`src/engine/useSnapshot.ts`](src/engine/useSnapshot.ts) | Snapshot plumbing: `makeImageFromView` at touch-down, generation-stamped so overlays never draw a stale capture. |
| [`src/engine/usePageGestures.ts`](src/engine/usePageGestures.ts) | Gesture arbitration between the scroll view, the crinkle swipe, and the corner tear. |
| [`src/screens/NewsStack.tsx`](src/screens/NewsStack.tsx) | The deck: two mounted pages with keyed no-remount promotion, so committing a swipe or a delete never flickers. |

## Run it

```sh
npm install
npx expo prebuild -p ios
npx expo run:ios
```

Notes:

- Expo Go is not supported (custom fonts + prebuild).
- The articles are satire. Any resemblance to your sprint planning is
  coincidental.

## Stack

[@shopify/react-native-skia](https://github.com/Shopify/react-native-skia) ·
[Reanimated](https://github.com/software-mansion/react-native-reanimated) ·
[Gesture Handler](https://github.com/software-mansion/react-native-gesture-handler) ·
Expo SDK 57 · React Native 0.86
