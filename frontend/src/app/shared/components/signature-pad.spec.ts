import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { SignaturePad } from './signature-pad';

@Component({
  imports: [ReactiveFormsModule, SignaturePad],
  template: `<app-signature-pad [formControl]="signature" />`,
})
class Host {
  readonly signature = new FormControl('', { nonNullable: true, validators: Validators.required });
}

// jsdom has no canvas drawing: stand in for the 2D context and the PNG export.
const PNG = 'data:image/png;base64,AAAA';
beforeEach(() => {
  const ctx = { beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, clearRect() {} };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(PNG);
});

function setup() {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const el: HTMLElement = fixture.nativeElement;
  const canvas = el.querySelector('canvas')!;
  const pointer = (type: string) => canvas.dispatchEvent(new MouseEvent(type, { clientX: 10, clientY: 10, bubbles: true }));
  return { control: fixture.componentInstance.signature, el, pointer };
}

describe('SignaturePad', () => {
  it('starts empty, so a required control is invalid', () => {
    expect(setup().control.valid).toBe(false);
  });

  it('sets the control to a PNG data URL after a stroke', () => {
    const { control, pointer } = setup();
    pointer('pointerdown');
    pointer('pointermove');
    pointer('pointerup');
    expect(control.value).toBe(PNG);
    expect(control.valid).toBe(true);
  });

  it('clears back to an empty value', () => {
    const { control, el, pointer } = setup();
    pointer('pointerdown');
    pointer('pointerup');
    el.querySelector<HTMLButtonElement>('button')!.click();
    expect(control.value).toBe('');
  });
});
