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
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { RouterLink } from '@angular/router';
import { BehaviorSubject, catchError, debounceTime, filter, forkJoin, map, of, startWith, switchMap } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { Department, LookupItem } from '../../shared/models/lookup';
import { Material } from '../../shared/models/material';
import {
  CreateTransactionInput,
  TRANSACTION_TYPE_LABELS,
  TransactionItemInput,
  TransactionType,
} from '../../shared/models/transaction';
import { MaterialUnit } from '../../shared/models/unit';
import { UserOption } from '../../shared/models/user';
import { active, LookupService } from '../../shared/services/lookup.service';
import { Notify } from '../../shared/services/notify';
import { apiError, applyServerErrors } from '../../shared/utils/api-error';
import { MaterialService } from '../materials/material.service';
import { InventoryService } from './inventory.service';
import { ReceiptImportDialog } from './receipt-import-dialog';
import { UnitService } from './unit.service';

type UnitLine = FormGroup<{ unit: FormControl<MaterialUnit>; remark: FormControl<string> }>;

type Line = FormGroup<{
  material: FormControl<Material>;
  /** QUANTITY materials */
  quantity: FormControl<number | null>;
  unitPrice: FormControl<number | null>;
  /** SERIAL + IN: one serial per line (named like the API field so server errors land here) */
  serialNumbers: FormControl<string>;
  /** SERIAL + OUT: chosen units */
  units: FormArray<UnitLine>;
  unitSearch: FormControl<string | MaterialUnit>;
  autoCount: FormControl<number | null>;
}>;

/** Show field errors as soon as the user types, not only after blur (spec: warn immediately). */
const showWhileTyping: ErrorStateMatcher = {
  isErrorState: (control) => !!control && control.invalid && (control.dirty || control.touched),
};

const positiveInteger = (c: AbstractControl): ValidationErrors | null =>
  c.value === null || c.value === '' || (Number.isInteger(c.value) && c.value >= 1)
    ? null
    : { positiveInteger: true };

/** Serials typed or pasted from Excel / a barcode scanner: one per line (commas and tabs work too). */
export const parseSerials = (text: string): string[] =>
  text
    .split(/[\n\r\t,]+/)
    .map((s) => s.trim())
    .filter(Boolean);

/** Thai fiscal year (B.E.) of today: October starts the next one. */
const currentFiscalYear = () => {
  const d = new Date();
  return d.getFullYear() + 543 + (d.getMonth() >= 9 ? 1 : 0);
};

/** An autocomplete value counts only once an option was picked (requireSelection). */
const picked = (c: AbstractControl): ValidationErrors | null =>
  c.value && typeof c.value === 'object' ? null : { required: true };

