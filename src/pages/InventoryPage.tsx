import React, { useState } from 'react';
import { Package, Plus, RefreshCw, Search } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { REFERENCE_TODAY } from '../data/mockBusinesses';
import { formatCurrency } from '../utils/formatters';
import { DataOriginTag } from '../components/common/DataOriginTag';
import { EmptyState } from '../components/common/EmptyState';
import { Modal } from '../components/common/Modal';

export function InventoryPage() {
  const {
    activeBusiness,
    businessInventory,
    addInventoryItem,
    restockInventoryItem,
    isBackendMode,
    showToast,
  } = useApp();

  const [filter, setFilter] = useState<'all' | 'low'>('all');
  const [search, setSearch] = useState('');
  const [addModalOpen, setAddModalOpen] = useState(false);

  // Add item form state
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('General Stock');
  const [currentStock, setCurrentStock] = useState('20');
  const [reorderPoint, setReorderPoint] = useState('15');
  const [unit, setUnit] = useState('units');
  const [unitCost, setUnitCost] = useState('500');
  const [sellingPrice, setSellingPrice] = useState('780');
  const [supplier, setSupplier] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const c = activeBusiness.currency;

  const totalValue = businessInventory.reduce(
    (s, i) => s + i.currentStock * i.unitCost,
    0
  );
  const lowStockItems = businessInventory.filter(
    (i) => i.currentStock <= i.reorderPoint
  );

  const filtered = businessInventory.filter((item) => {
    if (filter === 'low' && item.currentStock > item.reorderPoint) return false;
    const q = search.trim().toLowerCase();
    if (
      q &&
      !item.name.toLowerCase().includes(q) &&
      !item.sku.toLowerCase().includes(q) &&
      !item.supplier.toLowerCase().includes(q)
    ) {
      return false;
    }
    return true;
  });

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      await addInventoryItem({
        sku: sku.trim() || `SKU-${Math.floor(100 + Math.random() * 899)}`,
        name: name.trim(),
        category: category.trim() || 'General Stock',
        currentStock: Math.max(0, Number(currentStock) || 0),
        reorderPoint: Math.max(1, Number(reorderPoint) || 10),
        unit: unit.trim() || 'units',
        unitCost: Math.max(1, Number(unitCost) || 100),
        sellingPrice: Math.max(0, Number(sellingPrice) || 0),
        supplier: supplier.trim() || 'Primary Supplier',
        leadTimeDays: 3,
        lastRestocked: isBackendMode ? new Date().toISOString().slice(0, 10) : REFERENCE_TODAY,
      });
      setSku('');
      setName('');
      setSupplier('');
      setAddModalOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to save inventory SKU.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRestock = (itemId: string, qty: number) => {
    restockInventoryItem(itemId, qty).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Unable to restock item.';
      showToast(msg, 'warning');
    });
  };

  return (
    <div className="space-y-6">
      {/* Header Summary */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-white/8">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              {activeBusiness.name} Inventory
            </span>
            <span aria-hidden="true">·</span>
            <DataOriginTag kind={isBackendMode ? 'ACTUAL' : 'demo'} />
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-5 text-xs font-mono-num">
            <span className="text-slate-700 dark:text-slate-200">
              Total Stock Value: <strong>{formatCurrency(totalValue, c)}</strong>
            </span>
            <span className="text-slate-500 dark:text-slate-400">
              Tracked SKUs: {businessInventory.length}
            </span>
            <span
              className={
                lowStockItems.length > 0
                  ? 'text-amber-600 dark:text-amber-400 font-semibold'
                  : 'text-emerald-600 dark:text-emerald-400'
              }
            >
              Low-Stock Alerts: {lowStockItems.length}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setAddModalOpen(true)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium self-start lg:self-auto"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Product SKU
        </button>
      </div>

      {/* Reorder Recommendations Strip */}
      {lowStockItems.length > 0 && (
        <div className="rounded-xl p-4 bg-white dark:bg-[#22323f] border border-slate-200 dark:border-white/8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              Reorder Recommendations ({lowStockItems.length} items below threshold)
            </h2>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              Restocking updates inventory and logs an operating procurement expense
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {lowStockItems.slice(0, 3).map((item) => {
              const recommendedQty = Math.max(10, item.reorderPoint * 2 - item.currentStock);
              return (
                <div
                  key={item.id}
                  className="p-3 rounded-lg bg-slate-50 dark:bg-white/[0.03] flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                      {item.name}
                    </div>
                    <div className="text-[11px] font-mono-num text-amber-600 dark:text-amber-400">
                      {item.currentStock} / {item.reorderPoint} {item.unit} · {item.leadTimeDays}d lead
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRestock(item.id, recommendedQty)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-violet-600 hover:bg-violet-700 text-white text-[11px] font-medium shrink-0"
                  >
                    <RefreshCw className="w-3 h-3" />
                    +{recommendedQty}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filter & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="inline-flex p-1 rounded-lg bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/8 text-xs self-start">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`px-3 py-1 rounded-md font-medium ${
              filter === 'all'
                ? 'bg-white dark:bg-[#2e4152] text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            All SKUs ({businessInventory.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('low')}
            className={`px-3 py-1 rounded-md font-medium ${
              filter === 'low'
                ? 'bg-white dark:bg-[#2e4152] text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            Low Stock ({lowStockItems.length})
          </button>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search SKU, product, supplier..."
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#22323f] text-slate-900 dark:text-slate-100"
          />
        </div>
      </div>

      {/* Product Table */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No inventory SKUs match"
          description="Try clearing your filter or add a new SKU to monitor stock levels and reorder points."
          actionLabel="Add Product SKU"
          onAction={() => setAddModalOpen(true)}
        />
      ) : (
        <div className="rounded-xl bg-white dark:bg-[#22323f] border border-slate-200 dark:border-white/8 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-white/8 text-[11px] font-medium text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-white/[0.02]">
                  <th className="py-2.5 px-5">SKU / Product</th>
                  <th className="py-2.5 px-4">Supplier</th>
                  <th className="py-2.5 px-4 text-right">Stock Level</th>
                  <th className="py-2.5 px-4 text-right">Unit Cost</th>
                  <th className="py-2.5 px-4 text-right">Stock Value</th>
                  <th className="py-2.5 px-5 text-right">Reorder</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/[0.05] text-xs">
                {filtered.map((item) => {
                  const isLow = item.currentStock <= item.reorderPoint;
                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-50 dark:hover:bg-white/[0.02]"
                    >
                      <td className="py-3 px-5">
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {item.name}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono-num">
                          {item.sku} · {item.category}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                        <div>{item.supplier}</div>
                        <div className="text-[11px] text-slate-400">
                          Lead time: {item.leadTimeDays} days
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono-num whitespace-nowrap">
                        <div
                          className={`font-semibold ${
                            isLow
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {item.currentStock} {item.unit}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {isLow ? 'Low Stock' : 'Nominal'} (min {item.reorderPoint})
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono-num text-slate-700 dark:text-slate-300">
                        {formatCurrency(item.unitCost, c)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-num font-semibold text-slate-900 dark:text-slate-100">
                        {formatCurrency(item.currentStock * item.unitCost, c)}
                      </td>
                      <td className="py-3 px-5 text-right">
                        <button
                          type="button"
                          onClick={() => handleRestock(item.id, 20)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 dark:border-white/10 text-[11px] font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.05]"
                        >
                          <RefreshCw className="w-3 h-3" />
                          Restock +20
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

      {/* Add Product Modal */}
      <Modal
        open={addModalOpen}
        onClose={() => {
          if (!submitting) {
            setAddModalOpen(false);
            setError('');
          }
        }}
        title="Add Inventory SKU"
        subtitle={`Track stock levels and valuation for ${activeBusiness.name}`}
      >
        <form onSubmit={handleCreateProduct} className="space-y-4">
          {error && (
            <div className="p-2.5 rounded-lg bg-rose-500/10 text-xs text-rose-600 dark:text-rose-400">
              {error}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Product Name *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Organic Basmati Rice (10kg)"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">SKU Code</label>
              <input
                type="text"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="e.g., KFM-GRN-18"
                className="w-full px-3 py-2 text-xs font-mono-num rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Category</label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Supplier</label>
              <input
                type="text"
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                placeholder="e.g., Deccan Grain Distributors"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Current Stock</label>
              <input
                type="number"
                value={currentStock}
                onChange={(e) => setCurrentStock(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono-num rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Reorder Threshold</label>
              <input
                type="number"
                value={reorderPoint}
                onChange={(e) => setReorderPoint(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono-num rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Unit Cost ({c})</label>
              <input
                type="number"
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono-num rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Unit Label</label>
              <input
                type="text"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04]"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-white/8">
            <button
              type="button"
              disabled={submitting}
              onClick={() => setAddModalOpen(false)}
              className="px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-white/10"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-xs font-medium rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white"
            >
              {submitting ? 'Saving...' : 'Save SKU'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
