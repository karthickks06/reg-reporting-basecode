/**
 * GitHub Artifact Configuration Page
 *
 * Configure GitHub repository for artifact publishing.
 * Uses same design style as Stage Configuration page.
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'react-hot-toast';
import api from '@/utils/axios';
import '@/components/css/ArtifactConfigPage.css';

interface GitHubConfig {
  repository_url: string;
  access_token: string;
  default_branch: string;
  repository_folder_path: string;
  publishing_enabled: boolean;
  status?: 'active' | 'inactive' | 'error';
}

interface LocalConfig {
  local_storage_path: string;
  auto_save_enabled: boolean;
  create_subfolders_by_date: boolean;
  create_subfolders_by_user: boolean;
  status?: 'active' | 'inactive' | 'error';
}

export const ArtifactConfigPage = () => {
  const [config, setConfig] = useState<GitHubConfig>({
    repository_url: '',
    access_token: '',
    default_branch: 'main',
    repository_folder_path: '',
    publishing_enabled: false,
  });

  const [localConfig, setLocalConfig] = useState<LocalConfig>({
    local_storage_path: '',
    auto_save_enabled: true,
    create_subfolders_by_date: false,
    create_subfolders_by_user: false,
  });

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [localLoading, setLocalLoading] = useState(false);
  const [localSaving, setLocalSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validationStatus, setValidationStatus] = useState<'valid' | 'invalid' | null>(null);

  useEffect(() => {
    loadConfiguration();
    loadLocalConfiguration();
  }, []);

  const loadConfiguration = async () => {
    setLoading(true);
    try {
      const response = await api.get('/api/system/github/configuration');
      if (response.data) {
        setConfig({
          repository_url: response.data.repository_url ?? '',
          access_token: response.data.access_token ?? '',
          default_branch: response.data.default_branch ?? 'main',
          repository_folder_path: response.data.repository_folder_path ?? '',
          publishing_enabled: response.data.publishing_enabled ?? false,
          status: response.data.status,
        });
      }
    } catch (error: any) {
      console.log('No existing GitHub configuration found');
    } finally {
      setLoading(false);
    }
  };

  const loadLocalConfiguration = async () => {
    setLocalLoading(true);
    try {
      const response = await api.get('/api/system/local/configuration');
      if (response.data) {
        setLocalConfig({
          local_storage_path: response.data.local_storage_path ?? '',
          auto_save_enabled: response.data.auto_save_enabled ?? true,
          create_subfolders_by_date: response.data.create_subfolders_by_date ?? false,
          create_subfolders_by_user: response.data.create_subfolders_by_user ?? false,
          status: response.data.status,
        });
      }
    } catch (error: any) {
      console.log('No existing local configuration found');
    } finally {
      setLocalLoading(false);
    }
  };

  const handleValidate = async () => {
    if (!config.repository_url || !config.access_token) {
      toast.error('Please provide repository URL and access token');
      return;
    }

    setValidating(true);
    setValidationStatus(null);

    try {
      const response = await api.post('/api/system/github/validate', {
        repository_url: config.repository_url,
        access_token: config.access_token,
        default_branch: config.default_branch,
      });

      if (response.data.valid) {
        setValidationStatus('valid');
        toast.success('GitHub credentials validated successfully!');
      } else {
        setValidationStatus('invalid');
        toast.error(response.data.message || 'Validation failed');
      }
    } catch (error: any) {
      setValidationStatus('invalid');
      toast.error(error.response?.data?.detail || 'Failed to validate credentials');
    } finally {
      setValidating(false);
    }
  };

  const handleSave = async () => {
    if (!config.repository_url || !config.access_token) {
      toast.error('Repository URL and access token are required');
      return;
    }

    setSaving(true);

    try {
      await api.post('/api/system/github/configure', {
        repository_url: config.repository_url,
        access_token: config.access_token,
        default_branch: config.default_branch,
        repository_folder_path: config.repository_folder_path,
        publishing_enabled: config.publishing_enabled,
      });

      toast.success('GitHub configuration saved successfully!');
      await loadConfiguration();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleInputChange = (field: keyof GitHubConfig, value: any) => {
    setConfig((prev) => ({ ...prev, [field]: value }));
    setValidationStatus(null);
  };

  const handleLocalInputChange = (field: keyof LocalConfig, value: any) => {
    setLocalConfig((prev) => ({ ...prev, [field]: value }));
  };

  const handleLocalSave = async () => {
    if (!localConfig.local_storage_path) {
      toast.error('Local storage path is required');
      return;
    }

    setLocalSaving(true);

    try {
      await api.post('/api/system/local/configure', {
        local_storage_path: localConfig.local_storage_path,
        auto_save_enabled: localConfig.auto_save_enabled,
        create_subfolders_by_date: localConfig.create_subfolders_by_date,
        create_subfolders_by_user: localConfig.create_subfolders_by_user,
      });

      toast.success('Local configuration saved successfully!');
      await loadLocalConfiguration();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to save local configuration');
    } finally {
      setLocalSaving(false);
    }
  };

  if (loading || localLoading) {
    return (
      <div className="artifact-publish-loading">
        <p>Loading configuration...</p>
      </div>
    );
  }

  return (
    <div className="artifact-page-container">
      {/* Header */}
      <div className="artifact-page-header">
        <h1 className="artifact-page-title">
          Artifact Publishing Configuration
        </h1>
        <p className="artifact-page-subtitle">
          Configure GitHub repository and local storage for artifact publishing
        </p>
      </div>

      {/* Current Active Configuration */}
      <div className={`artifact-active-config ${config.publishing_enabled ? 'artifact-active-config-github' : 'artifact-active-config-local'}`}>
        <div className="artifact-active-config-content">
          <div className="artifact-active-config-left">
            <h2 className="artifact-active-config-title">
              Active Configuration:
            </h2>
            <span className={config.publishing_enabled ? 'artifact-active-config-name-github' : 'artifact-active-config-name-local'}>
              {config.publishing_enabled ? 'GitHub Publishing' : 'Local Storage'}
            </span>
            <span className="artifact-active-badge">
              ✓ Active
            </span>
          </div>
          <div className="artifact-active-config-location">
            {config.publishing_enabled ? (
              <span>Publishing to: <strong className="artifact-active-config-location-path">{config.repository_url || 'Not configured'}</strong></span>
            ) : (
              <span>Saving to: <strong className="artifact-active-config-location-path">{localConfig.local_storage_path || 'Not configured'}</strong></span>
            )}
          </div>
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="artifact-grid">
        {/* GitHub Configuration Card */}
        <Card className="artifact-card">
          <CardHeader>
            <div className="artifact-card-header">
              <div>
                <CardTitle className="artifact-card-title-github">GitHub Configuration</CardTitle>
                <CardDescription>Configure repository for artifact publishing</CardDescription>
              </div>
              <div className="artifact-card-enable-wrapper">
                <Label>Enable Publishing</Label>
                <Checkbox
                  checked={config.publishing_enabled}
                  onCheckedChange={(checked) => handleInputChange('publishing_enabled', !!checked)}
                />
              </div>
            </div>
          </CardHeader>

          <CardContent className="artifact-card-content">
            <div className="artifact-settings-wrapper">
              <div className="artifact-settings-inner">
                <h3 className="artifact-settings-title">
                  GitHub Settings
                </h3>

                <div className="artifact-settings-fields">
                  {/* Repository URL */}
                  <div className="artifact-field">
                    <Label className="artifact-field-label">Repository URL</Label>
                    <p className="artifact-field-description">
                      GitHub repository URL (e.g., https://github.com/org/repo)
                    </p>
                    <input
                      type="text"
                      placeholder="https://github.com/org/repo"
                      value={config.repository_url}
                      onChange={(e) => handleInputChange('repository_url', e.target.value)}
                      className="artifact-publish-input"
                    />
                  </div>

                  {/* Branch */}
                  <div className="artifact-field">
                    <Label className="artifact-field-label">Branch</Label>
                    <p className="artifact-field-description">
                      Target branch for commits (default: main)
                    </p>
                    <input
                      type="text"
                      placeholder="main"
                      value={config.default_branch}
                      onChange={(e) => handleInputChange('default_branch', e.target.value)}
                      className="artifact-publish-input"
                    />
                  </div>

                  {/* Folder Path */}
                  <div className="artifact-field">
                    <Label className="artifact-field-label">Repository Folder Path (Optional)</Label>
                    <p className="artifact-field-description">
                      Leave blank to publish directly to repo root
                    </p>
                    <input
                      type="text"
                      placeholder="local-workspace/workflows"
                      value={config.repository_folder_path}
                      onChange={(e) => handleInputChange('repository_folder_path', e.target.value)}
                      className="artifact-publish-input"
                    />
                  </div>

                  {/* Access Token */}
                  <div className="artifact-field">
                    <Label className="artifact-field-label">GitHub Fine-Grained PAT</Label>
                    <p className="artifact-field-description">
                      Token required: GitHub fine-grained personal access token with repository{' '}
                      <strong>Contents: Read and write</strong> permission
                    </p>
                    <input
                      type="password"
                      placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                      value={config.access_token}
                      onChange={(e) => handleInputChange('access_token', e.target.value)}
                      className="artifact-publish-input"
                    />
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="artifact-actions">
                <Button
                  onClick={handleSave}
                  disabled={saving || !config.repository_url || !config.access_token}
                  className="artifact-save-btn"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </Button>
                <Button
                  onClick={handleValidate}
                  disabled={validating || !config.repository_url || !config.access_token}
                  variant="outline"
                  className={`artifact-validate-btn ${validationStatus === 'valid' ? 'artifact-validate-btn-valid' : ''}`}
                >
                  {validating ? 'Validating...' : validationStatus === 'valid' ? '✓ Validated' : 'Validate'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Local Configuration Card */}
        <Card className="artifact-card">
          <CardHeader>
            <div className="artifact-card-header">
              <div>
                <CardTitle className="artifact-card-title-local">Local Configuration</CardTitle>
                <CardDescription>Configure local storage for artifacts</CardDescription>
              </div>
              <div className="artifact-card-enable-wrapper">
                <Label>Enable Auto Save</Label>
                <Checkbox
                  checked={localConfig.auto_save_enabled}
                  onCheckedChange={(checked) => handleLocalInputChange('auto_save_enabled', !!checked)}
                />
              </div>
            </div>
          </CardHeader>

          <CardContent className="artifact-card-content">
            <div className="artifact-settings-wrapper">
              <div className="artifact-settings-inner">
                <h3 className="artifact-settings-title">
                  Local Storage Settings
                </h3>

                <div className="artifact-settings-fields">
                  {/* Local Storage Path */}
                  <div className="artifact-field">
                    <Label className="artifact-field-label">Local Storage Path</Label>
                    <p className="artifact-field-description">
                      Absolute path where artifacts will be saved locally
                    </p>
                    <input
                      type="text"
                      placeholder="C:\artifacts or /home/user/artifacts"
                      value={localConfig.local_storage_path}
                      onChange={(e) => handleLocalInputChange('local_storage_path', e.target.value)}
                      className="artifact-publish-input"
                    />
                  </div>

                  {/* Create Subfolders by Date */}
                  <div className="artifact-checkbox-field">
                    <div>
                      <Label className="artifact-checkbox-field-label">Create Subfolders by Date</Label>
                      <p className="artifact-checkbox-field-description">
                        Organize artifacts in date-based subfolders (YYYY-MM-DD)
                      </p>
                    </div>
                    <Checkbox
                      checked={localConfig.create_subfolders_by_date}
                      onCheckedChange={(checked) => handleLocalInputChange('create_subfolders_by_date', !!checked)}
                    />
                  </div>

                  {/* Create Subfolders by User */}
                  <div className="artifact-checkbox-field">
                    <div>
                      <Label className="artifact-checkbox-field-label">Create Subfolders by User</Label>
                      <p className="artifact-checkbox-field-description">
                        Organize artifacts in user-based subfolders (by username)
                      </p>
                    </div>
                    <Checkbox
                      checked={localConfig.create_subfolders_by_user}
                      onCheckedChange={(checked) => handleLocalInputChange('create_subfolders_by_user', !!checked)}
                    />
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <div className="artifact-actions">
                <Button
                  onClick={handleLocalSave}
                  disabled={localSaving || !localConfig.local_storage_path}
                  className="artifact-save-btn"
                >
                  {localSaving ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ArtifactConfigPage;
