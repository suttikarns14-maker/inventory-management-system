export type Role = 'ADMIN' | 'STAFF' | 'USER';

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'ผู้ดูแลระบบ',
  STAFF: 'เจ้าหน้าที่คลัง',
  USER: 'ผู้เบิก',
};

/** 3-50 chars: letters, digits, dot, underscore, hyphen. Unique, case-insensitive. */
export const USERNAME_PATTERN = /^[A-Za-z0-9._-]{3,50}$/;

export interface User {
  id: string;
  username: string;
  fullName: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserInput {
  username: string;
  fullName: string;
  role: Role;
  password: string;
}

export interface UpdateUserInput {
  fullName: string;
  role: Role;
  isActive: boolean;
}
