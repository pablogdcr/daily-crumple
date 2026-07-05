import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import type { GestureType } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import type { Article } from '../data/articles';
import type { OverscrollWiring } from '../effects/OverscrollOverlay';
import type { CrinkleGestureState } from '../engine/usePageGestures';
import type { CrumpleState } from '../engine/useCrumpleGesture';
import { ArticlePage } from './ArticlePage';

interface Props {
  article: Article;
  page: number;
  total: number;
  crinkle: CrinkleGestureState;
  crumple: CrumpleState;
  /** 1 while the overscroll crumple overlay is drawing. */
  overscrollActive: SharedValue<number>;
  /** Scroll wiring — only the current page writes it. */
  overscroll?: OverscrollWiring;
  /** True only for the article frozen in the current snapshot. */
  shouldHide: boolean;
  pageRef?: React.RefObject<View | null>;
  /** Touch-indicator tracker ref — the scroll gesture must not cancel it. */
  scrollSimultaneousWith?: React.RefObject<GestureType | undefined>;
}

/**
 * One mounted page of the deck. Memoized: NewsStack re-renders on every
 * snapshot landing (mid-gesture), and without memo both full article pages
 * would re-render their text each time.
 */
export const PageHolder = memo(function PageHolder({
  article,
  page,
  total,
  crinkle,
  crumple,
  overscrollActive,
  overscroll,
  shouldHide,
  pageRef,
  scrollSimultaneousWith,
}: Props) {
  // the snapshotted page hides while an overlay draws it — never both visible
  const style = useAnimatedStyle(
    () => ({
      opacity:
        shouldHide &&
        (crinkle.active.value || crumple.active.value || overscrollActive.value)
          ? 0
          : 1,
    }),
    [shouldHide],
  );

  return (
    <Animated.View style={[styles.holder, style]}>
      <ArticlePage
        ref={pageRef}
        article={article}
        page={page}
        total={total}
        overscroll={overscroll}
        scrollSimultaneousWith={scrollSimultaneousWith}
      />
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  holder: StyleSheet.absoluteFill,
});
