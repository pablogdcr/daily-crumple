import { TextInput, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

/**
 * Dev-only frame-rate readout. Measures the gap between display frames on the UI
 * thread (Reanimated's frame callback) and writes the smoothed fps straight into
 * a TextInput's `text` prop via animatedProps — so the counter never triggers a
 * React re-render and doesn't perturb the very thing it's measuring.
 *
 * Read it on a *physical* 120Hz device: the simulator is locked to 60. ~120 means
 * ProMotion is engaged (CADisableMinimumFrameDurationOnPhone is set); a steady 60
 * on a Pro device means something is capping it; dips below mean dropped frames.
 *
 * Mounted behind `__DEV__` in App.tsx, so it never ships.
 */
export function FpsCounter() {
  const insets = useSafeAreaInsets();
  const fps = useSharedValue(0);

  useFrameCallback((frame) => {
    'worklet';
    const dt = frame.timeSincePreviousFrame; // ms, null on the first frame
    if (dt && dt > 0) {
      const instant = 1000 / dt;
      // light exponential smoothing so the number is readable but still reactive
      fps.value = fps.value === 0 ? instant : fps.value * 0.9 + instant * 0.1;
    }
  });

  const animatedProps = useAnimatedProps(() => ({
    text: `${Math.round(fps.value)} fps`,
    // keep iOS's controlled-input invariant happy while we drive `text` directly
    defaultValue: `${Math.round(fps.value)} fps`,
  }));

  // colour-code for an at-a-glance read: green ≈120, amber ≈60, red below
  const animatedStyle = useAnimatedStyle(() => ({
    color: fps.value >= 100 ? '#30D158' : fps.value >= 50 ? '#FFD60A' : '#FF453A',
  }));

  return (
    <AnimatedTextInput
      editable={false}
      pointerEvents="none"
      underlineColorAndroid="transparent"
      allowFontScaling={false}
      style={[styles.text, { top: insets.top + 6 }, animatedStyle]}
      // initial frame before the worklet writes the first value
      defaultValue="… fps"
      animatedProps={animatedProps}
    />
  );
}

const styles = StyleSheet.create({
  text: {
    position: 'absolute',
    right: 8,
    zIndex: 9999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
});
