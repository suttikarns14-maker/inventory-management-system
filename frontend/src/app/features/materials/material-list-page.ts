import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { ActivatedRoute, ParamMap, Router, RouterLink } from '@angular/router';
import { catchError, debounceTime, distinctUntilChanged, map, of, switchMap, tap } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { Page } from '../../shared/models/api';
import { Material, MaterialQuery, MaterialSortBy, MaterialStatus } from '../../shared/models/material';
import { CategoryService } from '../../shared/services/category.service';
import { Notify } from '../../shared/services/notify';
import { StockBadge } from '../../shared/components/stock-badge';
import { MaterialService } from './material.service';

const SORTABLE: MaterialSortBy[] = ['code', 'name', 'currentQuantity', 'updatedAt'];

function parseQuery(p: ParamMap): MaterialQuery {
  const sortBy = p.get('sortBy') as MaterialSortBy | null;
  return {
    search: p.get('search') ?? undefined,
    categoryId: p.get('categoryId') ?? undefined,
    status: (p.get('status') as MaterialStatus | null) ?? undefined,
    lowStock: p.get('lowStock') === 'true' || undefined,
    sortBy: sortBy && SORTABLE.includes(sortBy) ? sortBy : 'code',
    sortOrder: p.get('sortOrder') === 'desc' ? 'desc' : 'asc',
    page: Number(p.get('page')) || 1,
    limit: Number(p.get('limit')) || 20,
  };
}

@Component({
  selector: 'app-material-list-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    StockBadge,
  ],
  templateUrl: './material-list-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MaterialListPage {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private materials = inject(MaterialService);
  private notify = inject(Notify);
  private auth = inject(AuthService);

  protected readonly canCreate = this.auth.hasRole('ADMIN', 'STAFF');
  protected readonly canEdit = this.auth.hasRole('ADMIN');
  protected readonly categories = toSignal(inject(CategoryService).list(), { initialValue: [] });
  protected readonly query = toSignal(this.route.queryParamMap.pipe(map(parseQuery)), {
    requireSync: true,
  });
  protected readonly loading = signal(false);
  protected readonly result = toSignal(
    this.route.queryParamMap.pipe(
      map(parseQuery),
      tap(() => this.loading.set(true)),
      switchMap((q) =>
        this.materials.list(q).pipe(
          catchError((err: unknown) => {
            this.notify.error(err);
            return of<Page<Material> | null>(null);
          }),
        ),
      ),
      tap(() => this.loading.set(false)),
    ),
    { initialValue: null },
  );
  protected readonly columns = computed(() => [
    'code',
    'name',
    'category',
    'currentQuantity',
    'minStock',
    'location',
    'status',
    ...(this.canEdit ? ['actions'] : []),
  ]);

  protected readonly search = new FormControl(this.query().search ?? '', { nonNullable: true });

  constructor() {
    this.search.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((search) => this.update({ search: search.trim() || undefined }));
  }

  /** Every filter change goes through the URL, which triggers the reload above. */
  protected update(changes: Partial<MaterialQuery>, resetPage = true): void {
    const next = { ...this.query(), ...changes, ...(resetPage ? { page: 1 } : {}) };
    this.router.navigate([], {
      queryParams: {
        search: next.search || null,
        categoryId: next.categoryId || null,
        status: next.status || null,
        lowStock: next.lowStock ? 'true' : null,
        sortBy: next.sortBy === 'code' ? null : next.sortBy,
        sortOrder: next.sortOrder === 'asc' ? null : next.sortOrder,
        page: next.page === 1 ? null : next.page,
        limit: next.limit === 20 ? null : next.limit,
      },
      replaceUrl: true,
    });
  }

  protected onSort(sort: Sort): void {
    this.update({
      sortBy: sort.direction ? (sort.active as MaterialSortBy) : 'code',
      sortOrder: sort.direction || 'asc',
    });
  }

  protected onPage(e: PageEvent): void {
    this.update({ page: e.pageIndex + 1, limit: e.pageSize }, e.pageSize !== this.query().limit);
  }

  protected clearFilters(): void {
    this.search.setValue('', { emitEvent: false });
    this.router.navigate([], { queryParams: {}, replaceUrl: true });
  }
}
