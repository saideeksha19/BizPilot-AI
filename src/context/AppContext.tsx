import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  DEMO_BUSINESSES,
  DEMO_INVENTORY,
  DEMO_INVOICES,
  DEMO_NOTIFICATIONS,
  DEMO_RISK_ALERTS,
  DEMO_TEAM,
  DEMO_TRANSACTIONS,
  REFERENCE_TODAY,
} from '../data/mockBusinesses';
import { authApi } from '../services/authApi';
import { clearAuthToken, getAuthToken } from '../services/apiClient';
import { businessApi } from '../services/businessApi';
import { generateStarterSeedForBusiness } from '../services/financialService';
import { ledgerApi } from '../services/ledgerApi';
import {
  ApiBusiness,
  ApiBusinessMember,
  ApiCategory,
  ApiCustomer,
  ApiInventoryProduct,
  ApiInvoiceSummary,
  ApiMembershipRole,
  ApiPaymentMethod,
  ApiSupplier,
  ApiTransaction,
  ApiUser,
} from '../types/api';
import {
  BusinessProfile,
  BusinessSize,
  BusinessType,
  CurrencyCode,
  CustomDateRange,
  DashboardPreference,
  DateRangePreset,
  InventoryItem,
  Invoice,
  InvoiceStatus,
  NotificationItem,
  RiskAlert,
  RouteId,
  TeamMember,
  Transaction,
} from '../types/financial';

const STORAGE_KEY = 'bizpilot_ai_workspace_v1';

interface PersistedWorkspace {
  /** Bumped when the design system changes so the new ivory default applies once. */
  designVersion?: number;
  theme: 'dark' | 'light';
  activeBusinessId: string;
  businesses: BusinessProfile[];
  transactions: Transaction[];
  invoices: Invoice[];
  inventory: InventoryItem[];
  riskAlerts: RiskAlert[];
  teamMembers: TeamMember[];
  notifications: NotificationItem[];
}

interface BackendLedgerCache {
  categories: ApiCategory[];
  customers: ApiCustomer[];
  suppliers: ApiSupplier[];
  transactions: Transaction[];
  invoices: Invoice[];
  inventory: InventoryItem[];
  teamMembers: TeamMember[];
}

const EMPTY_BACKEND_LEDGER: BackendLedgerCache = {
  categories: [],
  customers: [],
  suppliers: [],
  transactions: [],
  invoices: [],
  inventory: [],
  teamMembers: [],
};

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function getInitialWorkspace(): PersistedWorkspace {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PersistedWorkspace;
      if (parsed && Array.isArray(parsed.businesses) && parsed.businesses.length > 0) {
        const demoOnlyBusinesses = parsed.businesses.filter((b) => b.isDemoData !== false);
        if (demoOnlyBusinesses.length > 0) {
          return {
            ...parsed,
            designVersion: 2,
            // Preserve a deliberate choice; otherwise adopt the redesigned ivory default once.
            theme: parsed.designVersion === 2 ? parsed.theme : 'light',
            businesses: demoOnlyBusinesses,
            activeBusinessId: demoOnlyBusinesses.some((b) => b.id === parsed.activeBusinessId)
              ? parsed.activeBusinessId
              : demoOnlyBusinesses[0].id,
          };
        }
      }
    }
  } catch {
    // Fallback to clean demo state
  }
  return {
    designVersion: 2,
    theme: 'light',
    activeBusinessId: DEMO_BUSINESSES[0].id,
    businesses: DEMO_BUSINESSES,
    transactions: DEMO_TRANSACTIONS,
    invoices: DEMO_INVOICES,
    inventory: DEMO_INVENTORY,
    riskAlerts: DEMO_RISK_ALERTS,
    teamMembers: DEMO_TEAM,
    notifications: DEMO_NOTIFICATIONS,
  };
}

function mapPaymentMethodFromApi(method: ApiPaymentMethod): Transaction['paymentMethod'] {
  switch (method) {
    case 'upi':
      return 'UPI';
    case 'card':
      return 'Card';
    case 'cash':
      return 'Cash';
    case 'auto_debit':
      return 'Auto-Debit';
    case 'bank_transfer':
    default:
      return 'Bank Transfer';
  }
}

function mapPaymentMethodToApi(method: Transaction['paymentMethod']): ApiPaymentMethod {
  switch (method) {
    case 'UPI':
      return 'upi';
    case 'Card':
      return 'card';
    case 'Cash':
      return 'cash';
    case 'Auto-Debit':
      return 'auto_debit';
    case 'Bank Transfer':
    default:
      return 'bank_transfer';
  }
}

function mapBusinessTypeFromApi(val: string): BusinessType {
  const valid: BusinessType[] = [
    'Retail',
    'Grocery',
    'Restaurant',
    'Startup',
    'Freelancer',
    'Service Business',
    'Home Business',
    'Other',
  ];
  return valid.includes(val as BusinessType) ? (val as BusinessType) : 'Other';
}

function mapBusinessSizeFromApi(val: string): BusinessSize {
  const valid: BusinessSize[] = [
    'Solo / Micro (1–5)',
    'Small (6–20)',
    'Growing (21–50)',
    'Mid-Size (51–200)',
  ];
  return valid.includes(val as BusinessSize) ? (val as BusinessSize) : 'Small (6–20)';
}

function mapCurrencyFromApi(val: string): CurrencyCode {
  if (val === 'USD' || val === 'EUR' || val === 'GBP' || val === 'INR') return val;
  return 'INR';
}

function mapDashPrefFromApi(val: string): DashboardPreference {
  const valid: DashboardPreference[] = [
    'Executive Balanced',
    'Cash Flow First',
    'Profitability & Margins',
    'Inventory & Operations',
  ];
  return valid.includes(val as DashboardPreference)
    ? (val as DashboardPreference)
    : 'Executive Balanced';
}

function mapTeamRoleFromApi(role: ApiMembershipRole): TeamMember['role'] {
  switch (role) {
    case 'owner':
      return 'Owner';
    case 'admin':
      return 'Finance Manager';
    case 'manager':
      return 'Accountant';
    case 'viewer':
    default:
      return 'Viewer';
  }
}

