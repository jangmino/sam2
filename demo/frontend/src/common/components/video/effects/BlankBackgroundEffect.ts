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
import {AbstractEffect, EffectFrameContext} from './Effect';
import {CanvasForm} from 'pts';

export default class BlankBackgroundEffect extends AbstractEffect {
  constructor() {
    super(1);
  }

  async setup(): Promise<void> {
    // noop
  }

  async cleanup(): Promise<void> {
    // noop
  }

  apply(form: CanvasForm, context: EffectFrameContext): void {
    // Fill the background with black (or transparent) and do not draw the source frame
    form.ctx.save();
    form.ctx.fillStyle = 'black';
    form.ctx.fillRect(0, 0, context.width, context.height);
    form.ctx.restore();
  }
}
