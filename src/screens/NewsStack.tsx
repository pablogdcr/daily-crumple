import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { ArticlePage } from '../components/ArticlePage';
import { ARTICLES, type Article } from '../data/articles';
import { CrinkleOverlay } from '../effects/CrinkleOverlay';
import { usePageGestures, type CrinkleGestureState } from '../engine/usePageGestures';
import { useSnapshot } from '../engine/useSnapshot';
import { colors } from '../theme';

/**
 * The deck of newspaper pages. Exactly two pages are mounted: the current one
 * and the one beneath it (revealed by the crinkle swipe / crumple delete).
 * Both render in one keyed list so that promoting the under page to current
 * reorders props on the same element — never a remount, never a flicker.
 */
export function NewsStack() {
  const { width, height } = useWindowDimensions();
  const [articles] = useState<Article[]>(ARTICLES);
  const [index, setIndex] = useState(0);
  const [underIndex, setUnderIndex] = useState<number | null>(null);
  // id of the article currently frozen in the snapshot — the only page that hides
  const [snapArticleId, setSnapArticleId] = useState<string | null>(null);

  const snapshot = useSnapshot();

  const hasNext = useSharedValue(true);
  const hasPrev = useSharedValue(false);
  useEffect(() => {
    hasNext.value = index < articles.length - 1;
    hasPrev.value = index > 0;
  }, [index, articles, hasNext, hasPrev]);

  const currentArticle = articles[index];

  const takeSnapshot = useCallback(() => {
    setSnapArticleId(currentArticle.id);
    snapshot.take();
  }, [currentArticle.id, snapshot]);

  const chooseUnder = useCallback(
    (dir: number) => {
      const target = dir < 0 ? index + 1 : index - 1;
      setUnderIndex(target >= 0 && target < articles.length ? target : null);
    },
    [index, articles.length],
  );

  const pendingCommit = useRef<number | null>(null);
  const commit = useCallback(() => {
    setIndex((i) => {
      const target = pendingCommit.current;
      pendingCommit.current = null;
      return target ?? i;
    });
    setUnderIndex(null);
  }, []);
  // chooseUnder runs before commit, so remember the target for the commit callback
  useEffect(() => {
    pendingCommit.current = underIndex;
  }, [underIndex]);

  const cancel = useCallback(() => {
    setUnderIndex(null);
  }, []);

  const { crinklePan, state } = usePageGestures({
    takeSnapshot,
    chooseUnder,
    commit,
    cancel,
    hasNext,
    hasPrev,
  });

  // After the index swap has rendered, the old page is unmounted — only now is
  // it safe to reset the gesture state (un-hiding nothing, overlay off).
  useEffect(() => {
    state.progress.value = 0;
    state.active.value = 0;
    state.settling.value = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const underArticle =
    underIndex != null ? articles[underIndex] : articles[index + 1] ?? null;

  // under first (below), current last (on top); stable keys drive promotion
  const pages = (
    underArticle && underArticle.id !== currentArticle.id
      ? [underArticle, currentArticle]
      : [currentArticle]
  ).map((a) => ({
    article: a,
    isCurrent: a.id === currentArticle.id,
  }));

  return (
    <View style={styles.root}>
      <GestureDetector gesture={crinklePan}>
        <View style={styles.deck}>
          {pages.map(({ article, isCurrent }) => (
            <PageHolder
              key={article.id}
              article={article}
              gestureState={state}
              shouldHide={article.id === snapArticleId}
              pageRef={isCurrent ? snapshot.pageRef : undefined}
            />
          ))}
        </View>
      </GestureDetector>
      <CrinkleOverlay image={snapshot.image} state={state} width={width} height={height} />
    </View>
  );
}

interface PageHolderProps {
  article: Article;
  gestureState: CrinkleGestureState;
  /** True only for the article frozen in the current snapshot. */
  shouldHide: boolean;
  pageRef?: React.RefObject<View | null>;
}

function PageHolder({ article, gestureState, shouldHide, pageRef }: PageHolderProps) {
  const { active } = gestureState;
  const style = useAnimatedStyle(
    () => ({
      opacity: shouldHide && active.value ? 0 : 1,
    }),
    [shouldHide],
  );

  return (
    <Animated.View style={[styles.pageHolder, style]}>
      <ArticlePage ref={pageRef} article={article} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paperDark },
  deck: { flex: 1 },
  pageHolder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});
