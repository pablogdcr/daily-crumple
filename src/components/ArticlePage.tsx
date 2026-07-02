import { forwardRef } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import Animated, { useAnimatedScrollHandler } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Article } from '../data/articles';
import type { OverscrollWiring } from '../effects/OverscrollOverlay';
import { colors, fonts, layout } from '../theme';

const AnimatedScrollView = Animated.createAnimatedComponent(ScrollView);

const EDITION_DATE = 'Wednesday, July 2, 2026';

interface Props {
  article: Article;
  /** 1-based position of this page in the paper, and the page count. */
  page: number;
  total: number;
  /** Wired only on the current page — feeds the overscroll crumple. */
  overscroll?: OverscrollWiring;
}

/**
 * One full-screen newspaper page. The outer View is the snapshot target for the
 * crinkle/crumple shaders (collapsable={false} so iOS keeps a real backing view),
 * so everything that should distort — paper color, grain, text — lives inside it.
 */
export const ArticlePage = forwardRef<View, Props>(function ArticlePage(
  { article, page, total, overscroll },
  ref,
) {
  const insets = useSafeAreaInsets();

  const [lead, ...rest] = article.paragraphs;
  const split = Math.ceil(rest.length / 2);
  const leftCol = rest.slice(0, split);
  const rightCol = rest.slice(split);

  // UI-thread scroll state for the overscroll crumple. Arming happens at
  // drag START: the effect only runs for a pull that began at the edge, so
  // the touch-down snapshot is guaranteed to match the frozen content.
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      if (!overscroll) return;
      overscroll.y.value = e.contentOffset.y;
      overscroll.max.value = Math.max(
        0,
        e.contentSize.height - e.layoutMeasurement.height,
      );
    },
    onBeginDrag: (e) => {
      if (!overscroll) return;
      const max = Math.max(0, e.contentSize.height - e.layoutMeasurement.height);
      overscroll.y.value = e.contentOffset.y;
      overscroll.max.value = max;
      let armed = 0;
      if (e.contentOffset.y <= 2) armed |= 1;
      if (e.contentOffset.y >= max - 2) armed |= 2;
      overscroll.armed.value = armed;
      overscroll.seed.value = Math.random() * 100;
    },
  });

  return (
    <View ref={ref} collapsable={false} style={styles.page}>
      <Image source={require('../../assets/paper-grain.png')} style={styles.grain} resizeMode="repeat" />
      <AnimatedScrollView
        style={styles.scroll}
        contentContainerStyle={{
          paddingTop: insets.top + 6,
          paddingBottom: insets.bottom + 40,
          paddingHorizontal: layout.pageGutter,
        }}
        showsVerticalScrollIndicator={false}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
      >
        {/* ─── Masthead ─── */}
        <View style={styles.topRule} />
        {/* right slot stays empty — the tear-here coupon owns that corner */}
        <View style={styles.dateRow}>
          <Text style={[styles.dateText, styles.dateLeft]}>VOL. CCXIV — No. 42</Text>
          <Text style={[styles.dateText, styles.dateCenter]}>
            {`${EDITION_DATE.toUpperCase()} — PAGE ${page} OF ${total}`}
          </Text>
          <Text style={[styles.dateText, styles.dateRight]} />
        </View>
        <Text style={styles.masthead} numberOfLines={1} adjustsFontSizeToFit>
          The Daily Crumple
        </Text>
        <View style={styles.doubleRule}>
          <View style={styles.doubleRuleThick} />
          <View style={styles.doubleRuleThin} />
        </View>

        {/* ─── Kicker ─── */}
        <View style={styles.kickerRow}>
          <View style={styles.kickerRule} />
          <Text style={styles.kicker}>{article.kicker.toUpperCase()}</Text>
          <View style={styles.kickerRule} />
        </View>

        {/* ─── Headline block ─── */}
        <Text style={styles.headline}>{article.headline}</Text>
        {article.subhead ? <Text style={styles.subhead}>{article.subhead}</Text> : null}
        <View style={styles.bylineBlock}>
          <View style={styles.hairline} />
          <Text style={styles.byline}>{article.byline}</Text>
          <View style={styles.hairline} />
        </View>

        {/* ─── Lead with raised cap on the dateline ─── */}
        <Text style={styles.lead}>
          <Text style={styles.dropCap}>{article.dateline.charAt(0)}</Text>
          <Text style={styles.bodyBoldInline}>{article.dateline.slice(1)} </Text>
          {lead}
        </Text>

        {/* ─── Pull quote ─── */}
        {article.pullQuote ? (
          <View style={styles.pullQuoteBlock}>
            <View style={styles.hairline} />
            <Text style={styles.pullQuote}>{article.pullQuote}</Text>
            <View style={styles.hairline} />
          </View>
        ) : null}

        {/* ─── Two-column body ─── */}
        <View style={styles.columns}>
          <View style={styles.column}>
            {leftCol.map((p, i) => (
              <Text key={i} style={styles.body}>
                {p}
              </Text>
            ))}
          </View>
          <View style={styles.columnRule} />
          <View style={styles.column}>
            {rightCol.map((p, i) => (
              <Text key={i} style={styles.body}>
                {p}
              </Text>
            ))}
          </View>
        </View>

        {/* ─── End slug ─── */}
        <Text style={styles.endSlug}>✦ ✦ ✦</Text>
        <Text style={styles.footer}>THE DAILY CRUMPLE — ALL THE NEWS THAT’S FIT TO FOLD</Text>
      </AnimatedScrollView>

      {/* ─── Corner perforation — the delete affordance, printed on the page
          like a coupon cutout. Sits under the invisible drag handle; tearing
          along it crumples the page into the bin. ─── */}
      <View pointerEvents="none" style={[styles.tearCorner, { top: insets.top + 16 }]}>
        <View style={styles.tearRow}>
          <Text style={styles.tearScissors}>✄</Text>
          {Array.from({ length: 9 }, (_, i) => (
            <View key={i} style={styles.tearDash} />
          ))}
        </View>
        <Text style={styles.tearCaption}>TEAR HERE</Text>
      </View>
    </View>
  );
});

