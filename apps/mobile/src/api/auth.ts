import type {
  AuthResponse,
  LoginInput,
  RegisterInput,
  UpdateProfileInput,
  User,
  ForgotPasswordInput,
  ResetPasswordInput,
} from '@app/shared';
import { api } from './client';

export const authApi = {
  register: (input: RegisterInput) =>
    api.post<AuthResponse>('/v1/auth/register', input, { public: true }),

  login: (input: LoginInput) => api.post<AuthResponse>('/v1/auth/login', input, { public: true }),

  refresh: (refreshToken: string) =>
    api.post<AuthResponse>('/v1/auth/refresh', { refreshToken }, { public: true }),

  logout: (refreshToken: string) =>
    api.post<void>('/v1/auth/logout', { refreshToken }, { public: true }),

  /** Always resolves, whether or not that address has an account. */
  forgotPassword: (input: ForgotPasswordInput) =>
    api.post<{ message: string }>('/v1/auth/forgot-password', input, { public: true }),

  resetPassword: (input: ResetPasswordInput) =>
    api.post<void>('/v1/auth/reset-password', input, { public: true }),

  me: () => api.get<User>('/v1/users/me'),

  updateProfile: (input: UpdateProfileInput) => api.patch<User>('/v1/users/me', input),
};
