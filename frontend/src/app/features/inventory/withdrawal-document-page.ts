import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { WithdrawalDocument } from '../../shared/models/request';
import { apiError } from '../../shared/utils/api-error';
import { RequestService } from './request.service';

/**
 * Printable withdrawal form (D17). Outside the app shell so it prints clean; the browser's
 * print dialog also saves it as PDF. Old withdrawals without a request get blank lines to sign by hand.
 */
@Component({
  selector: 'app-withdrawal-document-page',
  imports: [DatePipe, RouterLink, MatButtonModule, MatIconModule],
  templateUrl: './withdrawal-document-page.html',
  styleUrl: './withdrawal-document-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WithdrawalDocumentPage implements OnInit {
  private requests = inject(RequestService);

  readonly id = input.required<string>();
  protected readonly doc = signal<WithdrawalDocument | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly isWithdrawal = computed(() => {
    const t = this.doc()?.transaction;
    return !!t && t.type === 'OUT' && !t.reversalOf;
  });

  ngOnInit(): void {
    this.requests.document(this.id()).subscribe({
      next: (d) => this.doc.set(d),
      error: (err: unknown) => this.error.set(apiError(err)?.message ?? 'โหลดใบเบิกไม่สำเร็จ'),
    });
  }

  protected serials(units: { serialNumber: string }[]): string {
    return units.map((u) => u.serialNumber).join(', ');
  }

  protected materialName(id: string): string {
    return this.doc()?.transaction.items.find((i) => i.materialId === id)?.material.name ?? '';
  }

  protected print(): void {
    window.print();
  }
}
