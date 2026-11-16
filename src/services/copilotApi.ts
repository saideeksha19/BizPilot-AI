import {
  ApiCopilotChatRequest,
  ApiCopilotChatResponse,
  ApiCopilotConversationDetail,
  ApiCopilotConversationSummary,
  ApiCopilotDeleteResponse,
  ApiPaginatedResponse,
} from '../types/api';
import { apiRequest } from './apiClient';

export const copilotApi = {
  chat(businessId: string, payload: ApiCopilotChatRequest): Promise<ApiCopilotChatResponse> {
    return apiRequest<ApiCopilotChatResponse>(`/businesses/${businessId}/copilot/chat`, {
      method: 'POST',
      body: payload,
    });
  },

  listConversations(
    businessId: string,
    page = 1,
    pageSize = 20
  ): Promise<ApiPaginatedResponse<ApiCopilotConversationSummary>> {
    return apiRequest<ApiPaginatedResponse<ApiCopilotConversationSummary>>(
      `/businesses/${businessId}/copilot/conversations?page=${page}&page_size=${pageSize}`
    );
  },

  getConversation(
    businessId: string,
    conversationId: string
  ): Promise<ApiCopilotConversationDetail> {
    return apiRequest<ApiCopilotConversationDetail>(
      `/businesses/${businessId}/copilot/conversations/${conversationId}`
    );
  },

  deleteConversation(
    businessId: string,
    conversationId: string
  ): Promise<ApiCopilotDeleteResponse> {
    return apiRequest<ApiCopilotDeleteResponse>(
      `/businesses/${businessId}/copilot/conversations/${conversationId}`,
      {
        method: 'DELETE',
      }
    );
  },
};
