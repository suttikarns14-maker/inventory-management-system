import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormArray,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { ErrorStateMatcher } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { RouterLink } from '@angular/router';
import {
  BehaviorSubject,
  catchError,
  debounceTime,
  filter,
  forkJoin,
  map,
  of,
  startWith,
  switchMap,
} from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { Material } from '../../shared/models/material';
import { TRANSACTION_TYPE_LABELS, TransactionType } from '../../shared/models/transaction';
import { Notify } from '../../shared/services/notify';
import { apiError, applyServerErrors } from '../../shared/utils/api-error';
import { MaterialService } from '../materials/material.service';
import { InventoryService } from './inventory.service';

type Line = FormGroup<{
  material: FormControl<Material>;
  quantity: FormControl<number | null>;
  unitPrice: FormControl<number | null>;
}>;

/** Show field errors as soon as the user types, not only after blur (spec: warn immediately). */
const showWhileTyping: ErrorStateMatcher = {
  isErrorState: (control) => !!control && control.invalid && (control.dirty || control.touched),
};

const positiveInteger = (c: AbstractControl): ValidationErrors | null =>
  c.value === null || c.value === '' || (Number.isInteger(c.value) && c.value >= 1)
    ? null
    : { positiveInteger: true };

@Component({
  selector: 'app-transaction-form-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonToggleModule,
    MatAutocompleteModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
  ],
  templateUrl: './transaction-form-page.html',
  styleUrl: './transaction-form-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TransactionFormPage {
  private inventory = inject(InventoryService);
  private materials = inject(MaterialService);
  private notify = inject(Notify);

  /** USER may only withdraw (spec §1). */
  protected readonly canReceive = inject(AuthService).hasRole('ADMIN', 'STAFF');
  protected readonly errorMatcher = showWhileTyping;
  protected readonly saving = signal(false);

  protected readonly form = new FormGroup({
    type: new FormControl<TransactionType>('OUT', { nonNullable: true }),
    note: new FormControl('', { nonNullable: true, validators: Validators.maxLength(500) }),
    items: new FormArray<Line>([]),
  });
  protected readonly items = this.form.controls.items;
  protected readonly type = toSignal(
    this.form.controls.type.valueChanges.pipe(startWith(this.form.controls.type.value)),
    { requireSync: true },
  );
  protected readonly typeLabel = computed(() => TRANSACTION_TYPE_LABELS[this.type()]);

  // ---- material search ----
  protected readonly picker = new FormControl<string | Material>('', { nonNullable: true });
  private readonly search$ = new BehaviorSubject('');
  protected readonly options = toSignal(
    this.search$.pipe(
      switchMap((search) =>
        this.materials.list({ search: search || undefined, status: 'ACTIVE', limit: 10 }).pipe(
          map((page) => page.items),
          catchError(() => of<Material[]>([])),
        ),
      ),
    ),
    { initialValue: [] },
  );
  protected readonly blank = () => '';

  constructor() {
    this.picker.valueChanges
      .pipe(
        filter((v): v is string => typeof v === 'string'),
        debounceTime(300),
        takeUntilDestroyed(),
      )
      .subscribe((v) => this.search$.next(v.trim()));

    // The stock check depends on IN/OUT, so re-run it when the type flips.
    this.form.controls.type.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.items.controls.forEach((line) => line.controls.quantity.updateValueAndValidity()));
  }

  /** OUT only: quantity must not exceed the stock known for that line. */
  private withinStock = (c: AbstractControl): ValidationErrors | null => {
    const line = c.parent as Line | null;
    if (!line || this.form.controls.type.value !== 'OUT' || typeof c.value !== 'number') return null;
    const available = line.controls.material.value.currentQuantity;
    return c.value > available ? { exceedsStock: available } : null;
  };

  protected add(material: Material): void {
    this.picker.setValue('');
    const existing = this.items.controls.findIndex((l) => l.controls.material.value.id === material.id);
    if (existing === -1) {
      this.items.push(
        new FormGroup({
          material: new FormControl(material, { nonNullable: true }),
          quantity: new FormControl<number | null>(null, [
            Validators.required,
            positiveInteger,
            this.withinStock,
          ]),
          unitPrice: new FormControl<number | null>(null, Validators.min(0)),
        }),
      );
    }
    // One line per material (spec §4.4): re-selecting jumps to the existing line.
    setTimeout(() => document.getElementById(`qty-${material.id}`)?.focus());
  }

  protected remove(index: number): void {
    this.items.removeAt(index);
  }

  protected submit(): void {
    if (this.form.invalid || this.items.length === 0) {
      this.form.markAllAsTouched();
      return;
    }
    const { type, note, items } = this.form.getRawValue();
    this.saving.set(true);
    this.inventory
      .create({
        type,
        note: note.trim() || undefined,
        items: items.map((l) => ({
          materialId: l.material.id,
          quantity: l.quantity!,
          ...(type === 'IN' && l.unitPrice !== null ? { unitPrice: l.unitPrice } : {}),
        })),
      })
      .subscribe({
        next: (txn) => {
          this.saving.set(false);
          this.notify.success(`บันทึก${this.typeLabel()}สำเร็จ (${txn.referenceNo})`);
          this.items.clear();
          this.form.controls.note.reset();
          this.search$.next(this.search$.value); // refresh stock shown in the search list
        },
        error: (err: unknown) => {
          this.saving.set(false);
          if (apiError(err)?.code === 'INSUFFICIENT_STOCK') this.refreshStock();
          if (!applyServerErrors(this.form, err)) this.notify.error(err);
        },
      });
  }

  /** Stock changed while the form was open: reload every line and re-check quantities. */
  private refreshStock(): void {
    const lines = this.items.controls;
    if (!lines.length) return;
    forkJoin(lines.map((l) => this.materials.get(l.controls.material.value.id))).subscribe((fresh) =>
      fresh.forEach((m, i) => {
        lines[i].controls.material.setValue(m);
        lines[i].controls.quantity.updateValueAndValidity();
        lines[i].controls.quantity.markAsTouched();
      }),
    );
  }
}
