import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { ReasonDialog, ReasonDialogData } from '../../shared/components/reason-dialog';
import { MaterialUnit, UNIT_STATUS_LABELS } from '../../shared/models/unit';
import { Notify } from '../../shared/services/notify';
import { UnitService } from './unit.service';

/** Serial numbers with where each one is; ADMIN can correct a serial (spec v2.2 §3). */
@Component({
  selector: 'app-unit-table',
  imports: [DatePipe, RouterLink, MatButtonModule, MatIconModule, MatTooltipModule],
  template: `
    <div class="table-wrap">
      <table class="units">
        <thead>
          <tr>
            <th>S/N</th>
            @if (showMaterial()) {
              <th>วัสดุ</th>
            }
            <th>สถานะ</th>
            <th>ที่เก็บ / เบิกให้</th>
            <th>ความเคลื่อนไหวล่าสุด</th>
            @if (canEdit()) {
              <th></th>
            }
          </tr>
        </thead>
        <tbody>
          @for (u of units(); track u.id) {
            <tr>
              <td class="serial">
                <span [class.temp-sn]="u.isTempSerial">{{ u.serialNumber }}</span>
                @if (u.isTempSerial) {
                  <div><span class="badge badge-warn">S/N ชั่วคราว</span></div>
                }
              </td>
              @if (showMaterial()) {
                <td>
                  <a class="name-link" [routerLink]="['/materials', u.material.id]">{{ u.material.name }}</a>
                  <div class="muted">{{ u.material.code }}</div>
                </td>
              }
              <td>
                <span [class]="statusClass[u.status]">{{ statusLabels[u.status] }}</span>
              </td>
              <td>
                @if (u.status === 'ISSUED' && u.lastMovement) {
                  {{ u.lastMovement.requesterName }}
                  <div class="muted">{{ u.lastMovement.usingDepartment?.name ?? '' }}</div>
                  @if (u.lastMovement.remark) {
                    <div class="muted">หมายเหตุ: {{ u.lastMovement.remark }}</div>
                  }
                } @else {
                  {{ u.storageLocation?.name ?? '-' }}
                }
              </td>
              <td class="nowrap">
                @if (u.lastMovement; as mv) {
                  {{ mv.referenceNo }}
                  <div class="muted">{{ mv.createdAt | date: 'd MMM y' }}</div>
                }
              </td>
              @if (canEdit()) {
                <td>
                  <button mat-icon-button (click)="edit(u)" matTooltip="แก้ S/N" aria-label="แก้ S/N">
                    <mat-icon>edit</mat-icon>
                  </button>
                </td>
              }
            </tr>
          } @empty {
            <tr>
              <td class="empty" colspan="6">{{ emptyText() }}</td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styles: `
    .units {
      border-collapse: collapse;
      th, td {
        padding: 8px;
        text-align: left;
        vertical-align: top;
        border-bottom: 1px solid var(--mat-sys-outline-variant);
      }
      th {
        font: var(--mat-sys-label-large);
        color: var(--mat-sys-on-surface-variant);
      }
    }
    .serial {
      font-family: ui-monospace, monospace;
      word-break: break-all;
    }
    .nowrap {
      white-space: nowrap;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UnitTable {
  readonly units = input.required<MaterialUnit[]>();
  readonly showMaterial = input(false);
  readonly canEdit = input(false);
  readonly emptyText = input('ไม่พบ S/N');
  /** Emits after a serial was changed, so the page can reload. */
  readonly changed = output<void>();

  private dialog = inject(MatDialog);
  private unitService = inject(UnitService);
  private notify = inject(Notify);

  protected readonly statusLabels = UNIT_STATUS_LABELS;
  protected readonly statusClass = {
    IN_STOCK: 'badge badge-ok',
    ISSUED: 'badge badge-neutral',
    VOID: 'badge badge-danger',
  } as const;

  protected edit(unit: MaterialUnit): void {
    const data: ReasonDialogData = {
      title: 'แก้ Serial Number',
      message: `${unit.material.name} · S/N เดิม: ${unit.serialNumber}`,
      label: 'S/N ใหม่',
      confirmText: 'บันทึก',
    };
    this.dialog
      .open<ReasonDialog, ReasonDialogData, string>(ReasonDialog, { data, width: '440px' })
      .afterClosed()
      .subscribe((serialNumber) => {
        if (!serialNumber) return;
        this.unitService.updateSerial(unit.id, serialNumber).subscribe({
          next: () => {
            this.notify.success(`แก้ S/N เป็น ${serialNumber} แล้ว`);
            this.changed.emit();
          },
          error: (err: unknown) => this.notify.error(err),
        });
      });
  }
}
