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
import RestartSessionButton from '@/common/components/session/RestartSessionButton';
import {
  WIREFRAMES_TOOLBAR_INDEX,
  OBJECT_TOOLBAR_INDEX,
} from '@/common/components/toolbar/ToolbarConfig';
import {ChevronLeft} from '@carbon/icons-react';
import {Button} from 'react-daisyui';
import ToolbarBottomActionsWrapper from '../toolbar/ToolbarBottomActionsWrapper';

type Props = {
  onTabChange: (newIndex: number) => void;
};

export default function MoreOptionsToolbarBottomActions({onTabChange}: Props) {
  function handleReturnToWireframesTab() {
    onTabChange(WIREFRAMES_TOOLBAR_INDEX);
  }

  return (
    <ToolbarBottomActionsWrapper>
      <Button
        color="ghost"
        onClick={handleReturnToWireframesTab}
        className="!px-4 !rounded-full font-medium text-white hover:bg-black"
        startIcon={<ChevronLeft />}>
        Edit wire-frames
      </Button>
      <RestartSessionButton
        onRestartSession={() => onTabChange(OBJECT_TOOLBAR_INDEX)}
      />
    </ToolbarBottomActionsWrapper>
  );
}