const absoluteFill = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
} as const;

const styles = StyleSheet.create({
  page: {
    ...absoluteFill,
    backgroundColor: colors.paper,
  },
  grain: {
    ...absoluteFill,
    width: undefined,
    height: undefined,
    opacity: 0.055,
  },
  scroll: { flex: 1 },

  topRule: { height: 2, backgroundColor: colors.ink, marginBottom: 4 },
  dateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.rule,
    paddingBottom: 3,
  },
  dateText: {
    fontFamily: fonts.body,
    fontSize: 9,
    letterSpacing: 0.6,
    color: colors.inkSoft,
  },
  dateLeft: { flex: 1.25, textAlign: 'left' },
  dateCenter: { flex: 2.3, textAlign: 'center' },
  dateRight: { flex: 0.75, textAlign: 'right' },
  masthead: {
    fontFamily: fonts.masthead,
    fontSize: 46,
    color: colors.ink,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 2,
  },
  doubleRule: { marginBottom: 10 },
  doubleRuleThick: { height: 3, backgroundColor: colors.ink },
  doubleRuleThin: { height: 1, backgroundColor: colors.ink, marginTop: 2 },

  kickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  kickerRule: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.rule },
  kicker: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    letterSpacing: 3,
    color: colors.inkSoft,
  },

  headline: {
    fontFamily: fonts.headline,
    fontSize: 30,
    lineHeight: 34,
    color: colors.ink,
    textAlign: 'center',
    marginBottom: 8,
  },
  subhead: {
    fontFamily: fonts.subhead,
    fontSize: 15,
    lineHeight: 20,
    color: colors.inkSoft,
    textAlign: 'center',
    marginBottom: 10,
    paddingHorizontal: 8,
  },
  bylineBlock: { alignItems: 'stretch', gap: 5, marginBottom: 14 },
  hairline: { height: StyleSheet.hairlineWidth, backgroundColor: colors.rule },
  byline: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    letterSpacing: 1.8,
    color: colors.ink,
    textAlign: 'center',
  },

  lead: {
    fontFamily: fonts.body,
    fontSize: 15.5,
    lineHeight: 23,
    color: colors.ink,
    textAlign: 'justify' as const,
    marginBottom: 12,
  },
  dropCap: {
    fontFamily: fonts.headline,
    fontSize: 40,
    lineHeight: 42,
    color: colors.ink,
  },
  bodyBoldInline: { fontFamily: fonts.bodyBold, fontSize: 13.5 },

  pullQuoteBlock: { gap: 8, marginVertical: 10 },
  pullQuote: {
    fontFamily: fonts.headlineItalic,
    fontSize: 18,
    lineHeight: 25,
    color: colors.ink,
    textAlign: 'center',
    paddingHorizontal: 12,
  },

  columns: {
    flexDirection: 'row',
    gap: layout.columnGap,
    marginTop: 6,
  },
  column: { flex: 1 },
  columnRule: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: colors.rule,
  },
  body: {
    fontFamily: fonts.body,
    fontSize: 12.5,
    lineHeight: 18.5,
    color: colors.ink,
    textAlign: 'justify' as const,
    marginBottom: 10,
  },

  endSlug: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.inkSoft,
    textAlign: 'center',
    marginTop: 14,
  },
  footer: {
    fontFamily: fonts.body,
    fontSize: 8.5,
    letterSpacing: 1.2,
    color: colors.inkFaint,
    textAlign: 'center',
    marginTop: 8,
  },

  // perforation across the top-right corner, rotated onto the diagonal the
  // delete drag follows
  tearCorner: {
    position: 'absolute',
    right: -10,
    width: 120,
    alignItems: 'center',
    transform: [{ rotate: '45deg' }],
  },
  tearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  tearScissors: {
    fontSize: 11,
    color: colors.inkSoft,
    marginRight: 2,
  },
  tearDash: {
    width: 6,
    height: 1,
    backgroundColor: colors.inkSoft,
    opacity: 0.55,
  },
  tearCaption: {
    fontFamily: fonts.body,
    fontSize: 7.5,
    letterSpacing: 1.6,
    color: colors.inkFaint,
    marginTop: 2,
  },
});
