/**
 * Data Model Service
 * 
 * Handles all API interactions for the Model Library feature.
 */

import axios from '../utils/axios';

const PROJECT_ID = import.meta.env.VITE_PROJECT_ID || 'local-workspace';

export interface DataModel {
  id: number;
  name: string;
  version: string;
  description?: string;
  model_type?: string;
  domain?: string;
  status: string;
  source_file_type: string;
  source_file_name: string;
  tags?: string[];
  created_at: string;
  updated_at?: string;
  table_count?: number;
  primary_key_count?: number;
  foreign_key_count?: number;
}

export interface DataModelDetail extends DataModel {
  model_metadata?: any;
  tables: DataModelTable[];
}

export interface DataModelTable {
  id: number;
  table_name: string;
  table_alias?: string;
  description?: string;
  schema_name: string;
  table_type: string;
  primary_key?: string[];
  field_count: number;
  fields: DataModelField[];
}

export interface DataModelField {
  id: number;
  field_name: string;
  field_alias?: string;
  data_type: string;
  length?: number;
  precision?: number;
  scale?: number;
  is_nullable: boolean;
  is_primary_key: boolean;
  is_foreign_key: boolean;
  foreign_key_reference?: string;
  default_value?: string;
  description?: string;
  pii_flag: boolean;
}

export interface DataModelStats {
  total_models: number;
  by_status: Record<string, number>;
  by_domain: Record<string, number>;
  total_tables: number;
  total_fields: number;
}

/**
 * Upload a new data model file
 */
export const uploadDataModel = async (
  file: File,
  name: string,
  version: string,
  description?: string,
  modelType?: string,
  domain?: string,
  tags?: string
): Promise<any> => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('name', name);
  formData.append('version', version);
  formData.append('project_id', PROJECT_ID);
  if (description) formData.append('description', description);
  if (modelType) formData.append('model_type', modelType);
  if (domain) formData.append('domain', domain);
  if (tags) formData.append('tags', tags);

  const response = await axios.post('/api/model-library/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
};

/**
 * Get list of data models
 */
export const getDataModels = async (
  skip: number = 0,
  limit: number = 50,
  status?: string,
  domain?: string,
  search?: string
): Promise<{ models: DataModel[]; total: number; skip: number; limit: number }> => {
  const params: any = { skip, limit, project_id: PROJECT_ID };
  if (status) params.status = status;
  if (domain) params.domain = domain;
  if (search) params.search = search;

  const response = await axios.get('/api/model-library/models', { params });
  return response.data;
};

/**
 * Get detailed information about a specific data model
 */
export const getDataModelDetail = async (modelId: number): Promise<DataModelDetail> => {
  const response = await axios.get(`/api/model-library/models/${modelId}`);
  return response.data;
};

/**
 * Update data model metadata
 */
export const updateDataModel = async (
  modelId: number,
  updates: {
    name?: string;
    description?: string;
    status?: string;
    domain?: string;
    tags?: string;
  }
): Promise<any> => {
  const response = await axios.put(`/api/model-library/models/${modelId}`, updates);
  return response.data;
};

/**
 * Delete a data model
 */
export const deleteDataModel = async (modelId: number): Promise<any> => {
  const response = await axios.delete(`/api/model-library/models/${modelId}`);
  return response.data;
};

/**
 * Get Model Library statistics
 */
export const getDataModelStats = async (): Promise<DataModelStats> => {
  const response = await axios.get('/api/model-library/stats', { params: { project_id: PROJECT_ID } });
  return response.data;
};
