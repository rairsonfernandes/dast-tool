import { api } from './api';

export interface Settings {
  security: Record<string, boolean | string>;
  notifications: Record<string, boolean | string>;
  scans: Record<string, boolean | string>;
  appearance: Record<string, string>;
}

export const settingsApi = {
  get: async (): Promise<Settings> => {
    const { data } = await api.get<Settings>('/api/settings');
    return data;
  },
  update: async (payload: Partial<Settings>): Promise<Settings> => {
    const { data } = await api.put<Settings>('/api/settings', payload);
    return data;
  },
  reset: async (): Promise<void> => {
    await api.post('/api/settings/reset');
  },
};