import { api } from './client';

export type ProxyTokenStatus =
  | { success: true; enabled: true; token: string; warning?: string }
  | { success: true; enabled: false };

export const proxyTokenApi = {
  get: async (signal?: AbortSignal): Promise<ProxyTokenStatus> =>
    (await api.get<ProxyTokenStatus>('/settings/proxy-token', { signal })).data,
  regenerate: async (): Promise<ProxyTokenStatus> =>
    (await api.post<ProxyTokenStatus>('/settings/proxy-token/regenerate')).data,
};
