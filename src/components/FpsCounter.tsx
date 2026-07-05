import { TextInput, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts } from '../theme';

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

/**
 * Dev-only frame-rate readout. Writes the smoothed fps straight into a
 * TextInput via animatedProps, so it never triggers a React re-render and
 * doesn't perturb the very thing it's measuring. The simulator is locked to
 * 60 — read it on a physical 120Hz device for real numbers.
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

  const animatedProps = useAnimatedProps(() => {
    const label = `PRESS SPEED — ${Math.round(fps.value)} FPS`;
    // keep iOS's controlled-input invariant happy while we drive `text` directly
    return { text: label, defaultValue: label };
  });

  // ink normally; drops below 50 print in the pressroom's red correction ink
  const animatedStyle = useAnimatedStyle(() => ({
    color: fps.value >= 50 || fps.value === 0 ? colors.inkFaint : '#8a2418',
  }));

  return (
    <AnimatedTextInput
      editable={false}
      pointerEvents="none"
      underlineColorAndroid="transparent"
      allowFontScaling={false}
      style={[styles.text, { bottom: insets.bottom - 22 }, animatedStyle]}
      // initial frame before the worklet writes the first value
      defaultValue="PRESS SPEED — … FPS"
      animatedProps={animatedProps}
    />
  );
}

// styled as a printer's colophon mark — typeset, not overlaid
const styles = StyleSheet.create({
  text: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 9999,
    paddingVertical: 3,
    backgroundColor: colors.paper,
    fontFamily: fonts.body,
    fontSize: 8.5,
    letterSpacing: 1.2,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
});
