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
import WireframesToolbarHeader from './WireframesToolbarHeader';
import WireframesToolbarBottomActions from './WireframesToolbarBottomActions';
import WireframesPanel from './WireframesPanel';

// New "wire-frames for drape data" tab replacing the previous Effects tab

type Props = {
  onTabChange: (newIndex: number) => void;
};

export default function WireframesToolbar({onTabChange}: Props) {
  return (
    <div className="flex flex-col h-full">
      <WireframesToolbarHeader />
      <div className="grow overflow-y-auto">
        <WireframesPanel />
      </div>
      <WireframesToolbarBottomActions onTabChange={onTabChange} />
    </div>
  );
}
