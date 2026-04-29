/**
 * Stage Configuration Service
 *
 * Handles API calls for stage configuration management (Admin only):
 * - Get/Update stage configurations
 * - Reset to defaults
 * - Toggle validation
 */

import api from '@/utils/axios';

export interface StageConfiguration {
  id: string;
  stage_name: 'business_analyst' | 'developer' | 'reviewer';
  stage_display_name: string;
  stage_description?: string;
  is_validation_enabled: boolean;
  validation_config: Record<string, any>;
  created_by: string;
  updated_by?: string;
  created_at: string;
  updated_at: string;
}

export interface BAValidationConfig {
  allow_unresolved_missing_fields: boolean;
  allow_degraded_quality_analysis: boolean;
  minimum_document_coverage: number;
  require_gap_analysis: boolean;
  require_test_cases: boolean;
  minimum_requirements_count: number;
}

export interface DeveloperValidationConfig {
  required_sql_validation: boolean;
  required_report_xml_artifact: boolean;
  require_schema_analysis: boolean;
  require_lineage_builder: boolean;
  minimum_test_coverage: number;
  require_deterministic_mapping: boolean;
}

export interface ReviewerValidationConfig {
  minimum_coverage_scores: number;
  required_xsd_validation: boolean;
  required_rule_checks: boolean;
  require_anomaly_detection: boolean;
  require_variance_explanation: boolean;
  require_audit_pack: boolean;
}

export interface UpdateConfigRequest {
  is_validation_enabled: boolean;
  validation_config: BAValidationConfig | DeveloperValidationConfig | ReviewerValidationConfig;
}

/**
 * Get all stage configurations
 */
export const getAllConfigurations = async () => {
  const response = await api.get('/api/stage-configurations');
  return response.data;
};

/**
 * Get configuration for specific stage
 */
export const getConfiguration = async (
  stageName: 'business_analyst' | 'developer' | 'reviewer'
) => {
  const response = await api.get(`/api/stage-configurations/${stageName}`);
  return response.data;
};

/**
 * Update stage configuration
 */
export const updateConfiguration = async (
  stageName: 'business_analyst' | 'developer' | 'reviewer',
  data: UpdateConfigRequest
) => {
  const response = await api.put(`/api/stage-configurations/${stageName}`, data);
  return response.data;
};

/**
 * Reset stage configuration to defaults
 */
export const resetConfiguration = async (
  stageName: 'business_analyst' | 'developer' | 'reviewer'
) => {
  const response = await api.post(`/api/stage-configurations/${stageName}/reset`);
  return response.data;
};

/**
 * Get default configuration for stage
 */
export const getDefaults = async (
  stageName: 'business_analyst' | 'developer' | 'reviewer'
) => {
  const response = await api.get(`/api/stage-configurations/${stageName}/defaults`);
  return response.data;
};

/**
 * Toggle validation on/off for stage
 */
export const toggleValidation = async (
  stageName: 'business_analyst' | 'developer' | 'reviewer',
  enabled: boolean
) => {
  const response = await api.patch(
    `/api/stage-configurations/${stageName}/toggle-validation`,
    null,
    { params: { enabled } }
  );
  return response.data;
};

/**
 * Get validation status summary for all stages
 */
export const getValidationSummary = async () => {
  const response = await api.get('/api/stage-configurations/validation-status/summary');
  return response.data;
};

export default {
  getAllConfigurations,
  getConfiguration,
  updateConfiguration,
  resetConfiguration,
  getDefaults,
  toggleValidation,
  getValidationSummary,
};
