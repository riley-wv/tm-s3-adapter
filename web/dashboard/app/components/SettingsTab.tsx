'use client';

import {
  Button,
  Card,
  Input,
  Select,
  Textarea,
  FormGroup,
  Checkbox,
  Badge,
  PageHeader,
  InfoItem,
} from './ui';
import type {
  SettingsForm,
  SettingDescriptor,
  DashboardState,
  ThemeMode,
} from '../lib/types';
import {
  cn,
  settingSourceLabel,
  isSettingLocked,
  copyToClipboard,
} from '../lib/utils';
import { Save, Sun, Moon, Monitor, Server, Shield, Database } from 'lucide-react';

export interface SettingsTabProps {
  form: SettingsForm;
  onChange: (patch: Partial<SettingsForm>) => void;
  settingsConfig: Record<string, SettingDescriptor> | undefined;
  onSubmit: (e: React.FormEvent) => void;
  submitting: boolean;
  dashboard: DashboardState;
  theme: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
  onNotice: (msg: string) => void;
  onError: (msg: string) => void;
}

export function SettingsTab({
  form,
  onChange,
  settingsConfig,
  onSubmit,
  submitting,
  dashboard,
  theme,
  onThemeChange,
  onNotice,
  onError,
}: SettingsTabProps) {
  const cfg = settingsConfig;
  const samba = dashboard.samba;
  const mountManager = dashboard.mountManager;
  const sftp = dashboard.sftp;
  const postgres = dashboard.postgres;
  const settings = dashboard.settings;

  const handleCopy = async (text: string, label: string) => {
    try {
      await copyToClipboard(text);
      onNotice(`${label} copied to clipboard`);
    } catch {
      onError(`Failed to copy ${label}`);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Configure server, appearance, and enterprise options."
      />

      <form onSubmit={onSubmit} className="space-y-6">
        {/* Appearance Card */}
        <Card>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <Sun className="h-4 w-4 text-gray-500 dark:text-gray-400" />
            Appearance
          </h3>
          <div className="flex gap-2 p-2 rounded-lg bg-gray-100 dark:bg-gray-800">
            <button
              type="button"
              onClick={() => onThemeChange('light')}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors',
                theme === 'light'
                  ? 'bg-blue-600 text-white dark:bg-blue-500'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700',
              )}
            >
              <Sun className="h-4 w-4" />
              Light
            </button>
            <button
              type="button"
              onClick={() => onThemeChange('system')}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors',
                theme === 'system'
                  ? 'bg-blue-600 text-white dark:bg-blue-500'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700',
              )}
            >
              <Monitor className="h-4 w-4" />
              System
            </button>
            <button
              type="button"
              onClick={() => onThemeChange('dark')}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors',
                theme === 'dark'
                  ? 'bg-blue-600 text-white dark:bg-blue-500'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700',
              )}
            >
              <Moon className="h-4 w-4" />
              Dark
            </button>
          </div>
        </Card>

        {/* Server Configuration Card */}
        <Card>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <Server className="h-4 w-4 text-gray-500 dark:text-gray-400" />
            Server Configuration
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormGroup label="Admin Username" htmlFor="settings-admin-username">
              <Input
                id="settings-admin-username"
                type="text"
                value={form.adminUsername}
                onChange={(e) => onChange({ adminUsername: e.target.value })}
                placeholder="admin"
              />
            </FormGroup>

            <FormGroup label="Admin Password" htmlFor="settings-admin-password">
              <Input
                id="settings-admin-password"
                type="password"
                value={form.adminPassword}
                onChange={(e) => onChange({ adminPassword: e.target.value })}
                placeholder="••••••••"
              />
            </FormGroup>

            <FormGroup label="API Token" htmlFor="settings-api-token">
              <Input
                id="settings-api-token"
                type="password"
                value={form.apiToken}
                onChange={(e) => onChange({ apiToken: e.target.value })}
                placeholder="••••••••"
              />
            </FormGroup>

            <FormGroup
              label="Admin Session Seconds"
              htmlFor="settings-admin-session-seconds"
              hint="60–2592000"
            >
              <Input
                id="settings-admin-session-seconds"
                type="number"
                min={60}
                max={2592000}
                value={form.adminSessionSeconds}
                onChange={(e) => onChange({ adminSessionSeconds: e.target.value })}
              />
            </FormGroup>

            <FormGroup label="Hostname" htmlFor="settings-hostname">
              <Input
                id="settings-hostname"
                type="text"
                value={form.hostname}
                onChange={(e) => onChange({ hostname: e.target.value })}
                placeholder="timemachine.local"
              />
            </FormGroup>

            <FormGroup label="Browse Share Name" htmlFor="settings-browse-share-name">
              <Input
                id="settings-browse-share-name"
                type="text"
                value={form.browseShareName}
                onChange={(e) => onChange({ browseShareName: e.target.value })}
                placeholder="timemachine"
              />
            </FormGroup>

            <FormGroup label="SMB Public Port" htmlFor="settings-smb-port" hint="1–65535">
              <Input
                id="settings-smb-port"
                type="number"
                min={1}
                max={65535}
                value={form.smbPublicPort}
                onChange={(e) => onChange({ smbPublicPort: e.target.value })}
              />
            </FormGroup>

            <FormGroup label="VPS Cache Dir" htmlFor="settings-vps-cache-dir">
              <Input
                id="settings-vps-cache-dir"
                type="text"
                value={form.vpsCacheDir}
                onChange={(e) => onChange({ vpsCacheDir: e.target.value })}
                placeholder="/data/vps/rclone-vfs-cache"
              />
            </FormGroup>

            <FormGroup label="SMB Streams Backend" htmlFor="settings-smb-streams">
              <Select
                id="settings-smb-streams"
                value={form.smbStreamsBackend}
                onChange={(e) => onChange({ smbStreamsBackend: e.target.value })}
              >
                <option value="xattr">xattr</option>
                <option value="depot">depot</option>
              </Select>
            </FormGroup>

            <FormGroup
              label="Mount Poll Seconds"
              htmlFor="settings-mount-poll"
              hint="10–86400"
            >
              <Input
                id="settings-mount-poll"
                type="number"
                min={10}
                max={86400}
                value={form.mountPollSeconds}
                onChange={(e) => onChange({ mountPollSeconds: e.target.value })}
              />
            </FormGroup>

            <FormGroup
              label="VPS Write Back Seconds"
              htmlFor="settings-vps-writeback"
            >
              <Input
                id="settings-vps-writeback"
                type="number"
                value={form.vpsWriteBackSeconds}
                onChange={(e) => onChange({ vpsWriteBackSeconds: e.target.value })}
              />
            </FormGroup>

            <FormGroup
              label="VPS Cache Max Size (GB)"
              htmlFor="settings-vps-cache-max-size"
            >
              <Input
                id="settings-vps-cache-max-size"
                type="number"
                min={0}
                value={form.vpsCacheMaxSizeGb}
                onChange={(e) => onChange({ vpsCacheMaxSizeGb: e.target.value })}
              />
            </FormGroup>

            <FormGroup
              label="VPS Cache Max Age (hours)"
              htmlFor="settings-vps-cache-max-age"
            >
              <Input
                id="settings-vps-cache-max-age"
                type="number"
                min={0}
                value={form.vpsCacheMaxAgeHours}
                onChange={(e) => onChange({ vpsCacheMaxAgeHours: e.target.value })}
              />
            </FormGroup>

            <FormGroup
              label="VPS Read Ahead (MB)"
              htmlFor="settings-vps-readahead"
            >
              <Input
                id="settings-vps-readahead"
                type="number"
                min={0}
                value={form.vpsReadAheadMb}
                onChange={(e) => onChange({ vpsReadAheadMb: e.target.value })}
              />
            </FormGroup>

            <div className="sm:col-span-2 flex flex-col gap-3 pt-2">
              <Checkbox
                id="settings-smb-enabled"
                checked={form.smbEnabled}
                onChange={(checked) => onChange({ smbEnabled: checked })}
                label="Enable SMB"
              />
              <Checkbox
                id="settings-browse-share-enabled"
                checked={form.browseShareEnabled}
                onChange={(checked) => onChange({ browseShareEnabled: checked })}
                label="Enable browse share"
              />
              <Checkbox
                id="settings-sftp-enabled"
                checked={form.sftpEnabled}
                onChange={(checked) => onChange({ sftpEnabled: checked })}
                label="Enable SFTP"
              />
              <Checkbox
                id="settings-mount-management-enabled"
                checked={form.mountManagementEnabled}
                onChange={(checked) => onChange({ mountManagementEnabled: checked })}
                label="Enable mount management"
              />
              <Checkbox
                id="settings-vps-cache-enabled"
                checked={form.vpsCacheEnabled}
                onChange={(checked) => onChange({ vpsCacheEnabled: checked })}
                label="Enable VPS cache"
              />
            </div>
          </div>
        </Card>

        {/* Enterprise Auth & Security Card */}
        <Card>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <Shield className="h-4 w-4 text-gray-500 dark:text-gray-400" />
            Enterprise Auth & Security
          </h3>
          <div className="space-y-4">
            <div className="flex flex-col gap-3">
              <Checkbox
                id="settings-enterprise-enabled"
                checked={form.enterpriseFeaturesEnabled}
                onChange={(checked) => onChange({ enterpriseFeaturesEnabled: checked })}
                label={
                  isSettingLocked(cfg, 'enterpriseFeaturesEnabled')
                    ? `Enable enterprise features (locked: ${settingSourceLabel(cfg, 'enterpriseFeaturesEnabled')})`
                    : 'Enable enterprise features'
                }
                disabled={isSettingLocked(cfg, 'enterpriseFeaturesEnabled')}
              />
              <Checkbox
                id="settings-security-breakglass"
                checked={form.securityBreakGlassEnabled}
                onChange={(checked) => onChange({ securityBreakGlassEnabled: checked })}
                label={`Enable break-glass local login (${settingSourceLabel(cfg, 'securityBreakGlassEnabled')})`}
                disabled={isSettingLocked(cfg, 'securityBreakGlassEnabled')}
              />
              <Checkbox
                id="settings-postgres-enabled"
                checked={form.postgresEnabled}
                onChange={() => {}}
                label={`Postgres-backed config (${settingSourceLabel(cfg, 'postgresEnabled')})`}
                disabled
              />
            </div>

            {form.enterpriseFeaturesEnabled && (
              <Card className="border border-gray-200 dark:border-gray-700">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormGroup
                    label="Admin Auth Mode"
                    htmlFor="settings-admin-auth-mode"
                    hint={settingSourceLabel(cfg, 'adminAuthMode')}
                  >
                    <Select
                      id="settings-admin-auth-mode"
                      value={form.adminAuthMode}
                      onChange={(e) => onChange({ adminAuthMode: e.target.value })}
                      disabled={isSettingLocked(cfg, 'adminAuthMode')}
                    >
                      <option value="local">Break-glass local admin</option>
                      <option value="centralized">Centralized local users</option>
                      <option value="oidc">OIDC SSO</option>
                      <option value="ldap">LDAP / Active Directory</option>
                    </Select>
                  </FormGroup>

                  <FormGroup
                    label="SMB Auth Mode"
                    htmlFor="settings-smb-auth-mode"
                    hint={settingSourceLabel(cfg, 'smbAuthMode')}
                  >
                    <Select
                      id="settings-smb-auth-mode"
                      value={form.smbAuthMode}
                      onChange={(e) => onChange({ smbAuthMode: e.target.value })}
                      disabled={isSettingLocked(cfg, 'smbAuthMode')}
                    >
                      <option value="legacy-per-share">Legacy per-share credentials</option>
                      <option value="centralized">Centralized user access</option>
                    </Select>
                  </FormGroup>

                  <FormGroup
                    label="SFTP Auth Mode"
                    htmlFor="settings-sftp-auth-mode"
                    hint={settingSourceLabel(cfg, 'sftpAuthMode')}
                  >
                    <Select
                      id="settings-sftp-auth-mode"
                      value={form.sftpAuthMode}
                      onChange={(e) => onChange({ sftpAuthMode: e.target.value })}
                      disabled={isSettingLocked(cfg, 'sftpAuthMode')}
                    >
                      <option value="legacy-per-share">Legacy per-share credentials</option>
                      <option value="centralized">Centralized user access</option>
                    </Select>
                  </FormGroup>

                  <FormGroup
                    label="Security IP Allowlist"
                    htmlFor="settings-security-allowlist"
                    hint={settingSourceLabel(cfg, 'securityIpAllowlist')}
                  >
                    <Input
                      id="settings-security-allowlist"
                      type="text"
                      value={form.securityIpAllowlist}
                      onChange={(e) => onChange({ securityIpAllowlist: e.target.value })}
                      placeholder="10.0.0.0/8,192.168.0.0/16"
                      disabled={isSettingLocked(cfg, 'securityIpAllowlist')}
                    />
                  </FormGroup>

                  <FormGroup
                    label="Audit Retention Days"
                    htmlFor="settings-security-retention"
                    hint={settingSourceLabel(cfg, 'securityAuditRetentionDays')}
                  >
                    <Input
                      id="settings-security-retention"
                      type="number"
                      min={1}
                      max={3650}
                      value={form.securityAuditRetentionDays}
                      onChange={(e) => onChange({ securityAuditRetentionDays: e.target.value })}
                      disabled={isSettingLocked(cfg, 'securityAuditRetentionDays')}
                    />
                  </FormGroup>

                  <FormGroup
                    label="OIDC Issuer"
                    htmlFor="settings-oidc-issuer"
                    hint={settingSourceLabel(cfg, 'oidcIssuer')}
                  >
                    <Input
                      id="settings-oidc-issuer"
                      type="text"
                      value={form.oidcIssuer}
                      onChange={(e) => onChange({ oidcIssuer: e.target.value })}
                      placeholder="https://idp.example.com"
                      disabled={isSettingLocked(cfg, 'oidcIssuer')}
                    />
                  </FormGroup>

                  <FormGroup
                    label="OIDC Client ID"
                    htmlFor="settings-oidc-client-id"
                    hint={settingSourceLabel(cfg, 'oidcClientId')}
                  >
                    <Input
                      id="settings-oidc-client-id"
                      type="text"
                      value={form.oidcClientId}
                      onChange={(e) => onChange({ oidcClientId: e.target.value })}
                      disabled={isSettingLocked(cfg, 'oidcClientId')}
                    />
                  </FormGroup>

                  <FormGroup
                    label="OIDC Client Secret"
                    htmlFor="settings-oidc-client-secret"
                    hint={settingSourceLabel(cfg, 'oidcClientSecret')}
                  >
                    <Input
                      id="settings-oidc-client-secret"
                      type="password"
                      value={form.oidcClientSecret}
                      onChange={(e) => onChange({ oidcClientSecret: e.target.value })}
                      disabled={isSettingLocked(cfg, 'oidcClientSecret')}
                    />
                  </FormGroup>

                  <FormGroup
                    label="OIDC Scopes"
                    htmlFor="settings-oidc-scopes"
                    hint={settingSourceLabel(cfg, 'oidcScopes')}
                  >
                    <Input
                      id="settings-oidc-scopes"
                      type="text"
                      value={form.oidcScopes}
                      onChange={(e) => onChange({ oidcScopes: e.target.value })}
                      placeholder="openid profile email groups"
                      disabled={isSettingLocked(cfg, 'oidcScopes')}
                    />
                  </FormGroup>

                  <FormGroup
                    label="OIDC Admin Group"
                    htmlFor="settings-oidc-admin-group"
                    hint={settingSourceLabel(cfg, 'oidcAdminGroup')}
                  >
                    <Input
                      id="settings-oidc-admin-group"
                      type="text"
                      value={form.oidcAdminGroup}
                      onChange={(e) => onChange({ oidcAdminGroup: e.target.value })}
                      disabled={isSettingLocked(cfg, 'oidcAdminGroup')}
                    />
                  </FormGroup>

                  <FormGroup
                    label="OIDC Read-Only Group"
                    htmlFor="settings-oidc-readonly-group"
                    hint={settingSourceLabel(cfg, 'oidcReadOnlyGroup')}
                  >
                    <Input
                      id="settings-oidc-readonly-group"
                      type="text"
                      value={form.oidcReadOnlyGroup}
                      onChange={(e) => onChange({ oidcReadOnlyGroup: e.target.value })}
                      disabled={isSettingLocked(cfg, 'oidcReadOnlyGroup')}
                    />
                  </FormGroup>

                  <FormGroup
                    label="Directory URL"
                    htmlFor="settings-directory-url"
                    hint={settingSourceLabel(cfg, 'directoryUrl')}
                  >
                    <Input
                      id="settings-directory-url"
                      type="text"
                      value={form.directoryUrl}
                      onChange={(e) => onChange({ directoryUrl: e.target.value })}
                      placeholder="ldap://dc.example.com"
                      disabled={isSettingLocked(cfg, 'directoryUrl')}
                    />
                  </FormGroup>

                  <FormGroup
                    label="Directory Domain"
                    htmlFor="settings-directory-domain"
                    hint={settingSourceLabel(cfg, 'directoryDomain')}
                  >
                    <Input
                      id="settings-directory-domain"
                      type="text"
                      value={form.directoryDomain}
                      onChange={(e) => onChange({ directoryDomain: e.target.value })}
                      placeholder="CORP"
                      disabled={isSettingLocked(cfg, 'directoryDomain')}
                    />
                  </FormGroup>

                  <FormGroup
                    label="Directory Realm"
                    htmlFor="settings-directory-realm"
                    hint={settingSourceLabel(cfg, 'directoryRealm')}
                  >
                    <Input
                      id="settings-directory-realm"
                      type="text"
                      value={form.directoryRealm}
                      onChange={(e) => onChange({ directoryRealm: e.target.value })}
                      placeholder="CORP.EXAMPLE.COM"
                      disabled={isSettingLocked(cfg, 'directoryRealm')}
                    />
                  </FormGroup>

                  <FormGroup
                    label="Directory Bind DN"
                    htmlFor="settings-directory-bind-dn"
                    hint={settingSourceLabel(cfg, 'directoryBindDn')}
                  >
                    <Input
                      id="settings-directory-bind-dn"
                      type="text"
                      value={form.directoryBindDn}
                      onChange={(e) => onChange({ directoryBindDn: e.target.value })}
                      disabled={isSettingLocked(cfg, 'directoryBindDn')}
                    />
                  </FormGroup>

                  <FormGroup
                    label="Directory Bind Password"
                    htmlFor="settings-directory-bind-password"
                    hint={settingSourceLabel(cfg, 'directoryBindPassword')}
                  >
                    <Input
                      id="settings-directory-bind-password"
                      type="password"
                      value={form.directoryBindPassword}
                      onChange={(e) => onChange({ directoryBindPassword: e.target.value })}
                      disabled={isSettingLocked(cfg, 'directoryBindPassword')}
                    />
                  </FormGroup>

                  <FormGroup
                    label="Workgroup Mappings JSON"
                    htmlFor="settings-workgroups-json"
                    hint={settingSourceLabel(cfg, 'workgroupMappingsJson')}
                    className="sm:col-span-2"
                  >
                    <Textarea
                      id="settings-workgroups-json"
                      value={form.workgroupMappingsJson}
                      onChange={(e) => onChange({ workgroupMappingsJson: e.target.value })}
                      rows={3}
                      disabled={isSettingLocked(cfg, 'workgroupMappingsJson')}
                    />
                  </FormGroup>

                  <FormGroup
                    label="Mount Policy Mode"
                    htmlFor="settings-mount-policy-mode"
                    hint={settingSourceLabel(cfg, 'mountPolicyMode')}
                  >
                    <Select
                      id="settings-mount-policy-mode"
                      value={form.mountPolicyMode}
                      onChange={(e) => onChange({ mountPolicyMode: e.target.value })}
                      disabled={isSettingLocked(cfg, 'mountPolicyMode')}
                    >
                      <option value="policy_templates">Policy templates + guarded overrides</option>
                      <option value="global_defaults">Single global defaults</option>
                      <option value="guidelines">Guidelines only</option>
                    </Select>
                  </FormGroup>

                  <FormGroup
                    label="Postgres Host"
                    htmlFor="settings-postgres-host"
                    hint={settingSourceLabel(cfg, 'postgresHost')}
                  >
                    <Input
                      id="settings-postgres-host"
                      type="text"
                      value={form.postgresHost}
                      onChange={(e) => onChange({ postgresHost: e.target.value })}
                      disabled={isSettingLocked(cfg, 'postgresHost') || !form.postgresEnabled}
                    />
                  </FormGroup>

                  <FormGroup
                    label="Postgres Port"
                    htmlFor="settings-postgres-port"
                    hint={settingSourceLabel(cfg, 'postgresPort')}
                  >
                    <Input
                      id="settings-postgres-port"
                      type="number"
                      min={1}
                      max={65535}
                      value={form.postgresPort}
                      onChange={(e) => onChange({ postgresPort: e.target.value })}
                      disabled={isSettingLocked(cfg, 'postgresPort') || !form.postgresEnabled}
                    />
                  </FormGroup>

                  <FormGroup
                    label="Postgres Database"
                    htmlFor="settings-postgres-db"
                    hint={settingSourceLabel(cfg, 'postgresDatabase')}
                  >
                    <Input
                      id="settings-postgres-db"
                      type="text"
                      value={form.postgresDatabase}
                      onChange={(e) => onChange({ postgresDatabase: e.target.value })}
                      disabled={isSettingLocked(cfg, 'postgresDatabase') || !form.postgresEnabled}
                    />
                  </FormGroup>

                  <FormGroup
                    label="Postgres User"
                    htmlFor="settings-postgres-user"
                    hint={settingSourceLabel(cfg, 'postgresUser')}
                  >
                    <Input
                      id="settings-postgres-user"
                      type="text"
                      value={form.postgresUser}
                      onChange={(e) => onChange({ postgresUser: e.target.value })}
                      disabled={isSettingLocked(cfg, 'postgresUser') || !form.postgresEnabled}
                    />
                  </FormGroup>

                  <FormGroup
                    label="Postgres Password"
                    htmlFor="settings-postgres-password"
                    hint={settingSourceLabel(cfg, 'postgresPassword')}
                  >
                    <Input
                      id="settings-postgres-password"
                      type="password"
                      value={form.postgresPassword}
                      onChange={(e) => onChange({ postgresPassword: e.target.value })}
                      disabled={isSettingLocked(cfg, 'postgresPassword') || !form.postgresEnabled}
                    />
                  </FormGroup>

                  <FormGroup
                    label="Postgres SSL Mode"
                    htmlFor="settings-postgres-ssl-mode"
                    hint={settingSourceLabel(cfg, 'postgresSslMode')}
                  >
                    <Select
                      id="settings-postgres-ssl-mode"
                      value={form.postgresSslMode}
                      onChange={(e) => onChange({ postgresSslMode: e.target.value })}
                      disabled={isSettingLocked(cfg, 'postgresSslMode') || !form.postgresEnabled}
                    >
                      <option value="disable">disable</option>
                      <option value="require">require</option>
                      <option value="verify-ca">verify-ca</option>
                      <option value="verify-full">verify-full</option>
                    </Select>
                  </FormGroup>
                </div>
              </Card>
            )}
          </div>
        </Card>

        <Button type="submit" variant="primary" loading={submitting} disabled={submitting}>
          <Save className="h-4 w-4" />
          Save
        </Button>
      </form>

      {/* Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
        <Card>
          <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
            Samba Status
          </h4>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge tone={samba?.effectiveEnabled ? 'success' : 'muted'}>
                {samba?.effectiveEnabled ? 'Enabled' : 'Disabled'}
              </Badge>
            </div>
            {samba?.confDir && (
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Conf dir: <span className="font-mono">{samba.confDir}</span>
              </p>
            )}
            {settings?.smbStreamsBackend && (
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Streams backend: <span className="font-mono">{settings.smbStreamsBackend}</span>
              </p>
            )}
          </div>
        </Card>

        <Card>
          <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
            Mount Manager
          </h4>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge tone={mountManager?.effectiveEnabled ? 'success' : 'muted'}>
                {mountManager?.effectiveEnabled ? 'Enabled' : 'Disabled'}
              </Badge>
            </div>
            {mountManager?.pollSeconds != null && (
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Poll interval: {mountManager.pollSeconds}s
              </p>
            )}
            {form.vpsCacheEnabled && (
              <p className="text-xs text-gray-600 dark:text-gray-400">
                VPS cache: {form.vpsCacheMaxSizeGb}GB max, {form.vpsCacheMaxAgeHours}h max age
              </p>
            )}
          </div>
        </Card>

        <Card>
          <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
            SFTP Status
          </h4>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge tone={sftp?.enabled ? 'success' : 'muted'}>
                {sftp?.enabled ? 'Enabled' : 'Disabled'}
              </Badge>
            </div>
            {sftp?.url && (
              <p className="text-xs text-gray-600 dark:text-gray-400 break-all">
                URL: {sftp.url}
              </p>
            )}
          </div>
        </Card>

        <Card>
          <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
            Enterprise Config
          </h4>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge tone={form.enterpriseFeaturesEnabled ? 'success' : 'muted'}>
                {form.enterpriseFeaturesEnabled ? 'Enabled' : 'Disabled'}
              </Badge>
            </div>
            {form.enterpriseFeaturesEnabled && (
              <>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  Admin: {form.adminAuthMode} · SMB: {form.smbAuthMode} · SFTP: {form.sftpAuthMode}
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  Postgres: {postgres?.configured ? 'configured' : 'not configured'}
                </p>
              </>
            )}
          </div>
        </Card>
      </div>

      {/* SFTP Configuration Card */}
      <Card>
        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
          <Database className="h-4 w-4 text-gray-500 dark:text-gray-400" />
          SFTP Configuration
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <InfoItem label="URL" value={sftp?.url || ''} mono />
          <InfoItem label="Username" value={sftp?.username || ''} mono />
          <InfoItem label="Password" value={sftp?.password ? '••••••••' : ''} mono />
          <InfoItem label="Root Path" value={sftp?.rootPath || ''} mono />
        </div>
        <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => handleCopy(sftp?.url || '', 'URL')}
          >
            Copy URL
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => handleCopy(sftp?.username || '', 'Username')}
          >
            Copy Username
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => handleCopy(sftp?.password || '', 'Password')}
          >
            Copy Password
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => handleCopy(sftp?.rootPath || '', 'Root path')}
          >
            Copy Root Path
          </Button>
        </div>
      </Card>
    </div>
  );
}
