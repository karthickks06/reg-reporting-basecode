import axios from '@/utils/axios';

export interface LLMConfig {
  id: number;
  provider: string;
  name: string;
  api_endpoint: string | null;
  deployment_name: string | null;
  api_version: string | null;
  model_name: string;
  temperature: number;
  max_tokens: number;
  top_p: number;
  additional_params: Record<string, any> | null;
  is_active: boolean;
  created_at: string;
  updated_at: string | null;
  updated_by: number | null;
  api_key_masked: string;
}

export interface LLMConfigCreate {
  provider: string;
  name: string;
  api_endpoint?: string;
  api_key: string;
  deployment_name?: string;
  api_version?: string;
  model_name: string;
  temperature: number;
  max_tokens: number;
  top_p: number;
  additional_params?: Record<string, any>;
}

export interface LLMConfigUpdate {
  name?: string;
  api_endpoint?: string;
  api_key?: string;
  deployment_name?: string;
  api_version?: string;
  model_name?: string;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  additional_params?: Record<string, any>;
  is_active?: boolean;
}

export interface LLMProviderInfo {
  provider: string;
  display_name: string;
  description: string;
  requires_endpoint: boolean;
  requires_deployment: boolean;
  requires_api_version: boolean;
  example_models: string[];
}

export interface LLMConfigTestResponse {
  success: boolean;
  message: string;
  response_content?: string;
  execution_time?: number;
  token_usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export const llmConfigService = {
  async getSupportedProviders(): Promise<LLMProviderInfo[]> {
    const response = await axios.get('/api/llm-config/providers');
    return response.data;
  },

  async getAllConfigs(): Promise<LLMConfig[]> {
    const response = await axios.get('/api/llm-config/');
    return response.data;
  },

  async getCurrentConfig(): Promise<LLMConfig> {
    const response = await axios.get('/api/llm-config/current');
    return response.data;
  },

  async createConfig(data: LLMConfigCreate): Promise<LLMConfig> {
    const response = await axios.post('/api/llm-config/', data);
    return response.data;
  },

  async updateConfig(configId: number, data: LLMConfigUpdate): Promise<LLMConfig> {
    const response = await axios.put(`/api/llm-config/${configId}`, data);
    return response.data;
  },

  async activateConfig(configId: number): Promise<LLMConfig> {
    const response = await axios.post(`/api/llm-config/${configId}/activate`);
    return response.data;
  },

  async deleteConfig(configId: number): Promise<void> {
    await axios.delete(`/api/llm-config/${configId}`);
  },

  async testConfig(testPrompt?: string): Promise<LLMConfigTestResponse> {
    const response = await axios.post('/api/llm-config/test', {
      test_prompt: testPrompt || "Hello, please respond with 'Configuration test successful!'"
    });
    return response.data;
  },

  async getConfigHistory(): Promise<LLMConfig[]> {
    const response = await axios.get('/api/llm-config/history');
    return response.data;
  }
};
