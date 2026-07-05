import { Gesture, type GestureType } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';
import {
  Easing,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useWindowDimensions } from 'react-native';

export interface CrinkleGestureState {
  /** 0..1 — how far the page has been pulled off (drives shader + reveal). */
  progress: SharedValue<number>;
  /** Current finger position (page coords). */
  touchX: SharedValue<number>;
  touchY: SharedValue<number>;
  /** Finger position at activation — folds are anchored here (top/middle/bottom differ). */
  originX: SharedValue<number>;
  originY: SharedValue<number>;
  /** -1 = pulling left (next article), +1 = pulling right (previous). */
  dir: SharedValue<number>;
  /** Per-gesture random phase so no two swipes fold identically. */
  seed: SharedValue<number>;
  /** 1 while the overlay should draw (and the live page hide). */
  active: SharedValue<number>;
  /** 1 while a commit/cancel animation is settling — blocks new input. */
  settling: SharedValue<number>;
}

interface Options {
  /** Capture the page image (JS thread) — called at touch-down. */
  takeSnapshot: () => void;
  /** Mount the correct under page for this drag direction. dir: -1 next, +1 prev. */
  chooseUnder: (dir: number) => void;
  /** Promote the under page (progress reached 1). */
  commit: () => void;
  /** Gesture cancelled — under page back to default. */
  cancel: () => void;
  /** Set from React so the worklet knows the deck bounds. */
  hasNext: SharedValue<boolean>;
  hasPrev: SharedValue<boolean>;
  /** Touch-indicator tracker — must survive this gesture activating. */
  tracker: GestureType;
}

const COMMIT_PROGRESS = 0.35;
const COMMIT_VELOCITY = 800;

export function usePageGestures(opts: Options) {
  const { width } = useWindowDimensions();

  // All shared values are declared BEFORE the gesture builders — RNGH snapshots
  // the worklet closures at creation time.
  const progress = useSharedValue(0);
  const touchX = useSharedValue(0);
  const touchY = useSharedValue(0);
  const originX = useSharedValue(0);
  const originY = useSharedValue(0);
  const dir = useSharedValue(-1);
  const seed = useSharedValue(0);
  const active = useSharedValue(0);
  const settling = useSharedValue(0); // ignore new input while committing/cancelling

  const { takeSnapshot, chooseUnder, commit, cancel, hasNext, hasPrev, tracker } = opts;

  const crinklePan = Gesture.Pan()
    .simultaneousWithExternalGesture(tracker)
    .activeOffsetX([-14, 14])
    .failOffsetY([-16, 16])
    .onBegin(() => {
      'worklet';
      if (settling.value) return;
      scheduleOnRN(takeSnapshot);
    })
    .onStart((e) => {
      'worklet';
      if (settling.value) return;
      const d = e.translationX < 0 ? -1 : 1;
      dir.value = d;
      originX.value = e.x;
      originY.value = e.y;
      touchX.value = e.x;
      touchY.value = e.y;
      seed.value = Math.random() * 100;
      progress.value = 0;
      active.value = 1;
      scheduleOnRN(chooseUnder, d);
    })
    .onUpdate((e) => {
      'worklet';
      if (settling.value) return;
      // direction may flip mid-gesture (drag left, then back past the origin)
      const d = e.translationX < 0 ? -1 : 1;
      if (d !== dir.value && Math.abs(e.translationX) > 4) {
        dir.value = d;
        scheduleOnRN(chooseUnder, d);
      }
      touchX.value = e.x;
      touchY.value = e.y;
      const raw = Math.abs(e.translationX) / width;
      const blocked = d < 0 ? !hasNext.value : !hasPrev.value;
      // rubber-band at the deck ends: folds appear but the page can't leave
      progress.value = blocked ? 0.18 * (1 - 1 / (1 + raw * 3)) : Math.min(raw, 1);
    })
    .onEnd((e) => {
      'worklet';
      if (settling.value || !active.value) return;
      const blocked = dir.value < 0 ? !hasNext.value : !hasPrev.value;
      // recompute from the end event — trailing Move events can be coalesced,
      // leaving progress.value stale at release
      const endProgress = Math.max(
        progress.value,
        Math.min(Math.abs(e.translationX) / width, 1),
      );
      const shouldCommit =
        !blocked &&
        (endProgress > COMMIT_PROGRESS || Math.abs(e.velocityX) > COMMIT_VELOCITY);
      if (shouldCommit && !blocked) progress.value = endProgress;
      settling.value = 1;
      if (shouldCommit) {
        progress.value = withTiming(
          1,
          { duration: 260, easing: Easing.out(Easing.cubic) },
          (finished) => {
            if (finished) {
              // active/settling stay set until React has promoted the under
              // page (reset in an effect) — resetting here would un-hide the
              // old page for a frame before the index swap lands.
              scheduleOnRN(commit);
            }
          },
        );
      } else {
        // overshootClamping: the folds relax flat and STOP — a spring dipping
        // below 0 re-bulges the paper and reads as a rubbery bounce
        progress.value = withSpring(
          0,
          { damping: 26, stiffness: 220, overshootClamping: true },
          (finished) => {
            if (finished) {
              active.value = 0;
              settling.value = 0;
              scheduleOnRN(cancel);
            }
          },
        );
      }
    });

  const state: CrinkleGestureState = {
    progress,
    touchX,
    touchY,
    originX,
    originY,
    dir,
    seed,
    active,
    settling,
  };

  return { crinklePan, state };
}
