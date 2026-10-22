import { api } from './api';
import type { Vulnerability } from './scans';

export interface FlatVuln extends Vulnerability {
  id: string;
  scan_id: number;
  target: string;
  status: 'pending' | 'fixed' | 'fixing' | 'ignored';
  discovered_at: string;
}

export const vulnsApi = {
  list: async (): Promise<FlatVuln[]> => {
    const { data } = await api.get<FlatVuln[]>('/api/vulnerabilities');
    return data;
  },
  get: async (id: string): Promise<FlatVuln> => {
    const { data } = await api.get<FlatVuln>(`/api/vulnerabilities/${id}`);
    return data;
  },
  fix: async (id: string): Promise<void> => {
    await api.post(`/api/vulnerabilities/${id}/fix`);
  },
};