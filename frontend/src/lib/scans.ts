import { api } from "./api";

export interface Vulnerability {
  type: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  url?: string;
  description: string;
  evidence?: string;
  remediation?: string;
}

export interface ScanResult {
  target: string;
  vulnerabilities: Vulnerability[];
  duration_seconds?: number;
  started_at?: string;
  finished_at?: string;
}

export interface Scan {
  id: number;
  url: string;
  status: "pending" | "running" | "completed" | "failed";
  result: ScanResult | null;
  created_at: string;
}

export interface CreateScanPayload {
  url: string;
}

export const scansApi = {
  list: async (): Promise<Scan[]> => {
    const { data } = await api.get<Scan[]>("/api/scans");
    return data;
  },
  get: async (id: number): Promise<Scan> => {
    const { data } = await api.get<Scan>(`/api/scans/${id}`);
    return data;
  },
  create: async (payload: CreateScanPayload): Promise<Scan> => {
    const { data } = await api.post<Scan>("/api/scans", payload);
    return data;
  },
  remove: async (id: number): Promise<void> => {
    await api.delete(`/api/scans/${id}`);
  },
  totals: (scans: Scan[]) => {
    const total = scans.length;
    const completed = scans.filter((s) => s.status === "completed").length;
    const failed = scans.filter((s) => s.status === "failed").length;
    const running = scans.filter((s) => s.status === "running").length;
    const vulnerabilities = scans.reduce(
      (acc, s) => acc + (s.result?.vulnerabilities?.length || 0),
      0
    );
    const critical = scans.reduce(
      (acc, s) =>
        acc +
        (s.result?.vulnerabilities?.filter((v) => v.severity === "critical").length || 0),
      0
    );
    const high = scans.reduce(
      (acc, s) =>
        acc +
        (s.result?.vulnerabilities?.filter((v) => v.severity === "high").length || 0),
      0
    );
    return { total, completed, failed, running, vulnerabilities, critical, high };
  },
};