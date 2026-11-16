import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { REFERENCE_TODAY } from '../../data/mockBusinesses';
import { InvoiceLineItem } from '../../types/financial';
import { addDays, formatCurrency } from '../../utils/formatters';
import { Modal } from '../common/Modal';

export function CreateInvoiceModal() {
  const {
    createInvoiceOpen,
    setCreateInvoiceOpen,
    createInvoice,
    activeBusiness,
    businessInvoices,
    isBackendMode,
  } = useApp();

  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [issueDate, setIssueDate] = useState(REFERENCE_TODAY);
  const [dueDate, setDueDate] = useState(addDays(REFERENCE_TODAY, 15));
  const [taxRate, setTaxRate] = useState(18);
  const [notes, setNotes] = useState('Net-15 commercial payment terms.');
  const [items, setItems] = useState<InvoiceLineItem[]>([
    { id: 'li-1', description: 'Commercial Supply / Services', quantity: 1, unitPrice: 45000 },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  React.useEffect(() => {
    if (createInvoiceOpen) {
      const baseDate = isBackendMode ? new Date().toISOString().slice(0, 10) : REFERENCE_TODAY;
      setIssueDate(baseDate);
      setDueDate(addDays(baseDate, 15));
      setError('');
    }
  }, [createInvoiceOpen, isBackendMode]);

  const subtotal = items.reduce((s, it) => s + it.quantity * it.unitPrice, 0);
  const taxAmount = Math.round((subtotal * taxRate) / 100);
  const totalAmount = subtotal + taxAmount;

  const addLineItem = () => {
    setItems((prev) => [
      ...prev,
      { id: `li-${Date.now()}`, description: '', quantity: 1, unitPrice: 0 },
    ]);
  };

  const updateItem = (
    id: string,
    field: keyof InvoiceLineItem,
    val: string | number
  ) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, [field]: val } : it))
    );
  };

  const removeItem = (id: string) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim() || totalAmount <= 0) {
      setError('Customer name and at least one positive line item are required.');
      return;
    }

    const nextSeq = 1052 + businessInvoices.length;
    setSubmitting(true);
    setError('');
    try {
      await createInvoice({
        invoiceNumber: `INV-2026-${nextSeq}`,
        customerName: customerName.trim(),
        customerEmail: customerEmail.trim() || 'accounts@client.example',
        customerPhone: customerPhone.trim() || '+91 98000 00000',
        issueDate,
        dueDate,
        items: items.map((i) => ({
          ...i,
          description: i.description.trim() || 'Goods / Services',
        })),
        taxRate,
        subtotal,
        taxAmount,
        totalAmount,
        status: 'pending',
        notes,
      });

      setCustomerName('');
      setCustomerEmail('');
      setCustomerPhone('');
      setError('');
      setCreateInvoiceOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to create invoice.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={createInvoiceOpen}
      onClose={() => setCreateInvoiceOpen(false)}
      title="Create Customer Invoice"
      subtitle={`Generate a receivable entry for ${activeBusiness.name}`}
      maxWidthClass="max-w-2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-2.5 rounded-lg bg-rose-500/10 text-xs text-rose-600 dark:text-rose-400">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-1">
            <label htmlFor="inv-customer" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Customer Name *
            </label>
            <input
              id="inv-customer"
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="e.g., Meridian Retail Ltd"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] text-slate-900 dark:text-slate-100"
            />
          </div>
          <div>
            <label htmlFor="inv-email" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Customer Email
            </label>
            <input
              id="inv-email"
              type="email"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              placeholder="billing@meridian.in"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] text-slate-900 dark:text-slate-100"
            />
          </div>
          <div>
            <label htmlFor="inv-phone" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Phone
            </label>
            <input
              id="inv-phone"
              type="text"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="+91 98450 00112"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] text-slate-900 dark:text-slate-100"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label htmlFor="inv-issue" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Issue Date
            </label>
            <input
              id="inv-issue"
              type="date"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono-num rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] text-slate-900 dark:text-slate-100"
            />
          </div>
          <div>
            <label htmlFor="inv-due" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Due Date
            </label>
            <input
              id="inv-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono-num rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] text-slate-900 dark:text-slate-100"
            />
          </div>
          <div>
            <label htmlFor="inv-tax" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Tax / GST (%)
            </label>
            <select
              id="inv-tax"
              value={taxRate}
              onChange={(e) => setTaxRate(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm font-mono-num rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#22323f] text-slate-900 dark:text-slate-100"
            >
              <option value={0}>0% (Exempt)</option>
              <option value={5}>5% GST</option>
              <option value={12}>12% GST</option>
              <option value={18}>18% GST</option>
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Line Items
            </span>
            <button
              type="button"
              onClick={addLineItem}
              className="inline-flex items-center gap-1 text-xs font-medium text-violet-600 dark:text-violet-400 hover:underline"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Line
            </button>
          </div>

          <div className="space-y-2">
            {items.map((item) => (
              <div
                key={item.id}
                className="grid grid-cols-12 gap-2 items-center"
              >
                <input
                  type="text"
                  value={item.description}
                  onChange={(e) =>
                    updateItem(item.id, 'description', e.target.value)
                  }
                  aria-label="Item or service description"
                  placeholder="Item or service description"
                  className="col-span-6 px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] text-slate-900 dark:text-slate-100"
                />
                <input
                  type="number"
                  min="1"
                  value={item.quantity}
                  onChange={(e) =>
                    updateItem(item.id, 'quantity', Math.max(1, Number(e.target.value)))
                  }
                  aria-label="Quantity"
                  className="col-span-2 px-2.5 py-2 text-xs font-mono-num rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] text-slate-900 dark:text-slate-100"
                />
                <input
                  type="number"
                  min="0"
                  value={item.unitPrice}
                  onChange={(e) =>
                    updateItem(item.id, 'unitPrice', Math.max(0, Number(e.target.value)))
                  }
                  aria-label="Unit price"
                  className="col-span-3 px-2.5 py-2 text-xs font-mono-num rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] text-slate-900 dark:text-slate-100"
                />
                <button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  aria-label="Remove line item"
                  className="col-span-1 flex justify-center p-2 text-slate-400 hover:text-rose-500"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 p-3.5 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/8">
          <div className="flex-1">
            <label htmlFor="inv-notes" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Payment Notes
            </label>
            <input
              id="inv-notes"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] text-slate-900 dark:text-slate-100"
            />
          </div>
          <div className="text-right space-y-1 font-mono-num text-xs shrink-0">
            <div className="text-slate-500 dark:text-slate-400">
              Subtotal: {formatCurrency(subtotal, activeBusiness.currency)}
            </div>
            <div className="text-slate-500 dark:text-slate-400">
              Tax ({taxRate}%): {formatCurrency(taxAmount, activeBusiness.currency)}
            </div>
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Total: {formatCurrency(totalAmount, activeBusiness.currency)}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-200 dark:border-white/8">
          <button
            type="button"
            disabled={submitting}
            onClick={() => setCreateInvoiceOpen(false)}
            className="px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 text-xs font-medium rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white"
          >
            {submitting ? 'Issuing...' : 'Issue Invoice'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
