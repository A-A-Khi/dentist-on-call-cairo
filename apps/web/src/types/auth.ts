export type UserRole = "ADMIN" | "DOCTOR";

export interface AuthenticatedUser {
  id: string;
  organization_id: string;
  email: string;
  display_name: string;
  role: UserRole;
  access_token?: string;
}

export interface ApiErrorResponse {
  type?: string;
  title?: string;
  status: number;
  detail: string;
  requestId?: string;
}
