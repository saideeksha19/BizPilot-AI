import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowLeftRight,
  BarChart3,
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  HelpCircle,
  LayoutDashboard,
  MessageSquareText,
  Network,
  Package,
  Plus,
  Settings,
  SlidersHorizontal,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { RouteId } from '../../types/financial';

export interface NavItem {
  id: RouteId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const PRIMARY_NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'financial-twin', label: 'Financial Twin', icon: Network },
  { id: 'transactions', label: 'Transactions', icon: ArrowLeftRight },
  { id: 'invoices', label: 'Invoices', icon: FileText },
  { id: 'cash-flow', label: 'Cash Flow', icon: TrendingUp },
  { id: 'simulator', label: 'What-If Simulator', icon: SlidersHorizontal },
  { id: 'risk-radar', label: 'Risk Radar', icon: AlertTriangle },
  { id: 'inventory', label: 'Inventory', icon: Package },
  { id: 'copilot', label: 'AI Copilot', icon: MessageSquareText },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
];

export const BOTTOM_NAV_ITEMS: NavItem[] = [
  { id: 'settings', label: 'Business Settings', icon: Settings },
  { id: 'team', label: 'Team Management', icon: Users },
  { id: 'help', label: 'Help and Support', icon: HelpCircle },
];

interface SidebarProps {
  onExitToSite?: () => void;
}

