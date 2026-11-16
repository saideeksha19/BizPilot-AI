export type ApiMembershipRole = 'owner' | 'admin' | 'manager' | 'viewer';

export interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
  detail?: string;
}

export interface ApiUser {
  id: string;
  email: string;
  full_name: string;
  is_active: boolean;
  created_at: string;
}

export interface ApiTokenResponse {
  access_token: string;
  token_type: 'bearer';
  expires_in: number;
  user: ApiUser;
}

export interface ApiLogoutResponse {
  detail: string;
  revoked: boolean;
}

export interface ApiAuthRegisterPayload {
  email: string;
  full_name: string;
  password: string;
}

export interface ApiAuthLoginPayload {
  email: string;
  password: string;
}

export interface ApiBusiness {
  id: string;
  name: string;
  business_type: string;
  industry: string;
  currency: string;
  country: string;
  business_size: string;
  financial_year_start: string;
  dashboard_preference: string;
  timezone: string;
  gst_registered: boolean;
  opening_cash_balance: string;
  monthly_fixed_overhead: string;
  credit_facility_limit: string;
  short_term_loan_balance: string;
  tax_liability_accrued: string;
  is_demo_data: boolean;
  created_at: string;
  updated_at: string;
  current_user_role: ApiMembershipRole;
  permissions: string[];
}

export interface ApiBusinessDetail extends ApiBusiness {
  member_count: number;
}

export interface ApiBusinessCreatePayload {
  name: string;
  business_type: string;
  industry: string;
  currency?: string;
  country?: string;
  business_size?: string;
  financial_year_start?: string;
  dashboard_preference?: string;
  timezone?: string;
  gst_registered?: boolean;
  opening_cash_balance?: string;
  monthly_fixed_overhead?: string;
  credit_facility_limit?: string;
  short_term_loan_balance?: string;
  tax_liability_accrued?: string;
}

export type ApiBusinessUpdatePayload = Partial<ApiBusinessCreatePayload>;

