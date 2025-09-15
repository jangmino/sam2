/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import {useAtomValue} from 'jotai';
import {
  areTrackletObjectsInitializedAtom,
  trackletObjectsAtom,
  frameIndexAtom,
} from '../../../demo/atoms';
import {Button} from 'react-daisyui';
import useVideo from '../video/editor/useVideo';
import {EffectIndex} from '../video/effects/Effects';
import type {
  EncodingCompletedEvent,
  EncodingStateUpdateEvent,
} from '../video/VideoWorkerBridge';
import type {WireframesExportedEvent} from '../video/VideoWorkerTypes';
import {useCallback, useMemo, useRef, useState, useEffect} from 'react';

// Inline wireframe preview is powered by worker-side export events.
// We no longer compute wireframes in the main thread.

const DEFAULT_SCALE_CM = 120; // distance between Marker 1 and 2 in cm
const DEFAULT_EPSILON = 2; // polygon simplification tolerance in px
const DEFAULT_STROKE_WIDTH = 2;
const DEFAULT_STROKE_COLOR = '#ffffff';
const DEFAULT_FILL_ALPHA = 0.08;

function saveJson(data: unknown, fileName: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

function makeJsonFilename() {
  return `wireframes_${Date.now()}.json`;
}

function makeVideoFilename() {
  return `wireframe_video_${Date.now()}.mp4`;
}

export default function WireframesPanel() {
  const tracklets = useAtomValue(trackletObjectsAtom);
  const initialized = useAtomValue(areTrackletObjectsInitializedAtom);
  const video = useVideo();
  const frameIndex = useAtomValue(frameIndexAtom);

  // UI state: wireframe parameters
  const [scaleCm, setScaleCm] = useState<number>(DEFAULT_SCALE_CM);
  const [epsilon, setEpsilon] = useState<number>(DEFAULT_EPSILON);
  const [strokeWidth, setStrokeWidth] = useState<number>(DEFAULT_STROKE_WIDTH);
  const [strokeColor, setStrokeColor] = useState<string>(DEFAULT_STROKE_COLOR);
  const [fillAlpha, setFillAlpha] = useState<number>(DEFAULT_FILL_ALPHA);
  const [preview, setPreview] = useState<boolean>(false);

  // Wireframe frames from worker export for inline preview
  const [wfFrames, setWfFrames] = useState<WireframesExportedEvent['frames']>(
    [],
  );
  const [wfReady, setWfReady] = useState(false);

  const currentWf = useMemo(() => {
    return wfFrames.find(f => f.frame === frameIndex) ?? null;
  }, [wfFrames, frameIndex]);

  const previewSvg = useMemo(() => {
    if (!currentWf || currentWf.polygon.length === 0) {
      return null;
    }
    const pts = currentWf.polygon;
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const [x, y] of pts) {
      if (x < minX) {
        minX = x;
      }
      if (y < minY) {
        minY = y;
      }
      if (x > maxX) {
        maxX = x;
      }
      if (y > maxY) {
        maxY = y;
      }
    }
    const pad = 6;
    const vw = 180,
      vh = 120;
    const w = Math.max(1, maxX - minX);
    const h = Math.max(1, maxY - minY);
    const sx = (vw - pad * 2) / w;
    const sy = (vh - pad * 2) / h;
    const s = Math.min(sx, sy);
    const ox = (vw - s * w) / 2 - s * minX;
    const oy = (vh - s * h) / 2 - s * minY;
    const pointsAttr = pts
      .map(([x, y]) => `${(x * s + ox).toFixed(2)},${(y * s + oy).toFixed(2)}`)
      .join(' ');
    return {vw, vh, pointsAttr};
  }, [currentWf]);

  const hasThreeObjects = initialized && tracklets.length >= 3;

  const [downloadingState, setDownloadingState] = useState<'idle' | 'encoding'>(
    'idle',
  );
  const [progress, setProgress] = useState(0);
  const encodingHandlersBound = useRef(false);

  const canExport = hasThreeObjects && video != null;

  // Wireframe export listener for inline preview
  useEffect(() => {
    if (!video) {
      return;
    }
    const onWireframes = (event: WireframesExportedEvent) => {
      setWfFrames(event.frames);
      setWfReady(true);
    };
    video.addEventListener('wireframesExported', onWireframes);
    return () => {
      video.removeEventListener('wireframesExported', onWireframes);
    };
  }, [video]);

  // Trigger export when preview is on and parameters change
  useEffect(() => {
    if (video && preview && canExport) {
      video.exportWireframes(scaleCm, epsilon);
    }
  }, [video, preview, canExport, scaleCm, epsilon]);

  // Apply/refresh preview effect
  const applyPreviewEffect = useCallback(() => {
    if (!video) {
      return;
    }
    if (!preview) {
      return;
    }
    // Keep background original for preview
    video.setEffect('Original', EffectIndex.BACKGROUND);
    video.setEffect('Wireframe', EffectIndex.HIGHLIGHT, {
      variant: 0,
      epsilon,
      scaleCm,
      strokeWidth,
      strokeColor,
      fillAlpha,
    });
  }, [video, preview, epsilon, scaleCm, strokeWidth, strokeColor, fillAlpha]);

  useEffect(() => {
    if (preview) {
      applyPreviewEffect();
    } else if (video) {
      // Revert to a sane default when preview is off
      video.setEffect('Original', EffectIndex.BACKGROUND);
      video.setEffect('Overlay', EffectIndex.HIGHLIGHT, {variant: 0});
    }
  }, [applyPreviewEffect, preview, video]);

  const helperText = useMemo(() => {
    if (!initialized) {
      return '객체 트래킹 중... 잠시만 기다려 주세요.';
    }
    if (!hasThreeObjects) {
      return '세 개의 객체가 준비되면 스케일(120cm) 계산을 진행합니다.';
    }
    return '세 개의 객체가 준비되었습니다. 다음 단계의 데이터 변환/다운로드 UI를 표시합니다.';
  }, [initialized, hasThreeObjects]);

  const onExportJSON = useCallback(() => {
    if (!video) {
      return;
    }

    const once = (event: WireframesExportedEvent) => {
      // Compose export payload
      const payload = {
        version: 1,
        scaleCm: event.scaleCm,
        pxPerCm: event.pxPerCm,
        width: video.width,
        height: video.height,
        frames: event.frames,
        style: {
          strokeWidth,
          strokeColor,
          fillAlpha,
        },
        epsilon,
      };
      saveJson(payload, makeJsonFilename());
      video.removeEventListener('wireframesExported', once);
    };

    video.addEventListener('wireframesExported', once);
    video.exportWireframes(scaleCm, epsilon);
  }, [video, scaleCm, epsilon, strokeWidth, strokeColor, fillAlpha]);

  const onDownloadWireframeVideo = useCallback(() => {
    if (!video) {
      return;
    }

    // Switch to Blank background + Wireframe highlight preset
    video.setEffect('Blank', EffectIndex.BACKGROUND);
    video.setEffect('Wireframe', EffectIndex.HIGHLIGHT, {
      variant: 0,
      epsilon,
      scaleCm,
      strokeWidth,
      strokeColor,
      fillAlpha,
    });

    // Bind encoding listeners once per click
    if (!encodingHandlersBound.current) {
      const onUpdate = (ev: EncodingStateUpdateEvent) => {
        setDownloadingState('encoding');
        setProgress(ev.progress);
      };
      const onDone = (ev: EncodingCompletedEvent) => {
        // Save with wireframe-specific filename
        const blob = new Blob([ev.file]);
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = makeVideoFilename();
        a.click();
        window.URL.revokeObjectURL(url);
        setDownloadingState('idle');
        setProgress(0);
        video.removeEventListener('encodingStateUpdate', onUpdate);
        video.removeEventListener('encodingCompleted', onDone);
        encodingHandlersBound.current = false;
      };

      video.addEventListener('encodingStateUpdate', onUpdate);
      video.addEventListener('encodingCompleted', onDone);
      encodingHandlersBound.current = true;
    }

    video.pause();
    video.encode();
  }, [video, epsilon, scaleCm, strokeWidth, strokeColor, fillAlpha]);

  return (
    <div className="flex flex-col gap-3 p-6 text-sm text-gray-300">
      <div className="font-medium text-white">
        Step 3/3: wire-frames for drape data
      </div>
      <div className="text-gray-400">
        윤곽선 전체 픽셀을 저장하지 않고, 단순화된 폴리곤(와이어프레임)으로
        저장합니다.
      </div>
      <div>{helperText}</div>
      {hasThreeObjects && (
        <div className="text-xs text-gray-500">
          주의: 객체 순서를 1=메인, 2=마커1, 3=마커2로 가정합니다.
        </div>
      )}

      {/* Parameters */}
      <div className="mt-2 grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-gray-400">Scale (cm)</span>
          <input
            type="number"
            className="input input-bordered input-sm bg-transparent"
            min={1}
            step={1}
            value={scaleCm}
            onChange={e => setScaleCm(Math.max(1, Number(e.target.value) || 1))}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-gray-400">Simplify epsilon (px)</span>
          <input
            type="number"
            className="input input-bordered input-sm bg-transparent"
            min={0}
            step={0.5}
            value={epsilon}
            onChange={e => setEpsilon(Math.max(0, Number(e.target.value) || 0))}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-gray-400">Stroke width</span>
          <input
            type="number"
            className="input input-bordered input-sm bg-transparent"
            min={0}
            step={0.5}
            value={strokeWidth}
            onChange={e =>
              setStrokeWidth(Math.max(0, Number(e.target.value) || 0))
            }
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-gray-400">Stroke color</span>
          <input
            type="color"
            className="input input-bordered input-sm bg-transparent"
            value={strokeColor}
            onChange={e => setStrokeColor(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 col-span-2">
          <span className="text-gray-400">Fill alpha</span>
          <input
            type="range"
            className="range range-xs"
            min={0}
            max={1}
            step={0.01}
            value={fillAlpha}
            onChange={e => setFillAlpha(Number(e.target.value))}
          />
          <div className="text-xs text-gray-400">{fillAlpha.toFixed(2)}</div>
        </label>
      </div>

      {/* Preview toggle */}
      <div className="flex items-center gap-2 mt-1">
        <input
          type="checkbox"
          className="toggle toggle-sm"
          checked={preview}
          onChange={e => setPreview(e.target.checked)}
          disabled={!canExport}
        />
        <div className="text-gray-300">
          미리보기 활성화 (Original + Wireframe)
        </div>
      </div>

      {/* Inline SVG preview */}
      <div className="mt-2">
        <div className="text-xs text-gray-400 mb-1">현재 프레임 미리보기</div>
        <div className="border border-gray-700 rounded p-2 inline-block bg-black/30">
          {wfReady && previewSvg ? (
            <svg
              width={200}
              height={140}
              viewBox={`0 0 ${previewSvg.vw} ${previewSvg.vh}`}>
              <rect
                x={0}
                y={0}
                width={previewSvg.vw}
                height={previewSvg.vh}
                fill="transparent"
              />
              <polygon
                points={previewSvg.pointsAttr}
                fill={`rgba(255,255,255,${fillAlpha})`}
                stroke={strokeColor}
                strokeWidth={strokeWidth}
              />
            </svg>
          ) : (
            <div className="text-xs text-gray-500">
              와이어프레임 계산 대기중...
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 mt-2">
        <div>트래킹된 객체 수: {tracklets.length}</div>
        <div className="flex gap-2 mt-2 items-center">
          <Button
            color="primary"
            className="!rounded-full"
            disabled={!canExport}
            onClick={onExportJSON}>
            Export Wireframe JSON
          </Button>
          <Button
            color="ghost"
            className="!rounded-full"
            disabled={!canExport || downloadingState === 'encoding'}
            onClick={onDownloadWireframeVideo}>
            {downloadingState === 'encoding'
              ? 'Encoding...'
              : 'Download Wireframe Video'}
          </Button>
          {downloadingState === 'encoding' && (
            <progress
              className="progress progress-xs w-40"
              value={Math.round(progress * 100)}
              max={100}
            />
          )}
        </div>
      </div>
    </div>
  );
}