export function Sidebar({ onExitToSite }: SidebarProps) {
  const {
    activeRoute,
    navigate,
    sidebarCollapsed,
    setSidebarCollapsed,
    mobileNavOpen,
    setMobileNavOpen,
    businesses,
    activeBusiness,
    setActiveBusinessId,
    setOnboardingOpen,
    businessRisks,
  } = useApp();

  const [bizMenuOpen, setBizMenuOpen] = useState(false);
  const openRiskCount = businessRisks.filter((r) => !r.acknowledged).length;

  const renderNavContent = (isMobile: boolean) => {
    const collapsed = !isMobile && sidebarCollapsed;

    return (
      <div className="flex h-full select-none flex-col border-r border-[#34495e]/12 bg-[#faf8f2] dark:border-[#f5f0e6]/10 dark:bg-[#20303d]">
        {/* Brand */}
        <div
          className={`flex h-[68px] shrink-0 items-center border-b border-[#34495e]/10 dark:border-[#f5f0e6]/10 ${
            collapsed ? 'justify-center px-2' : 'justify-between px-4'
          }`}
        >
          <button
            type="button"
            onClick={() => navigate('overview')}
            className="group flex min-w-0 items-center gap-2.5 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b69a68]"
            aria-label="BizPilot AI — Executive Overview"
          >
            <span className="relative flex h-8 w-8 shrink-0 items-center justify-center border border-[#34495e]/25 bg-[#34495e] text-[#f5f0e6] dark:border-[#f5f0e6]/25">
              <span className="font-display text-[14px] leading-none">B</span>
              <span
                className="absolute -right-[3px] -top-[3px] h-[5px] w-[5px] bg-[#b69a68]"
                aria-hidden="true"
              />
            </span>
            {!collapsed && (
              <span className="flex flex-col leading-none">
                <span className="font-display text-[13.5px] tracking-[0.14em] text-[#263746] dark:text-[#f5f0e6]">
                  BIZPILOT AI
                </span>
                <span className="mt-1 text-[8px] uppercase tracking-[0.26em] text-[#5b6e7a]">
                  Financial Intelligence
                </span>
              </span>
            )}
          </button>

          {isMobile ? (
            <button
              type="button"
              onClick={() => setMobileNavOpen(false)}
              aria-label="Close navigation menu"
              className="rounded-sm p-2 text-[#647c8e] transition-colors hover:bg-[#34495e]/8 dark:text-[#91a6b5]"
            >
              <X className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="rounded-sm p-1.5 text-[#5b6e7a] transition-colors hover:bg-[#34495e]/8 hover:text-[#34495e] dark:hover:bg-[#f5f0e6]/8 dark:hover:text-[#f5f0e6]"
            >
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
          )}
        </div>

        {/* Business workspace selector */}
        <div className="relative border-b border-[#34495e]/10 px-3 py-3 dark:border-[#f5f0e6]/10">
          <button
            type="button"
            onClick={() => setBizMenuOpen((open) => !open)}
            title={activeBusiness.name}
            className={`flex w-full items-center justify-between gap-2 border border-[#34495e]/12 bg-[#f5f0e6]/70 px-2.5 py-2 text-left transition-colors hover:border-[#34495e]/25 dark:border-[#f5f0e6]/12 dark:bg-[#f5f0e6]/[0.04] ${
              collapsed ? 'justify-center px-0' : ''
            }`}
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <Building2 className="h-4 w-4 shrink-0 text-[#647c8e] dark:text-[#91a6b5]" />
              {!collapsed && (
                <span className="min-w-0">
                  <span className="block truncate text-[12px] font-medium text-[#263746] dark:text-[#f5f0e6]">
                    {activeBusiness.name}
                  </span>
                  <span className="mt-0.5 block truncate text-[10px] uppercase tracking-[0.12em] text-[#5b6e7a]">
                    {activeBusiness.type} · {activeBusiness.currency}
                  </span>
                </span>
              )}
            </span>
            {!collapsed && <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[#5b6e7a]" />}
          </button>

          {bizMenuOpen && (
            <div
              className={`absolute z-30 mt-1.5 border border-[#34495e]/12 bg-[#fcfaf3] py-1.5 shadow-[0_24px_60px_-30px_rgba(38,55,70,0.5)] dark:border-[#f5f0e6]/12 dark:bg-[#2a3b4b] ${
                collapsed ? 'left-16 top-2 w-60' : 'left-3 right-3'
              }`}
            >
              <div className="px-3 py-1 text-[9px] uppercase tracking-[0.24em] text-[#5b6e7a]">
                Switch workspace
              </div>
              {businesses.map((biz) => {
                const selected = biz.id === activeBusiness.id;
                return (
                  <button
                    key={biz.id}
                    type="button"
                    onClick={() => {
                      setActiveBusinessId(biz.id);
                      setBizMenuOpen(false);
                    }}
                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-[12px] transition-colors ${
                      selected
                        ? 'bg-[#34495e]/8 font-medium text-[#34495e] dark:bg-[#f5f0e6]/10 dark:text-[#f5f0e6]'
                        : 'text-[#46586a] hover:bg-[#34495e]/5 dark:text-[#c3d0d9] dark:hover:bg-[#f5f0e6]/6'
                    }`}
                  >
                    <span className="truncate">{biz.name}</span>
                    <span className="ml-2 shrink-0 text-[10px] uppercase tracking-[0.08em] text-[#5b6e7a]">
                      {biz.type}
                    </span>
                  </button>
                );
              })}
              <div className="my-1 border-t border-[#34495e]/10 dark:border-[#f5f0e6]/10" />
              <button
                type="button"
                onClick={() => {
                  setBizMenuOpen(false);
                  setOnboardingOpen(true);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-[12px] font-medium text-[#647c8e] transition-colors hover:bg-[#34495e]/6 dark:text-[#91a6b5]"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add new business</span>
              </button>
            </div>
          )}
        </div>

        {/* Primary modules */}
        {!collapsed && (
          <div className="px-5 pb-2 pt-4 text-[9px] uppercase tracking-[0.26em] text-[#5b6e7a]">
            Workspace
          </div>
        )}
        <nav
          className={`flex-1 space-y-0.5 overflow-y-auto px-2.5 ${collapsed ? 'pt-3' : 'pt-1'}`}
          aria-label="Primary modules"
        >
          {PRIMARY_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeRoute === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => navigate(item.id)}
                title={collapsed ? item.label : undefined}
                aria-current={active ? 'page' : undefined}
                className={`group flex w-full items-center justify-between gap-2.5 px-3 py-2 text-[12.5px] transition-all duration-300 ${
                  collapsed ? 'justify-center px-0' : ''
                } ${
                  active
                    ? 'nav-active-indicator bg-[#34495e] font-medium text-[#f5f0e6] shadow-[0_10px_28px_-18px_rgba(38,55,70,0.9)] dark:bg-[#34495e]'
                    : 'text-[#46586a] hover:bg-[#34495e]/6 hover:text-[#263746] dark:text-[#c3d0d9] dark:hover:bg-[#f5f0e6]/6 dark:hover:text-[#f5f0e6]'
                }`}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <Icon
                    className={`h-[15px] w-[15px] shrink-0 transition-colors ${
                      active
                        ? 'text-[#b69a68]'
                        : 'text-[#91a6b5] group-hover:text-[#647c8e] dark:group-hover:text-[#f5f0e6]'
                    }`}
                  />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </span>
                {!collapsed && item.id === 'risk-radar' && openRiskCount > 0 && (
                  <span
                    className={`font-mono-num text-[10px] font-semibold ${
                      active ? 'text-[#e8d7b6]' : 'text-[#7d6338] dark:text-[#d8c29b]'
                    }`}
                  >
                    {openRiskCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Bottom utilities */}
        <div className="shrink-0 space-y-0.5 border-t border-[#34495e]/10 px-2.5 pb-4 pt-3 dark:border-[#f5f0e6]/10">
          {BOTTOM_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeRoute === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => navigate(item.id)}
                title={collapsed ? item.label : undefined}
                aria-current={active ? 'page' : undefined}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-[12.5px] transition-all duration-300 ${
                  collapsed ? 'justify-center px-0' : ''
                } ${
                  active
                    ? 'nav-active-indicator bg-[#34495e] font-medium text-[#f5f0e6] dark:bg-[#34495e]'
                    : 'text-[#46586a] hover:bg-[#34495e]/6 hover:text-[#263746] dark:text-[#c3d0d9] dark:hover:bg-[#f5f0e6]/6 dark:hover:text-[#f5f0e6]'
                }`}
              >
                <Icon
                  className={`h-[15px] w-[15px] shrink-0 ${
                    active ? 'text-[#b69a68]' : 'text-[#91a6b5]'
                  }`}
                />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </button>
            );
          })}

          {onExitToSite && (
            <button
              type="button"
              onClick={onExitToSite}
              title={collapsed ? 'Back to brand site' : undefined}
              className={`mt-1 flex w-full items-center gap-2.5 border-t border-[#34495e]/10 px-3 pt-3 text-[11px] uppercase tracking-[0.16em] text-[#5b6e7a] transition-colors hover:text-[#34495e] dark:border-[#f5f0e6]/10 dark:hover:text-[#f5f0e6] ${
                collapsed ? 'justify-center px-0' : ''
              }`}
            >
              <ArrowLeft className="h-3.5 w-3.5 shrink-0" />
              {!collapsed && <span>Brand site</span>}
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <aside
        className={`hidden shrink-0 transition-all duration-300 lg:block ${
          sidebarCollapsed ? 'w-[76px]' : 'w-[264px]'
        }`}
      >
        <div className="sticky top-0 h-screen">{renderNavContent(false)}</div>
      </aside>

      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-[#1b2833]/60 backdrop-blur-sm"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="relative z-10 h-full w-[280px] max-w-[85vw]">
            {renderNavContent(true)}
          </aside>
        </div>
      )}
    </>
  );
}