function mapTeamRoleToApi(role: TeamMember['role']): ApiMembershipRole {
  switch (role) {
    case 'Owner':
      return 'owner';
    case 'Finance Manager':
      return 'admin';
    case 'Accountant':
    case 'Operations':
      return 'manager';
    case 'Viewer':
    default:
      return 'viewer';
  }
}

function mapApiBusiness(b: ApiBusiness): BusinessProfile {
  return {
    id: b.id,
    name: b.name,
    type: mapBusinessTypeFromApi(b.business_type),
    industry: b.industry,
    currency: mapCurrencyFromApi(b.currency),
    country: b.country,
    size: mapBusinessSizeFromApi(b.business_size),
    financialYearStart: b.financial_year_start,
    dashboardPreference: mapDashPrefFromApi(b.dashboard_preference),
    gstRegistered: b.gst_registered,
    openingCashBalance: Number(b.opening_cash_balance) || 0,
    monthlyFixedOverhead: Number(b.monthly_fixed_overhead) || 0,
    creditFacilityLimit: Number(b.credit_facility_limit) || 0,
    shortTermLoanBalance: Number(b.short_term_loan_balance) || 0,
    taxLiabilityAccrued: Number(b.tax_liability_accrued) || 0,
    isDemoData: b.is_demo_data,
    createdAt: b.created_at.slice(0, 10),
  };
}

function mapApiTransaction(tx: ApiTransaction): Transaction {
  return {
    id: tx.id,
    businessId: tx.business_id,
    date: tx.transaction_date,
    description: tx.description,
    counterparty: tx.counterparty,
    category: tx.category_name || 'Uncategorized',
    categoryId: tx.category_id,
    type: tx.type,
    amount: Number(tx.amount) || 0,
    paymentMethod: mapPaymentMethodFromApi(tx.payment_method),
    status: tx.status,
    sourceType: tx.source_type,
    reference: tx.reference_code || tx.id.slice(0, 8).toUpperCase(),
    isDemoData: tx.is_demo_data,
  };
}

function mapApiInvoice(inv: ApiInvoiceSummary, customers: ApiCustomer[]): Invoice {
  const customer = customers.find((c) => c.id === inv.customer_id);
  const effectiveStatus: InvoiceStatus =
    inv.is_overdue && (inv.status === 'pending' || inv.status === 'partial')
      ? 'overdue'
      : inv.status;
  return {
    id: inv.id,
    businessId: inv.business_id,
    customerId: inv.customer_id,
    invoiceNumber: inv.invoice_number,
    customerName: inv.customer_name,
    customerEmail: customer?.email || 'billing@client.example',
    customerPhone: customer?.phone || '+91 98000 00000',
    issueDate: inv.issue_date,
    dueDate: inv.due_date,
    items: [],
    taxRate: Number(inv.tax_rate) || 0,
    subtotal: Number(inv.subtotal) || 0,
    taxAmount: Number(inv.tax_amount) || 0,
    totalAmount: Number(inv.total_amount) || 0,
    amountPaid: Number(inv.amount_paid) || 0,
    outstandingBalance: Number(inv.outstanding_balance) || 0,
    status: effectiveStatus,
    notes: inv.notes || '',
    isDemoData: inv.is_demo_data,
  };
}

function mapApiProduct(p: ApiInventoryProduct, suppliers: ApiSupplier[]): InventoryItem {
  const sup = suppliers.find((s) => s.id === p.preferred_supplier_id);
  return {
    id: p.id,
    businessId: p.business_id,
    sku: p.sku,
    name: p.name,
    category: p.category,
    currentStock: Number(p.current_stock) || 0,
    reorderPoint: Number(p.reorder_point) || 0,
    unit: p.unit,
    unitCost: Number(p.unit_cost) || 0,
    sellingPrice: Number(p.selling_price) || 0,
    supplier: p.preferred_supplier_name || sup?.name || 'Primary Supplier',
    leadTimeDays: sup?.default_lead_time_days ?? 3,
    lastRestocked: p.last_restocked_date || p.created_at.slice(0, 10),
  };
}

function mapApiMember(m: ApiBusinessMember): TeamMember {
  return {
    id: m.id,
    businessId: m.business_id,
    name: m.user_full_name,
    email: m.user_email,
    role: mapTeamRoleFromApi(m.role),
    status: m.is_active ? 'Active' : 'Invited',
    lastActive: m.updated_at.slice(0, 10),
  };
}

export interface ToastMessage {
  id: string;
  text: string;
  tone?: 'info' | 'success' | 'warning';
}

export interface InvoicePaymentInput {
  amount?: number;
  paymentMethod?: Transaction['paymentMethod'];
  paymentReference?: string;
  paymentDate?: string;
  notes?: string;
}

