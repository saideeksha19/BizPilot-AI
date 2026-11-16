import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { REFERENCE_TODAY } from '../../data/mockBusinesses';
import { TransactionStatus, TransactionType } from '../../types/financial';
import { Modal } from '../common/Modal';

const INCOME_CATEGORIES = [
  'Retail Sales',
  'B2B Wholesale',
  'Online Orders',
  'Food & Beverage Sales',
  'Catering Revenue',
  'Boutique Sales',
  'Invoice Settlements',
  'Consulting & Services',
];

const EXPENSE_CATEGORIES = [
  'Inventory Procurement',
  'Payroll & Benefits',
  'Rent & Facilities',
  'Utilities & Cold Chain',
  'Kitchen Ingredients',
  'Marketing & Commissions',
  'Taxes & Compliance',
  'Debt Service',
  'Equipment & Repairs',
];

export function AddTransactionModal() {
  const {
    addTransactionOpen,
    setAddTransactionOpen,
    addTransaction,
    activeBusiness,
    isBackendMode,
  } = useApp();

  const [type, setType] = useState<TransactionType>('expense');
  const [date, setDate] = useState(() =>
    isBackendMode ? new Date().toISOString().slice(0, 10) : REFERENCE_TODAY
  );
  const [description, setDescription] = useState('');
  const [counterparty, setCounterparty] = useState('');
  const [category, setCategory] = useState('Inventory Procurement');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<
    'UPI' | 'Bank Transfer' | 'Card' | 'Cash' | 'Auto-Debit'
  >('Bank Transfer');
  const [status, setStatus] = useState<TransactionStatus>('completed');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  React.useEffect(() => {
    if (addTransactionOpen) {
      setDate(isBackendMode ? new Date().toISOString().slice(0, 10) : REFERENCE_TODAY);
      setError('');
    }
  }, [addTransactionOpen, isBackendMode]);

  const categories = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  const handleTypeSwitch = (nextType: TransactionType) => {
    setType(nextType);
    setCategory(
      nextType === 'income' ? INCOME_CATEGORIES[0] : EXPENSE_CATEGORIES[0]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numericAmount = Number(amount);
    if (!description.trim() || !numericAmount || numericAmount <= 0) {
      setError('Enter a valid description and positive amount.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      await addTransaction({
        date,
        description: description.trim(),
        counterparty: counterparty.trim() || 'General Counterparty',
        category,
        type,
        amount: numericAmount,
        paymentMethod,
        status,
        reference: `TX-${Math.floor(10000 + Math.random() * 89999)}`,
      });

      setDescription('');
      setCounterparty('');
      setAmount('');
      setError('');
      setAddTransactionOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to save transaction.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={addTransactionOpen}
      onClose={() => setAddTransactionOpen(false)}
      title="Record Transaction"
      subtitle={`Add an entry to ${activeBusiness.name} (${activeBusiness.currency})`}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-slate-100 dark:bg-white/[0.04]">
          <button
            type="button"
            onClick={() => handleTypeSwitch('income')}
            className={`py-2 text-xs font-medium rounded-md transition-colors ${
              type === 'income'
                ? 'bg-white dark:bg-[#2e4152] text-emerald-600 dark:text-emerald-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Income / Inflow
          </button>
          <button
            type="button"
            onClick={() => handleTypeSwitch('expense')}
            className={`py-2 text-xs font-medium rounded-md transition-colors ${
              type === 'expense'
                ? 'bg-white dark:bg-[#2e4152] text-rose-600 dark:text-rose-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Expense / Outflow
          </button>
        </div>

        {error && (
          <div className="p-2.5 rounded-lg bg-rose-500/10 text-xs text-rose-600 dark:text-rose-400">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <label htmlFor="tx-amount" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Amount ({activeBusiness.currency}) *
            </label>
            <input
              id="tx-amount"
              type="number"
              min="1"
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="25000"
              className="w-full px-3 py-2 text-sm font-mono-num rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] text-slate-900 dark:text-slate-100"
            />
          </div>
          <div>
            <label htmlFor="tx-date" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Date
            </label>
            <input
              id="tx-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono-num rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] text-slate-900 dark:text-slate-100"
            />
          </div>
        </div>

        <div>
          <label htmlFor="tx-description" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
            Description *
          </label>
          <input
            id="tx-description"
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={
              type === 'income'
                ? 'e.g., Weekend Store POS Settlement'
                : 'e.g., Fresh Produce Batch Restock'
            }
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] text-slate-900 dark:text-slate-100"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <label htmlFor="tx-counterparty" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Counterparty / Vendor
            </label>
            <input
              id="tx-counterparty"
              type="text"
              value={counterparty}
              onChange={(e) => setCounterparty(e.target.value)}
              placeholder="e.g., Sahyadri Agro Farms"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] text-slate-900 dark:text-slate-100"
            />
          </div>
          <div>
            <label htmlFor="tx-category" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Category
            </label>
            <select
              id="tx-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#22323f] text-slate-900 dark:text-slate-100"
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <label htmlFor="tx-payment" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Payment Method
            </label>
            <select
              id="tx-payment"
              value={paymentMethod}
              onChange={(e) =>
                setPaymentMethod(
                  e.target.value as 'UPI' | 'Bank Transfer' | 'Card' | 'Cash' | 'Auto-Debit'
                )
              }
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#22323f] text-slate-900 dark:text-slate-100"
            >
              <option value="UPI">UPI</option>
              <option value="Bank Transfer">Bank Transfer</option>
              <option value="Card">Card</option>
              <option value="Cash">Cash</option>
              <option value="Auto-Debit">Auto-Debit</option>
            </select>
          </div>
          <div>
            <label htmlFor="tx-status" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Status
            </label>
            <select
              id="tx-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as TransactionStatus)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#22323f] text-slate-900 dark:text-slate-100"
            >
              <option value="completed">Completed</option>
              <option value="pending">Pending</option>
              <option value="scheduled">Scheduled Future</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200 dark:border-white/8">
          <button
            type="button"
            disabled={submitting}
            onClick={() => setAddTransactionOpen(false)}
            className="px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 text-xs font-medium rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white"
          >
            {submitting ? 'Saving...' : 'Save Transaction'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
