import React, { useMemo, useState } from 'react';
import { ArrowLeftRight, Download, Plus, RotateCcw, Search, Trash2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ledgerApi } from '../services/ledgerApi';
import { formatCurrency, formatShortDate } from '../utils/formatters';
import { DataOriginTag } from '../components/common/DataOriginTag';
import { EmptyState } from '../components/common/EmptyState';

export function TransactionsPage() {
  const {
    activeBusiness,
    businessTransactions,
    setAddTransactionOpen,
    deleteTransaction,
    isBackendMode,
    showToast,
  } = useApp();

  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const c = activeBusiness.currency;

  const categories = useMemo(() => {
    const set = new Set(businessTransactions.map((t) => t.category));
    return ['all', ...Array.from(set).sort()];
  }, [businessTransactions]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return businessTransactions.filter((t) => {
      if (typeFilter !== 'all' && t.type !== typeFilter) return false;
      if (categoryFilter !== 'all' && t.category !== categoryFilter) return false;
      if (
        q &&
        !t.description.toLowerCase().includes(q) &&
        !t.counterparty.toLowerCase().includes(q) &&
        !t.reference.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [businessTransactions, typeFilter, categoryFilter, search]);

  const totalInflow = filtered
    .filter((t) => t.type === 'income' && t.status !== 'void')
    .reduce((s, t) => s + t.amount, 0);
  const totalOutflow = filtered
    .filter((t) => t.type === 'expense' && t.status !== 'void')
    .reduce((s, t) => s + t.amount, 0);

  const exportCsv = async () => {
    if (isBackendMode) {
      try {
        const blob = await ledgerApi.exportTransactionsCsv(activeBusiness.id);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${activeBusiness.name.toLowerCase().replace(/\s+/g, '-')}-transactions.csv`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Exported authoritative ledger CSV from backend');
        return;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unable to export CSV.';
        showToast(msg, 'warning');
        return;
      }
    }

    const header = 'Date,Type,Description,Counterparty,Category,Method,Status,Amount\n';
    const rows = filtered
      .map(
        (t) =>
          `${t.date},${t.type},"${t.description.replace(/"/g, '""')}","${t.counterparty.replace(/"/g, '""')}",${t.category},${t.paymentMethod},${t.status},${t.amount}`
      )
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeBusiness.name.toLowerCase().replace(/\s+/g, '-')}-transactions.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Exported filtered transactions CSV');
  };

  return (
    <div className="space-y-5">
      {/* Summary & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-white/8">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              {activeBusiness.name} Ledger
            </span>
            <span aria-hidden="true">·</span>
            <DataOriginTag kind={isBackendMode ? 'ACTUAL' : 'demo'} />
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-4 text-xs font-mono-num">
            <span className="text-emerald-600 dark:text-emerald-400">
              Inflows: {formatCurrency(totalInflow, c)}
            </span>
            <span className="text-rose-600 dark:text-rose-400">
              Outflows: {formatCurrency(totalOutflow, c)}
            </span>
            <span className="text-slate-600 dark:text-slate-300">
              Net: {formatCurrency(totalInflow - totalOutflow, c)}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/[0.04]"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => setAddTransactionOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Transaction
          </button>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex p-1 rounded-lg bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/8 text-xs">
            {(['all', 'income', 'expense'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTypeFilter(t)}
                className={`px-3 py-1 rounded-md capitalize font-medium transition-colors ${
                  typeFilter === t
                    ? 'bg-white dark:bg-[#2e4152] text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="Filter by category"
            className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#22323f] text-slate-700 dark:text-slate-200"
          >
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat === 'all' ? 'All Categories' : cat}
              </option>
            ))}
          </select>
        </div>

        <div className="relative w-full md:w-72">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search description, counterparty, ref..."
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#22323f] text-slate-900 dark:text-slate-100"
          />
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={ArrowLeftRight}
          title="No matching transactions"
          description="Adjust your search or category filter, or record a new transaction in the workspace ledger."
          actionLabel="Record Transaction"
          onAction={() => setAddTransactionOpen(true)}
        />
      ) : (
        <div className="rounded-xl bg-white dark:bg-[#22323f] border border-slate-200 dark:border-white/8 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-white/8 text-[11px] font-medium text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-white/[0.02]">
                  <th className="py-2.5 px-5">Date</th>
                  <th className="py-2.5 px-4">Description & Counterparty</th>
                  <th className="py-2.5 px-4">Category</th>
                  <th className="py-2.5 px-4">Method</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4 text-right">Amount</th>
                  <th className="py-2.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/[0.05] text-xs">
                {filtered.map((tx) => {
                  const isCompletedCloud = isBackendMode && tx.status === 'completed';
                  return (
                    <tr
                      key={tx.id}
                      className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="py-3 px-5 font-mono-num text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {formatShortDate(tx.date)}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {tx.description}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {tx.counterparty} · {tx.reference}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {tx.category}
                      </td>
                      <td className="py-3 px-4 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {tx.paymentMethod}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap capitalize">
                        <span
                          className={`font-medium ${
                            tx.status === 'completed'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : tx.status === 'scheduled'
                              ? 'text-blue-600 dark:text-blue-400'
                              : tx.status === 'void'
                              ? 'text-slate-400'
                              : 'text-amber-600 dark:text-amber-400'
                          }`}
                        >
                          {tx.status}
                        </span>
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono-num font-medium whitespace-nowrap ${
                          tx.type === 'income'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-slate-900 dark:text-slate-100'
                        }`}
                      >
                        {tx.type === 'income' ? '+' : '-'}
                        {formatCurrency(tx.amount, c)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => deleteTransaction(tx.id)}
                          title={
                            isCompletedCloud
                              ? 'Reverse completed entry (audit-safe offsetting transaction)'
                              : 'Delete entry'
                          }
                          aria-label={
                            isCompletedCloud
                              ? `Reverse ${tx.description}`
                              : `Delete ${tx.description}`
                          }
                          className="p-1.5 rounded-md text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                        >
                          {isCompletedCloud ? (
                            <RotateCcw className="w-3.5 h-3.5" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
