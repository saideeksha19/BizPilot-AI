/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { LandingPage } from './pages/LandingPage';
import { RouteId } from './types/financial';

const AppShell = lazy(() =>
  import('./components/layout/AppShell').then((m) => ({ default: m.AppShell }))
);

/*
 * Dashboard modules are code-split: the brand site never downloads the charting
 * library, ledger tables, report builders or copilot UI. Each module is fetched
 * the first time its route is opened and cached by the browser afterwards.
 */
const OverviewPage = lazy(() =>
  import('./pages/OverviewPage').then((m) => ({ default: m.OverviewPage }))
);
const FinancialTwinPage = lazy(() =>
  import('./pages/FinancialTwinPage').then((m) => ({ default: m.FinancialTwinPage }))
);
const TransactionsPage = lazy(() =>
  import('./pages/TransactionsPage').then((m) => ({ default: m.TransactionsPage }))
);
const InvoicesPage = lazy(() =>
  import('./pages/InvoicesPage').then((m) => ({ default: m.InvoicesPage }))
);
const CashFlowPage = lazy(() =>
  import('./pages/CashFlowPage').then((m) => ({ default: m.CashFlowPage }))
);
const SimulatorPage = lazy(() =>
  import('./pages/SimulatorPage').then((m) => ({ default: m.SimulatorPage }))
);
const RiskRadarPage = lazy(() =>
  import('./pages/RiskRadarPage').then((m) => ({ default: m.RiskRadarPage }))
);
const InventoryPage = lazy(() =>
  import('./pages/InventoryPage').then((m) => ({ default: m.InventoryPage }))
);
const CopilotPage = lazy(() =>
  import('./pages/CopilotPage').then((m) => ({ default: m.CopilotPage }))
);
const ReportsPage = lazy(() =>
  import('./pages/ReportsPage').then((m) => ({ default: m.ReportsPage }))
);
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage }))
);
const HelpSupportPage = lazy(() =>
  import('./pages/HelpSupportPage').then((m) => ({ default: m.HelpSupportPage }))
);

function WorkspaceFallback() {
  return (
    <div className="app-canvas flex min-h-screen flex-col items-center justify-center gap-5">
      <span
        aria-hidden="true"
        className="flex h-10 w-10 items-center justify-center border border-[#34495e]/25 bg-[#34495e] font-display text-[16px] text-[#f5f0e6]"
      >
        B
      </span>
      <span
        aria-hidden="true"
        className="h-6 w-6 animate-spin rounded-full border border-[#34495e]/15 border-t-[#b69a68]"
      />
      <span className="text-[10px] uppercase tracking-[0.3em] text-[#5b6e7a]">
        Opening workspace
      </span>
    </div>
  );
}

function RouteFallback() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-[55vh] flex-col items-center justify-center gap-4"
    >
      <span
        aria-hidden="true"
        className="h-7 w-7 animate-spin rounded-full border border-[#34495e]/15 border-t-[#b69a68]"
      />
      <span className="text-[10px] uppercase tracking-[0.3em] text-[#5b6e7a]">
        Preparing workspace
      </span>
    </div>
  );
}

function ActiveRouteView() {
  const { activeRoute } = useApp();

  switch (activeRoute) {
    case 'overview':
      return <OverviewPage />;
    case 'financial-twin':
      return <FinancialTwinPage />;
    case 'transactions':
      return <TransactionsPage />;
    case 'invoices':
      return <InvoicesPage />;
    case 'cash-flow':
      return <CashFlowPage />;
    case 'simulator':
      return <SimulatorPage />;
    case 'risk-radar':
      return <RiskRadarPage />;
    case 'inventory':
      return <InventoryPage />;
    case 'copilot':
      return <CopilotPage />;
    case 'reports':
      return <ReportsPage />;
    case 'settings':
      return <SettingsPage initialTab="profile" />;
    case 'team':
      return <SettingsPage initialTab="team" />;
    case 'help':
      return <HelpSupportPage />;
    default:
      return <OverviewPage />;
  }
}

type WorkspaceView = 'landing' | 'workspace';

const VIEW_STORAGE_KEY = 'bizpilot_ai_view_v1';

function readInitialView(): WorkspaceView {
  if (typeof window === 'undefined') return 'landing';
  try {
    if (window.location.hash === '#workspace') return 'workspace';
    return sessionStorage.getItem(VIEW_STORAGE_KEY) === 'workspace' ? 'workspace' : 'landing';
  } catch {
    return 'landing';
  }
}

function BizPilotExperience() {
  const { navigate } = useApp();
  const [view, setView] = useState<WorkspaceView>(readInitialView);

  const enterWorkspace = useCallback(
    (route?: RouteId) => {
      if (route) navigate(route);
      try {
        sessionStorage.setItem(VIEW_STORAGE_KEY, 'workspace');
      } catch {
        // Session storage can be unavailable in privacy modes.
      }
      setView('workspace');
      window.scrollTo({ top: 0, behavior: 'auto' });
    },
    [navigate]
  );

  const exitToSite = useCallback(() => {
    try {
      sessionStorage.removeItem(VIEW_STORAGE_KEY);
    } catch {
      // Ignore storage failures.
    }
    setView('landing');
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  useEffect(() => {
    if (view === 'workspace') {
      window.history.replaceState(null, '', '#workspace');
    } else if (window.location.hash === '#workspace') {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, [view]);

  if (view === 'landing') {
    return (
      <div className="view-enter">
        <LandingPage onEnter={enterWorkspace} />
      </div>
    );
  }

  return (
    <div className="view-enter">
      <Suspense fallback={<WorkspaceFallback />}>
        <AppShell onExitToSite={exitToSite}>
          <Suspense fallback={<RouteFallback />}>
            <ActiveRouteView />
          </Suspense>
        </AppShell>
      </Suspense>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <BizPilotExperience />
    </AppProvider>
  );
}
