import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { GestureDetector, type GestureType } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArticlePage } from '../components/ArticlePage';
import { TouchIndicator, useTouchIndicator } from '../components/TouchIndicator';
import { ARTICLES, type Article } from '../data/articles';
import { CrinkleOverlay } from '../effects/CrinkleOverlay';
import { CrumpleOverlay } from '../effects/CrumpleOverlay';
import {
  OverscrollOverlay,
  overscrollAmount,
  overscrollShowing,
  type OverscrollWiring,
} from '../effects/OverscrollOverlay';
import { usePageGestures, type CrinkleGestureState } from '../engine/usePageGestures';
import { useCrumpleGesture, type CrumpleState } from '../engine/useCrumpleGesture';
import { useSnapshot } from '../engine/useSnapshot';
import { colors } from '../theme';

/** Hit area of the invisible top-right delete handle. */
const HANDLE_SIZE = 64;

/**
 * The deck of newspaper pages. Exactly two pages are mounted: the current one
 * and the one beneath it (revealed by the crinkle swipe / crumple delete).
 * Both render in one keyed list so that promoting the under page to current
 * reorders props on the same element — never a remount, never a flicker.
 */
export function NewsStack() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [articles, setArticles] = useState<Article[]>(ARTICLES);
  const [index, setIndex] = useState(0);
  const [underIndex, setUnderIndex] = useState<number | null>(null);
  // id of the article currently frozen in the snapshot — the only page that hides
  const [snapArticleId, setSnapArticleId] = useState<string | null>(null);

  const snapshot = useSnapshot();
  const touch = useTouchIndicator();

  const hasNext = useSharedValue(true);
  const hasPrev = useSharedValue(false);
  const canDelete = useSharedValue(true);
  useEffect(() => {
    hasNext.value = index < articles.length - 1;
    hasPrev.value = index > 0;
    canDelete.value = articles.length > 1;
  }, [index, articles, hasNext, hasPrev, canDelete]);

  const currentArticle = articles[index];

  // depend on snapshot.take (stable), NOT the snapshot object — its identity
  // changes every render, and takeSnapshot feeds effects: an unstable identity
  // here loops take → setImage → render → take until Hermes OOMs
  const takeSnapshotFn = snapshot.take;
  const takeSnapshot = useCallback(() => {
    setSnapArticleId(currentArticle.id);
    takeSnapshotFn();
  }, [currentArticle.id, takeSnapshotFn]);

  // Pre-warm: the first makeImageFromView after launch is slow (>1s cold
  // Metal pipeline) — capture ahead of time so the shaders have an image the
  // moment a gesture starts. Refreshed after every page swap.
  useEffect(() => {
    const id = setTimeout(takeSnapshot, 400);
    return () => clearTimeout(id);
  }, [index, articles, takeSnapshot]);

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
    tracker: touch.tracker,
  });

  // ── overscroll crumple: scroll state written by the current page ──
  const overscrollY = useSharedValue(0);
  const overscrollMax = useSharedValue(0);
  const overscrollArmed = useSharedValue(0);
  const overscrollReady = useSharedValue(0);
  const overscrollRamp = useSharedValue(1);
  const overscrollSeed = useSharedValue(0);
  const overscrollRelease = useSharedValue(0);
  const overscroll: OverscrollWiring = {
    y: overscrollY,
    max: overscrollMax,
    armed: overscrollArmed,
    ready: overscrollReady,
    ramp: overscrollRamp,
    seed: overscrollSeed,
    release: overscrollRelease,
  };
  const overscrollActive = useDerivedValue<number>(() => overscrollShowing(overscroll));

  // Momentum overscroll (a fling coasting past the edge, no finger down):
  // the touch-down snapshot is stale, so grab a fresh one the moment the
  // bounce begins. The content is pinned at the edge by ArticlePage's
  // compensation transform, so the capture is edge-exact; once it lands the
  // crumple ramps in over ~140ms.
  const momentumPending = useRef(false);
  const requestMomentumSnapshot = useCallback(() => {
    momentumPending.current = true;
    takeSnapshot();
  }, [takeSnapshot]);
  useAnimatedReaction(
    () => overscrollAmount(overscroll),
    (over, prev) => {
      if (over !== 0 && !(prev ?? 0)) {
        const armedForEdge =
          over > 0 ? overscrollArmed.value & 1 : overscrollArmed.value & 2;
        if (!armedForEdge && !overscrollReady.value) {
          overscrollSeed.value = Math.random() * 100;
          scheduleOnRN(requestMomentumSnapshot);
        }
      } else if (over === 0 && (prev ?? 0)) {
        overscrollReady.value = 0;
      }
    },
  );
  const snapImage = snapshot.image;
  useEffect(() => {
    if (momentumPending.current && snapImage) {
      momentumPending.current = false;
      overscrollRamp.value = 0;
      overscrollRamp.value = withTiming(1, { duration: 140 });
      overscrollReady.value = 1;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapImage]);

  // ── crumple delete: dragged from the invisible top-right corner handle ──
  const handleX = width - 10 - HANDLE_SIZE / 2;
  const handleY = insets.top + 4 + HANDLE_SIZE / 2;

  const chooseUnderForDelete = useCallback(() => {
    chooseUnder(index < articles.length - 1 ? -1 : 1);
  }, [chooseUnder, index, articles.length]);

  const land = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, []);

  const arrive = useCallback(() => {
    const wasLast = index >= articles.length - 1;
    setArticles((prev) => prev.filter((a) => a.id !== currentArticle.id));
    setIndex(wasLast ? Math.max(0, index - 1) : index);
    setUnderIndex(null);
  }, [index, articles.length, currentArticle.id]);

  const {
    binPan,
    state: crumple,
    settling: crumpleSettling,
  } = useCrumpleGesture({
    takeSnapshot,
    chooseUnder: chooseUnderForDelete,
    land,
    arrive,
    cancel,
    canDelete,
    handleX,
    handleY,
    tracker: touch.tracker,
  });

  // After the index/articles swap has rendered, the old page is unmounted —
  // only now is it safe to reset gesture state (un-hiding nothing, overlays off).
  useEffect(() => {
    state.progress.value = 0;
    state.active.value = 0;
    state.settling.value = 0;
    crumple.t.value = 0;
    crumple.throwU.value = 0;
    crumple.active.value = 0;
    crumple.binRise.value = 0;
    crumpleSettling.value = 0;
    overscrollArmed.value = 0;
    overscrollRelease.value = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, articles]);

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
    pageNo: articles.indexOf(a) + 1,
  }));

  return (
    <GestureDetector gesture={touch.tracker}>
    <View style={styles.root}>
      <GestureDetector gesture={crinklePan}>
        <View style={styles.deck}>
          {pages.map(({ article, isCurrent, pageNo }) => (
            <PageHolder
              key={article.id}
              article={article}
              page={pageNo}
              total={articles.length}
              crinkle={state}
              crumple={crumple}
              overscrollActive={overscrollActive}
              overscroll={isCurrent ? overscroll : undefined}
              shouldHide={article.id === snapArticleId}
              pageRef={isCurrent ? snapshot.pageRef : undefined}
              scrollSimultaneousWith={touch.trackerRef}
            />
          ))}
        </View>
      </GestureDetector>
      <CrinkleOverlay image={snapshot.image} state={state} width={width} height={height} />
      <OverscrollOverlay
        image={snapshot.image}
        wiring={overscroll}
        width={width}
        height={height}
      />
      <CrumpleOverlay
        image={snapshot.image}
        state={crumple}
        width={width}
        height={height}
      />
      {/* invisible delete handle — grabbing this corner crumples the page.
          collapsable={false}: RN view-flattening would remove this empty
          View, leaving the gesture with no native view to hit-test */}
      <GestureDetector gesture={binPan}>
        <View collapsable={false} style={[styles.handle, { top: insets.top + 4 }]} />
      </GestureDetector>
      {/* demo fingertip — a translucent circle following any touch */}
      <TouchIndicator x={touch.x} y={touch.y} pressed={touch.pressed} />
    </View>
    </GestureDetector>
  );
}

interface PageHolderProps {
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

function PageHolder({
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
}: PageHolderProps) {
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
    <Animated.View style={[styles.pageHolder, style]}>
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
  handle: {
    position: 'absolute',
    right: 10,
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
  },
});
