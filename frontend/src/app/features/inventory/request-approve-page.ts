import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input, OnInit, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormArray, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { Router, RouterLink } from '@angular/router';
import { BehaviorSubject, catchError, debounceTime, filter, map, of, switchMap } from 'rxjs';
import { SignaturePad } from '../../shared/components/signature-pad';
import { ApproveRequestInput, WithdrawalRequest, WithdrawalRequestItem } from '../../shared/models/request';
import { MaterialUnit } from '../../shared/models/unit';
import { Notify } from '../../shared/services/notify';
import { apiError, applyServerErrors } from '../../shared/utils/api-error';
import { RequestService } from './request.service';
import { UnitService } from './unit.service';

type UnitLine = FormGroup<{ unit: FormControl<MaterialUnit>; remark: FormControl<string> }>;

/** Named like the API fields (items.N.quantity / items.N.units) so server errors land here. */
type Line = FormGroup<{
  item: FormControl<WithdrawalRequestItem>;
  quantity: FormControl<number>;
  units: FormArray<UnitLine>;
  unitSearch: FormControl<string | MaterialUnit>;
}>;

/** SERIAL lines need exactly as many units as the approved quantity. */
const unitsMatch = (g: AbstractControl): ValidationErrors | null => {
  const { item, quantity, units } = (g as Line).controls;
  return item.value.material.trackingType === 'SERIAL' && units.length !== quantity.value
    ? { unitsCount: quantity.value - units.length }
    : null;
};

/** D17: STAFF/ADMIN approve a request, may lower quantities, pick the serials and sign. */
@Component({
  selector: 'app-request-approve-page',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    RouterLink,
    MatAutocompleteModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    SignaturePad,
  ],
  templateUrl: './request-approve-page.html',
  // Line and signature layout shared with the withdrawal form.
  styleUrls: ['./transaction-form-page.scss', './request-approve-page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RequestApprovePage implements OnInit {
  private requests = inject(RequestService);
  private unitService = inject(UnitService);
  private notify = inject(Notify);
  private router = inject(Router);

  readonly id = input.required<string>();
  protected readonly request = signal<WithdrawalRequest | null>(null);
  protected readonly saving = signal(false);
  protected readonly form = new FormGroup({
    items: new FormArray<Line>([]),
    signature: new FormControl('', { nonNullable: true, validators: Validators.required }),
  });
  protected readonly items = this.form.controls.items;

  // ---- serial picker; one shared list for whichever line is being edited ----
  private readonly unitQuery$ = new BehaviorSubject<{ line: Line; text: string } | null>(null);
  protected readonly unitOptions = toSignal(
    this.unitQuery$.pipe(
      filter((q): q is { line: Line; text: string } => q !== null),
      debounceTime(250),
      switchMap(({ line, text }) => {
        const taken = new Set(line.controls.units.controls.map((u) => u.controls.unit.value.id));
        return this.unitService
          .forMaterial(line.controls.item.value.materialId, { status: 'IN_STOCK', search: text || undefined, limit: 30 })
          .pipe(
            map((p) => p.items.filter((u) => !taken.has(u.id))),
            catchError(() => of<MaterialUnit[]>([])),
          );
      }),
    ),
    { initialValue: [] },
  );
  protected readonly displayUnit = () => '';

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.requests.get(this.id()).subscribe({
      next: (r) => {
        if (r.status !== 'PENDING') {
          this.notify.error('คำขอนี้ได้รับการพิจารณาหรือถูกยกเลิกไปแล้ว');
          this.router.navigate(['/inventory/requests']);
          return;
        }
        this.request.set(r);
        this.items.clear();
        for (const item of r.items) {
          this.items.push(
            new FormGroup(
              {
                item: new FormControl(item, { nonNullable: true }),
                // Default: what was asked, but no more than is in stock now.
                quantity: new FormControl(Math.min(item.quantity, item.material.currentQuantity), {
                  nonNullable: true,
                  validators: [Validators.required, Validators.min(0), Validators.max(item.quantity), Validators.pattern(/^\d+$/)],
                }),
                units: new FormArray<UnitLine>([]),
                unitSearch: new FormControl<string | MaterialUnit>('', { nonNullable: true }),
              },
              { validators: unitsMatch },
            ),
          );
        }
      },
      error: (err: unknown) => {
        this.notify.error(err);
        this.router.navigate(['/inventory/requests']);
      },
    });
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

  protected removeUnit(line: Line, index: number): void {
    line.controls.units.removeAt(index);
  }

  /** No serial known: fill the rest of the line with placeholder (-TEMP-SN-) units still in stock. */
  protected fillTempUnits(line: Line): void {
    const want = line.controls.quantity.value - line.controls.units.length;
    if (want < 1) return;
    const taken = new Set(line.controls.units.controls.map((u) => u.controls.unit.value.id));
    this.unitService
      // The API pages at 100; ask for enough to skip the ones already picked.
      .forMaterial(line.controls.item.value.materialId, { status: 'IN_STOCK', tempOnly: true, limit: Math.min(want + taken.size, 100) })
      .subscribe({
        next: (p) => {
          const free = p.items.filter((u) => !taken.has(u.id)).slice(0, want);
          free.forEach((u) => this.pickUnit(line, u));
          if (free.length < want) this.notify.error(`S/N ชั่วคราวเหลือให้เลือกได้อีก ${free.length} ชิ้น ที่เหลือกรุณาเลือก S/N`);
        },
        error: (err: unknown) => this.notify.error(err),
      });
  }

  protected approve(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    if (!v.items.some((l) => l.quantity > 0)) {
      this.notify.error('ต้องอนุมัติอย่างน้อย 1 รายการ ถ้าไม่ให้เบิกเลยให้กด "ไม่อนุมัติ" ที่หน้ารายการ');
      return;
    }
    const input: ApproveRequestInput = {
      signature: v.signature,
      items: v.items.map((l) => ({
        materialId: l.item.materialId,
        quantity: l.quantity,
        ...(l.item.material.trackingType === 'SERIAL' && {
          units: l.units.map((u) => ({ unitId: u.unit.id, remark: u.remark.trim() || null })),
        }),
      })),
    };
    this.saving.set(true);
    this.requests.approve(this.id(), input).subscribe({
      next: (r) => {
        this.notify.success(`อนุมัติ ${r.requestNo} แล้ว (${r.transaction?.referenceNo})`);
        this.router.navigate(['/inventory/requests']);
      },
      error: (err: unknown) => {
        this.saving.set(false);
        const code = apiError(err)?.code;
        if (code === 'REQUEST_NOT_PENDING') {
          this.notify.error(err);
          this.router.navigate(['/inventory/requests']);
          return;
        }
        if (!applyServerErrors(this.form, err)) this.notify.error(err);
        // Stock moved meanwhile: show the current numbers, keep the signature.
        if (code === 'INSUFFICIENT_STOCK' || code === 'UNIT_NOT_AVAILABLE') {
          this.requests.get(this.id()).subscribe((fresh) =>
            this.items.controls.forEach((line) => {
              const item = fresh.items.find((i) => i.id === line.controls.item.value.id);
              if (item) line.controls.item.setValue(item);
            }),
          );
        }
      },
    });
  }
}
