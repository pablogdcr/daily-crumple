import { makeImageFromView, type SkImage } from '@shopify/react-native-skia';
import { useCallback, useRef, useState } from 'react';
import type { View } from 'react-native';

export interface SnapshotController {
  pageRef: React.RefObject<View | null>;
  /** Latest snapshot of the current page, or null before the first capture. */
  image: SkImage | null;
  /** Generation of the capture that produced `image` (0 = none yet). */
  imageGen: number;
  /**
   * Capture the page into `image`; returns the request's generation so a
   * caller can tell whether a landed image is fresh enough. One capture runs
   * at a time; a request arriving mid-capture is queued (latest wins) and
   * re-runs the moment the current one settles - never silently dropped.
   */
  take: () => number;
  clear: () => void;
}

/**
 * Snapshot plumbing for the shader overlays. The page is captured at touch-down
 * (gesture onBegin) so by the time a pan activates (±14px of travel) the image
 * is ready. The image only changes at gesture boundaries, so React state is the
 * right home for it - per-frame animation happens in shader uniforms, not here.
 */
export function useSnapshot(): SnapshotController {
  const pageRef = useRef<View>(null);
  const [shot, setShot] = useState<{ image: SkImage | null; gen: number }>({
    image: null,
    gen: 0,
  });
  const inFlight = useRef(false);
  const reqGen = useRef(0);
  const queuedGen = useRef(0);

  const run = useCallback((gen: number) => {
    inFlight.current = true;
    makeImageFromView(pageRef as React.RefObject<View>)
      .then((img) => {
        if (img) setShot({ image: img, gen });
      })
      .catch(() => {
        // transient capture failure - next touch-down retries
      })
      .finally(() => {
        inFlight.current = false;
        if (queuedGen.current > gen) run(queuedGen.current);
      });
  }, []);

  const take = useCallback(() => {
    reqGen.current += 1;
    const gen = reqGen.current;
    if (!pageRef.current) return gen;
    if (inFlight.current) {
      queuedGen.current = gen;
      return gen;
    }
    run(gen);
    return gen;
  }, [run]);

  const clear = useCallback(() => setShot({ image: null, gen: 0 }), []);

  return { pageRef, image: shot.image, imageGen: shot.gen, take, clear };
}
