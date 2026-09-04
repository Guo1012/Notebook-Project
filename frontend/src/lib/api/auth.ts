import { apiFetch } from './client';

export interface CurrentUser { id: string; username: string; displayName: string }

export async function login(username: string, password: string): Promise<CurrentUser> {
  const response = await apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
  return response.json();
}

export async function getCurrentUser(): Promise<CurrentUser> {
  return (await apiFetch('/api/auth/me')).json();
}

export async function logout(): Promise<void> {
  await apiFetch('/api/auth/logout', { method: 'POST' });
}
