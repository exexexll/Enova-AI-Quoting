export interface Session {
  id: string;
  client_name?: string;
  client_email?: string;
  client_company?: string;
  client_phone?: string;
  client_address?: string;
  status: string;
  workflow_state: string;
  contract_status?: string;
  product_specs?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Escalation {
  id: number;
  session_id: string;
  client_name?: string;
  item_requested: string;
  source: string;
  quantity_needed?: string;
  similar_items?: string;
  est_low?: number;
  est_high?: number;
  status: string;
  confirmed_price?: number;
  admin_notes?: string;
  created_at: string;
}

export interface Contract {
  id: number;
  session_id: string;
  version: number;
  status: string;
  pdf_path?: string;
  data_json?: string;
  client_name_sig?: string;
  client_comments?: string;
  admin_notes?: string;
  submitted_at?: string;
  accepted_at?: string;
  created_at: string;
  updated_at: string;
}

export interface Ingredient {
  id: number;
  item_name: string;
  supplier?: string;
  location?: string;
  uom?: string;
  sum_cavg: number;
  cost_kg: number;
  price_per_kg?: number;
  on_hand: number;
  source_tab: string;
  needs_manual_price: boolean;
  category?: string;
}

export interface PricingConfig {
  id: number;
  key: string;
  value: string;
  description?: string;
  updated_at: string;
}

export interface ChatMessage {
  id: number;
  session_id: string;
  timestamp: string;
  role: string;
  phase?: string;
  content?: string;
  metadata_json?: string;
}

export interface ClientFile {
  id: number;
  session_id: string;
  filename: string;
  content_type?: string;
  file_path: string;
  created_at: string;
}

export interface DashboardStats {
  totalSessions: number;
  activeSessions: number;
  totalIngredients: number;
  pendingEscalations: number;
  contracts: number;
  submittedContracts: number;
}
