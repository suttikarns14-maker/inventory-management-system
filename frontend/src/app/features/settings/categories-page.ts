import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { Category } from '../../shared/models/material';
import { CategoryService } from '../../shared/services/category.service';
import { Notify } from '../../shared/services/notify';
import { applyServerErrors } from '../../shared/utils/api-error';

@Component({
  selector: 'app-categories-page',
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule],
  template: `
    <div class="page-header"><h1>หมวดหมู่วัสดุ</h1></div>

    <form class="card" [formGroup]="form" (ngSubmit)="save()">
      <h2>{{ editing() ? 'แก้ไขหมวดหมู่ "' + editing()!.name + '"' : 'เพิ่มหมวดหมู่' }}</h2>
      <div class="form-grid">
        <mat-form-field>
          <mat-label>ชื่อหมวดหมู่</mat-label>
          <input matInput formControlName="name" />
          <mat-error>{{ form.controls.name.getError('server') ?? 'กรุณากรอกชื่อหมวดหมู่' }}</mat-error>
        </mat-form-field>
        <mat-form-field>
          <mat-label>คำอธิบาย</mat-label>
          <input matInput formControlName="description" />
        </mat-form-field>
      </div>
      <div class="actions">
        @if (editing()) {
          <button mat-button type="button" (click)="cancel()">ยกเลิก</button>
        }
        <button mat-flat-button type="submit" [disabled]="saving()">
          {{ editing() ? 'บันทึกการแก้ไข' : 'เพิ่มหมวดหมู่' }}
        </button>
      </div>
    </form>

    <section class="card">
      <div class="table-wrap">
        <table class="simple">
          <thead>
            <tr>
              <th>ชื่อหมวดหมู่</th>
              <th>คำอธิบาย</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            @for (c of categories(); track c.id) {
              <tr [class.editing]="editing()?.id === c.id">
                <td>{{ c.name }}</td>
                <td class="muted">{{ c.description ?? '-' }}</td>
                <td class="num">
                  <button mat-icon-button (click)="edit(c)" aria-label="แก้ไข">
                    <mat-icon>edit</mat-icon>
                  </button>
                </td>
              </tr>
            } @empty {
              <tr><td colspan="3" class="empty">ยังไม่มีหมวดหมู่</td></tr>
            }
          </tbody>
        </table>
      </div>
      <p class="muted">หมวดหมู่ที่มีวัสดุอยู่แล้วจะลบไม่ได้ จึงมีแต่การแก้ไข</p>
    </section>
  `,
  styles: `
    .simple {
      border-collapse: collapse;
      th, td {
        padding: 8px;
        text-align: left;
        border-bottom: 1px solid var(--mat-sys-outline-variant);
      }
      tr.editing {
        background: var(--mat-sys-secondary-container);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CategoriesPage {
  private service = inject(CategoryService);
  private notify = inject(Notify);

  protected readonly categories = signal<Category[]>([]);
  protected readonly editing = signal<Category | null>(null);
  protected readonly saving = signal(false);
  protected readonly form = inject(FormBuilder).nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    description: ['', Validators.maxLength(500)],
  });

  constructor() {
    this.load();
  }

  private load(): void {
    this.service.list().subscribe({
      next: (list) => this.categories.set(list),
      error: (err: unknown) => this.notify.error(err),
    });
  }

  protected edit(c: Category): void {
    this.editing.set(c);
    this.form.setValue({ name: c.name, description: c.description ?? '' });
  }

  protected cancel(): void {
    this.editing.set(null);
    this.form.reset();
  }

  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const input = { name: v.name.trim(), description: v.description.trim() || null };
    const editing = this.editing();
    this.saving.set(true);
    (editing ? this.service.update(editing.id, input) : this.service.create(input)).subscribe({
      next: (c) => {
        this.saving.set(false);
        this.notify.success(`บันทึกหมวดหมู่ "${c.name}" แล้ว`);
        this.cancel();
        this.load();
      },
      error: (err: unknown) => {
        this.saving.set(false);
        if (!applyServerErrors(this.form, err)) this.notify.error(err);
      },
    });
  }
}
