import { makeImageFromView, type SkImage } from '@shopify/react-native-skia';
import { useCallback, useRef, useState } from 'react';
import type { View } from 'react-native';

export interface SnapshotController {
  pageRef: React.RefObject<View | null>;
  /** Latest snapshot of the current page, or null before the first capture. */
  image: SkImage | null;
  /** Capture the page into `image`. Guarded: one in-flight capture at a time. */
  take: () => void;
  clear: () => void;
}

/**
 * Snapshot plumbing for the shader overlays. The page is captured at touch-down
 * (gesture onBegin) so by the time a pan activates (±14px of travel) the image
 * is ready. The image only changes at gesture boundaries, so React state is the
 * right home for it — per-frame animation happens in shader uniforms, not here.
 */
export function useSnapshot(): SnapshotController {
  const pageRef = useRef<View>(null);
  const [image, setImage] = useState<SkImage | null>(null);
  const inFlight = useRef(false);

  const take = useCallback(() => {
    if (inFlight.current || !pageRef.current) return;
    inFlight.current = true;
    makeImageFromView(pageRef as React.RefObject<View>)
      .then((img) => {
        if (img) setImage(img);
      })
      .catch(() => {
        // transient capture failure — next touch-down retries
      })
      .finally(() => {
        inFlight.current = false;
      });
  }, []);

  const clear = useCallback(() => setImage(null), []);

  return { pageRef, image, take, clear };
}
