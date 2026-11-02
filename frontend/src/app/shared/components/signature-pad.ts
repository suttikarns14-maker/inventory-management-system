import { ChangeDetectionStrategy, Component, ElementRef, forwardRef, input, signal, viewChild } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';

/**
 * Draw-to-sign box (D17) for a FormControl<string>: the value is a PNG data URL, or '' when empty,
 * so Validators.required means "has signed". Works with mouse, pen and touch.
 */
@Component({
  selector: 'app-signature-pad',
  imports: [MatButtonModule],
  template: `
    <canvas
      #canvas
      width="600"
      height="200"
      role="img"
      [attr.aria-label]="label()"
      [class.disabled]="disabled()"
      (pointerdown)="start($event)"
      (pointermove)="move($event)"
      (pointerup)="end()"
      (pointerleave)="end()"
      (pointercancel)="end()"
    ></canvas>
    <div class="actions">
      <span class="hint">{{ label() }}: เซ็นในกรอบด้วยเมาส์หรือนิ้ว</span>
      <button mat-button type="button" (click)="clear()" [disabled]="disabled()">ล้าง</button>
    </div>
  `,
  styles: `
    :host { display: block; max-width: 600px; }
    canvas {
      display: block;
      width: 100%;
      aspect-ratio: 3 / 1;
      background: #fff;
      border: 1px dashed var(--mat-sys-outline);
      border-radius: 8px;
      touch-action: none; /* drawing must not scroll the page on phones */
      cursor: crosshair;
    }
    canvas.disabled { opacity: 0.6; cursor: default; }
    .actions { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .hint { font-size: 0.85em; color: var(--mat-sys-on-surface-variant); }
  `,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => SignaturePad), multi: true }],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignaturePad implements ControlValueAccessor {
  readonly label = input('ลายเซ็น');
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  protected readonly disabled = signal(false);
  private drawing = false;
  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  private context(): CanvasRenderingContext2D | null {
    const ctx = this.canvas().nativeElement.getContext('2d');
    if (ctx) {
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#111';
    }
    return ctx;
  }

  /** Pointer position in canvas pixels (the canvas is scaled by CSS). */
  private point(e: MouseEvent): { x: number; y: number } {
    const c = this.canvas().nativeElement;
    const r = c.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) * c.width) / (r.width || c.width),
      y: ((e.clientY - r.top) * c.height) / (r.height || c.height),
    };
  }

  protected start(e: PointerEvent): void {
    if (this.disabled()) return;
    e.preventDefault();
    this.canvas().nativeElement.setPointerCapture?.(e.pointerId);
    const ctx = this.context();
    const { x, y } = this.point(e);
    ctx?.beginPath();
    ctx?.moveTo(x, y);
    ctx?.lineTo(x, y); // a tap leaves a dot
    ctx?.stroke();
    this.drawing = true;
  }

  protected move(e: PointerEvent): void {
    if (!this.drawing) return;
    const ctx = this.context();
    const { x, y } = this.point(e);
    ctx?.lineTo(x, y);
    ctx?.stroke();
  }

  protected end(): void {
    if (!this.drawing) return;
    this.drawing = false;
    this.onChange(this.canvas().nativeElement.toDataURL('image/png'));
    this.onTouched();
  }

  protected clear(): void {
    this.erase();
    this.onChange('');
    this.onTouched();
  }

  private erase(): void {
    const c = this.canvas().nativeElement;
    this.context()?.clearRect(0, 0, c.width, c.height);
  }

  /** Only an empty value is written back (form reset); a saved signature is never redrawn. */
  writeValue(value: string | null): void {
    if (!value) this.erase();
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled.set(disabled);
  }
}
