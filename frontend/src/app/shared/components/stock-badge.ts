import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Stock status: red when currentQuantity <= minStock (spec business rule). */
@Component({
  selector: 'app-stock-badge',
  template: `<span [class]="state().cls">{{ state().label }}</span>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StockBadge {
  readonly currentQuantity = input.required<number>();
  readonly minStock = input.required<number>();

  protected readonly state = computed(() => {
    if (this.currentQuantity() === 0) return { label: 'หมดสต็อก', cls: 'badge badge-danger' };
    if (this.currentQuantity() <= this.minStock()) {
      return { label: 'เตือนสต็อกต่ำ', cls: 'badge badge-danger' };
    }
    return { label: 'ปกติ', cls: 'badge badge-ok' };
  });
}
