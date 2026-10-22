import { api } from './api';

export interface ApiVulnerability {
  id: number;
  scan_id: number;
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  url?: string;
  description: string;
  evidence?: string;
  remediation?: string;
  created_at?: string;
}

export interface VulnsListResponse {
  items: ApiVulnerability[];
  total: number;
  page: number;
  limit: number;
}

export const vulnsApi = {
  list: async (): Promise<VulnsListResponse> => {
    const { data } = await api.get<VulnsListResponse>('/api/vulnerabilities');
    return data;
  },
};