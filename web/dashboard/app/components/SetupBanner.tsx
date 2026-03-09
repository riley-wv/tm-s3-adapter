'use client';

import { Rocket, Check } from 'lucide-react';
import { Button, Input, Select, Label, FormGroup, FormGrid, Checkbox, Textarea } from './ui';
import type { SettingsForm, SettingDescriptor } from '../lib/types';
import { settingSourceLabel, isSettingLocked } from '../lib/utils';

interface SetupBannerProps {
  form: SettingsForm;
  setForm: React.Dispatch<React.SetStateAction<SettingsForm>>;
  settingsConfig: Record<string, SettingDescriptor>;
  onSubmit: (e: React.FormEvent) => void;
  onSkip: () => void;
  submitting: boolean;
}

function sl(config: Record<string, SettingDescriptor>, key: string) {
  const src = settingSourceLabel(config, key);
  const locked = isSettingLocked(config, key);
  return `(${src}${locked ? ', locked' : ''})`;
}

export function SetupBanner({ form, setForm, settingsConfig: cfg, onSubmit, onSkip, submitting }: SetupBannerProps) {
  const set = <K extends keyof SettingsForm>(key: K, val: SettingsForm[K]) => setForm((p) => ({ ...p, [key]: val }));

  return (
    <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/50 rounded-xl p-5 mb-5 animate-[fade-in_0.25s_ease]">
      <div className="flex items-center gap-2 mb-1">
        <Rocket className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Initial Setup Required</h3>
      </div>
      <p className="text-xs text-slate-600 dark:text-slate-400 mb-4">Configure your server settings to get started.</p>

      <form onSubmit={onSubmit}>
        <FormGrid>
          <FormGroup>
            <Label>Admin Username</Label>
            <Input value={form.adminUsername} onChange={(e) => set('adminUsername', e.target.value)} placeholder="admin" />
          </FormGroup>
          <FormGroup>
            <Label>Admin Password</Label>
            <Input type="password" value={form.adminPassword} onChange={(e) => set('adminPassword', e.target.value)} placeholder="Leave blank to keep current" />
          </FormGroup>
          <FormGroup>
            <Label>API Token</Label>
            <Input type="password" value={form.apiToken} onChange={(e) => set('apiToken', e.target.value)} placeholder="Leave blank to keep current" />
          </FormGroup>
          <FormGroup>
            <Label>Session Duration (seconds)</Label>
            <Input type="number" min={60} max={2592000} value={form.adminSessionSeconds} onChange={(e) => set('adminSessionSeconds', e.target.value)} />
          </FormGroup>
          <FormGroup>
            <Label>VPS Cache Directory</Label>
            <Input value={form.vpsCacheDir} onChange={(e) => set('vpsCacheDir', e.target.value)} placeholder="/data/vps/rclone-vfs-cache" />
          </FormGroup>
          <FormGroup>
            <Label>Hostname or IP</Label>
            <Input value={form.hostname} onChange={(e) => set('hostname', e.target.value)} placeholder="127.0.0.1" />
          </FormGroup>
          <FormGroup>
            <Label>Browse Share Name</Label>
            <Input value={form.browseShareName} onChange={(e) => { set('browseShareName', e.target.value); set('rootShareName', e.target.value); }} required />
          </FormGroup>
          <FormGroup>
            <Label>SMB Port</Label>
            <Input type="number" min={1} max={65535} value={form.smbPublicPort} onChange={(e) => set('smbPublicPort', e.target.value)} required />
          </FormGroup>
          <FormGroup>
            <Label>SMB Streams Backend</Label>
            <Select value={form.smbStreamsBackend} onChange={(e) => set('smbStreamsBackend', e.target.value)}>
              <option value="xattr">xattr (default)</option>
              <option value="depot">depot (compatibility)</option>
            </Select>
          </FormGroup>
          <FormGroup>
            <Label>Mount Poll Interval (seconds)</Label>
            <Input type="number" min={10} max={86400} value={form.mountPollSeconds} onChange={(e) => set('mountPollSeconds', e.target.value)} />
          </FormGroup>
        </FormGrid>

        <div className="flex flex-wrap gap-x-6 gap-y-2 mt-4">
          <Checkbox label="Enable browse share" checked={form.browseShareEnabled} onChange={(v) => set('browseShareEnabled', v)} />
          <Checkbox
            label={`Enable enterprise features ${sl(cfg, 'enterpriseFeaturesEnabled')}`}
            checked={form.enterpriseFeaturesEnabled}
            onChange={(v) => set('enterpriseFeaturesEnabled', v)}
            disabled={isSettingLocked(cfg, 'enterpriseFeaturesEnabled')}
          />
        </div>

        {form.enterpriseFeaturesEnabled && (
          <div className="mt-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
            <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">Enterprise Settings (Optional)</h4>
            <FormGrid>
              <FormGroup>
                <Label>Admin Auth Mode {sl(cfg, 'adminAuthMode')}</Label>
                <Select value={form.adminAuthMode} onChange={(e) => set('adminAuthMode', e.target.value)} disabled={isSettingLocked(cfg, 'adminAuthMode')}>
                  <option value="local">Break-glass local admin</option>
                  <option value="centralized">Centralized local users</option>
                  <option value="oidc">OIDC SSO</option>
                  <option value="ldap">LDAP / Active Directory</option>
                </Select>
              </FormGroup>
              <FormGroup>
                <Label>SMB Auth Mode {sl(cfg, 'smbAuthMode')}</Label>
                <Select value={form.smbAuthMode} onChange={(e) => set('smbAuthMode', e.target.value)} disabled={isSettingLocked(cfg, 'smbAuthMode')}>
                  <option value="legacy-per-share">Legacy per-share credentials</option>
                  <option value="centralized">Centralized user access</option>
                </Select>
              </FormGroup>
              <FormGroup>
                <Label>SFTP Auth Mode {sl(cfg, 'sftpAuthMode')}</Label>
                <Select value={form.sftpAuthMode} onChange={(e) => set('sftpAuthMode', e.target.value)} disabled={isSettingLocked(cfg, 'sftpAuthMode')}>
                  <option value="legacy-per-share">Legacy per-share credentials</option>
                  <option value="centralized">Centralized user access</option>
                </Select>
              </FormGroup>
              <FormGroup>
                <Label>IP Allowlist {sl(cfg, 'securityIpAllowlist')}</Label>
                <Input value={form.securityIpAllowlist} onChange={(e) => set('securityIpAllowlist', e.target.value)} placeholder="10.0.0.0/8,192.168.0.0/16" disabled={isSettingLocked(cfg, 'securityIpAllowlist')} />
              </FormGroup>
              <FormGroup>
                <Label>Audit Retention Days {sl(cfg, 'securityAuditRetentionDays')}</Label>
                <Input type="number" min={1} max={3650} value={form.securityAuditRetentionDays} onChange={(e) => set('securityAuditRetentionDays', e.target.value)} disabled={isSettingLocked(cfg, 'securityAuditRetentionDays')} />
              </FormGroup>
              <FormGroup>
                <Label>OIDC Issuer {sl(cfg, 'oidcIssuer')}</Label>
                <Input value={form.oidcIssuer} onChange={(e) => set('oidcIssuer', e.target.value)} placeholder="https://idp.example.com" disabled={isSettingLocked(cfg, 'oidcIssuer')} />
              </FormGroup>
              <FormGroup>
                <Label>OIDC Client ID {sl(cfg, 'oidcClientId')}</Label>
                <Input value={form.oidcClientId} onChange={(e) => set('oidcClientId', e.target.value)} disabled={isSettingLocked(cfg, 'oidcClientId')} />
              </FormGroup>
              <FormGroup>
                <Label>OIDC Client Secret {sl(cfg, 'oidcClientSecret')}</Label>
                <Input type="password" value={form.oidcClientSecret} onChange={(e) => set('oidcClientSecret', e.target.value)} disabled={isSettingLocked(cfg, 'oidcClientSecret')} />
              </FormGroup>
              <FormGroup>
                <Label>OIDC Scopes {sl(cfg, 'oidcScopes')}</Label>
                <Input value={form.oidcScopes} onChange={(e) => set('oidcScopes', e.target.value)} disabled={isSettingLocked(cfg, 'oidcScopes')} />
              </FormGroup>
              <FormGroup>
                <Label>OIDC Admin Group {sl(cfg, 'oidcAdminGroup')}</Label>
                <Input value={form.oidcAdminGroup} onChange={(e) => set('oidcAdminGroup', e.target.value)} disabled={isSettingLocked(cfg, 'oidcAdminGroup')} />
              </FormGroup>
              <FormGroup>
                <Label>OIDC Read-only Group {sl(cfg, 'oidcReadOnlyGroup')}</Label>
                <Input value={form.oidcReadOnlyGroup} onChange={(e) => set('oidcReadOnlyGroup', e.target.value)} disabled={isSettingLocked(cfg, 'oidcReadOnlyGroup')} />
              </FormGroup>
              <FormGroup>
                <Label>Directory URL {sl(cfg, 'directoryUrl')}</Label>
                <Input value={form.directoryUrl} onChange={(e) => set('directoryUrl', e.target.value)} placeholder="ldaps://dc.example.com" disabled={isSettingLocked(cfg, 'directoryUrl')} />
              </FormGroup>
              <FormGroup>
                <Label>Directory Domain {sl(cfg, 'directoryDomain')}</Label>
                <Input value={form.directoryDomain} onChange={(e) => set('directoryDomain', e.target.value)} disabled={isSettingLocked(cfg, 'directoryDomain')} />
              </FormGroup>
              <FormGroup>
                <Label>Directory Realm {sl(cfg, 'directoryRealm')}</Label>
                <Input value={form.directoryRealm} onChange={(e) => set('directoryRealm', e.target.value)} disabled={isSettingLocked(cfg, 'directoryRealm')} />
              </FormGroup>
              <FormGroup>
                <Label>Directory Bind DN {sl(cfg, 'directoryBindDn')}</Label>
                <Input value={form.directoryBindDn} onChange={(e) => set('directoryBindDn', e.target.value)} disabled={isSettingLocked(cfg, 'directoryBindDn')} />
              </FormGroup>
              <FormGroup>
                <Label>Directory Bind Password {sl(cfg, 'directoryBindPassword')}</Label>
                <Input type="password" value={form.directoryBindPassword} onChange={(e) => set('directoryBindPassword', e.target.value)} disabled={isSettingLocked(cfg, 'directoryBindPassword')} />
              </FormGroup>
              <FormGroup>
                <Label>Workgroup Mappings JSON {sl(cfg, 'workgroupMappingsJson')}</Label>
                <Textarea value={form.workgroupMappingsJson} onChange={(e) => set('workgroupMappingsJson', e.target.value)} rows={2} disabled={isSettingLocked(cfg, 'workgroupMappingsJson')} />
              </FormGroup>
              <FormGroup>
                <Label>Mount Policy Mode {sl(cfg, 'mountPolicyMode')}</Label>
                <Select value={form.mountPolicyMode} onChange={(e) => set('mountPolicyMode', e.target.value)} disabled={isSettingLocked(cfg, 'mountPolicyMode')}>
                  <option value="policy_templates">Policy templates + guarded overrides</option>
                  <option value="global_defaults">Single global defaults</option>
                  <option value="guidelines">Guidelines only</option>
                </Select>
              </FormGroup>
              <FormGroup>
                <Label>Postgres Host {sl(cfg, 'postgresHost')}</Label>
                <Input value={form.postgresHost} onChange={(e) => set('postgresHost', e.target.value)} disabled={isSettingLocked(cfg, 'postgresHost') || !form.postgresEnabled} />
              </FormGroup>
              <FormGroup>
                <Label>Postgres Port {sl(cfg, 'postgresPort')}</Label>
                <Input type="number" min={1} max={65535} value={form.postgresPort} onChange={(e) => set('postgresPort', e.target.value)} disabled={isSettingLocked(cfg, 'postgresPort') || !form.postgresEnabled} />
              </FormGroup>
              <FormGroup>
                <Label>Postgres Database {sl(cfg, 'postgresDatabase')}</Label>
                <Input value={form.postgresDatabase} onChange={(e) => set('postgresDatabase', e.target.value)} disabled={isSettingLocked(cfg, 'postgresDatabase') || !form.postgresEnabled} />
              </FormGroup>
              <FormGroup>
                <Label>Postgres User {sl(cfg, 'postgresUser')}</Label>
                <Input value={form.postgresUser} onChange={(e) => set('postgresUser', e.target.value)} disabled={isSettingLocked(cfg, 'postgresUser') || !form.postgresEnabled} />
              </FormGroup>
              <FormGroup>
                <Label>Postgres Password {sl(cfg, 'postgresPassword')}</Label>
                <Input type="password" value={form.postgresPassword} onChange={(e) => set('postgresPassword', e.target.value)} disabled={isSettingLocked(cfg, 'postgresPassword') || !form.postgresEnabled} />
              </FormGroup>
              <FormGroup>
                <Label>Postgres SSL Mode {sl(cfg, 'postgresSslMode')}</Label>
                <Select value={form.postgresSslMode} onChange={(e) => set('postgresSslMode', e.target.value)} disabled={isSettingLocked(cfg, 'postgresSslMode') || !form.postgresEnabled}>
                  <option value="disable">disable</option>
                  <option value="require">require</option>
                  <option value="verify-ca">verify-ca</option>
                  <option value="verify-full">verify-full</option>
                </Select>
              </FormGroup>
            </FormGrid>
            <div className="flex flex-wrap gap-x-6 gap-y-2 mt-3">
              <Checkbox label={`Break-glass local login ${sl(cfg, 'securityBreakGlassEnabled')}`} checked={form.securityBreakGlassEnabled} onChange={(v) => set('securityBreakGlassEnabled', v)} disabled={isSettingLocked(cfg, 'securityBreakGlassEnabled')} />
              <Checkbox label={`Postgres-backed config storage is required ${sl(cfg, 'postgresEnabled')}`} checked={form.postgresEnabled} onChange={(v) => set('postgresEnabled', v)} disabled />
            </div>
          </div>
        )}

        <div className="flex gap-2 mt-4">
          <Button variant="primary" type="submit" disabled={submitting}>
            <Check className="h-3.5 w-3.5" /> Complete Setup
          </Button>
          <Button variant="ghost" type="button" onClick={onSkip} disabled={submitting}>Skip for now</Button>
        </div>
      </form>
    </div>
  );
}
