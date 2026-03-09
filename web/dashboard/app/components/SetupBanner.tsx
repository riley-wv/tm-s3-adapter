'use client';

import { Rocket, Check } from 'lucide-react';
import {
  Button,
  Input,
  Select,
  Textarea,
  FormGroup,
  Checkbox,
  Card,
} from './ui';
import type { SettingsForm, SettingDescriptor } from '../lib/types';
import { settingSourceLabel, isSettingLocked } from '../lib/utils';

export interface SetupBannerProps {
  form: SettingsForm;
  onChange: (patch: Partial<SettingsForm>) => void;
  settingsConfig: Record<string, SettingDescriptor> | undefined;
  onSubmit: (e: React.FormEvent) => void;
  onSkip: () => void;
  submitting: boolean;
}

export function SetupBanner({
  form,
  onChange,
  settingsConfig,
  onSubmit,
  onSkip,
  submitting,
}: SetupBannerProps) {
  const cfg = settingsConfig;

  return (
    <div className="bg-blue-50/50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-xl p-6 mb-6 animate-in">
      <div className="flex items-start gap-3 mb-6">
        <div className="shrink-0 w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center">
          <Rocket className="h-5 w-5 text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
            Initial Setup Required
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
            Configure admin credentials, API token, and core settings to get started.
          </p>
        </div>
      </div>

      <form onSubmit={onSubmit}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormGroup label="Admin Username" htmlFor="setup-admin-username">
            <Input
              id="setup-admin-username"
              type="text"
              value={form.adminUsername}
              onChange={(e) => onChange({ adminUsername: e.target.value })}
              placeholder="admin"
            />
          </FormGroup>

          <FormGroup label="Admin Password" htmlFor="setup-admin-password">
            <Input
              id="setup-admin-password"
              type="password"
              value={form.adminPassword}
              onChange={(e) => onChange({ adminPassword: e.target.value })}
              placeholder="••••••••"
            />
          </FormGroup>

          <FormGroup label="API Token" htmlFor="setup-api-token">
            <Input
              id="setup-api-token"
              type="password"
              value={form.apiToken}
              onChange={(e) => onChange({ apiToken: e.target.value })}
              placeholder="••••••••"
            />
          </FormGroup>

          <FormGroup
            label="Admin Session Seconds"
            htmlFor="setup-admin-session-seconds"
            hint="60–2592000"
          >
            <Input
              id="setup-admin-session-seconds"
              type="number"
              min={60}
              max={2592000}
              value={form.adminSessionSeconds}
              onChange={(e) => onChange({ adminSessionSeconds: e.target.value })}
            />
          </FormGroup>

          <FormGroup label="VPS Cache Dir" htmlFor="setup-vps-cache-dir">
            <Input
              id="setup-vps-cache-dir"
              type="text"
              value={form.vpsCacheDir}
              onChange={(e) => onChange({ vpsCacheDir: e.target.value })}
              placeholder="/data/vps/rclone-vfs-cache"
            />
          </FormGroup>

          <FormGroup label="Hostname" htmlFor="setup-hostname">
            <Input
              id="setup-hostname"
              type="text"
              value={form.hostname}
              onChange={(e) => onChange({ hostname: e.target.value })}
              placeholder="timemachine.local"
            />
          </FormGroup>

          <FormGroup label="Browse Share Name" htmlFor="setup-browse-share-name">
            <Input
              id="setup-browse-share-name"
              type="text"
              value={form.browseShareName}
              onChange={(e) => onChange({ browseShareName: e.target.value })}
              placeholder="timemachine"
              required
            />
          </FormGroup>

          <FormGroup label="SMB Public Port" htmlFor="setup-smb-port" hint="1–65535">
            <Input
              id="setup-smb-port"
              type="number"
              min={1}
              max={65535}
              value={form.smbPublicPort}
              onChange={(e) => onChange({ smbPublicPort: e.target.value })}
            />
          </FormGroup>

          <FormGroup label="SMB Streams Backend" htmlFor="setup-smb-streams">
            <Select
              id="setup-smb-streams"
              value={form.smbStreamsBackend}
              onChange={(e) => onChange({ smbStreamsBackend: e.target.value })}
            >
              <option value="xattr">xattr</option>
              <option value="depot">depot</option>
            </Select>
          </FormGroup>

          <FormGroup
            label="Mount Poll Seconds"
            htmlFor="setup-mount-poll"
            hint="10–86400"
          >
            <Input
              id="setup-mount-poll"
              type="number"
              min={10}
              max={86400}
              value={form.mountPollSeconds}
              onChange={(e) => onChange({ mountPollSeconds: e.target.value })}
            />
          </FormGroup>

          <div className="sm:col-span-2 flex items-center pt-1">
            <Checkbox
              id="setup-browse-share-enabled"
              checked={form.browseShareEnabled}
              onChange={(checked) => onChange({ browseShareEnabled: checked })}
              label="Enable browse share"
            />
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-blue-200/50 dark:border-blue-800/50">
          <Checkbox
            id="setup-enterprise"
            checked={form.enterpriseFeaturesEnabled}
            onChange={(checked) => onChange({ enterpriseFeaturesEnabled: checked })}
            label="Enable enterprise features"
          />
        </div>

        {form.enterpriseFeaturesEnabled && (
          <Card className="mt-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Enterprise Setup (Optional)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormGroup
                label="Admin Auth Mode"
                htmlFor="setup-admin-auth-mode"
                hint={settingSourceLabel(cfg, 'adminAuthMode')}
              >
                <Select
                  id="setup-admin-auth-mode"
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
                htmlFor="setup-smb-auth-mode"
                hint={settingSourceLabel(cfg, 'smbAuthMode')}
              >
                <Select
                  id="setup-smb-auth-mode"
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
                htmlFor="setup-sftp-auth-mode"
                hint={settingSourceLabel(cfg, 'sftpAuthMode')}
              >
                <Select
                  id="setup-sftp-auth-mode"
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
                htmlFor="setup-security-allowlist"
                hint={settingSourceLabel(cfg, 'securityIpAllowlist')}
              >
                <Input
                  id="setup-security-allowlist"
                  type="text"
                  value={form.securityIpAllowlist}
                  onChange={(e) => onChange({ securityIpAllowlist: e.target.value })}
                  placeholder="10.0.0.0/8,192.168.0.0/16"
                  disabled={isSettingLocked(cfg, 'securityIpAllowlist')}
                />
              </FormGroup>

              <FormGroup
                label="Audit Retention Days"
                htmlFor="setup-security-retention"
                hint={settingSourceLabel(cfg, 'securityAuditRetentionDays')}
              >
                <Input
                  id="setup-security-retention"
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
                htmlFor="setup-oidc-issuer"
                hint={settingSourceLabel(cfg, 'oidcIssuer')}
              >
                <Input
                  id="setup-oidc-issuer"
                  type="text"
                  value={form.oidcIssuer}
                  onChange={(e) => onChange({ oidcIssuer: e.target.value })}
                  placeholder="https://idp.example.com"
                  disabled={isSettingLocked(cfg, 'oidcIssuer')}
                />
              </FormGroup>

              <FormGroup
                label="OIDC Client ID"
                htmlFor="setup-oidc-client-id"
                hint={settingSourceLabel(cfg, 'oidcClientId')}
              >
                <Input
                  id="setup-oidc-client-id"
                  type="text"
                  value={form.oidcClientId}
                  onChange={(e) => onChange({ oidcClientId: e.target.value })}
                  disabled={isSettingLocked(cfg, 'oidcClientId')}
                />
              </FormGroup>

              <FormGroup
                label="OIDC Client Secret"
                htmlFor="setup-oidc-client-secret"
                hint={settingSourceLabel(cfg, 'oidcClientSecret')}
              >
                <Input
                  id="setup-oidc-client-secret"
                  type="password"
                  value={form.oidcClientSecret}
                  onChange={(e) => onChange({ oidcClientSecret: e.target.value })}
                  disabled={isSettingLocked(cfg, 'oidcClientSecret')}
                />
              </FormGroup>

              <FormGroup
                label="OIDC Scopes"
                htmlFor="setup-oidc-scopes"
                hint={settingSourceLabel(cfg, 'oidcScopes')}
              >
                <Input
                  id="setup-oidc-scopes"
                  type="text"
                  value={form.oidcScopes}
                  onChange={(e) => onChange({ oidcScopes: e.target.value })}
                  placeholder="openid profile email groups"
                  disabled={isSettingLocked(cfg, 'oidcScopes')}
                />
              </FormGroup>

              <FormGroup
                label="OIDC Admin Group"
                htmlFor="setup-oidc-admin-group"
                hint={settingSourceLabel(cfg, 'oidcAdminGroup')}
              >
                <Input
                  id="setup-oidc-admin-group"
                  type="text"
                  value={form.oidcAdminGroup}
                  onChange={(e) => onChange({ oidcAdminGroup: e.target.value })}
                  disabled={isSettingLocked(cfg, 'oidcAdminGroup')}
                />
              </FormGroup>

              <FormGroup
                label="OIDC Read-Only Group"
                htmlFor="setup-oidc-readonly-group"
                hint={settingSourceLabel(cfg, 'oidcReadOnlyGroup')}
              >
                <Input
                  id="setup-oidc-readonly-group"
                  type="text"
                  value={form.oidcReadOnlyGroup}
                  onChange={(e) => onChange({ oidcReadOnlyGroup: e.target.value })}
                  disabled={isSettingLocked(cfg, 'oidcReadOnlyGroup')}
                />
              </FormGroup>

              <FormGroup
                label="Directory URL"
                htmlFor="setup-directory-url"
                hint={settingSourceLabel(cfg, 'directoryUrl')}
              >
                <Input
                  id="setup-directory-url"
                  type="text"
                  value={form.directoryUrl}
                  onChange={(e) => onChange({ directoryUrl: e.target.value })}
                  placeholder="ldap://dc.example.com"
                  disabled={isSettingLocked(cfg, 'directoryUrl')}
                />
              </FormGroup>

              <FormGroup
                label="Directory Domain"
                htmlFor="setup-directory-domain"
                hint={settingSourceLabel(cfg, 'directoryDomain')}
              >
                <Input
                  id="setup-directory-domain"
                  type="text"
                  value={form.directoryDomain}
                  onChange={(e) => onChange({ directoryDomain: e.target.value })}
                  placeholder="CORP"
                  disabled={isSettingLocked(cfg, 'directoryDomain')}
                />
              </FormGroup>

              <FormGroup
                label="Directory Realm"
                htmlFor="setup-directory-realm"
                hint={settingSourceLabel(cfg, 'directoryRealm')}
              >
                <Input
                  id="setup-directory-realm"
                  type="text"
                  value={form.directoryRealm}
                  onChange={(e) => onChange({ directoryRealm: e.target.value })}
                  placeholder="CORP.EXAMPLE.COM"
                  disabled={isSettingLocked(cfg, 'directoryRealm')}
                />
              </FormGroup>

              <FormGroup
                label="Directory Bind DN"
                htmlFor="setup-directory-bind-dn"
                hint={settingSourceLabel(cfg, 'directoryBindDn')}
              >
                <Input
                  id="setup-directory-bind-dn"
                  type="text"
                  value={form.directoryBindDn}
                  onChange={(e) => onChange({ directoryBindDn: e.target.value })}
                  disabled={isSettingLocked(cfg, 'directoryBindDn')}
                />
              </FormGroup>

              <FormGroup
                label="Directory Bind Password"
                htmlFor="setup-directory-bind-password"
                hint={settingSourceLabel(cfg, 'directoryBindPassword')}
              >
                <Input
                  id="setup-directory-bind-password"
                  type="password"
                  value={form.directoryBindPassword}
                  onChange={(e) => onChange({ directoryBindPassword: e.target.value })}
                  disabled={isSettingLocked(cfg, 'directoryBindPassword')}
                />
              </FormGroup>

              <FormGroup
                label="Workgroup Mappings JSON"
                htmlFor="setup-workgroups-json"
                hint={settingSourceLabel(cfg, 'workgroupMappingsJson')}
                className="sm:col-span-2"
              >
                <Textarea
                  id="setup-workgroups-json"
                  value={form.workgroupMappingsJson}
                  onChange={(e) => onChange({ workgroupMappingsJson: e.target.value })}
                  rows={3}
                  disabled={isSettingLocked(cfg, 'workgroupMappingsJson')}
                />
              </FormGroup>

              <FormGroup
                label="Mount Policy Mode"
                htmlFor="setup-mount-policy-mode"
                hint={settingSourceLabel(cfg, 'mountPolicyMode')}
              >
                <Select
                  id="setup-mount-policy-mode"
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
                htmlFor="setup-postgres-host"
                hint={settingSourceLabel(cfg, 'postgresHost')}
              >
                <Input
                  id="setup-postgres-host"
                  type="text"
                  value={form.postgresHost}
                  onChange={(e) => onChange({ postgresHost: e.target.value })}
                  disabled={isSettingLocked(cfg, 'postgresHost') || !form.postgresEnabled}
                />
              </FormGroup>

              <FormGroup
                label="Postgres Port"
                htmlFor="setup-postgres-port"
                hint={settingSourceLabel(cfg, 'postgresPort')}
              >
                <Input
                  id="setup-postgres-port"
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
                htmlFor="setup-postgres-db"
                hint={settingSourceLabel(cfg, 'postgresDatabase')}
              >
                <Input
                  id="setup-postgres-db"
                  type="text"
                  value={form.postgresDatabase}
                  onChange={(e) => onChange({ postgresDatabase: e.target.value })}
                  disabled={isSettingLocked(cfg, 'postgresDatabase') || !form.postgresEnabled}
                />
              </FormGroup>

              <FormGroup
                label="Postgres User"
                htmlFor="setup-postgres-user"
                hint={settingSourceLabel(cfg, 'postgresUser')}
              >
                <Input
                  id="setup-postgres-user"
                  type="text"
                  value={form.postgresUser}
                  onChange={(e) => onChange({ postgresUser: e.target.value })}
                  disabled={isSettingLocked(cfg, 'postgresUser') || !form.postgresEnabled}
                />
              </FormGroup>

              <FormGroup
                label="Postgres Password"
                htmlFor="setup-postgres-password"
                hint={settingSourceLabel(cfg, 'postgresPassword')}
              >
                <Input
                  id="setup-postgres-password"
                  type="password"
                  value={form.postgresPassword}
                  onChange={(e) => onChange({ postgresPassword: e.target.value })}
                  disabled={isSettingLocked(cfg, 'postgresPassword') || !form.postgresEnabled}
                />
              </FormGroup>

              <FormGroup
                label="Postgres SSL Mode"
                htmlFor="setup-postgres-ssl-mode"
                hint={settingSourceLabel(cfg, 'postgresSslMode')}
              >
                <Select
                  id="setup-postgres-ssl-mode"
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

              <div className="sm:col-span-2 flex flex-col gap-3 pt-2">
                <Checkbox
                  id="setup-security-breakglass"
                  checked={form.securityBreakGlassEnabled}
                  onChange={(checked) => onChange({ securityBreakGlassEnabled: checked })}
                  label={`Enable local break-glass login (${settingSourceLabel(cfg, 'securityBreakGlassEnabled')}${isSettingLocked(cfg, 'securityBreakGlassEnabled') ? ', locked' : ''})`}
                  disabled={isSettingLocked(cfg, 'securityBreakGlassEnabled')}
                />
                <Checkbox
                  id="setup-postgres-enabled"
                  checked={form.postgresEnabled}
                  onChange={() => {}}
                  label={`Postgres-backed config storage is required (${settingSourceLabel(cfg, 'postgresEnabled')})`}
                  disabled
                />
              </div>
            </div>
          </Card>
        )}

        <div className="flex items-center gap-3 mt-6">
          <Button
            type="submit"
            variant="primary"
            loading={submitting}
            disabled={submitting}
          >
            <Check className="h-4 w-4" />
            Complete Setup
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={onSkip}
            disabled={submitting}
          >
            Skip for now
          </Button>
        </div>
      </form>
    </div>
  );
}
