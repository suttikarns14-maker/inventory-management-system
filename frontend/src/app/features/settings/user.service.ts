import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { ApiSuccess } from '../../shared/models/api';
import { CreateUserInput, Role, UpdateUserInput, User } from '../../shared/models/user';
import { API, toParams, unwrap, unwrapPage } from '../../shared/utils/http';

@Injectable({ providedIn: 'root' })
export class UserService {
  private http = inject(HttpClient);

  list(query: { search?: string; role?: Role; page?: number; limit?: number }) {
    return this.http
      .get<ApiSuccess<User[]>>(`${API}/users`, { params: toParams(query) })
      .pipe(unwrapPage());
  }

  create(input: CreateUserInput) {
    return this.http.post<ApiSuccess<User>>(`${API}/users`, input).pipe(unwrap());
  }

  update(id: string, input: UpdateUserInput) {
    return this.http.put<ApiSuccess<User>>(`${API}/users/${id}`, input).pipe(unwrap());
  }

  resetPassword(id: string, password: string) {
    return this.http.put<ApiSuccess<null>>(`${API}/users/${id}/password`, { password });
  }
}
