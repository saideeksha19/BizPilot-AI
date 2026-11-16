import { ApiErrorBody } from '../types/api';

export function getApiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_BASE_URL;
  if (typeof configured === 'string' && configured.trim().length > 0) {
    return configured.trim().replace(/\/+$/, '');
  }
  if (import.meta.env.DEV) {
    return 'http://localhost:8000/api/v1';
  }
  return '/api/v1';
}

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(message: string, status: number, code = 'api_error', details?: unknown) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const SESSION_TOKEN_KEY = 'bizpilot_auth_token_v1';

function readStoredSessionToken(): string | null {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      return window.sessionStorage.getItem(SESSION_TOKEN_KEY);
    }
  } catch {
    // Ignore storage access errors in restricted contexts
  }
  return null;
}

let inMemoryAccessToken: string | null = readStoredSessionToken();

export function setAuthToken(token: string | null): void {
  inMemoryAccessToken = token;
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      if (token) {
        window.sessionStorage.setItem(SESSION_TOKEN_KEY, token);
      } else {
        window.sessionStorage.removeItem(SESSION_TOKEN_KEY);
      }
    }
  } catch {
    // Ignore storage quota/security errors
  }
}

export function getAuthToken(): string | null {
  return inMemoryAccessToken;
}

export function clearAuthToken(): void {
  setAuthToken(null);
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  token?: string | null;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, token, headers: customHeaders, ...rest } = options;
  const activeToken = token !== undefined ? token : inMemoryAccessToken;

  const headers = new Headers(customHeaders);
  if (body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (activeToken) {
    headers.set('Authorization', `Bearer ${activeToken}`);
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const response = await fetch(`${getApiBaseUrl()}${normalizedPath}`, {
    ...rest,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const contentType = response.headers.get('content-type') ?? '';
  const isJson = contentType.includes('application/json');
  const parsed = isJson ? await response.json() : null;

  if (!response.ok) {
    const errorBody = (parsed ?? {}) as ApiErrorBody;
    const message =
      errorBody.error?.message ||
      errorBody.detail ||
      `Request failed with status ${response.status}`;
    const code = errorBody.error?.code || 'http_error';
    throw new ApiClientError(message, response.status, code, errorBody.error?.details);
  }

  return parsed as T;
}
