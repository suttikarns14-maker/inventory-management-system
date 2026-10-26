import { ChangeDetectionStrategy, Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { Router, RouterLink } from '@angular/router';
import {
  Material,
  MaterialInput,
  TRACKING_LABELS,
  TrackingType,
} from '../../shared/models/material';
import { active, LookupService } from '../../shared/services/lookup.service';
import { CategoryService } from '../../shared/services/category.service';
import { Notify } from '../../shared/services/notify';
import { applyServerErrors } from '../../shared/utils/api-error';
import { MaterialService } from './material.service';

@Component({
  selector: 'app-material-form-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
  ],
  template: `
    <div class="page-header">
      <a mat-icon-button routerLink="/materials" aria-label="กลับ"><mat-icon>arrow_back</mat-icon></a>
      <h1>{{ id() ? 'แก้ไขวัสดุ' : 'เพิ่มวัสดุ' }}</h1>
    </div>

    <form class="card" [formGroup]="form" (ngSubmit)="save()">
      @if (loading()) {
        <mat-progress-bar mode="indeterminate" />
      }

      <div class="form-grid">
        <mat-form-field>
          <mat-label>รหัสวัสดุ</mat-label>
          <input matInput formControlName="code" placeholder="เช่น OFF-009" />
          @if (form.controls.code.hasError('server')) {
            <mat-error>{{ form.controls.code.getError('server') }}</mat-error>
          } @else {
            <mat-error>กรุณากรอกรหัสวัสดุ</mat-error>
          }
        </mat-form-field>

        <mat-form-field>
          <mat-label>ชื่อวัสดุ</mat-label>
          <input matInput formControlName="name" />
          <mat-error>{{ form.controls.name.getError('server') ?? 'กรุณากรอกชื่อวัสดุ' }}</mat-error>
        </mat-form-field>

        <mat-form-field>
          <mat-label>ยี่ห้อ</mat-label>
          <input matInput formControlName="brand" />
        </mat-form-field>

        <mat-form-field>
          <mat-label>รุ่น</mat-label>
          <input matInput formControlName="model" />
        </mat-form-field>

        <mat-form-field>
          <mat-label>หมวดหมู่</mat-label>
          <mat-select formControlName="categoryId">
            @for (c of categories(); track c.id) {
              <mat-option [value]="c.id">{{ c.name }}</mat-option>
            }
          </mat-select>
          <mat-error>{{ form.controls.categoryId.getError('server') ?? 'กรุณาเลือกหมวดหมู่' }}</mat-error>
        </mat-form-field>

        <mat-form-field>
          <mat-label>หน่วยนับ</mat-label>
          <input matInput formControlName="unit" placeholder="เช่น ชิ้น, กล่อง, รีม" />
          <mat-error>{{ form.controls.unit.getError('server') ?? 'กรุณากรอกหน่วยนับ' }}</mat-error>
        </mat-form-field>

        <mat-form-field>
          <mat-label>จุดสั่งซื้อ (สต็อกขั้นต่ำ)</mat-label>
          <input matInput type="number" min="0" step="1" formControlName="minStock" />
          <mat-hint>เตือนสต็อกต่ำเมื่อคงเหลือน้อยกว่าหรือเท่ากับค่านี้</mat-hint>
          <mat-error>
            {{ form.controls.minStock.getError('server') ?? 'ต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป' }}
          </mat-error>
        </mat-form-field>

        <mat-form-field>
          <mat-label>สถานที่เก็บของ</mat-label>
          <mat-select formControlName="storageLocationId">
            <mat-option [value]="''">ไม่ระบุ</mat-option>
            @for (s of storageLocations(); track s.id) {
              <mat-option [value]="s.id">{{ s.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field>
          <mat-label>วิธีติดตาม</mat-label>
          <mat-select formControlName="trackingType">
            <mat-option value="QUANTITY">{{ trackingLabels.QUANTITY }}</mat-option>
            <mat-option value="SERIAL">{{ trackingLabels.SERIAL }}</mat-option>
          </mat-select>
          <mat-hint>รายชิ้น = เก็บ S/N ของแต่ละชิ้น · เปลี่ยนไม่ได้หลังมีรายการรับ-เบิกแล้ว</mat-hint>
          <mat-error>{{ form.controls.trackingType.getError('server') }}</mat-error>
        </mat-form-field>

        @if (id()) {
          @if (material(); as m) {
            <div class="stock-note span-all muted">
              <mat-icon>info</mat-icon>
              คงเหลือปัจจุบัน {{ m.currentQuantity }} {{ m.unit }} ·
              ยอดคงเหลือเปลี่ยนได้ผ่านการรับเข้าหรือเบิกจ่ายเท่านั้น
            </div>
          }
        } @else {
          <div class="stock-note span-all muted">
            <mat-icon>info</mat-icon>
            วัสดุใหม่เริ่มที่ยอด 0 ให้บันทึกยอดเริ่มต้นผ่านหน้า "รับเข้า"
          </div>
        }
      </div>

      <div class="actions">
        <a mat-button routerLink="/materials">ยกเลิก</a>
        <button mat-flat-button type="submit" [disabled]="saving() || loading()">
          {{ saving() ? 'กำลังบันทึก...' : 'บันทึก' }}
        </button>
      </div>
    </form>
  `,
  styles: `
    .stock-note {
      display: flex;
      align-items: center;
      gap: 8px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MaterialFormPage implements OnInit {
  /** Bound from the `:id` route param; absent on /materials/new. */
  readonly id = input<string>();

  private materials = inject(MaterialService);
  private router = inject(Router);
  private notify = inject(Notify);

  protected readonly categories = toSignal(inject(CategoryService).list(), { initialValue: [] });
  private readonly lookups = toSignal(inject(LookupService).all());
  protected readonly storageLocations = computed(() => active(this.lookups()?.storageLocations));
  protected readonly trackingLabels = TRACKING_LABELS;
  protected readonly material = signal<Material | null>(null);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly form = inject(FormBuilder).nonNullable.group({
    code: ['', [Validators.required, Validators.maxLength(50)]],
    name: ['', [Validators.required, Validators.maxLength(200)]],
    categoryId: ['', Validators.required],
    unit: ['', [Validators.required, Validators.maxLength(30)]],
    minStock: [0, [Validators.required, Validators.min(0), Validators.pattern(/^\d+$/)]],
    brand: [''],
    model: [''],
    storageLocationId: [''],
    trackingType: ['QUANTITY' as TrackingType],
  });

  ngOnInit(): void {
    const id = this.id();
    if (!id) return;
    this.loading.set(true);
    this.materials.get(id).subscribe({
      next: (m) => {
        this.material.set(m);
        this.form.patchValue({
          ...m,
          brand: m.brand ?? '',
          model: m.model ?? '',
          storageLocationId: m.storageLocationId ?? '',
        });
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.notify.error(err);
        this.router.navigate(['/materials']);
      },
    });
  }

  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const id = this.id();
    const input: MaterialInput = {
      code: v.code.trim(),
      name: v.name.trim(),
      categoryId: v.categoryId,
      unit: v.unit.trim(),
      minStock: Number(v.minStock),
      brand: v.brand.trim() || null,
      model: v.model.trim() || null,
      trackingType: v.trackingType,
      storageLocationId: v.storageLocationId || null,
    };
    this.saving.set(true);
    (id ? this.materials.update(id, input) : this.materials.create(input)).subscribe({
      next: (m) => {
        this.notify.success(`บันทึกวัสดุ ${m.code} แล้ว`);
        this.router.navigate(['/materials']);
      },
      error: (err: unknown) => {
        this.saving.set(false);
        if (!applyServerErrors(this.form, err)) this.notify.error(err);
      },
    });
  }
}
