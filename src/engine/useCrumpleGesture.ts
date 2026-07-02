import { Gesture } from 'react-native-gesture-handler';
import { useWindowDimensions } from 'react-native';
import {
  Easing,
  useSharedValue,
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
  /** 0..1 throw animation (ball flies center → bin). */
  throwU: SharedValue<number>;
  /** Per-gesture noise seed. */
  seed: SharedValue<number>;
  /** Bin lid angle, degrees (0 closed, -75 open). */
  lidAngle: SharedValue<number>;
  /** Bin pulse scale on ball arrival. */
  binScale: SharedValue<number>;
}

interface Options {
  takeSnapshot: () => void;
  /** Mount the page revealed beneath the crumpling one. */
  chooseUnder: () => void;
  /** Ball reached the bin — remove the article (state swap). */
  arrive: () => void;
  cancel: () => void;
  /** False when this is the last article — delete is blocked. */
  canDelete: SharedValue<boolean>;
  binX: number;
  binY: number;
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
  const lidAngle = useSharedValue(0);
  const binScale = useSharedValue(1);
  const settling = useSharedValue(0);

  const { takeSnapshot, chooseUnder, arrive, cancel, canDelete, binX, binY } = opts;

  // pull direction: from the bin toward the screen center
  const dirLen = Math.hypot(width / 2 - binX, height / 2 - binY);
  const dirX = (width / 2 - binX) / dirLen;
  const dirY = (height / 2 - binY) / dirLen;
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
    .onEnd(() => {
      'worklet';
      if (settling.value || !active.value) return;
      settling.value = 1;
      if (t.value > CONFIRM_T) {
        // confirm: finish the ball at screen center, open the lid, throw
        lidAngle.value = withSpring(-75, { damping: 14, stiffness: 240 });
        cx.value = withTiming(width / 2, { duration: 170 });
        cy.value = withTiming(height / 2, { duration: 170 });
        t.value = withTiming(1, { duration: 170 }, (finished) => {
          if (!finished) return;
          throwU.value = withTiming(
            1,
            { duration: 480, easing: Easing.in(Easing.quad) },
            (done) => {
              if (!done) return;
              // lid slams shut with overshoot + bin pulse
              lidAngle.value = withSpring(0, { damping: 11, stiffness: 380 });
              binScale.value = 1.14;
              binScale.value = withSpring(1, { damping: 9, stiffness: 300 });
              // active/settling reset in an effect after the article list swap
              scheduleOnRN(arrive);
            },
          );
        });
      } else {
        lidAngle.value = withSpring(0, { damping: 14, stiffness: 240 });
        t.value = withSpring(0, { damping: 20, stiffness: 200 }, (finished) => {
          if (finished) {
            active.value = 0;
            settling.value = 0;
            scheduleOnRN(cancel);
          }
        });
      }
    });

  const state: CrumpleState = { t, cx, cy, active, throwU, seed, lidAngle, binScale };
  return { binPan, state, settling };
}
