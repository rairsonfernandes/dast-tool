import { api } from './api';

export interface Report {
  id: string;
  name: string;
  type: string;
  format: 'PDF' | 'CSV';
  date: string;
  size: string;
  pages?: string;
}

export const reportsApi = {
  list: async (format?: 'PDF' | 'CSV'): Promise<Report[]> => {
    const { data } = await api.get<Report[]>('/api/reports', {
      params: format ? { format } : {},
    });
    return data;
  },
  create: async (payload: {
    type: string;
    format: 'PDF' | 'CSV';
    period: string;
  }): Promise<Report> => {
    const { data } = await api.post<Report>('/api/reports', payload);
    return data;
  },
  download: async (id: string): Promise<Blob> => {
    const { data } = await api.get(`/api/reports/${id}/download`, {
      responseType: 'blob',
    });
    return data;
  },
};