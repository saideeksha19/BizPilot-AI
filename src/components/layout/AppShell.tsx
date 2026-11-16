import React from 'react';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { CreateInvoiceModal } from '../invoices/CreateInvoiceModal';
import { AddTransactionModal } from '../transactions/AddTransactionModal';
import { AuthModal } from './AuthModal';
import { OnboardingModal } from './OnboardingModal';
import { Sidebar } from './Sidebar';
import { TopHeader } from './TopHeader';

interface AppShellProps {
  children: React.ReactNode;
  onExitToSite?: () => void;
}

export function AppShell({ children, onExitToSite }: AppShellProps) {
  const { toast } = useApp();

  return (
    <div className="app-canvas flex min-h-screen">
      <Sidebar onExitToSite={onExitToSite} />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopHeader />

        <main className="mx-auto w-full max-w-[1480px] flex-1 px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
          {children}
        </main>
      </div>

      {/* Global interactive modals */}
      <AuthModal />
      <OnboardingModal />
      <AddTransactionModal />
      <CreateInvoiceModal />

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 right-5 z-50 flex max-w-md items-center gap-3 border border-[#f5f0e6]/15 bg-[#263746] px-4 py-3 text-[12px] font-medium text-[#f5f0e6] shadow-[0_28px_60px_-30px_rgba(20,30,38,0.8)]"
        >
          <span className="h-10 w-px bg-[#b69a68]/60" aria-hidden="true" />
          {toast.tone === 'warning' ? (
            <AlertTriangle className="h-4 w-4 shrink-0 text-[#d8c29b]" />
          ) : toast.tone === 'info' ? (
            <Info className="h-4 w-4 shrink-0 text-[#91a6b5]" />
          ) : (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-[#a9c2b2]" />
          )}
          <span className="leading-relaxed">{toast.text}</span>
        </div>
      )}
    </div>
  );
}
