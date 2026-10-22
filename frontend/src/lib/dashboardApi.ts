import { api } from './api';

export interface DashboardStats {
  threatsBlocked: number;
  securityScore: number;
  activeScans: number;
  criticalVulns: number;
  totalScans: number;
  completedScans: number;
  failedScans: number;
  findings: { severity: string; count: number }[];
  recentEvents: { id: string; type: string; message: string; timestamp: string }[];
  health: {
    cpu: number;
    ram: number;
    disk: number;
    network: number;
    region: string;
    version: string;
    uptime_days: number;
    last_backup: string;
  };
}

export const dashboardApi = {
  stats: async (): Promise<DashboardStats> => {
    const { data } = await api.get<DashboardStats>('/api/dashboard/stats');
    return data;
  },
};