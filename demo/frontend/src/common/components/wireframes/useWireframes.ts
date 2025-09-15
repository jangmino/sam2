/**
 * Hook to compute wireframe polygons per frame from tracked objects.
 *
 * Deprecated: Wireframe computation now happens in the Video worker.
 * This stub is kept for compatibility and always returns not-ready.
 */
import {useMemo} from 'react';
import type {Point} from '@/common/wireframes/WireframeUtils';

export type FrameWireframe = {
  frame: number;
  polygon: Point[];
};

export function useWireframes(_scaleCm: number = 120, _epsilon: number = 2) {
  return useMemo(
    () => ({ready: false as const, frames: [] as FrameWireframe[], scale: 1}),
    [],
  );
}
