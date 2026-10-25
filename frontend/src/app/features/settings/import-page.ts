import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatTabsModule } from '@angular/material/tabs';
import { RouterLink } from '@angular/router';
import { InitialImportPreview, InitialImportReport, Mapping, UnmatchedValue } from '../../shared/models/import';
import { TRACKING_LABELS, TrackingType } from '../../shared/models/material';
import { ImportService } from '../../shared/services/import.service';
import { Notify } from '../../shared/services/notify';

type MappingKind = 'requestingDepartments' | 'usingDepartments' | 'buildings';

/** ADMIN: one-time import of IT_Inventory.xlsx with its history (spec v2.2 §5.1-5.3). */
@Component({
  selector: 'app-import-page',
  imports: [RouterLink, MatButtonModule, MatIconModule, MatProgressBarModule, MatSelectModule, MatTabsModule],
  templateUrl: './import-page.html',
  styles: `
    .summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 12px;
      margin: 16px 0;
      div {
        padding: 12px;
        border-radius: 8px;
        background: var(--mat-sys-surface-container);
      }
      strong {
        display: block;
        font: var(--mat-sys-headline-small);
      }
    }
    .simple {
      border-collapse: collapse;
      th, td {
        padding: 4px 8px;
        text-align: left;
        border-bottom: 1px solid var(--mat-sys-outline-variant);
      }
    }
    .map-select {
      min-width: 320px;
    }
    .issue {
      display: flex;
      gap: 6px;
      align-items: center;
    }
    .tab-body {
      padding-top: 16px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImportPage {
  private imports = inject(ImportService);
  private notify = inject(Notify);

  protected readonly labels = TRACKING_LABELS;
  protected readonly fileName = signal('');
  protected readonly busy = signal(false);
  protected readonly preview = signal<InitialImportPreview | null>(null);
  protected readonly report = signal<InitialImportReport | null>(null);
  protected readonly tracking = signal<Record<string, TrackingType>>({});
  protected readonly mapping = signal<Record<MappingKind, Mapping>>({
    requestingDepartments: {},
    usingDepartments: {},
    buildings: {},
  });

  protected readonly blocking = computed(() => this.preview()?.issues.filter((i) => i.blocking) ?? []);
  protected readonly serialCount = computed(() => {
    const p = this.preview();
    return p ? p.materials.filter((m) => (this.tracking()[m.key] ?? m.proposed) === 'SERIAL').length : 0;
  });
  protected readonly unmatchedGroups = computed(() => {
    const p = this.preview();
    if (!p) return [];
    return [
      { kind: 'requestingDepartments' as const, label: 'หน่วยงานที่เบิก', values: p.unmatched.requestingDepartments, options: p.options.allDepartments },
      { kind: 'usingDepartments' as const, label: 'หน่วยงานที่ใช้', values: p.unmatched.usingDepartments, options: p.options.allDepartments },
      { kind: 'buildings' as const, label: 'อาคาร', values: p.unmatched.buildings, options: p.options.buildings },
    ];
  });
  protected readonly mappedCount = computed(() =>
    Object.values(this.mapping()).reduce((n, m) => n + Object.values(m).filter(Boolean).length, 0),
  );

  protected choose(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.fileName.set(file.name);
    this.preview.set(null);
    this.report.set(null);
    this.tracking.set({});
    this.mapping.set({ requestingDepartments: {}, usingDepartments: {}, buildings: {} });
    this.busy.set(true);
    this.imports.previewInitial(file).subscribe({
      next: (p) => {
        this.preview.set(p);
        this.busy.set(false);
      },
      error: (err: unknown) => {
        this.notify.error(err);
        this.busy.set(false);
      },
    });
  }

  protected setTracking(key: string, value: TrackingType): void {
    this.tracking.update((t) => ({ ...t, [key]: value }));
  }

  protected setMapping(kind: MappingKind, value: UnmatchedValue, target: string | null): void {
    this.mapping.update((m) => ({ ...m, [kind]: { ...m[kind], [value.value]: target } }));
  }

  protected commit(): void {
    const p = this.preview();
    if (!p) return;
    if (!confirm(`นำเข้าวัสดุ ${p.summary.materials} รายการ (${p.summary.rows} ชิ้น) เข้าระบบจริง? ทำได้ครั้งเดียว`)) return;
    this.busy.set(true);
    this.imports.commitInitial({ importId: p.importId, tracking: this.tracking(), mapping: this.mapping() }).subscribe({
      next: (r) => {
        this.report.set(r);
        this.preview.set(null);
        this.busy.set(false);
        this.notify.success('นำเข้าข้อมูลสำเร็จ');
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.preview.set(null); // the server used up this preview; upload again
        this.notify.error(err);
      },
    });
  }
}
