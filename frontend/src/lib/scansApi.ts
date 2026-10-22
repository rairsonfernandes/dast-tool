import { api } from './api';

export interface ApiScan {
  id: number;
  url: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result: any;
  created_at: string;
}

export interface ScansListResponse {
  items: ApiScan[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export const scansApi = {
  list: async (): Promise<ScansListResponse> => {
    const { data } = await api.get<ScansListResponse>('/api/scans');
    return data;
  },
  get: async (id: number): Promise<ApiScan> => {
    const { data } = await api.get<ApiScan>(`/api/scans/${id}`);
    return data;
  },
  create: async (url: string): Promise<ApiScan> => {
    const { data } = await api.post<ApiScan>('/api/scans', { url });
    return data;
  },
  remove: async (id: number): Promise<void> => {
    await api.delete(`/api/scans/${id}`);
  },
};