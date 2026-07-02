import { Gesture } from 'react-native-gesture-handler';
import { useWindowDimensions } from 'react-native';
import {
  Easing,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

export interface CrumpleState {
  /** 0..1 crumple progress (0 = flat page, 1 = paper ball). */
  t: SharedValue<number>;
  /** Crumple center — follows the finger, settles to screen center on confirm. */
  cx: SharedValue<number>;
  cy: SharedValue<number>;
  /** 1 from drag start until the article is removed. */
  active: SharedValue<number>;
  /** 0..1 throw animation (ball flies center → bin mouth). */
  throwU: SharedValue<number>;
  /** Per-gesture noise seed. */
  seed: SharedValue<number>;
  /** 0..1 — the bin rises from below the bottom screen edge. */
  binRise: SharedValue<number>;
  /** Bin pulse scale on ball arrival. */
  binScale: SharedValue<number>;
}

interface Options {
  takeSnapshot: () => void;
  /** Mount the page revealed beneath the crumpling one. */
  chooseUnder: () => void;
  /** Ball landed in the bin — haptics. */
  land: () => void;
  /** Bin has sunk away — remove the article (state swap). */
  arrive: () => void;
  cancel: () => void;
  /** False when this is the last article — delete is blocked. */
  canDelete: SharedValue<boolean>;
  /** The invisible top-right corner handle — sets the pull direction. */
  handleX: number;
  handleY: number;
}

const CONFIRM_T = 0.6;

export function useCrumpleGesture(opts: Options) {
  const { width, height } = useWindowDimensions();

  const t = useSharedValue(0);
  const cx = useSharedValue(width / 2);
  const cy = useSharedValue(height / 2);
  const active = useSharedValue(0);
  const throwU = useSharedValue(0);
  const seed = useSharedValue(0);
  const binRise = useSharedValue(0);
  const binScale = useSharedValue(1);
  const settling = useSharedValue(0);

  const { takeSnapshot, chooseUnder, land, arrive, cancel, canDelete, handleX, handleY } =
    opts;

  // pull direction: from the corner handle toward the screen center
  const dirLen = Math.hypot(width / 2 - handleX, height / 2 - handleY);
  const dirX = (width / 2 - handleX) / dirLen;
  const dirY = (height / 2 - handleY) / dirLen;
  const requiredDist = dirLen * 0.82;

  const binPan = Gesture.Pan()
    .hitSlop(12)
    .onBegin(() => {
      'worklet';
      if (settling.value || !canDelete.value) return;
      scheduleOnRN(takeSnapshot);
    })
    .onStart((e) => {
      'worklet';
      if (settling.value || !canDelete.value) return;
      seed.value = Math.random() * 40;
      cx.value = e.absoluteX;
      cy.value = e.absoluteY;
      t.value = 0;
      throwU.value = 0;
      active.value = 1;
      // the bin surfaces from the bottom edge, ready to receive — near
      // critically damped: a firm rise, no wobble
      binRise.value = withSpring(1, { damping: 20, stiffness: 200 });
      scheduleOnRN(chooseUnder);
    })
    .onUpdate((e) => {
      'worklet';
      if (settling.value || !active.value) return;
      cx.value = e.absoluteX;
      cy.value = e.absoluteY;
      const proj = e.translationX * dirX + e.translationY * dirY;
      t.value = Math.min(Math.max(proj / requiredDist, 0), 1);
    })
    .onEnd((e) => {
      'worklet';
      if (settling.value || !active.value) return;
      settling.value = 1;
      // recompute from the end event itself — trailing Move events can be
      // coalesced, leaving t.value stale at release
      const proj = e.translationX * dirX + e.translationY * dirY;
      const tEnd = Math.max(t.value, Math.min(Math.max(proj / requiredDist, 0), 1));
      if (tEnd > CONFIRM_T) {
        t.value = tEnd;
        // confirm: finish the ball at screen center, then drop it in the bin
        cx.value = withTiming(width / 2, { duration: 240 });
        cy.value = withTiming(height / 2, { duration: 240 });
        t.value = withTiming(1, { duration: 240 }, (finished) => {
          if (!finished) return;
          throwU.value = withTiming(
            1,
            { duration: 480, easing: Easing.in(Easing.quad) },
            (done) => {
              if (!done) return;
              // the can swallows the ball: pulse, then sink back offscreen
              binScale.value = 1.06;
              binScale.value = withSpring(1, { damping: 9, stiffness: 300 });
              scheduleOnRN(land);
              binRise.value = withDelay(
                160,
                withTiming(0, { duration: 300 }, (sunk) => {
                  if (!sunk) return;
                  // active/settling reset in an effect after the article swap
                  scheduleOnRN(arrive);
                }),
              );
            },
          );
        });
      } else {
        binRise.value = withTiming(0, { duration: 240 });
        t.value = withSpring(0, { damping: 20, stiffness: 200 }, (finished) => {
          if (finished) {
            active.value = 0;
            settling.value = 0;
            scheduleOnRN(cancel);
          }
        });
      }
    });

  const state: CrumpleState = { t, cx, cy, active, throwU, seed, binRise, binScale };
  return { binPan, state, settling };
}