export interface ApiBusinessMember {
  id: string;
  business_id: string;
  user_id: string;
  user_email: string;
  user_full_name: string;
  role: ApiMembershipRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ApiMembershipAddPayload {
  email: string;
  role: ApiMembershipRole;
}

export interface ApiMembershipRoleUpdatePayload {
  role: ApiMembershipRole;
}

export interface ApiMembershipRemoveResponse {
  detail: string;
  membership_id: string;
}

export interface ApiAuditLog {
  id: string;
  business_id: string | null;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

export type ApiDataLabel = 'ACTUAL' | 'ESTIMATED' | 'FORECAST' | 'HYPOTHETICAL';
export type ApiConfidenceLevel = 'high' | 'medium' | 'low' | 'insufficient_data';
export type ApiAlertSeverity = 'critical' | 'warning' | 'advisory';

export interface ApiPaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface ApiFinancialWindow {
  preset: string;
  start: string;
  end: string;
  prev_start: string;
  prev_end: string;
  days: number;
}

export interface ApiFinancialKpis {
  opening_cash_balance: string;
  total_revenue: string;
  prev_revenue: string;
  revenue_change_pct: string | null;
  billed_invoiced_revenue: string;
  invoice_collections: string;
  other_income: string;
  total_expenses: string;
  prev_expenses: string;
  expenses_change_pct: string | null;
  operating_expenses: string;
  non_operating_expenses: string;
  cogs_and_inventory_spend: string;
  gross_profit: string;
  gross_margin_pct: string;
  operating_profit: string;
  net_profit: string;
  prev_net_profit: string;
  net_profit_change_pct: string | null;
  net_margin_pct: string;
  cash_inflows: string;
  cash_outflows: string;
  net_cash_flow: string;
  available_cash: string;
  prev_available_cash: string;
  cash_change_pct: string | null;
  accounts_receivable: string;
  invoice_receivables: string;
  customer_opening_receivables: string;
  overdue_receivables: string;
  open_invoices_count: number;
  overdue_invoices_count: number;
  accounts_payable: string;
  scheduled_expense_payables: string;
  supplier_opening_payables: string;
  tax_liability_accrued: string;
  inventory_valuation: string;
}

export interface ApiSummaryTimeSeriesPoint {
  date: string;
  label: string;
  revenue: string;
  expenses: string;
  profit: string;
  net_cash_flow: string;
  cumulative_cash: string;
  data_label: ApiDataLabel;
}

export interface ApiCategoryBreakdownItem {
  name: string;
  value: string;
  share_pct: string;
}

export interface ApiFinancialSummary {
  business_id: string;
  currency: string;
  data_label: ApiDataLabel;
  as_of_date: string;
  window: ApiFinancialWindow;
  kpis: ApiFinancialKpis;
  time_series: ApiSummaryTimeSeriesPoint[];
  income_breakdown: ApiCategoryBreakdownItem[];
  expense_breakdown: ApiCategoryBreakdownItem[];
  data_completeness: {
    completed_transactions_total: number;
    completed_transactions_in_window: number;
    invoices_count: number;
    inventory_products_count: number;
    has_activity: boolean;
  };
  accounting_assumptions: string[];
}

export interface ApiTwinTimelinePoint {
  period: string;
  label: string;
  data_label: ApiDataLabel;
  cash_balance: string;
  revenue: string;
  expenses: string;
  net_profit: string;
  receivables: string;
  payables: string;
}

export interface ApiScheduledExpenseItem {
  transaction_id: string;
  description: string;
  counterparty: string;
  scheduled_date: string;
  amount: string;
  status: string;
}

export interface ApiFinancialTwin {
  business_id: string;
  currency: string;
  data_label: ApiDataLabel;
  as_of_date: string;
  net_working_position: string;
  quick_ratio: string | null;
  cash_runway_months: string;
  collection_efficiency_pct: string;
  fixed_vs_variable_ratio: {
    fixed_pct: number;
    variable_pct: number;
    monthly_fixed_overhead: string;
    trailing_variable_spend: string;
  };
  assets: {
    available_cash: string;
    accounts_receivable: string;
    overdue_receivables: string;
    inventory_valuation: string;
    total_current_assets: string;
  };
  liabilities: {
    upcoming_payables: string;
    tax_liability_accrued: string;
    short_term_loan_balance: string;
    credit_facility_limit: string;
    total_liabilities: string;
  };
  obligations_timeline: ApiScheduledExpenseItem[];
  timeline: ApiTwinTimelinePoint[];
  change_drivers: {
    title: string;
    impact: string;
    data_label: ApiDataLabel;
    detail: string;
  }[];
  forecast_confidence: ApiConfidenceLevel;
}

export interface ApiForecastHorizon {
  horizon_days: number;
  starting_cash_balance: string;
  expected_cash_balance: string;
  expected_inflows: string;
  expected_outflows: string;
  net_cash_change: string;
  min_projected_cash: string;
  shortage_risk: boolean;
  shortage_dates: string[];
  confidence: ApiConfidenceLevel;
  series: {
    date: string;
    label: string;
    expected_inflows: string;
    expected_outflows: string;
    net_flow: string;
    projected_cash_balance: string;
    data_label: ApiDataLabel;
  }[];
}

export interface ApiCashFlowForecast {
  business_id: string;
  currency: string;
  data_label: ApiDataLabel;
  as_of_date: string;
  generated_at: string;
  overall_confidence: ApiConfidenceLevel;
  observed_payment_delay_days: number | null;
  historical_sample_transactions: number;
  historical_span_days: number;
  data_quality_notes: string[];
  assumptions: string[];
  horizons: Record<'7d' | '30d' | '90d' | string, ApiForecastHorizon>;
  expected_incoming_invoices: {
    invoice_id: string;
    invoice_number: string;
    due_date: string;
    expected_collection_date: string;
    remaining_amount: string;
    status: string;
  }[];
  upcoming_scheduled_expenses: ApiScheduledExpenseItem[];
}

export interface ApiHealthComponent {
  key: string;
  label: string;
  weight: number;
  score: number;
  weighted_contribution: string;
  data_available: boolean;
  underlying_metric: string;
  explanation: string;
}

export interface ApiFinancialHealth {
  business_id: string;
  currency: string;
  data_label: ApiDataLabel;
  as_of_date: string;
  overall_score: number;
  grade: string;
  data_completeness_pct: number;
  runway_months: string;
  net_margin_pct: string;
  components: ApiHealthComponent[];
  missing_data_notes: string[];
}

export interface ApiFinancialAlert {
  id: string;
  business_id: string;
  dedup_key: string;
  alert_type: string;
  category: string;
  severity: ApiAlertSeverity;
  title: string;
  description: string;
  target_route: string;
  impact_amount: string | null;
  supporting_evidence: Record<string, unknown> | null;
  recommended_action: string;
  detected_at: string;
  is_active: boolean;
  is_acknowledged: boolean;
  acknowledged_at: string | null;
  acknowledged_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApiSimulationCreatePayload {
  name: string;
  description?: string | null;
  sales_change_pct: string;
  supplier_price_change_pct: string;
  payment_delay_days: number;
  additional_employees: number;
  avg_monthly_salary: string;
  new_inventory_purchase: string;
  equipment_purchase: string;
  open_new_location: boolean;
  new_location_monthly_rent: string;
  new_location_setup_cost: string;
  save?: boolean;
}

export interface ApiSimulationMonthlyPoint {
  month: string;
  baseline_cash: string;
  simulated_cash: string;
  baseline_profit: string;
  simulated_profit: string;
}

export interface ApiSimulationResult {
  data_label: ApiDataLabel;
  currency: string;
  starting_cash: string;
  upfront_outflow: string;
  baseline_monthly_revenue: string;
  simulated_monthly_revenue: string;
  revenue_impact_monthly: string;
  baseline_monthly_expenses: string;
  simulated_monthly_expenses: string;
  expense_impact_monthly: string;
  baseline_six_month_cash: string;
  simulated_six_month_cash: string;
  baseline_monthly_profit: string;
  simulated_monthly_profit: string;
  profit_delta_monthly: string;
  cash_delta_six_month: string;
  min_simulated_cash: string;
  shortage_months: string[];
  runway_months_baseline: string;
  runway_months_simulated: string;
  risk_level: 'Low' | 'Moderate' | 'High' | 'Critical';
  risk_summary: string;
  monthly_series: ApiSimulationMonthlyPoint[];
  assumptions: string[];
}

export interface ApiSimulationScenario {
  id: string | null;
  business_id: string;
  created_by_user_id: string | null;
  name: string;
  description: string | null;
  sales_change_pct: string;
  supplier_price_change_pct: string;
  payment_delay_days: number;
  additional_employees: number;
  avg_monthly_salary: string;
  new_inventory_purchase: string;
  equipment_purchase: string;
  open_new_location: boolean;
  new_location_monthly_rent: string;
  new_location_setup_cost: string;
  data_label: ApiDataLabel;
  result: ApiSimulationResult;
  saved: boolean;
  created_at: string | null;
  updated_at: string | null;
}

export interface ApiSimulationCompareResponse {
  business_id: string;
  currency: string;
  data_label: ApiDataLabel;
  scenarios: {
    id: string;
    name: string;
    data_label: ApiDataLabel;
    simulated_six_month_cash: string;
    cash_delta_six_month: string;
    simulated_monthly_profit: string;
    profit_delta_monthly: string;
    runway_months_simulated: string;
    risk_level: 'Low' | 'Moderate' | 'High' | 'Critical';
    monthly_series: ApiSimulationMonthlyPoint[];
  }[];
  best_ending_cash_scenario_id: string;
  best_monthly_profit_scenario_id: string;
}

export interface ApiCopilotComputedFact {
  key: string;
  label: string;
  value: string;
  numeric_value: string | null;
  data_label: ApiDataLabel;
  source: string;
}

export interface ApiCopilotRecommendation {
  title: string;
  explanation: string;
  supporting_evidence: string;
  relevant_amount_or_pct: string | null;
  data_label: ApiDataLabel;
  confidence: ApiConfidenceLevel;
  potential_impact: string;
  recommended_next_step: string;
  assumptions_and_limitations: string;
}

export interface ApiCopilotStructuredResponse {
  summary: string;
  ai_interpretation: string;
  confidence: ApiConfidenceLevel;
  primary_data_label: ApiDataLabel;
  insufficient_data: boolean;
  insufficient_data_reason: string | null;
  computed_facts: ApiCopilotComputedFact[];
  recommendations: ApiCopilotRecommendation[];
  hypothetical_notes: string[];
  follow_up_questions: string[];
  assumptions_and_limitations: string[];
  generation_mode: 'gemini';
  model_used: string;
  context_as_of_date: string;
  window_preset: string;
  safety_notice: string;
}

export interface ApiCopilotMessage {
  id: string;
  conversation_id: string;
  business_id: string;
  role: 'user' | 'assistant';
  content: string;
  structured_payload: ApiCopilotStructuredResponse | null;
  created_at: string;
}

export interface ApiCopilotConversationSummary {
  id: string;
  business_id: string;
  user_id: string;
  title: string;
  message_count: number;
  last_message_at: string;
  created_at: string;
  updated_at: string;
}

export interface ApiCopilotConversationDetail extends ApiCopilotConversationSummary {
  messages: ApiCopilotMessage[];
}

export interface ApiCopilotChatRequest {
  question: string;
  conversation_id?: string | null;
  preset?: '7d' | '30d' | '90d';
}

export interface ApiCopilotChatResponse {
  conversation: ApiCopilotConversationSummary;
  user_message: ApiCopilotMessage;
  assistant_message: ApiCopilotMessage;
  structured: ApiCopilotStructuredResponse;
}

export interface ApiCopilotDeleteResponse {
  detail: string;
  conversation_id: string;
  deleted: boolean;
}

export type ApiTransactionType = 'income' | 'expense';
export type ApiTransactionStatus = 'completed' | 'pending' | 'scheduled' | 'void';
export type ApiPaymentMethod = 'upi' | 'bank_transfer' | 'card' | 'cash' | 'auto_debit';
export type ApiInvoiceStatus = 'draft' | 'pending' | 'partial' | 'paid' | 'overdue' | 'void';

export interface ApiCategory {
  id: string;
  business_id: string;
  name: string;
  type: ApiTransactionType;
  is_operating: boolean;
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

export interface ApiTransaction {
  id: string;
  business_id: string;
  category_id: string | null;
  category_name: string | null;
  created_by_user_id: string | null;
  transaction_date: string;
  description: string;
  counterparty: string;
  type: ApiTransactionType;
  amount: string;
  payment_method: ApiPaymentMethod;
  status: ApiTransactionStatus;
  source_type: 'manual' | 'csv_import' | 'invoice_payment' | 'inventory_restock';
  reference_code: string | null;
  notes: string | null;
  is_demo_data: boolean;
  created_at: string;
  updated_at: string;
}

export interface ApiTransactionCreatePayload {
  transaction_date: string;
  description: string;
  counterparty: string;
  type: ApiTransactionType;
  amount: string;
  category_id?: string | null;
  payment_method?: ApiPaymentMethod;
  status?: ApiTransactionStatus;
  reference_code?: string | null;
  notes?: string | null;
}

export interface ApiCustomer {
  id: string;
  business_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  tax_id: string | null;
  billing_address: string | null;
  opening_balance: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApiSupplier {
  id: string;
  business_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  tax_id: string | null;
  address: string | null;
  default_lead_time_days: number;
  opening_payable: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApiInvoiceLineItem {
  id: string;
  business_id: string;
  invoice_id: string;
  description: string;
  quantity: string;
  unit_price: string;
  line_total: string;
}

export interface ApiInvoiceSummary {
  id: string;
  business_id: string;
  customer_id: string;
  customer_name: string;
  invoice_number: string;
  issue_date: string;
  due_date: string;
  tax_rate: string;
  subtotal: string;
  tax_amount: string;
  total_amount: string;
  amount_paid: string;
  outstanding_balance: string;
  is_overdue: boolean;
  status: ApiInvoiceStatus;
  notes: string | null;
  is_demo_data: boolean;
  created_at: string;
  updated_at: string;
}

export interface ApiPayment {
  id: string;
  business_id: string;
  invoice_id: string;
  customer_id: string;
  transaction_id: string | null;
  payment_reference: string;
  idempotency_key: string | null;
  payment_date: string;
  amount: string;
  payment_method: ApiPaymentMethod;
  notes: string | null;
  created_at: string;
  updated_at: string;
  invoice_status: ApiInvoiceStatus | null;
  invoice_remaining_balance: string | null;
}

export interface ApiInvoiceDetail extends ApiInvoiceSummary {
  line_items: ApiInvoiceLineItem[];
  payments: ApiPayment[];
}

export interface ApiInvoiceCreatePayload {
  customer_id: string;
  invoice_number: string;
  issue_date: string;
  due_date: string;
  tax_rate: string;
  status?: 'draft' | 'pending' | 'overdue';
  notes?: string | null;
  line_items: {
    description: string;
    quantity: string;
    unit_price: string;
  }[];
}

export interface ApiPaymentCreatePayload {
  invoice_id: string;
  payment_reference: string;
  payment_date: string;
  amount: string;
  payment_method: ApiPaymentMethod;
  notes?: string | null;
  idempotency_key?: string | null;
}

export interface ApiInventoryProduct {
  id: string;
  business_id: string;
  preferred_supplier_id: string | null;
  preferred_supplier_name: string | null;
  sku: string;
  name: string;
  category: string;
  unit: string;
  current_stock: string;
  reorder_point: string;
  unit_cost: string;
  selling_price: string;
  stock_value: string;
  is_low_stock: boolean;
  last_restocked_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApiInventoryProductCreatePayload {
  sku: string;
  name: string;
  category: string;
  unit?: string;
  preferred_supplier_id?: string | null;
  current_stock: string;
  reorder_point: string;
  unit_cost: string;
  selling_price: string;
}

export interface ApiInventoryRestockPayload {
  quantity: string;
  unit_cost?: string | null;
  movement_date: string;
  supplier_id?: string | null;
  payment_method?: ApiPaymentMethod;
  reference_code?: string | null;
  record_expense?: boolean;
  notes?: string | null;
  idempotency_key?: string | null;
}

export interface ApiStockMovement {
  id: string;
  business_id: string;
  product_id: string;
  supplier_id: string | null;
  transaction_id: string | null;
  movement_type: 'restock' | 'sale' | 'adjustment' | 'return_in' | 'return_out';
  movement_date: string;
  quantity_delta: string;
  unit_cost: string;
  total_cost: string;
  reference_code: string | null;
  idempotency_key: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  resulting_stock: string | null;
}
