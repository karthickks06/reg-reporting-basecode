import api from '@/utils/axios';
import { GraphData } from '@/types';

const PROJECT_ID = import.meta.env.VITE_PROJECT_ID || 'local-workspace';

export const graphService = {
  getGraphData: async (): Promise<GraphData> => {
    const response = await api.get<GraphData>('/api/graph', { params: { project_id: PROJECT_ID } });
    return response.data;
  },

  getNodeDetails: async (nodeId: string): Promise<any> => {
    const response = await api.get(`/api/graph/nodes/${nodeId}`);
    return response.data;
  },

  getRelationships: async (nodeId: string): Promise<any[]> => {
    const response = await api.get(`/api/graph/nodes/${nodeId}/relationships`);
    return response.data;
  },

  searchNodes: async (query: string): Promise<any[]> => {
    const response = await api.get(`/api/graph/search`, { params: { q: query, project_id: PROJECT_ID } });
    return response.data;
  },
};
