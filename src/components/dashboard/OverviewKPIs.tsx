import React from 'react';
import { useApp } from '../../context/AppContext';
import { KpiSummary, TimeSeriesPoint } from '../../services/financialService';
import { formatCurrency } from '../../utils/formatters';
import { StatCard } from '../common/StatCard';

interface OverviewKPIsProps {
  kpi: KpiSummary;
  series: TimeSeriesPoint[];
}

export function OverviewKPIs({ kpi, series }: OverviewKPIsProps) {
  const { activeBusiness, navigate } = useApp();
  const c = activeBusiness.currency;

  const revSpark = series.map((p) => ({ value: p.revenue }));
  const expSpark = series.map((p) => ({ value: p.expenses }));
  const profitSpark = series.map((p) => ({ value: p.profit }));
  const cashSpark = series.map((p) => ({ value: p.cumulativeCash }));

  return (
    <section aria-label="Key Financial Indicators" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
      <StatCard
        title="Total Revenue"
        value={formatCurrency(kpi.totalRevenue, c, { compact: true })}
        previousValueLabel={`Prev: ${formatCurrency(kpi.prevRevenue, c, { compact: true })}`}
        changePct={kpi.revenueChangePct}
        positiveIsGood
        sparkline={revSpark}
        sparklineColor="#34495e"
        onClick={() => navigate('transactions')}
      />
      <StatCard
        title="Total Expenses"
        value={formatCurrency(kpi.totalExpenses, c, { compact: true })}
        previousValueLabel={`Prev: ${formatCurrency(kpi.prevExpenses, c, { compact: true })}`}
        changePct={kpi.expensesChangePct}
        positiveIsGood={false}
        sparkline={expSpark}
        sparklineColor="#647c8e"
        onClick={() => navigate('transactions')}
      />
      <StatCard
        title="Net Profit"
        value={formatCurrency(kpi.netProfit, c, { compact: true })}
        previousValueLabel={`Prev: ${formatCurrency(kpi.prevNetProfit, c, { compact: true })}`}
        changePct={kpi.netProfitChangePct}
        positiveIsGood
        sparkline={profitSpark}
        sparklineColor="#5c8a70"
        onClick={() => navigate('reports')}
      />
      <StatCard
        title="Available Cash"
        value={formatCurrency(kpi.availableCash, c, { compact: true })}
        previousValueLabel={`Prev: ${formatCurrency(kpi.prevCash, c, { compact: true })}`}
        changePct={kpi.cashChangePct}
        positiveIsGood
        sparkline={cashSpark}
        sparklineColor="#91a6b5"
        onClick={() => navigate('cash-flow')}
      />
      <StatCard
        title="Outstanding Receivables"
        value={formatCurrency(kpi.outstandingReceivables, c, { compact: true })}
        previousValueLabel={`Overdue: ${formatCurrency(kpi.overdueReceivables, c, { compact: true })}`}
        changePct={kpi.receivablesChangePct}
        positiveIsGood={false}
        onClick={() => navigate('invoices')}
      />
      <StatCard
        title="Upcoming Payables"
        value={formatCurrency(kpi.upcomingPayables, c, { compact: true })}
        previousValueLabel="Scheduled + accrued tax"
        changePct={kpi.payablesChangePct}
        positiveIsGood={false}
        onClick={() => navigate('cash-flow')}
      />
    </section>
  );
}
