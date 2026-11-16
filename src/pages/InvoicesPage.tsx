import React, { useMemo, useState } from 'react';
import { Ban, Check, CreditCard, FileText, Mail, Plus, Search } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Invoice, InvoiceStatus, Transaction } from '../types/financial';
import { formatCurrency, formatShortDate } from '../utils/formatters';
import { DataOriginTag } from '../components/common/DataOriginTag';
import { EmptyState } from '../components/common/EmptyState';
import { Modal } from '../components/common/Modal';

export function InvoicesPage() {
  const {
    activeBusiness,
    businessInvoices,
    setCreateInvoiceOpen,
    updateInvoiceStatus,
    recordInvoicePayment,
    voidInvoice,
    isBackendMode,
    showToast,
  } = useApp();

  const [statusFilter, setStatusFilter] = useState<'all' | InvoiceStatus>('all');
  const [search, setSearch] = useState('');
  const [payingInvoice, setPayingInvoice] = useState<Invoice | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<Transaction['paymentMethod']>('Bank Transfer');
  const [payRef, setPayRef] = useState('');
  const [paySubmitting, setPaySubmitting] = useState(false);
  const [payError, setPayError] = useState('');

  const c = activeBusiness.currency;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return businessInvoices.filter((inv) => {
      if (statusFilter !== 'all' && inv.status !== statusFilter) return false;
      if (
        q &&
        !inv.invoiceNumber.toLowerCase().includes(q) &&
        !inv.customerName.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [businessInvoices, statusFilter, search]);

  const paidTotal = businessInvoices
    .filter((i) => i.status === 'paid')
    .reduce((s, i) => s + i.totalAmount, 0);
  const pendingTotal = businessInvoices
    .filter((i) => i.status === 'pending' || i.status === 'partial')
    .reduce((s, i) => s + (i.outstandingBalance ?? i.totalAmount), 0);
  const overdueTotal = businessInvoices
    .filter((i) => i.status === 'overdue')
    .reduce((s, i) => s + (i.outstandingBalance ?? i.totalAmount), 0);

  const openPaymentModal = (inv: Invoice) => {
    const remaining =
      inv.outstandingBalance !== undefined
        ? inv.outstandingBalance
        : Math.max(0, inv.totalAmount - (inv.amountPaid ?? 0));
    setPayingInvoice(inv);
    setPayAmount(String(remaining));
    setPayMethod('Bank Transfer');
    setPayRef(`PAY-${inv.invoiceNumber}-${String(Date.now()).slice(-4)}`);
    setPayError('');
  };

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingInvoice) return;
    const numericAmount = Number(payAmount);
    const maxRemaining =
      payingInvoice.outstandingBalance !== undefined
        ? payingInvoice.outstandingBalance
        : Math.max(0, payingInvoice.totalAmount - (payingInvoice.amountPaid ?? 0));

    if (!numericAmount || numericAmount <= 0 || numericAmount > maxRemaining) {
      setPayError(`Enter a valid amount between 1 and ${maxRemaining}.`);
      return;
    }

    setPaySubmitting(true);
    setPayError('');
    try {
      await recordInvoicePayment(payingInvoice.id, {
        amount: numericAmount,
        paymentMethod: payMethod,
        paymentReference: payRef.trim() || undefined,
      });
      setPayingInvoice(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to record payment.';
      setPayError(msg);
    } finally {
      setPaySubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Summary Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-white/8">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              Receivables & Billing
            </span>
            <span aria-hidden="true">·</span>
            <DataOriginTag kind={isBackendMode ? 'ACTUAL' : 'demo'} />
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-4 text-xs font-mono-num">
            <span className="text-emerald-600 dark:text-emerald-400">
              Paid: {formatCurrency(paidTotal, c)}
            </span>
            <span className="text-blue-600 dark:text-blue-400">
              Pending / Partial: {formatCurrency(pendingTotal, c)}
            </span>
            <span className="text-rose-600 dark:text-rose-400">
              Overdue: {formatCurrency(overdueTotal, c)}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setCreateInvoiceOpen(true)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium self-start lg:self-auto"
        >
          <Plus className="w-3.5 h-3.5" />
          Create Invoice
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="inline-flex flex-wrap p-1 rounded-lg bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/8 text-xs self-start">
          {(['all', 'paid', 'partial', 'pending', 'overdue', 'void'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1 rounded-md capitalize font-medium transition-colors ${
                statusFilter === st
                  ? 'bg-white dark:bg-[#2e4152] text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search invoice # or customer..."
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#22323f] text-slate-900 dark:text-slate-100"
          />
        </div>
      </div>

      {/* Invoice List */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No invoices found"
          description="No invoices match the selected status or search term. Issue a new invoice to track receivables."
          actionLabel="Create Invoice"
          onAction={() => setCreateInvoiceOpen(true)}
        />
      ) : (
        <div className="rounded-xl bg-white dark:bg-[#22323f] border border-slate-200 dark:border-white/8 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-white/8 text-[11px] font-medium text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-white/[0.02]">
                  <th className="py-2.5 px-5">Invoice #</th>
                  <th className="py-2.5 px-4">Customer Details</th>
                  <th className="py-2.5 px-4">Issue / Due</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4 text-right">Total</th>
                  <th className="py-2.5 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/[0.05] text-xs">
                {filtered.map((inv) => {
                  const isOpen = inv.status !== 'paid' && inv.status !== 'void';
                  const hasPaidPartial = (inv.amountPaid ?? 0) > 0 && isOpen;
                  return (
                    <tr
                      key={inv.id}
                      className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="py-3.5 px-5 font-mono-num font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        {inv.invoiceNumber}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {inv.customerName}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {inv.customerEmail} · {inv.customerPhone}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono-num text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        <div>Issued: {formatShortDate(inv.issueDate)}</div>
                        <div className="text-[11px]">Due: {formatShortDate(inv.dueDate)}</div>
                      </td>
                      <td className="py-3.5 px-4 capitalize font-medium whitespace-nowrap">
                        <span
                          className={
                            inv.status === 'paid'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : inv.status === 'overdue'
                              ? 'text-rose-600 dark:text-rose-400'
                              : inv.status === 'partial'
                              ? 'text-blue-600 dark:text-blue-400'
                              : inv.status === 'void'
                              ? 'text-slate-400'
                              : 'text-amber-600 dark:text-amber-400'
                          }
                        >
                          {inv.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono-num font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        <div>{formatCurrency(inv.totalAmount, c)}</div>
                        {hasPaidPartial ? (
                          <div className="text-[11px] font-normal text-blue-600 dark:text-blue-400">
                            Due: {formatCurrency(inv.outstandingBalance ?? 0, c)}
                          </div>
                        ) : (
                          <div className="text-[11px] font-normal text-slate-400">
                            incl. {inv.taxRate}% tax
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {isOpen && (
                            <>
                              <button
                                type="button"
                                onClick={() => openPaymentModal(inv)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-violet-600/10 text-violet-600 dark:text-violet-400 hover:bg-violet-600/20 text-[11px] font-medium"
                              >
                                <CreditCard className="w-3 h-3" />
                                Pay
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  updateInvoiceStatus(inv.id, 'paid').catch((err) =>
                                    showToast(
                                      err instanceof Error ? err.message : 'Payment failed.',
                                      'warning'
                                    )
                                  )
                                }
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-600/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-600/20 text-[11px] font-medium"
                              >
                                <Check className="w-3 h-3" />
                                Mark Paid
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  showToast(
                                    `Payment reminder queued for ${inv.customerName}`,
                                    'info'
                                  )
                                }
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.04] text-[11px]"
                              >
                                <Mail className="w-3 h-3" />
                              </button>
                              {(inv.amountPaid ?? 0) === 0 && (
                                <button
                                  type="button"
                                  title="Void unpaid invoice"
                                  onClick={() =>
                                    voidInvoice(inv.id).catch((err) =>
                                      showToast(
                                        err instanceof Error ? err.message : 'Unable to void invoice.',
                                        'warning'
                                      )
                                    )
                                  }
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-200 dark:border-white/10 text-slate-500 hover:text-rose-500 hover:border-rose-500/30 text-[11px]"
                                >
                                  <Ban className="w-3 h-3" />
                                </button>
                              )}
                            </>
                          )}
                          {inv.status === 'paid' && (
                            <span className="text-[11px] text-slate-400">Settled</span>
                          )}
                          {inv.status === 'void' && (
                            <span className="text-[11px] text-slate-400">Voided</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Record Partial / Full Payment Modal */}
      <Modal
        open={Boolean(payingInvoice)}
        onClose={() => {
          if (!paySubmitting) setPayingInvoice(null);
        }}
        title="Record Invoice Payment"
        subtitle={
          payingInvoice
            ? `${payingInvoice.invoiceNumber} · ${payingInvoice.customerName}`
            : undefined
        }
        maxWidthClass="max-w-md"
      >
        <form onSubmit={handlePaymentSubmit} className="space-y-4">
          {payError && (
            <div className="p-2.5 rounded-lg bg-rose-500/10 text-xs text-rose-600 dark:text-rose-400">
              {payError}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Payment Amount ({c}) *
            </label>
            <input
              type="number"
              min="1"
              step="any"
              required
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono-num rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Payment Method
              </label>
              <select
                value={payMethod}
                onChange={(e) =>
                  setPayMethod(e.target.value as Transaction['paymentMethod'])
                }
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#22323f]"
              >
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="UPI">UPI</option>
                <option value="Card">Card</option>
                <option value="Cash">Cash</option>
                <option value="Auto-Debit">Auto-Debit</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Reference Code
              </label>
              <input
                type="text"
                value={payRef}
                onChange={(e) => setPayRef(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono-num rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04]"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-white/8">
            <button
              type="button"
              disabled={paySubmitting}
              onClick={() => setPayingInvoice(null)}
              className="px-3.5 py-2 text-xs rounded-lg border border-slate-200 dark:border-white/10"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={paySubmitting}
              className="px-4 py-2 text-xs font-medium rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white"
            >
              {paySubmitting ? 'Recording...' : 'Record Payment'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