interface AppContextValue {
  theme: 'dark' | 'light';
  toggleTheme: () => void;
  setTheme: (t: 'dark' | 'light') => void;
  activeRoute: RouteId;
  navigate: (route: RouteId) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (v: boolean) => void;
  mobileNavOpen: boolean;
  setMobileNavOpen: (v: boolean) => void;
  authUser: ApiUser | null;
  isAuthenticated: boolean;
  isBackendMode: boolean;
  isSyncingBackend: boolean;
  ledgerVersion: number;
  authModalOpen: boolean;
  setAuthModalOpen: (v: boolean) => void;
  loginWithBackend: (email: string, password: string) => Promise<void>;
  registerWithBackend: (fullName: string, email: string, password: string) => Promise<void>;
  logoutFromBackend: (allDevices?: boolean) => Promise<void>;
  businesses: BusinessProfile[];
  activeBusiness: BusinessProfile;
  setActiveBusinessId: (id: string) => void;
  businessTransactions: Transaction[];
  businessInvoices: Invoice[];
  businessInventory: InventoryItem[];
  businessRisks: RiskAlert[];
  businessTeam: TeamMember[];
  businessNotifications: NotificationItem[];
  datePreset: DateRangePreset;
  setDatePreset: (p: DateRangePreset) => void;
  customDateRange: CustomDateRange;
  setCustomDateRange: (r: CustomDateRange) => void;
  globalSearchQuery: string;
  setGlobalSearchQuery: (q: string) => void;
  onboardingOpen: boolean;
  setOnboardingOpen: (v: boolean) => void;
  addTransactionOpen: boolean;
  setAddTransactionOpen: (v: boolean) => void;
  createInvoiceOpen: boolean;
  setCreateInvoiceOpen: (v: boolean) => void;
  addTransaction: (tx: Omit<Transaction, 'id' | 'businessId' | 'isDemoData'>) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;
  createInvoice: (inv: Omit<Invoice, 'id' | 'businessId' | 'isDemoData'>) => Promise<void>;
  updateInvoiceStatus: (id: string, status: InvoiceStatus) => Promise<void>;
  recordInvoicePayment: (invoiceId: string, opts?: InvoicePaymentInput) => Promise<void>;
  voidInvoice: (invoiceId: string) => Promise<void>;
  acknowledgeRisk: (id: string) => void;
  addInventoryItem: (item: Omit<InventoryItem, 'id' | 'businessId'>) => Promise<void>;
  restockInventoryItem: (id: string, qty: number, unitCost?: number) => Promise<void>;
  onboardBusiness: (
    profile: Omit<
      BusinessProfile,
      | 'id'
      | 'openingCashBalance'
      | 'monthlyFixedOverhead'
      | 'creditFacilityLimit'
      | 'shortTermLoanBalance'
      | 'taxLiabilityAccrued'
      | 'isDemoData'
      | 'createdAt'
    > & { openingCashBalance?: number; monthlyFixedOverhead?: number }
  ) => Promise<void>;
  updateBusinessProfile: (patch: Partial<BusinessProfile>) => Promise<void>;
  inviteTeamMember: (
    member: Omit<TeamMember, 'id' | 'businessId' | 'status' | 'lastActive'>
  ) => Promise<void>;
  updateTeamMemberRole: (id: string, role: TeamMember['role']) => Promise<void>;
  removeTeamMember: (id: string) => Promise<void>;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  resetDemoData: () => void;
  toast: ToastMessage | null;
  showToast: (text: string, tone?: ToastMessage['tone']) => void;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [workspace, setWorkspace] = useState<PersistedWorkspace>(getInitialWorkspace);
  const [authUser, setAuthUser] = useState<ApiUser | null>(null);
  const [backendBusinesses, setBackendBusinesses] = useState<BusinessProfile[]>([]);
  const [backendLedger, setBackendLedger] = useState<BackendLedgerCache>(EMPTY_BACKEND_LEDGER);
  const [isSyncingBackend, setIsSyncingBackend] = useState(false);
  const [ledgerVersion, setLedgerVersion] = useState(0);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  const [activeRoute, setActiveRoute] = useState<RouteId>('overview');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [datePreset, setDatePreset] = useState<DateRangePreset>('30d');
  const [customDateRange, setCustomDateRange] = useState<CustomDateRange>({
    start: '2026-10-01',
    end: REFERENCE_TODAY,
  });
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [addTransactionOpen, setAddTransactionOpen] = useState(false);
  const [createInvoiceOpen, setCreateInvoiceOpen] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  useEffect(() => {
    try {
      const safeDemoOnly: PersistedWorkspace = {
        ...workspace,
        businesses: workspace.businesses.filter((b) => b.isDemoData !== false),
        activeBusinessId: workspace.businesses.some(
          (b) => b.id === workspace.activeBusinessId && b.isDemoData !== false
        )
          ? workspace.activeBusinessId
          : workspace.businesses[0]?.id ?? DEMO_BUSINESSES[0].id,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(safeDemoOnly));
    } catch {
      // Ignore storage quota errors
    }
  }, [workspace]);

