import type {
  AuthResponse,
  LoginInput,
  RegisterInput,
  UpdateProfileInput,
  User,
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

  me: () => api.get<User>('/v1/users/me'),

  updateProfile: (input: UpdateProfileInput) => api.patch<User>('/v1/users/me', input),
};
