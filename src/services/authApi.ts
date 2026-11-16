import {
  ApiAuthLoginPayload,
  ApiAuthRegisterPayload,
  ApiLogoutResponse,
  ApiTokenResponse,
  ApiUser,
} from '../types/api';
import { apiRequest, clearAuthToken, setAuthToken } from './apiClient';

export const authApi = {
  async register(payload: ApiAuthRegisterPayload): Promise<ApiTokenResponse> {
    const response = await apiRequest<ApiTokenResponse>('/auth/register', {
      method: 'POST',
      body: payload,
      token: null,
    });
    setAuthToken(response.access_token);
    return response;
  },

  async login(payload: ApiAuthLoginPayload): Promise<ApiTokenResponse> {
    const response = await apiRequest<ApiTokenResponse>('/auth/login', {
      method: 'POST',
      body: payload,
      token: null,
    });
    setAuthToken(response.access_token);
    return response;
  },

  async getCurrentUser(token?: string): Promise<ApiUser> {
    return apiRequest<ApiUser>('/auth/me', {
      method: 'GET',
      token,
    });
  },

  async logout(token?: string): Promise<ApiLogoutResponse> {
    try {
      return await apiRequest<ApiLogoutResponse>('/auth/logout', {
        method: 'POST',
        token,
      });
    } finally {
      clearAuthToken();
    }
  },

  async logoutAll(token?: string): Promise<ApiLogoutResponse> {
    try {
      return await apiRequest<ApiLogoutResponse>('/auth/logout-all', {
        method: 'POST',
        token,
      });
    } finally {
      clearAuthToken();
    }
  },
};
