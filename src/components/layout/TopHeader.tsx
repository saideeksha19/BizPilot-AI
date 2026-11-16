import React, { useMemo, useState } from 'react';
import {
  Bell,
  Building2,
  CheckCheck,
  ChevronDown,
  LogIn,
  LogOut,
  Menu,
  Moon,
  Plus,
  RotateCcw,
  Search,
  Settings,
  Sun,
  UserPlus,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { RouteId } from '../../types/financial';
import { formatCurrency } from '../../utils/formatters';

const PAGE_TITLES: Record<RouteId, string> = {
  overview: 'Executive Financial Overview',
  'financial-twin': 'Financial Digital Twin',
  transactions: 'Transactions Ledger',
  invoices: 'Invoices & Receivables',
  'cash-flow': 'Cash Flow Intelligence',
  simulator: 'What-If Decision Simulator',
  'risk-radar': 'Risk Radar',
  inventory: 'Inventory & Stock Control',
  copilot: 'AI Financial Copilot',
  reports: 'Financial Reports & Exports',
  settings: 'Business Settings',
  team: 'Team & Access Management',
  help: 'Help & Support',
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return 'BP';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function TopHeader() {
  const {
    theme,
    toggleTheme,
    activeRoute,
    navigate,
    setMobileNavOpen,
    authUser,
    isAuthenticated,
    isBackendMode,
    setAuthModalOpen,
    logoutFromBackend,
    businesses,
    activeBusiness,
    setActiveBusinessId,
    businessTransactions,
    businessInvoices,
    businessInventory,
    businessNotifications,
    markNotificationRead,
    markAllNotificationsRead,
    globalSearchQuery,
    setGlobalSearchQuery,
    setOnboardingOpen,
    setAddTransactionOpen,
    setCreateInvoiceOpen,
    resetDemoData,
  } = useApp();

  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [bizDropdownOpen, setBizDropdownOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);

  const unreadCount = businessNotifications.filter((n) => !n.read).length;

  const searchResults = useMemo(() => {
    const q = globalSearchQuery.trim().toLowerCase();
    if (!q) return [];
    const results: { label: string; meta: string; route: RouteId }[] = [];

    businessTransactions
      .filter(
        (t) =>
          t.description.toLowerCase().includes(q) ||
          t.counterparty.toLowerCase().includes(q) ||
          t.category.toLowerCase().includes(q)
      )
      .slice(0, 3)
      .forEach((t) => {
        results.push({
          label: t.description,
          meta: `Transaction · ${formatCurrency(t.amount, activeBusiness.currency)}`,
          route: 'transactions',
        });
      });

    businessInvoices
      .filter(
        (i) =>
          i.invoiceNumber.toLowerCase().includes(q) || i.customerName.toLowerCase().includes(q)
      )
      .slice(0, 3)
      .forEach((i) => {
        results.push({
          label: `${i.invoiceNumber} — ${i.customerName}`,
          meta: `Invoice · ${i.status}`,
          route: 'invoices',
        });
      });

    businessInventory
      .filter((itm) => itm.name.toLowerCase().includes(q) || itm.sku.toLowerCase().includes(q))
      .slice(0, 2)
      .forEach((itm) => {
        results.push({
          label: itm.name,
          meta: `Inventory · ${itm.currentStock} ${itm.unit}`,
          route: 'inventory',
        });
      });

    return results;
  }, [
    globalSearchQuery,
    businessTransactions,
    businessInvoices,
    businessInventory,
    activeBusiness.currency,
  ]);

  const handleContextualAction = () => {
    if (activeRoute === 'invoices') {
      setCreateInvoiceOpen(true);
    } else if (activeRoute === 'simulator') {
      navigate('financial-twin');
    } else if (activeRoute === 'inventory') {
      navigate('inventory');
      setAddTransactionOpen(true);
    } else if (activeRoute === 'reports') {
      navigate('reports');
    } else {
      setAddTransactionOpen(true);
    }
  };

  const contextualActionLabel =
    activeRoute === 'invoices'
      ? 'Create Invoice'
      : activeRoute === 'simulator'
      ? 'View Digital Twin'
      : 'Record Transaction';

  const displayName = authUser ? authUser.full_name : 'Ananya Deshmukh';
  const displaySubline = authUser
    ? `${authUser.email} · ${isBackendMode ? 'Live Cloud' : 'Demo'}`
    : `Demo Founder · ${activeBusiness.name}`;

  const menuPanel =
    'border border-[#34495e]/12 bg-[#fcfaf3] shadow-[0_30px_70px_-40px_rgba(38,55,70,0.55)] dark:border-[#f5f0e6]/12 dark:bg-[#2a3b4b]';
  const menuItem =
    'flex w-full items-center gap-2 px-3.5 py-2 text-left text-[12px] transition-colors';

  return (
    <header className="sticky top-0 z-30 flex h-[68px] items-center justify-between gap-4 border-b border-[#34495e]/10 bg-[#faf8f2]/92 px-4 backdrop-blur-md dark:border-[#f5f0e6]/10 dark:bg-[#20303d]/92 lg:px-8">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <button
          type="button"
          onClick={() => setMobileNavOpen(true)}
          aria-label="Open navigation menu"
          className="rounded-sm border border-[#34495e]/12 p-2 text-[#46586a] transition-colors hover:border-[#34495e]/30 dark:border-[#f5f0e6]/12 dark:text-[#c3d0d9] lg:hidden"
        >
          <Menu className="h-4 w-4" />
        </button>

        <div className="min-w-0">
          <div className="hidden text-[8.5px] uppercase tracking-[0.28em] text-[#5b6e7a] sm:block">
            BizPilot AI · Workspace
          </div>
          <h1 className="truncate whitespace-nowrap font-display text-[16px] font-normal tracking-[-0.01em] text-[#263746] dark:text-[#f5f0e6] sm:text-[18px] 2xl:text-[19px]">
            {PAGE_TITLES[activeRoute]}
          </h1>
        </div>

        <div className="relative ml-2 hidden 2xl:block">
          <button
            type="button"
            onClick={() => {
              setBizDropdownOpen((open) => !open);
              setNotifOpen(false);
              setProfileOpen(false);
            }}
            className="flex items-center gap-1.5 border border-[#34495e]/12 px-2.5 py-1.5 text-[11px] font-medium text-[#46586a] transition-colors hover:border-[#34495e]/25 hover:bg-[#34495e]/5 dark:border-[#f5f0e6]/12 dark:text-[#c3d0d9] dark:hover:bg-[#f5f0e6]/5"
          >
            <Building2 className="h-3.5 w-3.5 text-[#647c8e] dark:text-[#91a6b5]" />
            <span className="max-w-[140px] truncate">{activeBusiness.name}</span>
            <span
              className={`rounded-sm px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] ${
                isBackendMode
                  ? 'bg-[#4c7660]/12 text-[#4c7660] dark:text-[#a9c2b2]'
                  : 'bg-[#b69a68]/15 text-[#7d6338] dark:text-[#d8c29b]'
              }`}
            >
              {isBackendMode ? 'Cloud' : 'Demo'}
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-[#5b6e7a]" />
          </button>

          {bizDropdownOpen && (
            <div className={`absolute left-0 z-40 mt-2 w-64 py-1.5 ${menuPanel}`}>
              <div className="px-3.5 py-1 text-[9px] uppercase tracking-[0.24em] text-[#5b6e7a]">
                Switch workspace
              </div>
              {businesses.map((biz) => (
                <button
                  key={biz.id}
                  type="button"
                  onClick={() => {
                    setActiveBusinessId(biz.id);
                    setBizDropdownOpen(false);
                  }}
                  className={`${menuItem} justify-between ${
                    biz.id === activeBusiness.id
                      ? 'bg-[#34495e]/8 font-medium text-[#34495e] dark:bg-[#f5f0e6]/10 dark:text-[#f5f0e6]'
                      : 'text-[#46586a] hover:bg-[#34495e]/5 dark:text-[#c3d0d9] dark:hover:bg-[#f5f0e6]/6'
                  }`}
                >
                  <span className="truncate">{biz.name}</span>
                  <span className="ml-2 shrink-0 text-[9px] uppercase tracking-[0.1em] text-[#5b6e7a]">
                    {!biz.isDemoData ? 'Cloud · ' : 'Demo · '}
                    {biz.currency}
                  </span>
                </button>
              ))}
              <div className="my-1 border-t border-[#34495e]/10 dark:border-[#f5f0e6]/10" />
              <button
                type="button"
                onClick={() => {
                  setBizDropdownOpen(false);
                  setOnboardingOpen(true);
                }}
                className={`${menuItem} font-medium text-[#647c8e] hover:bg-[#34495e]/6 dark:text-[#91a6b5]`}
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Onboard new business</span>
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <div className="relative hidden w-44 lg:block xl:w-52 2xl:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#5b6e7a]" />
          <input
            type="search"
            value={globalSearchQuery}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setTimeout(() => setSearchFocused(false), 180)}
            onChange={(e) => setGlobalSearchQuery(e.target.value)}
            placeholder="Search ledger, invoices, SKUs..."
            aria-label="Global workspace search"
            className="w-full border border-[#34495e]/12 bg-[#f5f0e6]/60 py-2 pl-8 pr-3 text-[11.5px] text-[#263746] placeholder:text-[#5b6e7a] focus:border-[#b69a68]/60 focus:bg-[#fcfaf3] focus:outline-none dark:border-[#f5f0e6]/12 dark:bg-[#f5f0e6]/[0.04] dark:text-[#f5f0e6] dark:focus:bg-[#f5f0e6]/[0.07]"
          />

          {searchFocused && globalSearchQuery.trim().length > 0 && (
            <div className={`absolute left-0 right-0 z-40 mt-1.5 py-1.5 ${menuPanel}`}>
              {searchResults.length > 0 ? (
                searchResults.map((res, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onMouseDown={() => {
                      navigate(res.route);
                      setSearchFocused(false);
                    }}
                    className="w-full px-3.5 py-2 text-left transition-colors hover:bg-[#34495e]/5 dark:hover:bg-[#f5f0e6]/6"
                  >
                    <span className="block truncate text-[12px] font-medium text-[#263746] dark:text-[#f5f0e6]">
                      {res.label}
                    </span>
                    <span className="block text-[10px] uppercase tracking-[0.1em] text-[#5b6e7a]">
                      {res.meta}
                    </span>
                  </button>
                ))
              ) : (
                <div className="px-3.5 py-2 text-[11px] text-[#5b6e7a]">
                  No matching entries in {activeBusiness.name}
                </div>
              )}
            </div>
          )}
        </div>

        {!isAuthenticated && (
          <button
            type="button"
            onClick={() => setAuthModalOpen(true)}
            aria-label="Sign in to Live Cloud Mode"
            className="inline-flex items-center gap-1.5 border border-[#34495e]/25 px-2.5 py-2 text-[10.5px] font-medium uppercase tracking-[0.12em] text-[#34495e] transition-colors hover:border-[#b69a68] hover:bg-[#b69a68]/10 dark:border-[#f5f0e6]/20 dark:text-[#e6dfd0]"
          >
            <LogIn className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Sign In</span>
          </button>
        )}

        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setNotifOpen((open) => !open);
              setProfileOpen(false);
              setBizDropdownOpen(false);
            }}
            aria-label="Open notifications"
            className="relative border border-[#34495e]/12 p-2 text-[#46586a] transition-colors hover:border-[#34495e]/30 hover:bg-[#34495e]/5 dark:border-[#f5f0e6]/12 dark:text-[#c3d0d9] dark:hover:bg-[#f5f0e6]/5"
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#b69a68] px-1 font-mono-num text-[9px] font-semibold text-[#263746]">
                {unreadCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className={`absolute right-0 z-40 mt-2 w-80 overflow-hidden sm:w-96 ${menuPanel}`}>
              <div className="flex items-center justify-between border-b border-[#34495e]/10 px-4 py-3 dark:border-[#f5f0e6]/10">
                <span className="text-[10px] uppercase tracking-[0.2em] text-[#5f6a70] dark:text-[#aeb7ba]">
                  Notifications · {unreadCount} new
                </span>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={markAllNotificationsRead}
                    className="inline-flex items-center gap-1 text-[11px] text-[#647c8e] hover:underline dark:text-[#91a6b5]"
                  >
                    <CheckCheck className="h-3.5 w-3.5" />
                    Mark all read
                  </button>
                )}
              </div>
              <div className="max-h-80 divide-y divide-[#34495e]/8 overflow-y-auto dark:divide-[#f5f0e6]/8">
                {businessNotifications.length === 0 ? (
                  <div className="px-4 py-6 text-center text-[11px] text-[#5b6e7a]">
                    No pending notifications for {activeBusiness.name}.
                  </div>
                ) : (
                  businessNotifications.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => {
                        markNotificationRead(n.id);
                        setNotifOpen(false);
                        navigate(n.targetRoute);
                      }}
                      className={`w-full px-4 py-3 text-left transition-colors hover:bg-[#34495e]/4 dark:hover:bg-[#f5f0e6]/5 ${
                        !n.read ? 'bg-[#b69a68]/[0.06]' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`text-[12px] font-medium ${
                            n.severity === 'critical'
                              ? 'text-[#8e4a43] dark:text-[#c08d86]'
                              : n.severity === 'warning'
                              ? 'text-[#7d6338] dark:text-[#d8c29b]'
                              : 'text-[#263746] dark:text-[#f5f0e6]'
                          }`}
                        >
                          {n.title}
                        </span>
                        <span className="shrink-0 font-mono-num text-[10px] text-[#5b6e7a]">
                          {n.timestamp.slice(5)}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-[#5f6a70] dark:text-[#aeb7ba]">
                        {n.message}
                      </p>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === 'dark' ? 'ivory' : 'midnight'} theme`}
          className="hidden border border-[#34495e]/12 p-2 text-[#46586a] transition-colors hover:border-[#34495e]/30 hover:bg-[#34495e]/5 dark:border-[#f5f0e6]/12 dark:text-[#c3d0d9] sm:inline-flex"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        <button
          type="button"
          onClick={handleContextualAction}
          className="hidden shrink-0 items-center gap-1.5 bg-[#34495e] px-3.5 py-2.5 text-[10.5px] font-medium uppercase tracking-[0.12em] text-[#f5f0e6] transition-colors hover:bg-[#263746] xl:inline-flex"
        >
          <Plus className="h-3.5 w-3.5 text-[#b69a68]" />
          <span>{contextualActionLabel}</span>
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setProfileOpen((open) => !open);
              setNotifOpen(false);
              setBizDropdownOpen(false);
            }}
            aria-label="Open account menu"
            className="flex items-center gap-2 border border-[#34495e]/12 py-1 pl-1 pr-2 transition-colors hover:border-[#34495e]/30 dark:border-[#f5f0e6]/12"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center bg-[#34495e] text-[10px] font-semibold text-[#f5f0e6]">
              {getInitials(displayName)}
            </span>
            <ChevronDown className="hidden h-3.5 w-3.5 text-[#5b6e7a] sm:block" />
          </button>

          {profileOpen && (
            <div className={`absolute right-0 z-40 mt-2 w-64 py-1.5 ${menuPanel}`}>
              <div className="border-b border-[#34495e]/10 px-3.5 py-2.5 dark:border-[#f5f0e6]/10">
                <div className="truncate text-[12px] font-medium text-[#263746] dark:text-[#f5f0e6]">
                  {displayName}
                </div>
                <div className="mt-0.5 truncate text-[10px] text-[#5b6e7a]">{displaySubline}</div>
              </div>

              {!isAuthenticated && (
                <button
                  type="button"
                  onClick={() => {
                    setProfileOpen(false);
                    setAuthModalOpen(true);
                  }}
                  className={`${menuItem} font-medium text-[#647c8e] hover:bg-[#34495e]/6 dark:text-[#91a6b5]`}
                >
                  <LogIn className="h-3.5 w-3.5" />
                  <span>Sign in · Live Cloud Mode</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setProfileOpen(false);
                  setOnboardingOpen(true);
                }}
                className={`${menuItem} text-[#46586a] hover:bg-[#34495e]/5 dark:text-[#c3d0d9] dark:hover:bg-[#f5f0e6]/6`}
              >
                <Plus className="h-3.5 w-3.5 text-[#5b6e7a]" />
                <span>Onboard new business</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setProfileOpen(false);
                  navigate('settings');
                }}
                className={`${menuItem} text-[#46586a] hover:bg-[#34495e]/5 dark:text-[#c3d0d9] dark:hover:bg-[#f5f0e6]/6`}
              >
                <Settings className="h-3.5 w-3.5 text-[#5b6e7a]" />
                <span>Business settings</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setProfileOpen(false);
                  navigate('team');
                }}
                className={`${menuItem} text-[#46586a] hover:bg-[#34495e]/5 dark:text-[#c3d0d9] dark:hover:bg-[#f5f0e6]/6`}
              >
                <UserPlus className="h-3.5 w-3.5 text-[#5b6e7a]" />
                <span>Team & access</span>
              </button>
              <div className="my-1 border-t border-[#34495e]/10 dark:border-[#f5f0e6]/10" />
              <button
                type="button"
                onClick={() => {
                  setProfileOpen(false);
                  resetDemoData();
                }}
                className={`${menuItem} text-[#7d6338] hover:bg-[#b69a68]/10 dark:text-[#d8c29b]`}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Reset demo dataset</span>
              </button>

              {isAuthenticated && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false);
                      logoutFromBackend(false);
                    }}
                    className={`${menuItem} text-[#8e4a43] hover:bg-[#8e4a43]/8 dark:text-[#c08d86]`}
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    <span>Sign out</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false);
                      logoutFromBackend(true);
                    }}
                    className={`${menuItem} text-[10.5px] text-[#5b6e7a] hover:bg-[#34495e]/5 dark:hover:bg-[#f5f0e6]/6`}
                  >
                    <LogOut className="h-3 w-3" />
                    <span>Sign out all devices</span>
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
