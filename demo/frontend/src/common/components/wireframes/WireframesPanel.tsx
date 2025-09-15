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
} from '@/demo/atoms';
import {Button} from 'react-daisyui';
import useVideo from '@/common/components/video/editor/useVideo';
import {EffectIndex} from '@/common/components/video/effects/Effects';
import type {
  EncodingCompletedEvent,
  EncodingStateUpdateEvent,
} from '@/common/components/video/VideoWorkerBridge';
import type {WireframesExportedEvent} from '@/common/components/video/VideoWorkerTypes';
import {useCallback, useMemo, useRef, useState} from 'react';

const DEFAULT_SCALE_CM = 120; // distance between Marker 1 and 2 in cm
const DEFAULT_EPSILON = 2; // polygon simplification tolerance in px

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

  const hasThreeObjects = initialized && tracklets.length >= 3;

  const [downloadingState, setDownloadingState] = useState<'idle' | 'encoding'>(
    'idle',
  );
  const [progress, setProgress] = useState(0);
  const encodingHandlersBound = useRef(false);

  const canExport = hasThreeObjects && video != null;

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
      };
      saveJson(payload, makeJsonFilename());
      video.removeEventListener('wireframesExported', once);
    };

    video.addEventListener('wireframesExported', once);
    video.exportWireframes(DEFAULT_SCALE_CM, DEFAULT_EPSILON);
  }, [video]);

  const onDownloadWireframeVideo = useCallback(() => {
    if (!video) {
      return;
    }

    // Switch to Blank background + Wireframe highlight preset
    video.setEffect('Blank', EffectIndex.BACKGROUND);
    video.setEffect('Wireframe', EffectIndex.HIGHLIGHT);

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
  }, [video]);

  return (
    <div className="flex flex-col gap-3 p-6 text-sm text-gray-300">
      <div className="font-medium text-white">
        Step 3/3: wire-frames for drape data
      </div>
      <div className="text-gray-400">
        윤곽선 전체 픽셀을 저장하지 않고, 단순화된 폴리곤(와이어프레임)으로 저장합니다.
      </div>
      <div>{helperText}</div>
      <div className="flex flex-col gap-2">
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
