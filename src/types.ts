export interface Tenant {
  id: number;
  name: string;
}

export interface Sector {
  id: number;
  tenant_id: number;
  name: string;
}

export interface User {
  id: number;
  tenant_id: number;
  sector_id: number;
  name: string;
  email: string;
  role: 'admin' | 'user';
  theme: 'light' | 'dark';
  sector_name?: string;
  tenant_name?: string;
}

export interface Status {
  id: number;
  tenant_id: number;
  name: string;
  sequence: number;
}

export interface Ticket {
  id: number;
  tenant_id: number;
  title: string;
  description: string;
  solicitor_id: number;
  executor_id: number | null;
  solicitor_sector_id: number;
  executor_sector_id: number | null;
  status_id: number;
  created_at: string;
  solicitor_name: string;
  executor_name: string | null;
  solicitor_sector_name: string;
  executor_sector_name: string | null;
  status_name: string;
  status_sequence: number;
  attachments?: string[];
}

export interface Comment {
  id: number;
  ticket_id: number;
  user_id: number;
  content: string;
  type: 'user' | 'system';
  created_at: string;
  user_name: string;
  attachments?: string[];
}

export interface Notification {
  id: number;
  user_id: number;
  content: string;
  is_read: number;
  is_persistent: number;
  created_at: string;
}
