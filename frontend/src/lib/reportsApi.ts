import { api } from './api';

export interface ApiReport {
  id: number;
  name: string;
  type: string;
  format: 'PDF' | 'CSV';
  date: string;
  size: string;
  url?: string;
}

export interface ReportsListResponse {
  items: ApiReport[];
  total: number;
  counts: { pdf: number; csv: number };
}

export const reportsApi = {
  list: async (): Promise<ReportsListResponse> => {
    const { data } = await api.get<ReportsListResponse>('/api/reports');
    return data;
  },
};