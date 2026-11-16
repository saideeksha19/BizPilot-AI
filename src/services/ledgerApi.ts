import {
  ApiCategory,
  ApiCustomer,
  ApiInventoryProduct,
  ApiInventoryProductCreatePayload,
  ApiInventoryRestockPayload,
  ApiInvoiceCreatePayload,
  ApiInvoiceDetail,
  ApiInvoiceSummary,
  ApiPaginatedResponse,
  ApiPayment,
  ApiPaymentCreatePayload,
  ApiStockMovement,
  ApiSupplier,
  ApiTransaction,
  ApiTransactionCreatePayload,
} from '../types/api';
import { apiRequest, getApiBaseUrl, getAuthToken } from './apiClient';

export const ledgerApi = {
  async listCategories(businessId: string): Promise<ApiCategory[]> {
    return apiRequest<ApiCategory[]>(
      `/businesses/${encodeURIComponent(businessId)}/categories`,
      { method: 'GET' }
    );
  },

  async createCategory(
    businessId: string,
    payload: { name: string; type: 'income' | 'expense'; is_operating?: boolean }
  ): Promise<ApiCategory> {
    return apiRequest<ApiCategory>(
      `/businesses/${encodeURIComponent(businessId)}/categories`,
      { method: 'POST', body: payload }
    );
  },

  async listTransactions(
    businessId: string,
    page = 1,
    pageSize = 100
  ): Promise<ApiPaginatedResponse<ApiTransaction>> {
    return apiRequest<ApiPaginatedResponse<ApiTransaction>>(
      `/businesses/${encodeURIComponent(businessId)}/transactions?page=${page}&page_size=${pageSize}`,
      { method: 'GET' }
    );
  },

  async createTransaction(
    businessId: string,
    payload: ApiTransactionCreatePayload
  ): Promise<ApiTransaction> {
    return apiRequest<ApiTransaction>(
      `/businesses/${encodeURIComponent(businessId)}/transactions`,
      { method: 'POST', body: payload }
    );
  },

  async deleteTransaction(businessId: string, transactionId: string): Promise<void> {
    await apiRequest<{ detail: string }>(
      `/businesses/${encodeURIComponent(businessId)}/transactions/${encodeURIComponent(transactionId)}`,
      { method: 'DELETE' }
    );
  },

  async reverseTransaction(
    businessId: string,
    transactionId: string,
    reason: string
  ): Promise<ApiTransaction> {
    return apiRequest<ApiTransaction>(
      `/businesses/${encodeURIComponent(businessId)}/transactions/${encodeURIComponent(transactionId)}/reverse`,
      { method: 'POST', body: { reason } }
    );
  },

  async exportTransactionsCsv(businessId: string): Promise<Blob> {
    const token = getAuthToken();
    const res = await fetch(
      `${getApiBaseUrl()}/businesses/${encodeURIComponent(businessId)}/transactions/export-csv`,
      {
        method: 'GET',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }
    );
    if (!res.ok) {
      throw new Error(`CSV export failed with status ${res.status}`);
    }
    return res.blob();
  },

  async listCustomers(
    businessId: string,
    page = 1,
    pageSize = 100
  ): Promise<ApiPaginatedResponse<ApiCustomer>> {
    return apiRequest<ApiPaginatedResponse<ApiCustomer>>(
      `/businesses/${encodeURIComponent(businessId)}/customers?page=${page}&page_size=${pageSize}`,
      { method: 'GET' }
    );
  },

  async createCustomer(
    businessId: string,
    payload: { name: string; email?: string | null; phone?: string | null }
  ): Promise<ApiCustomer> {
    return apiRequest<ApiCustomer>(
      `/businesses/${encodeURIComponent(businessId)}/customers`,
      { method: 'POST', body: payload }
    );
  },

  async listSuppliers(
    businessId: string,
    page = 1,
    pageSize = 100
  ): Promise<ApiPaginatedResponse<ApiSupplier>> {
    return apiRequest<ApiPaginatedResponse<ApiSupplier>>(
      `/businesses/${encodeURIComponent(businessId)}/suppliers?page=${page}&page_size=${pageSize}`,
      { method: 'GET' }
    );
  },

  async createSupplier(
    businessId: string,
    payload: { name: string; default_lead_time_days?: number }
  ): Promise<ApiSupplier> {
    return apiRequest<ApiSupplier>(
      `/businesses/${encodeURIComponent(businessId)}/suppliers`,
      { method: 'POST', body: payload }
    );
  },

  async listInvoices(
    businessId: string,
    page = 1,
    pageSize = 100
  ): Promise<ApiPaginatedResponse<ApiInvoiceSummary>> {
    return apiRequest<ApiPaginatedResponse<ApiInvoiceSummary>>(
      `/businesses/${encodeURIComponent(businessId)}/invoices?page=${page}&page_size=${pageSize}`,
      { method: 'GET' }
    );
  },

  async createInvoice(
    businessId: string,
    payload: ApiInvoiceCreatePayload
  ): Promise<ApiInvoiceDetail> {
    return apiRequest<ApiInvoiceDetail>(
      `/businesses/${encodeURIComponent(businessId)}/invoices`,
      { method: 'POST', body: payload }
    );
  },

  async updateInvoiceStatus(
    businessId: string,
    invoiceId: string,
    status: 'draft' | 'pending' | 'overdue' | 'void'
  ): Promise<ApiInvoiceDetail> {
    return apiRequest<ApiInvoiceDetail>(
      `/businesses/${encodeURIComponent(businessId)}/invoices/${encodeURIComponent(invoiceId)}`,
      { method: 'PATCH', body: { status } }
    );
  },

  async createPayment(
    businessId: string,
    payload: ApiPaymentCreatePayload,
    idempotencyKey?: string
  ): Promise<ApiPayment> {
    return apiRequest<ApiPayment>(
      `/businesses/${encodeURIComponent(businessId)}/payments`,
      {
        method: 'POST',
        body: payload,
        headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
      }
    );
  },

  async listProducts(
    businessId: string,
    page = 1,
    pageSize = 100
  ): Promise<ApiPaginatedResponse<ApiInventoryProduct>> {
    return apiRequest<ApiPaginatedResponse<ApiInventoryProduct>>(
      `/businesses/${encodeURIComponent(businessId)}/inventory/products?page=${page}&page_size=${pageSize}`,
      { method: 'GET' }
    );
  },

  async createProduct(
    businessId: string,
    payload: ApiInventoryProductCreatePayload
  ): Promise<ApiInventoryProduct> {
    return apiRequest<ApiInventoryProduct>(
      `/businesses/${encodeURIComponent(businessId)}/inventory/products`,
      { method: 'POST', body: payload }
    );
  },

  async restockProduct(
    businessId: string,
    productId: string,
    payload: ApiInventoryRestockPayload,
    idempotencyKey?: string
  ): Promise<ApiStockMovement> {
    return apiRequest<ApiStockMovement>(
      `/businesses/${encodeURIComponent(businessId)}/inventory/products/${encodeURIComponent(productId)}/restock`,
      {
        method: 'POST',
        body: payload,
        headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
      }
    );
  },
};