@Component({
  selector: 'app-transaction-form-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonToggleModule,
    MatAutocompleteModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
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
  private unitService = inject(UnitService);
  private notify = inject(Notify);
  private dialog = inject(MatDialog);
  private auth = inject(AuthService);

  /** USER may only withdraw, always as themselves (spec §1, v2.2 D10). */
  protected readonly isStaff = this.auth.hasRole('ADMIN', 'STAFF');
  protected readonly isAdmin = this.auth.hasRole('ADMIN');
  protected readonly me = this.auth.user;
  protected readonly errorMatcher = showWhileTyping;
  protected readonly saving = signal(false);

  // ---- reference data ----
  private readonly lookups = toSignal(inject(LookupService).all());
  protected readonly mainDepartments = computed(() => active(this.lookups()?.departments).filter((d) => d.kind === 'MAIN'));
  protected readonly allDepartments = computed(() => active(this.lookups()?.departments));
  protected readonly buildings = computed(() => active(this.lookups()?.buildings));
  protected readonly floors = computed(() => this.lookups()?.floors ?? []);
  private readonly userOptions = toSignal(
    this.isStaff ? this.inventory.userOptions().pipe(catchError(() => of<UserOption[]>([]))) : of<UserOption[]>([]),
    { initialValue: [] },
  );

  protected readonly form = new FormGroup({
    type: new FormControl<TransactionType>('OUT', { nonNullable: true }),
    note: new FormControl('', { nonNullable: true, validators: Validators.maxLength(500) }),
    // IN
    fiscalYear: new FormControl<number | null>(currentFiscalYear(), [Validators.min(2500), Validators.max(2700)]),
    projectName: new FormControl('', { nonNullable: true, validators: Validators.maxLength(200) }),
    // OUT
    requester: new FormControl<string | UserOption>('', { nonNullable: true }),
    requestingDepartmentId: new FormControl<string | Department>('', { nonNullable: true }),
    usingDepartmentId: new FormControl<string | Department>('', { nonNullable: true }),
    buildingId: new FormControl('', { nonNullable: true }),
    floor: new FormControl('', { nonNullable: true }),
    purpose: new FormControl('', { nonNullable: true, validators: Validators.maxLength(200) }),
    items: new FormArray<Line>([]),
  });
  protected readonly items = this.form.controls.items;
  protected readonly type = toSignal(this.form.controls.type.valueChanges.pipe(startWith(this.form.controls.type.value)), {
    requireSync: true,
  });
  protected readonly typeLabel = computed(() => TRANSACTION_TYPE_LABELS[this.type()]);

  // Autocomplete filters for the OUT header.
  private textOf = <T>(c: FormControl<string | T>) =>
    toSignal(c.valueChanges.pipe(map((v) => (typeof v === 'string' ? v.trim().toLowerCase() : ''))), { initialValue: '' });
  private readonly requesterText = this.textOf(this.form.controls.requester);
  // requireSelection keeps the control value unchanged while typing, so filter on the raw input text.
  protected readonly requestingText = signal('');
  protected readonly usingText = signal('');
  protected readonly typed = (e: Event) => (e.target as HTMLInputElement).value.trim().toLowerCase();
  protected readonly requesterOptions = computed(() =>
    this.userOptions()
      .filter((u) => `${u.fullName} ${u.username}`.toLowerCase().includes(this.requesterText()))
      .slice(0, 30),
  );
  protected readonly requestingOptions = computed(() => this.filterByName(this.mainDepartments(), this.requestingText()));
  protected readonly usingOptions = computed(() => this.filterByName(this.allDepartments(), this.usingText()));
  protected readonly displayUser = (u: UserOption | string | null) => (u && typeof u === 'object' ? u.fullName : (u ?? ''));
  protected readonly displayName = (d: LookupItem | string | null) => (d && typeof d === 'object' ? d.name : (d ?? ''));

  private filterByName<T extends LookupItem>(rows: T[], text: string): T[] {
    return text ? rows.filter((r) => r.name.toLowerCase().includes(text)) : rows;
  }

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

  // ---- serial picker (SERIAL + OUT); one shared list for whichever line is being edited ----
  private readonly unitQuery$ = new BehaviorSubject<{ line: Line; text: string } | null>(null);
  protected readonly unitOptions = toSignal(
    this.unitQuery$.pipe(
      filter((q): q is { line: Line; text: string } => q !== null),
      debounceTime(250),
      switchMap(({ line, text }) => {
        const taken = new Set(line.controls.units.controls.map((u) => u.controls.unit.value.id));
        return this.unitService
          .forMaterial(line.controls.material.value.id, { status: 'IN_STOCK', search: text || undefined, limit: 30 })
          .pipe(
            map((p) => p.items.filter((u) => !taken.has(u.id))),
            catchError(() => of<MaterialUnit[]>([])),
          );
      }),
    ),
    { initialValue: [] },
  );

  constructor() {
    this.picker.valueChanges
      .pipe(
        filter((v): v is string => typeof v === 'string'),
        debounceTime(300),
        takeUntilDestroyed(),
      )
      .subscribe((v) => this.search$.next(v.trim()));

    // Header fields and per-line checks depend on IN/OUT.
    this.form.controls.type.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.applyTypeRules());
    this.applyTypeRules();
  }

  private applyTypeRules(): void {
    const out = this.form.controls.type.value === 'OUT';
    const c = this.form.controls;
    c.requester.setValidators(out && this.isStaff ? [Validators.required] : []);
    c.requestingDepartmentId.setValidators(out ? [picked] : []);
    c.usingDepartmentId.setValidators(out ? [picked] : []);
    for (const ctrl of [c.requester, c.requestingDepartmentId, c.usingDepartmentId]) ctrl.updateValueAndValidity();
    this.items.controls.forEach((line) => this.applyLineRules(line));
  }

  /** Which inputs a line needs: QUANTITY → quantity; SERIAL + IN → serials; SERIAL + OUT → units. */
  private applyLineRules(line: Line): void {
    const serial = line.controls.material.value.trackingType === 'SERIAL';
    const out = this.form.controls.type.value === 'OUT';
    const { quantity, serialNumbers, units } = line.controls;
    quantity.setValidators(serial ? [] : [Validators.required, positiveInteger, this.withinStock]);
    serialNumbers.setValidators(serial && !out ? [this.serialList] : []);
    units.setValidators(serial && out ? [(a) => ((a as FormArray).length ? null : { required: true })] : []);
    for (const ctrl of [quantity, serialNumbers, units]) ctrl.updateValueAndValidity();
  }

  /** OUT only: quantity must not exceed the stock known for that line. */
  private withinStock = (c: AbstractControl): ValidationErrors | null => {
    const line = c.parent as Line | null;
    if (!line || this.form.controls.type.value !== 'OUT' || typeof c.value !== 'number') return null;
    const available = line.controls.material.value.currentQuantity;
    return c.value > available ? { exceedsStock: available } : null;
  };

  private serialList = (c: AbstractControl): ValidationErrors | null => {
    const serials = parseSerials(c.value as string);
    if (!serials.length) return { required: true };
    const lower = serials.map((s) => s.toLowerCase());
    const dup = serials.find((_, i) => lower.indexOf(lower[i]!) !== i);
    if (dup) return { duplicate: dup };
    const bad = serials.find((s) => /\s/.test(s) || s.length > 100);
    return bad ? { invalid: bad } : null;
  };

  protected serialCount(line: Line): number {
    return parseSerials(line.controls.serialNumbers.value).length;
  }

  // ---- lines ----

  protected add(material: Material): void {
    this.picker.setValue('');
    const existing = this.items.controls.findIndex((l) => l.controls.material.value.id === material.id);
    if (existing === -1) {
      const line: Line = new FormGroup({
        material: new FormControl(material, { nonNullable: true }),
        quantity: new FormControl<number | null>(null),
        unitPrice: new FormControl<number | null>(null, Validators.min(0)),
        serialNumbers: new FormControl('', { nonNullable: true }),
        units: new FormArray<UnitLine>([]),
        unitSearch: new FormControl<string | MaterialUnit>('', { nonNullable: true }),
        autoCount: new FormControl<number | null>(null),
      });
      this.items.push(line);
      this.applyLineRules(line);
    }
    // One line per material (spec §4.4): re-selecting jumps to the existing line.
    setTimeout(() => document.getElementById(`line-${material.id}`)?.focus());
  }

  protected remove(index: number): void {
    this.items.removeAt(index);
  }

  protected searchUnits(line: Line): void {
    const v = line.controls.unitSearch.value;
    this.unitQuery$.next({ line, text: typeof v === 'string' ? v.trim() : '' });
  }

  protected pickUnit(line: Line, unit: MaterialUnit): void {
    line.controls.unitSearch.setValue('');
    if (line.controls.units.controls.some((u) => u.controls.unit.value.id === unit.id)) return;
    line.controls.units.push(
      new FormGroup({
        unit: new FormControl(unit, { nonNullable: true }),
        remark: new FormControl('', { nonNullable: true, validators: Validators.maxLength(200) }),
      }),
    );
    this.searchUnits(line);
  }

  /** Adds the first N units still in stock — quicker than picking 20 serials by hand. */
  protected addFirstUnits(line: Line): void {
    const want = line.controls.autoCount.value ?? 0;
    if (want < 1) return;
    const taken = new Set(line.controls.units.controls.map((u) => u.controls.unit.value.id));
    this.unitService
      .forMaterial(line.controls.material.value.id, { status: 'IN_STOCK', limit: Math.min(want + taken.size, 100) })
      .subscribe({
        next: (p) => {
          const free = p.items.filter((u) => !taken.has(u.id)).slice(0, want);
          free.forEach((u) => this.pickUnit(line, u));
          if (free.length < want) this.notify.error(`มีในคลังให้เลือกได้อีก ${free.length} ชิ้น`);
          line.controls.autoCount.setValue(null);
        },
        error: (err: unknown) => this.notify.error(err),
      });
  }

  protected removeUnit(line: Line, index: number): void {
    line.controls.units.removeAt(index);
  }

  protected readonly displayUnit = () => '';

  protected openImport(): void {
    this.dialog
      .open(ReceiptImportDialog, { width: '960px', maxWidth: '95vw' })
      .afterClosed()
      .subscribe((done) => {
        if (done) this.search$.next(this.search$.value);
      });
  }

  // ---- submit ----

  protected submit(): void {
    if (this.form.invalid || this.items.length === 0) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const out = v.type === 'OUT';
    const id = (x: string | { id: string }) => (typeof x === 'object' ? x.id : null);
    const input: CreateTransactionInput = {
      type: v.type,
      note: v.note.trim() || undefined,
      ...(out
        ? {
            ...(this.isStaff &&
              (typeof v.requester === 'object' ? { requesterId: v.requester.id } : { requesterName: v.requester.trim() })),
            requestingDepartmentId: id(v.requestingDepartmentId),
            usingDepartmentId: id(v.usingDepartmentId),
            buildingId: v.buildingId || null,
            floor: v.floor || null,
            purpose: v.purpose.trim() || null,
          }
        : { fiscalYear: v.fiscalYear, projectName: v.projectName.trim() || null }),
      items: v.items.map((l): TransactionItemInput => {
        const price = !out && l.unitPrice !== null ? { unitPrice: l.unitPrice } : {};
        if (l.material.trackingType === 'QUANTITY') return { materialId: l.material.id, quantity: l.quantity!, ...price };
        return out
          ? { materialId: l.material.id, units: l.units.map((u) => ({ unitId: u.unit.id, remark: u.remark.trim() || null })) }
          : { materialId: l.material.id, serialNumbers: parseSerials(l.serialNumbers), ...price };
      }),
    };
    this.saving.set(true);
    this.inventory.create(input).subscribe({
      next: (txn) => {
        this.saving.set(false);
        this.notify.success(`บันทึก${this.typeLabel()}สำเร็จ (${txn.referenceNo})`);
        this.items.clear();
        this.form.controls.note.reset();
        this.search$.next(this.search$.value); // refresh stock shown in the search list
      },
      error: (err: unknown) => {
        this.saving.set(false);
        const code = apiError(err)?.code;
        if (code === 'INSUFFICIENT_STOCK' || code === 'UNIT_NOT_AVAILABLE') this.refreshStock();
        if (!applyServerErrors(this.form, err)) this.notify.error(err);
      },
    });
  }

  /** Stock changed while the form was open: reload every line and re-check. */
  private refreshStock(): void {
    const lines = this.items.controls;
    if (!lines.length) return;
    forkJoin(lines.map((l) => this.materials.get(l.controls.material.value.id))).subscribe((fresh) =>
      fresh.forEach((m, i) => {
        lines[i]!.controls.material.setValue(m);
        lines[i]!.controls.quantity.updateValueAndValidity();
        lines[i]!.controls.quantity.markAsTouched();
      }),
    );
  }
}
