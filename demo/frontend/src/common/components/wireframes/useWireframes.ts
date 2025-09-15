/**
 * Hook to compute wireframe polygons per frame from tracked objects.
 */
import {useMemo} from 'react';
import {useAtomValue} from 'jotai';
import {areTrackletObjectsInitializedAtom, trackletObjectsAtom} from '@/demo/atoms';
import {RLEObject} from '@/jscocotools/mask';
import {centroidFromRLE, distance, transformTopAndScale, wireframeFromRLE, type Point} from '@/common/wireframes/WireframeUtils';

export type FrameWireframe = {
  frame: number;
  polygon: Point[];
};

export function useWireframes(scaleCm: number = 120, epsilon: number = 2) {
  const tracklets = useAtomValue(trackletObjectsAtom);
  const initialized = useAtomValue(areTrackletObjectsInitializedAtom);

  return useMemo(() => {
    if (!initialized || tracklets.length < 3) {
      return {ready: false, frames: [] as FrameWireframe[], scale: 1};
    }

    const main = tracklets[0];
    const marker1 = tracklets[1];
    const marker2 = tracklets[2];

    const numFrames = Math.min(
      main.masks.length,
      marker1.masks.length,
      marker2.masks.length,
    );

    // First frame scale based on centroids of marker masks
    const m1rle = marker1.masks[0]?.data as unknown as RLEObject | undefined;
    const m2rle = marker2.masks[0]?.data as unknown as RLEObject | undefined;
    if (!m1rle || !m2rle) {
      return {ready: false, frames: [] as FrameWireframe[], scale: 1};
    }
    const p = centroidFromRLE(m1rle);
    const q = centroidFromRLE(m2rle);
    if (!p || !q) {
      return {ready: false, frames: [] as FrameWireframe[], scale: 1};
    }
    const pxDist = distance(p, q);
    const scale = pxDist > 0 ? scaleCm / pxDist : 1;

    const frames: FrameWireframe[] = [];

    for (let i = 0; i < numFrames; i++) {
      const rle = main.masks[i]?.data as unknown as RLEObject | undefined;
      if (!rle) continue;
      const wf = wireframeFromRLE(rle, epsilon);
      const transformed = transformTopAndScale(wf.polygon, wf.topmostIndex, scale);
      frames.push({frame: i, polygon: transformed});
    }

    return {ready: true, frames, scale};
  }, [initialized, tracklets, scaleCm, epsilon]);
}
