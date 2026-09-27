export type Role = 'ADMIN' | 'STAFF' | 'USER';

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'ผู้ดูแลระบบ',
  STAFF: 'เจ้าหน้าที่คลัง',
  USER: 'ผู้เบิก',
};

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserInput {
  email: string;
  fullName: string;
  role: Role;
  password: string;
}

export interface UpdateUserInput {
  fullName: string;
  role: Role;
  isActive: boolean;
}
