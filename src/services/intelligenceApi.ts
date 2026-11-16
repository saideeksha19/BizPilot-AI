import {
  ApiAlertSeverity,
  ApiCashFlowForecast,
  ApiFinancialAlert,
  ApiFinancialHealth,
  ApiFinancialSummary,
  ApiFinancialTwin,
  ApiPaginatedResponse,
  ApiSimulationCompareResponse,
  ApiSimulationCreatePayload,
  ApiSimulationScenario,
} from '../types/api';
import { apiRequest } from './apiClient';

export function parseApiDecimal(value: string | number | null | undefined, fallback = 0): number {
  if (value === null || value === undefined) return fallback;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const intelligenceApi = {
  getFinancialSummary(
    businessId: string,
    params?: { preset?: string; startDate?: string; endDate?: string; asOfDate?: string }
  ): Promise<ApiFinancialSummary> {
    const search = new URLSearchParams();
    if (params?.preset) search.set('preset', params.preset);
    if (params?.preset === 'custom' && params.startDate && params.endDate) {
      search.set('start_date', params.startDate);
      search.set('end_date', params.endDate);
    }
    if (params?.asOfDate) search.set('as_of_date', params.asOfDate);
    const qs = search.toString();
    return apiRequest<ApiFinancialSummary>(
      `/businesses/${businessId}/financial-summary${qs ? `?${qs}` : ''}`
    );
  },

  getFinancialTwin(businessId: string, asOfDate?: string): Promise<ApiFinancialTwin> {
    const qs = asOfDate ? `?as_of_date=${encodeURIComponent(asOfDate)}` : '';
    return apiRequest<ApiFinancialTwin>(`/businesses/${businessId}/financial-twin${qs}`);
  },

  getCashFlowForecast(businessId: string, asOfDate?: string): Promise<ApiCashFlowForecast> {
    const qs = asOfDate ? `?as_of_date=${encodeURIComponent(asOfDate)}` : '';
    return apiRequest<ApiCashFlowForecast>(`/businesses/${businessId}/cash-flow-forecast${qs}`);
  },

  getFinancialHealth(businessId: string, asOfDate?: string): Promise<ApiFinancialHealth> {
    const qs = asOfDate ? `?as_of_date=${encodeURIComponent(asOfDate)}` : '';
    return apiRequest<ApiFinancialHealth>(`/businesses/${businessId}/financial-health${qs}`);
  },

  listAlerts(
    businessId: string,
    params?: {
      severity?: ApiAlertSeverity;
      isAcknowledged?: boolean;
      page?: number;
      pageSize?: number;
      refresh?: boolean;
    }
  ): Promise<ApiPaginatedResponse<ApiFinancialAlert>> {
    const search = new URLSearchParams();
    if (params?.severity) search.set('severity', params.severity);
    if (params?.isAcknowledged !== undefined) {
      search.set('is_acknowledged', String(params.isAcknowledged));
    }
    if (params?.page) search.set('page', String(params.page));
    if (params?.pageSize) search.set('page_size', String(params.pageSize));
    if (params?.refresh !== undefined) search.set('refresh', String(params.refresh));
    const qs = search.toString();
    return apiRequest<ApiPaginatedResponse<ApiFinancialAlert>>(
      `/businesses/${businessId}/alerts${qs ? `?${qs}` : ''}`
    );
  },

  acknowledgeAlert(
    businessId: string,
    alertId: string,
    isAcknowledged: boolean
  ): Promise<ApiFinancialAlert> {
    return apiRequest<ApiFinancialAlert>(`/businesses/${businessId}/alerts/${alertId}`, {
      method: 'PATCH',
      body: { is_acknowledged: isAcknowledged },
    });
  },

  runSimulation(
    businessId: string,
    payload: ApiSimulationCreatePayload
  ): Promise<ApiSimulationScenario> {
    return apiRequest<ApiSimulationScenario>(`/businesses/${businessId}/simulations`, {
      method: 'POST',
      body: payload,
    });
  },

  listSimulations(
    businessId: string,
    page = 1,
    pageSize = 25
  ): Promise<ApiPaginatedResponse<ApiSimulationScenario>> {
    return apiRequest<ApiPaginatedResponse<ApiSimulationScenario>>(
      `/businesses/${businessId}/simulations?page=${page}&page_size=${pageSize}`
    );
  },

  getSimulation(businessId: string, simulationId: string): Promise<ApiSimulationScenario> {
    return apiRequest<ApiSimulationScenario>(
      `/businesses/${businessId}/simulations/${simulationId}`
    );
  },

  compareSimulations(
    businessId: string,
    scenarioIds: string[]
  ): Promise<ApiSimulationCompareResponse> {
    return apiRequest<ApiSimulationCompareResponse>(
      `/businesses/${businessId}/simulations/compare`,
      {
        method: 'POST',
        body: { scenario_ids: scenarioIds },
      }
    );
  },
};
