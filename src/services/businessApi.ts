import {
  ApiAuditLog,
  ApiBusiness,
  ApiBusinessCreatePayload,
  ApiBusinessDetail,
  ApiBusinessMember,
  ApiBusinessUpdatePayload,
  ApiMembershipAddPayload,
  ApiMembershipRemoveResponse,
  ApiMembershipRoleUpdatePayload,
} from '../types/api';
import { apiRequest } from './apiClient';

export const businessApi = {
  async listBusinesses(): Promise<ApiBusiness[]> {
    return apiRequest<ApiBusiness[]>('/businesses', { method: 'GET' });
  },

  async createBusiness(payload: ApiBusinessCreatePayload): Promise<ApiBusinessDetail> {
    return apiRequest<ApiBusinessDetail>('/businesses', {
      method: 'POST',
      body: payload,
    });
  },

  async getBusiness(businessId: string): Promise<ApiBusinessDetail> {
    return apiRequest<ApiBusinessDetail>(`/businesses/${encodeURIComponent(businessId)}`, {
      method: 'GET',
    });
  },

  async updateBusiness(
    businessId: string,
    payload: ApiBusinessUpdatePayload
  ): Promise<ApiBusinessDetail> {
    return apiRequest<ApiBusinessDetail>(`/businesses/${encodeURIComponent(businessId)}`, {
      method: 'PATCH',
      body: payload,
    });
  },

  async switchBusiness(businessId: string): Promise<ApiBusinessDetail> {
    return apiRequest<ApiBusinessDetail>(
      `/businesses/${encodeURIComponent(businessId)}/switch`,
      {
        method: 'POST',
      }
    );
  },

  async listMembers(businessId: string): Promise<ApiBusinessMember[]> {
    return apiRequest<ApiBusinessMember[]>(
      `/businesses/${encodeURIComponent(businessId)}/members`,
      {
        method: 'GET',
      }
    );
  },

  async addMember(
    businessId: string,
    payload: ApiMembershipAddPayload
  ): Promise<ApiBusinessMember> {
    return apiRequest<ApiBusinessMember>(
      `/businesses/${encodeURIComponent(businessId)}/members`,
      {
        method: 'POST',
        body: payload,
      }
    );
  },

  async updateMemberRole(
    businessId: string,
    membershipId: string,
    payload: ApiMembershipRoleUpdatePayload
  ): Promise<ApiBusinessMember> {
    return apiRequest<ApiBusinessMember>(
      `/businesses/${encodeURIComponent(businessId)}/members/${encodeURIComponent(membershipId)}`,
      {
        method: 'PATCH',
        body: payload,
      }
    );
  },

  async removeMember(
    businessId: string,
    membershipId: string
  ): Promise<ApiMembershipRemoveResponse> {
    return apiRequest<ApiMembershipRemoveResponse>(
      `/businesses/${encodeURIComponent(businessId)}/members/${encodeURIComponent(membershipId)}`,
      {
        method: 'DELETE',
      }
    );
  },

  async listAuditLogs(businessId: string, limit = 50): Promise<ApiAuditLog[]> {
    return apiRequest<ApiAuditLog[]>(
      `/businesses/${encodeURIComponent(businessId)}/audit-logs?limit=${limit}`,
      {
        method: 'GET',
      }
    );
  },
};
