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

export default function WireframesPanel() {
  const tracklets = useAtomValue(trackletObjectsAtom);
  const initialized = useAtomValue(areTrackletObjectsInitializedAtom);

  const hasThreeObjects = initialized && tracklets.length >= 3;

  return (
    <div className="p-6 text-sm text-gray-300 flex flex-col gap-3">
      <div className="text-white font-medium">Step 3/3: wire-frames for drape data</div>
      <div className="text-gray-400">
        윤곽선 전체 픽셀을 저장하지 않고, 단순화된 폴리곤(와이어프레임)으로 저장합니다.
      </div>
      {!initialized && <div>객체 트래킹 중... 잠시만 기다려 주세요.</div>}
      {initialized && (
        <div className="flex flex-col gap-2">
          <div>
            트래킹된 객체 수: {tracklets.length} (예상: 3 — Object 1: 메인, Object 2: marker 1, Object 3: marker 2)
          </div>
          {!hasThreeObjects && (
            <div className="text-yellow-400">세 개의 객체가 준비되면 스케일(120cm) 계산을 진행합니다.</div>
          )}
          {hasThreeObjects && (
            <div className="text-green-400">세 개의 객체가 준비되었습니다. 다음 단계의 데이터 변환/다운로드 UI를 표시합니다.</div>
          )}
          <div className="flex gap-2 mt-2">
            <Button color="ghost" className="!rounded-full" disabled>
              Export Wireframe JSON (곧 제공)
            </Button>
            <Button color="ghost" className="!rounded-full" disabled>
              Download Wireframe Video (곧 제공)
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
