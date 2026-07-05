import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '../theme';

/** Ascent room the raised cap needs — becomes the first line's height. */
const CAP_BOX_HEIGHT = 34;

/**
 * The lead paragraph's raised cap, mounted as an inline view attachment.
 * A nested Text with a taller lineHeight would inflate EVERY line of the
 * paragraph on iOS, and matching the body lineHeight clips the glyph — an
 * inline view only grows the line that contains it. The box width tracks the
 * measured glyph, and the glyph hangs below the box to sit on the baseline.
 */
export function RaisedCap({ letter }: { letter: string }) {
  const [width, setWidth] = useState(26);
  return (
    <View style={{ width, height: CAP_BOX_HEIGHT }}>
      <Text
        style={styles.glyph}
        numberOfLines={1}
        onLayout={(e) => setWidth(Math.ceil(e.nativeEvent.layout.width))}
      >
        {letter}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  glyph: {
    position: 'absolute',
    left: 0,
    bottom: -9,
    fontFamily: fonts.headline,
    fontSize: 40,
    color: colors.ink,
  },
});
