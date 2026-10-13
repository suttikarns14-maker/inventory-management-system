import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { ApiSuccess } from '../models/api';
import {
  InitialImportCommit,
  InitialImportPreview,
  InitialImportReport,
  ReceiptImportPreview,
} from '../models/import';
import { TrackingType } from '../models/material';
import { API, unwrap } from '../utils/http';

/** The file goes as the raw request body (the API reads it with express.raw). */
const asFile = { headers: new HttpHeaders({ 'Content-Type': 'application/octet-stream' }) };

/** Excel import, ADMIN only (spec v2.2 §5). */
@Injectable({ providedIn: 'root' })
export class ImportService {
  private http = inject(HttpClient);

  previewInitial(file: File) {
    return this.http
      .post<ApiSuccess<InitialImportPreview>>(`${API}/import/initial/preview`, file, asFile)
      .pipe(unwrap());
  }

  commitInitial(input: InitialImportCommit) {
    return this.http
      .post<ApiSuccess<InitialImportReport>>(`${API}/import/initial/commit`, input)
      .pipe(unwrap());
  }

  previewReceipt(file: File) {
    return this.http
      .post<ApiSuccess<ReceiptImportPreview>>(`${API}/import/receipt/preview`, file, asFile)
      .pipe(unwrap());
  }

  commitReceipt(importId: string, tracking: Record<string, TrackingType>) {
    return this.http
      .post<ApiSuccess<{ transactions: { id: string; referenceNo: string }[] }>>(
        `${API}/import/receipt/commit`,
        { importId, tracking },
      )
      .pipe(unwrap());
  }

  /** Downloads the receipt template (.xlsx). */
  downloadTemplate(): void {
    this.http.get(`${API}/import/receipt/template`, { responseType: 'blob' }).subscribe((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'receipt-template.xlsx';
      a.click();
      URL.revokeObjectURL(a.href);
    });
  }
}
