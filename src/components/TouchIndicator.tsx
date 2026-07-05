import { useMemo, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { Gesture, type GestureType } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

const SIZE = 54;

/**
 * Fingertip for demo recordings: a translucent ink circle following any touch.
 * The tracker is a Manual gesture that never activates, so it observes every
 * touch without competing - but page gestures and the ScrollView must list it
 * as simultaneous, or RNGH cancels it the moment they activate.
 */
export function useTouchIndicator() {
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const pressed = useSharedValue(0);
  // old-style ref so the ScrollView can list the tracker in simultaneousHandlers
  const ref = useRef<GestureType | undefined>(undefined);

  const tracker = useMemo(
    () =>
      Gesture.Manual()
        .withRef(ref)
        .onTouchesDown((e) => {
          'worklet';
          const t = e.allTouches[0];
          if (!t) return;
          x.value = t.absoluteX;
          y.value = t.absoluteY;
          pressed.value = 1;
        })
        .onTouchesMove((e) => {
          'worklet';
          const t = e.allTouches[0];
          if (!t) return;
          x.value = t.absoluteX;
          y.value = t.absoluteY;
        })
        .onTouchesUp((e) => {
          'worklet';
          if (e.numberOfTouches === 0) pressed.value = 0;
        })
        .onTouchesCancelled(() => {
          'worklet';
          pressed.value = 0;
        }),
    [x, y, pressed],
  );

  return { tracker, trackerRef: ref, x, y, pressed };
}

interface Props {
  x: SharedValue<number>;
  y: SharedValue<number>;
  pressed: SharedValue<number>;
}

export function TouchIndicator({ x, y, pressed }: Props) {
  const style = useAnimatedStyle(() => ({
    opacity: withTiming(pressed.value, { duration: pressed.value ? 70 : 260 }),
    transform: [
      { translateX: x.value - SIZE / 2 },
      { translateY: y.value - SIZE / 2 },
      {
        scale: withSpring(pressed.value ? 1 : 0.6, {
          damping: 18,
          stiffness: 320,
        }),
      },
    ],
  }));

  return <Animated.View pointerEvents="none" style={[styles.circle, style]} />;
}

const styles = StyleSheet.create({
  circle: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: 'rgba(27, 23, 18, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(27, 23, 18, 0.18)',
  },
});
