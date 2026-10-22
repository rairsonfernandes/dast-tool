export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
export type ScanStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'PAUSED';

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'ANALYST' | 'VIEWER' | 'SUPER_ADMIN';
  avatar?: string;
  createdAt?: string;
}

export interface Scan {
  id: string;
  target: string;
  profile: string;
  status: ScanStatus;
  score: number | null;
  progress: number;
  startedAt: string;
  completedAt?: string;
  duration?: number;
  vulnerabilities: Vulnerability[];
}

export interface Vulnerability {
  id: string;
  severity: Severity;
  title: string;
  cwe?: string;
  cvss?: number;
  description: string;
  target: string;
  status: 'PENDING' | 'FIXED' | 'FIXING' | 'IGNORED';
  discoveredAt: string;
}

export interface Report {
  id: string;
  name: string;
  type: string;
  format: 'PDF' | 'CSV';
  date: string;
  size: string;
  pages?: string;
  url?: string;
}

export interface DashboardStats {
  threatsBlocked: number;
  securityScore: number;
  activeScans: number;
  criticalVulns: number;
  findings: { severity: Severity; count: number }[];
  recentEvents: { id: string; type: string; message: string; timestamp: string }[];
}