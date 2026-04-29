import api from '@/utils/axios';
import { Document, ChatMessage } from '@/types';

const PROJECT_ID = import.meta.env.VITE_PROJECT_ID || 'local-workspace';

export const documentService = {
  getAll: async (): Promise<Document[]> => {
    const response = await api.get<{ items: any[] }>('/v1/artifacts', {
      params: { project_id: PROJECT_ID },
    });
    return (response.data.items || []).map((item: any) => ({
      id: String(item.id),
      document_id: String(item.id),
      filename: item.filename,
      file_path: '',
      file_size: 0,
      upload_date: item.created_at,
      uploaded_by: 'user',
      embedding_status: 'completed',
      mapping_status: 'completed',
      status: item.is_deleted ? 'deleted' : 'processed',
      document_type: item.kind,
      created_at: item.created_at,
      is_processed: true,
      metadata: item,
    }));
  },

  upload: async (file: File): Promise<Document> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('project_id', PROJECT_ID);
    formData.append('kind', 'fca');
    const response = await api.post<any>('/v1/files/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return {
      id: String(response.data.artifact_id),
      document_id: String(response.data.artifact_id),
      filename: response.data.filename,
      file_path: '',
      file_size: 0,
      upload_date: new Date().toISOString(),
      uploaded_by: 'user',
      embedding_status: 'completed',
      mapping_status: 'completed',
      status: 'processed',
      document_type: response.data.kind,
      created_at: new Date().toISOString(),
      is_processed: true,
      metadata: response.data,
    };
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/v1/artifacts/${id}`, { params: { project_id: PROJECT_ID } });
  },

  vectorize: async (id: string): Promise<{ message: string }> => {
    const response = await api.post(`/api/documents/vectorize/${id}`);
    return response.data;
  },

  getEmbeddingStatus: async (id: string): Promise<{ status: string }> => {
    const response = await api.get(`/api/documents/${id}/embedding-status`);
    return response.data;
  },

  chat: async (documentId: string, message: string): Promise<ChatMessage> => {
    const response = await api.post<ChatMessage>(`/api/documents/${documentId}/chat`, { message });
    return response.data;
  },

  getChatHistory: async (documentId: string): Promise<ChatMessage[]> => {
    const response = await api.get<ChatMessage[]>(`/api/documents/${documentId}/chat-history`);
    return response.data;
  },

  getStats: async (): Promise<{
    total_files: number;
    vectorized_files: number;
    uploaded_files: number;
    total_size_bytes: number;
    total_size_formatted: string;
  }> => {
    const response = await api.get('/api/documents/stats', { params: { project_id: PROJECT_ID } });
    return response.data;
  },
};
