/**
 * Draws simplified wireframe polygon of Object 1 only, scaled so that
 * distance between marker1 and marker2 (Object 2 and 3) in first frame is 120cm,
 * and translated so that the topmost point sits slightly above the frame center.
 */
import {AbstractEffect, EffectFrameContext} from './Effect';
import {CanvasForm} from 'pts';
import {RLEObject} from '@/jscocotools/mask';
import {
  centroidFromRLE,
  distance,
  transformTopAndScale,
  wireframeFromRLE,
} from '@/common/wireframes/WireframeUtils';

export default class WireframeEffect extends AbstractEffect {
  private _scale = 1;
  private _epsilon = 2;
  private _scaleCm = 120;
  private _initialized = false;

  constructor() {
    super(1);
  }

  async update(options: {variant: number}): Promise<void> {
    // allow changing simplification tolerance by variant if desired in future
    this.variant = options.variant;
  }

  private _ensureScale(context: EffectFrameContext): void {
    if (this._initialized) return;
    // Expect markers at indices 1 and 2
    const marker1 = context.masks[1]?.bitmap as RLEObject | undefined;
    const marker2 = context.masks[2]?.bitmap as RLEObject | undefined;
    if (!marker1 || !marker2) {
      this._initialized = true; // avoid repeated attempts
      this._scale = 1;
      return;
    }
    const p = centroidFromRLE(marker1);
    const q = centroidFromRLE(marker2);
    if (!p || !q) {
      this._initialized = true;
      this._scale = 1;
      return;
    }
    const dpx = distance(p, q);
    this._scale = dpx > 0 ? this._scaleCm / dpx : 1;
    this._initialized = true;
  }

  apply(form: CanvasForm, context: EffectFrameContext): void {
    // Compute scale once using first frame markers
    if (context.frameIndex === 0 && !this._initialized) {
      this._ensureScale(context);
    }

    const mainMask = context.masks[0]?.bitmap as RLEObject | undefined;
    if (!mainMask) return;

    const {polygon, topmostIndex} = wireframeFromRLE(mainMask, this._epsilon);
    const scaled = transformTopAndScale(polygon, topmostIndex, this._scale);

    const cx = context.width / 2;
    const cy = context.height / 2 - Math.max(10, context.height * 0.05);

    const path = new Path2D();
    if (scaled.length > 0) {
      const [x0, y0] = scaled[0];
      path.moveTo(cx + x0, cy + y0);
      for (let i = 1; i < scaled.length; i++) {
        const [x, y] = scaled[i];
        path.lineTo(cx + x, cy + y);
      }
      // Close path
      path.closePath();
    }

    form.ctx.save();
    form.ctx.lineWidth = 2;
    form.ctx.strokeStyle = 'white';
    form.ctx.fillStyle = 'rgba(255,255,255,0.08)';
    form.ctx.stroke(path);
    // Optional slight fill to make visible
    form.ctx.fill(path);
    form.ctx.restore();
  }
}