  useEffect(() => {
    const root = document.documentElement;
    if (workspace.theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [workspace.theme]);

  const showToast = useCallback((text: string, tone: ToastMessage['tone'] = 'success') => {
    const id = String(Date.now());
    setToast({ id, text, tone });
    setTimeout(() => {
      setToast((prev) => (prev?.id === id ? null : prev));
    }, 3400);
  }, []);

  const hydrateBackendLedger = useCallback(async (businessId: string) => {
    setIsSyncingBackend(true);
    try {
      const [
        categoriesRes,
        txRes,
        customersRes,
        suppliersRes,
        invoicesRes,
        productsRes,
        membersRes,
      ] = await Promise.all([
        ledgerApi.listCategories(businessId),
        ledgerApi.listTransactions(businessId, 1, 100),
        ledgerApi.listCustomers(businessId, 1, 100),
        ledgerApi.listSuppliers(businessId, 1, 100),
        ledgerApi.listInvoices(businessId, 1, 100),
        ledgerApi.listProducts(businessId, 1, 100),
        businessApi.listMembers(businessId).catch(() => [] as ApiBusinessMember[]),
      ]);

      setBackendLedger({
        categories: categoriesRes,
        customers: customersRes.items,
        suppliers: suppliersRes.items,
        transactions: txRes.items.map(mapApiTransaction),
        invoices: invoicesRes.items.map((inv) => mapApiInvoice(inv, customersRes.items)),
        inventory: productsRes.items.map((p) => mapApiProduct(p, suppliersRes.items)),
        teamMembers: membersRes.map(mapApiMember),
      });
    } finally {
      setIsSyncingBackend(false);
    }
  }, []);

  const loadAuthenticatedSession = useCallback(
    async (preferredBusinessId?: string) => {
      const user = await authApi.getCurrentUser();
      const apiBusinesses = await businessApi.listBusinesses();
      const mapped = apiBusinesses.map(mapApiBusiness);

      setAuthUser(user);
      setBackendBusinesses(mapped);

      const targetBiz =
        (preferredBusinessId && mapped.find((b) => b.id === preferredBusinessId)) ||
        mapped.find((b) => !b.isDemoData) ||
        mapped[0];

      if (targetBiz) {
        setWorkspace((prev) => ({ ...prev, activeBusinessId: targetBiz.id }));
        await hydrateBackendLedger(targetBiz.id);
        setLedgerVersion((v) => v + 1);
      } else {
        setBackendLedger(EMPTY_BACKEND_LEDGER);
      }
      return { user, businesses: mapped };
    },
    [hydrateBackendLedger]
  );

  // Restore session silently on mount if token exists in sessionStorage
  useEffect(() => {
    const token = getAuthToken();
    if (!token) return;

    loadAuthenticatedSession().catch(() => {
      clearAuthToken();
      setAuthUser(null);
      setBackendBusinesses([]);
      setBackendLedger(EMPTY_BACKEND_LEDGER);
    });
  }, [loadAuthenticatedSession]);

  const businesses = useMemo(() => {
    if (!authUser || backendBusinesses.length === 0) {
      return workspace.businesses;
    }
    const existingIds = new Set(backendBusinesses.map((b) => b.id));
    const demoFallback = workspace.businesses.filter((b) => !existingIds.has(b.id));
    return [...backendBusinesses, ...demoFallback];
  }, [authUser, backendBusinesses, workspace.businesses]);

  const activeBusiness = useMemo(() => {
    return (
      businesses.find((b) => b.id === workspace.activeBusinessId) ??
      businesses[0]
    );
  }, [businesses, workspace.activeBusinessId]);

  const isAuthenticated = Boolean(authUser);
  const isBackendMode = Boolean(authUser) && !activeBusiness.isDemoData;

  const businessTransactions = useMemo(() => {
    if (isBackendMode) {
      return [...backendLedger.transactions].sort((a, b) => b.date.localeCompare(a.date));
    }
    return workspace.transactions
      .filter((t) => t.businessId === activeBusiness.id)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [isBackendMode, backendLedger.transactions, workspace.transactions, activeBusiness.id]);

  const businessInvoices = useMemo(() => {
    if (isBackendMode) {
      return [...backendLedger.invoices].sort((a, b) =>
        b.issueDate.localeCompare(a.issueDate)
      );
    }
    return workspace.invoices
      .filter((i) => i.businessId === activeBusiness.id)
      .sort((a, b) => b.issueDate.localeCompare(a.issueDate));
  }, [isBackendMode, backendLedger.invoices, workspace.invoices, activeBusiness.id]);

  const businessInventory = useMemo(() => {
    if (isBackendMode) return backendLedger.inventory;
    return workspace.inventory.filter((i) => i.businessId === activeBusiness.id);
  }, [isBackendMode, backendLedger.inventory, workspace.inventory, activeBusiness.id]);

  const businessRisks = useMemo(() => {
    if (isBackendMode) return [];
    return workspace.riskAlerts.filter((r) => r.businessId === activeBusiness.id);
  }, [isBackendMode, workspace.riskAlerts, activeBusiness.id]);

  const businessTeam = useMemo(() => {
    if (isBackendMode) return backendLedger.teamMembers;
    return workspace.teamMembers.filter((m) => m.businessId === activeBusiness.id);
  }, [isBackendMode, backendLedger.teamMembers, workspace.teamMembers, activeBusiness.id]);

  const businessNotifications = useMemo(() => {
    if (isBackendMode) return [];
    return workspace.notifications.filter((n) => n.businessId === activeBusiness.id);
  }, [isBackendMode, workspace.notifications, activeBusiness.id]);

  const navigate = (route: RouteId) => {
    setActiveRoute(route);
    setMobileNavOpen(false);
  };

  const toggleTheme = () => {
    setWorkspace((prev) => ({
      ...prev,
      theme: prev.theme === 'dark' ? 'light' : 'dark',
    }));
  };

  const setTheme = (t: 'dark' | 'light') => {
    setWorkspace((prev) => ({ ...prev, theme: t }));
  };

  const loginWithBackend = async (email: string, password: string) => {
    await authApi.login({ email, password });
    const { user, businesses: loadedBiz } = await loadAuthenticatedSession();
    if (loadedBiz.length > 0) {
      showToast(`Signed in as ${user.full_name} — Live Cloud Mode active`);
    } else {
      showToast(`Signed in as ${user.full_name}. Onboard a business to start your cloud ledger.`, 'info');
    }
  };

  const registerWithBackend = async (fullName: string, email: string, password: string) => {
    await authApi.register({ full_name: fullName, email, password });
    const { user } = await loadAuthenticatedSession();
    showToast(`Welcome ${user.full_name}! Onboard a business to initialize your live ledger.`);
  };

  const logoutFromBackend = async (allDevices = false) => {
    try {
      if (allDevices) {
        await authApi.logoutAll();
      } else {
        await authApi.logout();
      }
    } catch {
      clearAuthToken();
    } finally {
      setAuthUser(null);
      setBackendBusinesses([]);
      setBackendLedger(EMPTY_BACKEND_LEDGER);
      setWorkspace((prev) => ({
        ...prev,
        activeBusinessId: prev.businesses[0]?.id ?? DEMO_BUSINESSES[0].id,
      }));
      setLedgerVersion((v) => v + 1);
      showToast(
        allDevices
          ? 'Signed out from all devices. Returned to Illustrative Demo Mode.'
          : 'Signed out. Returned to Illustrative Demo Mode.',
        'info'
      );
    }
  };

  const setActiveBusinessId = (id: string) => {
    const target = businesses.find((b) => b.id === id);
    setWorkspace((prev) => ({ ...prev, activeBusinessId: id }));
    if (!target) return;

    if (authUser && !target.isDemoData) {
      businessApi.switchBusiness(id).catch(() => undefined);
      hydrateBackendLedger(id)
        .then(() => setLedgerVersion((v) => v + 1))
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : 'Unable to sync business ledger.';
          showToast(msg, 'warning');
        });
    } else {
      setBackendLedger(EMPTY_BACKEND_LEDGER);
    }
    showToast(`Switched workspace to ${target.name}`, 'info');
  };

  const addTransaction = async (
    tx: Omit<Transaction, 'id' | 'businessId' | 'isDemoData'>
  ) => {
    if (isBackendMode) {
      let category = backendLedger.categories.find(
        (c) =>
          c.name.toLowerCase() === tx.category.toLowerCase() &&
          c.type === tx.type
      );
      if (!category) {
        category = await ledgerApi.createCategory(activeBusiness.id, {
          name: tx.category,
          type: tx.type,
          is_operating: true,
        });
        setBackendLedger((prev) => ({
          ...prev,
          categories: [...prev.categories, category!],
        }));
      }

      const created = await ledgerApi.createTransaction(activeBusiness.id, {
        transaction_date: tx.date,
        description: tx.description,
        counterparty: tx.counterparty,
        type: tx.type,
        amount: tx.amount.toFixed(2),
        category_id: category.id,
        payment_method: mapPaymentMethodToApi(tx.paymentMethod),
        status: tx.status === 'void' ? 'pending' : tx.status,
        reference_code: tx.reference || null,
      });

      setBackendLedger((prev) => ({
        ...prev,
        transactions: [mapApiTransaction(created), ...prev.transactions],
      }));
      setLedgerVersion((v) => v + 1);
      showToast(
        `${tx.type === 'income' ? 'Income' : 'Expense'} saved to ${activeBusiness.name}`
      );
      return;
    }

    const newTx: Transaction = {
      ...tx,
      id: `tx-${Date.now()}`,
      businessId: activeBusiness.id,
      isDemoData: true,
    };
    setWorkspace((prev) => ({
      ...prev,
      transactions: [newTx, ...prev.transactions],
    }));
    showToast(
      `${tx.type === 'income' ? 'Income' : 'Expense'} entry recorded in ${activeBusiness.name}`
    );
  };

  const deleteTransaction = async (id: string) => {
    if (isBackendMode) {
      const target = backendLedger.transactions.find((t) => t.id === id);
      try {
        if (target && target.status === 'completed') {
          await ledgerApi.reverseTransaction(
            activeBusiness.id,
            id,
            'User reversed completed entry from Transactions ledger'
          );
          const refreshed = await ledgerApi.listTransactions(activeBusiness.id, 1, 100);
          setBackendLedger((prev) => ({
            ...prev,
            transactions: refreshed.items.map(mapApiTransaction),
          }));
          setLedgerVersion((v) => v + 1);
          showToast('Audit-safe reversal entry created in ledger', 'info');
        } else {
          await ledgerApi.deleteTransaction(activeBusiness.id, id);
          setBackendLedger((prev) => ({
            ...prev,
            transactions: prev.transactions.filter((t) => t.id !== id),
          }));
          setLedgerVersion((v) => v + 1);
          showToast('Transaction removed from workspace ledger', 'info');
        }
      } catch (err: unknown) {
        const msg =
          err instanceof Error
            ? err.message
            : 'Unable to modify this ledger transaction.';
        showToast(msg, 'warning');
      }
      return;
    }

    setWorkspace((prev) => ({
      ...prev,
      transactions: prev.transactions.filter((t) => t.id !== id),
    }));
    showToast('Transaction removed from workspace ledger', 'info');
  };

  const createInvoice = async (
    inv: Omit<Invoice, 'id' | 'businessId' | 'isDemoData'>
  ) => {
    if (isBackendMode) {
      let customer = backendLedger.customers.find(
        (c) => c.name.toLowerCase() === inv.customerName.trim().toLowerCase()
      );
      if (!customer) {
        customer = await ledgerApi.createCustomer(activeBusiness.id, {
          name: inv.customerName.trim(),
          email: inv.customerEmail || null,
          phone: inv.customerPhone || null,
        });
        setBackendLedger((prev) => ({
          ...prev,
          customers: [...prev.customers, customer!],
        }));
      }

      const created = await ledgerApi.createInvoice(activeBusiness.id, {
        customer_id: customer.id,
        invoice_number: inv.invoiceNumber,
        issue_date: inv.issueDate,
        due_date: inv.dueDate,
        tax_rate: inv.taxRate.toFixed(2),
        status: inv.status === 'draft' || inv.status === 'overdue' ? inv.status : 'pending',
        notes: inv.notes || null,
        line_items: inv.items.map((item) => ({
          description: item.description,
          quantity: item.quantity.toFixed(3),
          unit_price: item.unitPrice.toFixed(2),
        })),
      });

      const customersList = backendLedger.customers.some((c) => c.id === customer!.id)
        ? backendLedger.customers
        : [...backendLedger.customers, customer];

      setBackendLedger((prev) => ({
        ...prev,
        invoices: [mapApiInvoice(created, customersList), ...prev.invoices],
      }));
      setLedgerVersion((v) => v + 1);
      showToast(`Invoice ${created.invoice_number} created`);
      return;
    }

    const newInv: Invoice = {
      ...inv,
      id: `inv-${Date.now()}`,
      businessId: activeBusiness.id,
      isDemoData: true,
    };
    setWorkspace((prev) => ({
      ...prev,
      invoices: [newInv, ...prev.invoices],
    }));
    showToast(`Invoice ${inv.invoiceNumber} created`);
  };

  const recordInvoicePayment = async (
    invoiceId: string,
    opts?: InvoicePaymentInput
  ) => {
    const target = businessInvoices.find((i) => i.id === invoiceId);
    if (!target) return;

    const remaining =
      target.outstandingBalance !== undefined
        ? target.outstandingBalance
        : Math.max(0, target.totalAmount - (target.amountPaid ?? 0));
    const paymentAmount = opts?.amount && opts.amount > 0 ? opts.amount : remaining;
    if (paymentAmount <= 0) return;

    const method = opts?.paymentMethod ?? 'Bank Transfer';
    const paymentDate =
      opts?.paymentDate ?? (isBackendMode ? todayIsoDate() : REFERENCE_TODAY);
    const reference =
      opts?.paymentReference?.trim() ||
      `PAY-${target.invoiceNumber}-${String(Date.now()).slice(-4)}`;

    if (isBackendMode) {
      const idempotencyKey = `ui-pay-${invoiceId}-${Date.now()}`;
      await ledgerApi.createPayment(
        activeBusiness.id,
        {
          invoice_id: invoiceId,
          payment_reference: reference,
          payment_date: paymentDate,
          amount: paymentAmount.toFixed(2),
          payment_method: mapPaymentMethodToApi(method),
          notes: opts?.notes || null,
          idempotency_key: idempotencyKey,
        },
        idempotencyKey
      );

      const [invoicesRes, txRes] = await Promise.all([
        ledgerApi.listInvoices(activeBusiness.id, 1, 100),
        ledgerApi.listTransactions(activeBusiness.id, 1, 100),
      ]);
      setBackendLedger((prev) => ({
        ...prev,
        invoices: invoicesRes.items.map((inv) => mapApiInvoice(inv, prev.customers)),
        transactions: txRes.items.map(mapApiTransaction),
      }));
      setLedgerVersion((v) => v + 1);
      showToast(
        `Payment of ${paymentAmount.toLocaleString()} recorded for ${target.invoiceNumber}`
      );
      return;
    }

    const prevPaid = target.amountPaid ?? (target.status === 'paid' ? target.totalAmount : 0);
    const nextPaid = Math.min(target.totalAmount, prevPaid + paymentAmount);
    const nextRemaining = Math.max(0, target.totalAmount - nextPaid);
    const nextStatus: InvoiceStatus = nextRemaining <= 0 ? 'paid' : 'partial';

    setWorkspace((prev) => {
      const updatedInvoices = prev.invoices.map((i) =>
        i.id === invoiceId
          ? {
              ...i,
              amountPaid: nextPaid,
              outstandingBalance: nextRemaining,
              status: nextStatus,
            }
          : i
      );
      const paymentTx: Transaction = {
        id: `tx-pay-${Date.now()}`,
        businessId: target.businessId,
        date: paymentDate,
        description: `Invoice Payment — ${target.invoiceNumber}`,
        counterparty: target.customerName,
        category: 'Invoice Settlements',
        type: 'income',
        amount: paymentAmount,
        paymentMethod: method,
        status: 'completed',
        reference,
        isDemoData: true,
      };
      return {
        ...prev,
        invoices: updatedInvoices,
        transactions: [paymentTx, ...prev.transactions],
      };
    });
    showToast(`Invoice ${target.invoiceNumber} updated to ${nextStatus}`);
  };

  const voidInvoice = async (invoiceId: string) => {
    const target = businessInvoices.find((i) => i.id === invoiceId);
    if (!target) return;

    if (isBackendMode) {
      await ledgerApi.updateInvoiceStatus(activeBusiness.id, invoiceId, 'void');
      const invoicesRes = await ledgerApi.listInvoices(activeBusiness.id, 1, 100);
      setBackendLedger((prev) => ({
        ...prev,
        invoices: invoicesRes.items.map((inv) => mapApiInvoice(inv, prev.customers)),
      }));
      setLedgerVersion((v) => v + 1);
      showToast(`Invoice ${target.invoiceNumber} voided`, 'info');
      return;
    }

    setWorkspace((prev) => ({
      ...prev,
      invoices: prev.invoices.map((i) =>
        i.id === invoiceId ? { ...i, status: 'void' } : i
      ),
    }));
    showToast(`Invoice ${target.invoiceNumber} voided`, 'info');
  };

  const updateInvoiceStatus = async (id: string, status: InvoiceStatus) => {
    if (status === 'paid') {
      await recordInvoicePayment(id);
      return;
    }
    if (status === 'void') {
      await voidInvoice(id);
      return;
    }
    if (isBackendMode) {
      await ledgerApi.updateInvoiceStatus(
        activeBusiness.id,
        id,
        status === 'partial' ? 'pending' : status
      );
      const invoicesRes = await ledgerApi.listInvoices(activeBusiness.id, 1, 100);
      setBackendLedger((prev) => ({
        ...prev,
        invoices: invoicesRes.items.map((inv) => mapApiInvoice(inv, prev.customers)),
      }));
      setLedgerVersion((v) => v + 1);
      showToast(`Invoice updated to ${status}`);
      return;
    }
    setWorkspace((prev) => ({
      ...prev,
      invoices: prev.invoices.map((i) => (i.id === id ? { ...i, status } : i)),
    }));
    showToast(`Invoice updated to ${status}`);
  };

  const acknowledgeRisk = (id: string) => {
    setWorkspace((prev) => ({
      ...prev,
      riskAlerts: prev.riskAlerts.map((r) =>
        r.id === id ? { ...r, acknowledged: !r.acknowledged } : r
      ),
    }));
    showToast('Risk alert status updated', 'info');
  };

  const addInventoryItem = async (item: Omit<InventoryItem, 'id' | 'businessId'>) => {
    if (isBackendMode) {
      let supplier = backendLedger.suppliers.find(
        (s) => s.name.toLowerCase() === item.supplier.trim().toLowerCase()
      );
      if (!supplier && item.supplier.trim()) {
        supplier = await ledgerApi.createSupplier(activeBusiness.id, {
          name: item.supplier.trim(),
          default_lead_time_days: item.leadTimeDays || 3,
        });
        setBackendLedger((prev) => ({
          ...prev,
          suppliers: [...prev.suppliers, supplier!],
        }));
      }

      const created = await ledgerApi.createProduct(activeBusiness.id, {
        sku: item.sku,
        name: item.name,
        category: item.category,
        unit: item.unit,
        preferred_supplier_id: supplier?.id || null,
        current_stock: item.currentStock.toFixed(3),
        reorder_point: item.reorderPoint.toFixed(3),
        unit_cost: item.unitCost.toFixed(2),
        selling_price: item.sellingPrice.toFixed(2),
      });

      const suppliersList =
        supplier && !backendLedger.suppliers.some((s) => s.id === supplier!.id)
          ? [...backendLedger.suppliers, supplier]
          : backendLedger.suppliers;

      setBackendLedger((prev) => ({
        ...prev,
        inventory: [mapApiProduct(created, suppliersList), ...prev.inventory],
      }));
      setLedgerVersion((v) => v + 1);
      showToast(`Added ${created.name} to inventory`);
      return;
    }

    const newItem: InventoryItem = {
      ...item,
      id: `itm-${Date.now()}`,
      businessId: activeBusiness.id,
    };
    setWorkspace((prev) => ({
      ...prev,
      inventory: [newItem, ...prev.inventory],
    }));
    showToast(`Added ${item.name} to inventory`);
  };

  const restockInventoryItem = async (id: string, qty: number, unitCost?: number) => {
    const item = businessInventory.find((i) => i.id === id);
    if (!item || qty <= 0) return;

    if (isBackendMode) {
      const idempotencyKey = `ui-stk-${id}-${Date.now()}`;
      await ledgerApi.restockProduct(
        activeBusiness.id,
        id,
        {
          quantity: qty.toFixed(3),
          unit_cost: unitCost !== undefined ? unitCost.toFixed(2) : item.unitCost.toFixed(2),
          movement_date: todayIsoDate(),
          payment_method: 'bank_transfer',
          reference_code: `PO-${item.sku}`,
          record_expense: true,
          idempotency_key: idempotencyKey,
        },
        idempotencyKey
      );

      const [productsRes, txRes] = await Promise.all([
        ledgerApi.listProducts(activeBusiness.id, 1, 100),
        ledgerApi.listTransactions(activeBusiness.id, 1, 100),
      ]);
      setBackendLedger((prev) => ({
        ...prev,
        inventory: productsRes.items.map((p) => mapApiProduct(p, prev.suppliers)),
        transactions: txRes.items.map(mapApiTransaction),
      }));
      setLedgerVersion((v) => v + 1);
      showToast(`Restocked +${qty} ${item.unit} of ${item.name} & logged expense`);
      return;
    }

    const effectiveUnitCost = unitCost ?? item.unitCost;
    const restockCost = qty * effectiveUnitCost;
    const restockTx: Transaction = {
      id: `tx-stk-${Date.now()}`,
      businessId: item.businessId,
      date: REFERENCE_TODAY,
      description: `Inventory Restock: ${item.name} (${qty} ${item.unit})`,
      counterparty: item.supplier,
      category: 'Inventory Procurement',
      type: 'expense',
      amount: restockCost,
      paymentMethod: 'Bank Transfer',
      status: 'completed',
      reference: `PO-${item.sku}`,
      isDemoData: true,
    };

    setWorkspace((prev) => ({
      ...prev,
      inventory: prev.inventory.map((i) =>
        i.id === id
          ? {
              ...i,
              currentStock: i.currentStock + qty,
              unitCost: effectiveUnitCost,
              lastRestocked: REFERENCE_TODAY,
            }
          : i
      ),
      transactions: [restockTx, ...prev.transactions],
    }));
    showToast(`Restocked +${qty} ${item.unit} of ${item.name} & logged expense`);
  };

  const onboardBusiness = async (
    profile: Omit<
      BusinessProfile,
      | 'id'
      | 'openingCashBalance'
      | 'monthlyFixedOverhead'
      | 'creditFacilityLimit'
      | 'shortTermLoanBalance'
      | 'taxLiabilityAccrued'
      | 'isDemoData'
      | 'createdAt'
    > & { openingCashBalance?: number; monthlyFixedOverhead?: number }
  ) => {
    if (authUser) {
      const created = await businessApi.createBusiness({
        name: profile.name,
        business_type: profile.type,
        industry: profile.industry,
        currency: profile.currency,
        country: profile.country,
        business_size: profile.size,
        financial_year_start: profile.financialYearStart,
        dashboard_preference: profile.dashboardPreference,
        gst_registered: profile.gstRegistered,
        opening_cash_balance: (profile.openingCashBalance ?? 650000).toFixed(2),
        monthly_fixed_overhead: (profile.monthlyFixedOverhead ?? 185000).toFixed(2),
      });
      const mapped = mapApiBusiness(created);
      setBackendBusinesses((prev) => [mapped, ...prev]);
      setWorkspace((prev) => ({ ...prev, activeBusinessId: mapped.id }));
      await hydrateBackendLedger(mapped.id);
      setLedgerVersion((v) => v + 1);
      setOnboardingOpen(false);
      setActiveRoute('overview');
      showToast(`Created live business workspace: ${mapped.name}`);
      return;
    }

    const id = `biz-${Date.now()}`;
    const newBiz: BusinessProfile = {
      ...profile,
      id,
      openingCashBalance: profile.openingCashBalance ?? 650000,
      monthlyFixedOverhead: profile.monthlyFixedOverhead ?? 185000,
      creditFacilityLimit: 500000,
      shortTermLoanBalance: 0,
      taxLiabilityAccrued: 24000,
      isDemoData: true,
      createdAt: REFERENCE_TODAY,
    };
    const seed = generateStarterSeedForBusiness(newBiz);
    const starterTeam: TeamMember = {
      id: `tm-${Date.now()}`,
      businessId: id,
      name: 'Ananya Deshmukh',
      email: 'owner@business.example',
      role: 'Owner',
      status: 'Active',
      lastActive: REFERENCE_TODAY,
    };
    const starterNotif: NotificationItem = {
      id: `ntf-${Date.now()}`,
      businessId: id,
      title: `${newBiz.name} Workspace Initialized`,
      message: `Starter illustrative data created for ${newBiz.type} (${newBiz.currency}).`,
      timestamp: `${REFERENCE_TODAY} 10:00`,
      severity: 'info',
      read: false,
      targetRoute: 'overview',
    };

    setWorkspace((prev) => ({
      ...prev,
      businesses: [...prev.businesses, newBiz],
      activeBusinessId: id,
      transactions: [...seed.transactions, ...prev.transactions],
      invoices: [...seed.invoices, ...prev.invoices],
      inventory: [...seed.inventory, ...prev.inventory],
      riskAlerts: [...seed.risks, ...prev.riskAlerts],
      teamMembers: [starterTeam, ...prev.teamMembers],
      notifications: [starterNotif, ...prev.notifications],
    }));
    setOnboardingOpen(false);
    setActiveRoute('overview');
    showToast(`Onboarded ${newBiz.name} with ${newBiz.dashboardPreference} layout`);
  };

  const updateBusinessProfile = async (patch: Partial<BusinessProfile>) => {
    if (isBackendMode) {
      const updated = await businessApi.updateBusiness(activeBusiness.id, {
        name: patch.name,
        business_type: patch.type,
        industry: patch.industry,
        currency: patch.currency,
        country: patch.country,
        business_size: patch.size,
        financial_year_start: patch.financialYearStart,
        dashboard_preference: patch.dashboardPreference,
        gst_registered: patch.gstRegistered,
        opening_cash_balance:
          patch.openingCashBalance !== undefined
            ? patch.openingCashBalance.toFixed(2)
            : undefined,
        monthly_fixed_overhead:
          patch.monthlyFixedOverhead !== undefined
            ? patch.monthlyFixedOverhead.toFixed(2)
            : undefined,
      });
      const mapped = mapApiBusiness(updated);
      setBackendBusinesses((prev) =>
        prev.map((b) => (b.id === mapped.id ? mapped : b))
      );
      setLedgerVersion((v) => v + 1);
      showToast('Business settings saved to cloud');
      return;
    }

    setWorkspace((prev) => ({
      ...prev,
      businesses: prev.businesses.map((b) =>
        b.id === activeBusiness.id ? { ...b, ...patch } : b
      ),
    }));
    showToast('Business settings saved');
  };

  const inviteTeamMember = async (
    member: Omit<TeamMember, 'id' | 'businessId' | 'status' | 'lastActive'>
  ) => {
    if (isBackendMode) {
      try {
        const added = await businessApi.addMember(activeBusiness.id, {
          email: member.email.trim().toLowerCase(),
          role: mapTeamRoleToApi(member.role),
        });
        setBackendLedger((prev) => ({
          ...prev,
          teamMembers: [...prev.teamMembers, mapApiMember(added)],
        }));
        showToast(`Added ${added.user_full_name} (${added.role}) to workspace`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unable to add team member.';
        showToast(msg, 'warning');
      }
      return;
    }

    const newMember: TeamMember = {
      ...member,
      id: `tm-${Date.now()}`,
      businessId: activeBusiness.id,
      status: 'Invited',
      lastActive: REFERENCE_TODAY,
    };
    setWorkspace((prev) => ({
      ...prev,
      teamMembers: [...prev.teamMembers, newMember],
    }));
    showToast(`Invitation queued for ${member.email}`);
  };

  const updateTeamMemberRole = async (id: string, role: TeamMember['role']) => {
    if (isBackendMode) {
      try {
        const updated = await businessApi.updateMemberRole(activeBusiness.id, id, {
          role: mapTeamRoleToApi(role),
        });
        setBackendLedger((prev) => ({
          ...prev,
          teamMembers: prev.teamMembers.map((m) =>
            m.id === id ? mapApiMember(updated) : m
          ),
        }));
        showToast(`Updated team role to ${role}`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unable to update role.';
        showToast(msg, 'warning');
      }
      return;
    }

    setWorkspace((prev) => ({
      ...prev,
      teamMembers: prev.teamMembers.map((m) => (m.id === id ? { ...m, role } : m)),
    }));
    showToast(`Updated team role to ${role}`);
  };

  const removeTeamMember = async (id: string) => {
    if (isBackendMode) {
      try {
        await businessApi.removeMember(activeBusiness.id, id);
        setBackendLedger((prev) => ({
          ...prev,
          teamMembers: prev.teamMembers.filter((m) => m.id !== id),
        }));
        showToast('Team member removed from workspace', 'info');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unable to remove member.';
        showToast(msg, 'warning');
      }
      return;
    }

    setWorkspace((prev) => ({
      ...prev,
      teamMembers: prev.teamMembers.filter((m) => m.id !== id),
    }));
    showToast('Team member removed', 'info');
  };

  const markNotificationRead = (id: string) => {
    setWorkspace((prev) => ({
      ...prev,
      notifications: prev.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      ),
    }));
  };

  const markAllNotificationsRead = () => {
    setWorkspace((prev) => ({
      ...prev,
      notifications: prev.notifications.map((n) =>
        n.businessId === activeBusiness.id ? { ...n, read: true } : n
      ),
    }));
    showToast('All notifications marked as read', 'info');
  };

  const resetDemoData = () => {
    localStorage.removeItem(STORAGE_KEY);
    setWorkspace((prev) => ({
      theme: prev.theme,
      activeBusinessId: isBackendMode ? prev.activeBusinessId : DEMO_BUSINESSES[0].id,
      businesses: DEMO_BUSINESSES,
      transactions: DEMO_TRANSACTIONS,
      invoices: DEMO_INVOICES,
      inventory: DEMO_INVENTORY,
      riskAlerts: DEMO_RISK_ALERTS,
      teamMembers: DEMO_TEAM,
      notifications: DEMO_NOTIFICATIONS,
    }));
    if (!isBackendMode) {
      setActiveRoute('overview');
    }
    showToast(
      isBackendMode
        ? 'Local demo workspaces reset (your live cloud data was preserved untouched)'
        : 'Restored clean illustrative demo dataset',
      'info'
    );
  };

  return (
    <AppContext.Provider
      value={{
        theme: workspace.theme,
        toggleTheme,
        setTheme,
        activeRoute,
        navigate,
        sidebarCollapsed,
        setSidebarCollapsed,
        mobileNavOpen,
        setMobileNavOpen,
        authUser,
        isAuthenticated,
        isBackendMode,
        isSyncingBackend,
        ledgerVersion,
        authModalOpen,
        setAuthModalOpen,
        loginWithBackend,
        registerWithBackend,
        logoutFromBackend,
        businesses,
        activeBusiness,
        setActiveBusinessId,
        businessTransactions,
        businessInvoices,
        businessInventory,
        businessRisks,
        businessTeam,
        businessNotifications,
        datePreset,
        setDatePreset,
        customDateRange,
        setCustomDateRange,
        globalSearchQuery,
        setGlobalSearchQuery,
        onboardingOpen,
        setOnboardingOpen,
        addTransactionOpen,
        setAddTransactionOpen,
        createInvoiceOpen,
        setCreateInvoiceOpen,
        addTransaction,
        deleteTransaction,
        createInvoice,
        updateInvoiceStatus,
        recordInvoicePayment,
        voidInvoice,
        acknowledgeRisk,
        addInventoryItem,
        restockInventoryItem,
        onboardBusiness,
        updateBusinessProfile,
        inviteTeamMember,
        updateTeamMemberRole,
        removeTeamMember,
        markNotificationRead,
        markAllNotificationsRead,
        resetDemoData,
        toast,
        showToast,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useApp must be used inside AppProvider');
  }
  return ctx;
}
