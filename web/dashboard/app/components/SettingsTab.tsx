'use client';

import { useState } from 'react';
import { Server, Check, Sun, Moon, Monitor, Copy } from 'lucide-react';
import { Button, Input, Select, Textarea, Label, FormGroup, FormGrid, FormActions, Checkbox, Card, CardHeader, CardBody, CardFooter, PageHeader, InfoItem, Badge } from './ui';
import type { DashboardState, SettingsForm, SettingDescriptor, ThemeMode } from '../lib/types';
import { DEFAULT_SETTINGS_FORM } from '../lib/constants';
import { api } from '../lib/api';
import { settingSourceLabel, isSettingLocked, copyToClipboard, cn } from '../lib/utils';

interface SettingsTabProps {
  dashboard: DashboardState;
  refresh: () => Promise<void>;
  setNotice: (msg: string) => void;
  setError: (msg: string) => void;
  currentUser: string;
  theme: ThemeMode;
  onThemeChange: (t: ThemeMode) => void;
  settingsConfig: Record<string, SettingDescriptor>;
}

function sl(cfg: Record<string, SettingDescriptor>, key: string) {
  const src = settingSourceLabel(cfg, key);
  const locked = isSettingLocked(cfg, key);
  return `(${src}${locked ? ', locked' : ''})`;
}

export function SettingsTab({ dashboard, refresh, setNotice, setError, currentUser, theme, onThemeChange, settingsConfig: cfg }: SettingsTabProps) {
  const [form, setForm] = useState<SettingsForm>(() => buildFormFromState(dashboard, currentUser));
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof SettingsForm>(k: K, v: SettingsForm[K]) => setForm((p) => ({ ...p, [k]: v }));

  const stripLocked = (payload: Record<string, unknown>) => {
    const next = { ...payload };
    for (const [key, desc] of Object.entries(cfg || {})) { if (desc?.locked) delete next[key]; }
    return next;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/admin/api/settings', {
        method: 'PUT',
        body: JSON.stringify(stripLocked({
          adminUsername: form.adminUsername.trim() || undefined,
          adminPassword: form.adminPassword || undefined,
          apiToken: form.apiToken.trim() || undefined,
          adminSessionSeconds: Number(form.adminSessionSeconds || 43200),
          hostname: form.hostname, browseShareName: form.browseShareName, browseShareEnabled: form.browseShareEnabled,
          rootShareName: form.browseShareName, smbPublicPort: Number(form.smbPublicPort || 445),
          smbEnabled: form.smbEnabled, sftpEnabled: form.sftpEnabled, mountManagementEnabled: form.mountManagementEnabled,
          smbStreamsBackend: form.smbStreamsBackend, mountPollSeconds: Number(form.mountPollSeconds || 30),
          vpsCacheDir: form.vpsCacheDir, vpsCacheEnabled: form.vpsCacheEnabled,
          vpsWriteBackSeconds: Number(form.vpsWriteBackSeconds || 120), vpsCacheMaxSizeGb: Number(form.vpsCacheMaxSizeGb || 1),
          vpsCacheMaxAgeHours: Number(form.vpsCacheMaxAgeHours || 24), vpsReadAheadMb: Number(form.vpsReadAheadMb || 16),
          enterpriseFeaturesEnabled: form.enterpriseFeaturesEnabled, adminAuthMode: form.adminAuthMode,
          smbAuthMode: form.smbAuthMode, sftpAuthMode: form.sftpAuthMode,
          securityIpAllowlist: form.securityIpAllowlist, securityBreakGlassEnabled: form.securityBreakGlassEnabled,
          securityAuditRetentionDays: Number(form.securityAuditRetentionDays || 180),
          oidcIssuer: form.oidcIssuer, oidcClientId: form.oidcClientId, oidcClientSecret: form.oidcClientSecret,
          oidcScopes: form.oidcScopes, oidcAdminGroup: form.oidcAdminGroup, oidcReadOnlyGroup: form.oidcReadOnlyGroup,
          directoryDomain: form.directoryDomain, directoryRealm: form.directoryRealm, directoryUrl: form.directoryUrl,
          directoryBindDn: form.directoryBindDn, directoryBindPassword: form.directoryBindPassword,
          workgroupMappingsJson: form.workgroupMappingsJson, mountPolicyMode: form.mountPolicyMode,
          postgresEnabled: form.postgresEnabled, postgresHost: form.postgresHost, postgresPort: Number(form.postgresPort || 5432),
          postgresDatabase: form.postgresDatabase, postgresUser: form.postgresUser, postgresPassword: form.postgresPassword,
          postgresSslMode: form.postgresSslMode, applySamba: form.smbEnabled,
        }))
      });
      await refresh();
      setForm((p) => ({ ...p, adminPassword: '', apiToken: '' }));
      setNotice('Settings saved successfully.');
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const cp = async (label: string, value?: string) => { const r = await copyToClipboard(label, value); r.ok ? setNotice(r.message) : setError(r.message); };

  return (
    <div className="animate-[fade-in_0.2s_ease]">
      <PageHeader title="Server Settings" description="Configure your TM Adapter server." />

      {/* Appearance */}
      <Card className="mb-4">
        <CardBody>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">Appearance</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Choose your preferred color scheme.</p>
          <div className="flex gap-2">
            {([
              { id: 'light' as const, icon: Sun, label: 'Light' },
              { id: 'system' as const, icon: Monitor, label: 'System' },
              { id: 'dark' as const, icon: Moon, label: 'Dark' },
            ]).map(({ id, icon: TIcon, label }) => (
              <button
                key={id}
                onClick={() => onThemeChange(id)}
                type="button"
                className={cn(
                  'flex-1 flex flex-col items-center gap-1.5 py-3 rounded-lg border-2 text-xs font-medium transition-all',
                  theme === id
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400'
                    : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600'
                )}
              >
                <TIcon className="h-5 w-5" />
                {label}
              </button>
            ))}
          </div>
        </CardBody>
      </Card>

      {/* Server Config */}
      <Card className="mb-4">
        <CardHeader><h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2"><Server className="h-4 w-4 text-slate-400" /> Server Configuration</h3></CardHeader>
        <CardBody>
          <form onSubmit={handleSave}>
            <FormGrid>
              <FormGroup><Label>Admin Username</Label><Input value={form.adminUsername} onChange={(e) => set('adminUsername', e.target.value)} placeholder="admin" /></FormGroup>
              <FormGroup><Label>Admin Password</Label><Input type="password" value={form.adminPassword} onChange={(e) => set('adminPassword', e.target.value)} placeholder="Leave blank to keep current" /></FormGroup>
              <FormGroup><Label>API Token</Label><Input type="password" value={form.apiToken} onChange={(e) => set('apiToken', e.target.value)} placeholder={dashboard.settings?.apiTokenConfigured ? 'Leave blank to keep current' : 'Required for /api/*'} /></FormGroup>
              <FormGroup><Label>Session Duration (seconds)</Label><Input type="number" min={60} max={2592000} value={form.adminSessionSeconds} onChange={(e) => set('adminSessionSeconds', e.target.value)} required /></FormGroup>
              <FormGroup><Label>Hostname or IP</Label><Input value={form.hostname} onChange={(e) => set('hostname', e.target.value)} placeholder="backup.example.com" /></FormGroup>
              <FormGroup><Label>Browse Share Name</Label><Input value={form.browseShareName} onChange={(e) => { set('browseShareName', e.target.value); set('rootShareName', e.target.value); }} required /></FormGroup>
              <FormGroup><Label>SMB Public Port</Label><Input type="number" min={1} max={65535} value={form.smbPublicPort} onChange={(e) => set('smbPublicPort', e.target.value)} required /></FormGroup>
              <FormGroup><Label>VPS Cache Directory</Label><Input value={form.vpsCacheDir} onChange={(e) => set('vpsCacheDir', e.target.value)} required /></FormGroup>
              <FormGroup><Label>SMB Streams Backend</Label><Select value={form.smbStreamsBackend} onChange={(e) => set('smbStreamsBackend', e.target.value)}><option value="xattr">xattr (default)</option><option value="depot">depot (compatibility)</option></Select></FormGroup>
              <FormGroup><Label>Mount Poll Interval (seconds)</Label><Input type="number" min={10} max={86400} value={form.mountPollSeconds} onChange={(e) => set('mountPollSeconds', e.target.value)} required /></FormGroup>
              <FormGroup><Label>Write-Back Delay (seconds)</Label><Input type="number" min={5} max={86400} value={form.vpsWriteBackSeconds} onChange={(e) => set('vpsWriteBackSeconds', e.target.value)} required /></FormGroup>
              <FormGroup><Label>Cache Max Size (GB)</Label><Input type="number" min={1} max={10240} value={form.vpsCacheMaxSizeGb} onChange={(e) => set('vpsCacheMaxSizeGb', e.target.value)} required /></FormGroup>
              <FormGroup><Label>Cache Max Age (hours)</Label><Input type="number" min={1} max={720} value={form.vpsCacheMaxAgeHours} onChange={(e) => set('vpsCacheMaxAgeHours', e.target.value)} required /></FormGroup>
              <FormGroup><Label>Read Buffer (MB)</Label><Input type="number" min={1} max={2048} value={form.vpsReadAheadMb} onChange={(e) => set('vpsReadAheadMb', e.target.value)} required /></FormGroup>
            </FormGrid>

            <div className="flex flex-wrap gap-x-6 gap-y-2 mt-4">
              <Checkbox label="Enable SMB management" checked={form.smbEnabled} onChange={(v) => set('smbEnabled', v)} />
              <Checkbox label="Enable browse share" checked={form.browseShareEnabled} onChange={(v) => set('browseShareEnabled', v)} />
              <Checkbox label="Enable SFTP access" checked={form.sftpEnabled} onChange={(v) => set('sftpEnabled', v)} />
              <Checkbox label="Enable mount manager" checked={form.mountManagementEnabled} onChange={(v) => set('mountManagementEnabled', v)} />
              <Checkbox label="Enable VPS read/write cache" checked={form.vpsCacheEnabled} onChange={(v) => set('vpsCacheEnabled', v)} />
            </div>

            {/* Enterprise Section */}
            <div className="mt-4 bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
              <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">Enterprise Auth & Security</h4>
              <div className="flex flex-wrap gap-x-6 gap-y-2 mb-3">
                <Checkbox label={`Enterprise features ${sl(cfg, 'enterpriseFeaturesEnabled')}`} checked={form.enterpriseFeaturesEnabled} onChange={(v) => set('enterpriseFeaturesEnabled', v)} disabled={isSettingLocked(cfg, 'enterpriseFeaturesEnabled')} />
                <Checkbox label={`Break-glass local login ${sl(cfg, 'securityBreakGlassEnabled')}`} checked={form.securityBreakGlassEnabled} onChange={(v) => set('securityBreakGlassEnabled', v)} disabled={isSettingLocked(cfg, 'securityBreakGlassEnabled')} />
                <Checkbox label={`Postgres-backed config ${sl(cfg, 'postgresEnabled')}`} checked={form.postgresEnabled} onChange={(v) => set('postgresEnabled', v)} disabled />
              </div>
              <FormGrid>
                <FormGroup><Label>Admin Auth Mode {sl(cfg, 'adminAuthMode')}</Label><Select value={form.adminAuthMode} onChange={(e) => set('adminAuthMode', e.target.value)} disabled={isSettingLocked(cfg, 'adminAuthMode')}><option value="local">Break-glass local admin</option><option value="centralized">Centralized local users</option><option value="oidc">OIDC SSO</option><option value="ldap">LDAP / Active Directory</option></Select></FormGroup>
                <FormGroup><Label>SMB Auth Mode {sl(cfg, 'smbAuthMode')}</Label><Select value={form.smbAuthMode} onChange={(e) => set('smbAuthMode', e.target.value)} disabled={isSettingLocked(cfg, 'smbAuthMode')}><option value="legacy-per-share">Legacy per-share credentials</option><option value="centralized">Centralized user access</option></Select></FormGroup>
                <FormGroup><Label>SFTP Auth Mode {sl(cfg, 'sftpAuthMode')}</Label><Select value={form.sftpAuthMode} onChange={(e) => set('sftpAuthMode', e.target.value)} disabled={isSettingLocked(cfg, 'sftpAuthMode')}><option value="legacy-per-share">Legacy per-share credentials</option><option value="centralized">Centralized user access</option></Select></FormGroup>
                <FormGroup><Label>IP Allowlist {sl(cfg, 'securityIpAllowlist')}</Label><Input value={form.securityIpAllowlist} onChange={(e) => set('securityIpAllowlist', e.target.value)} placeholder="10.0.0.0/8,192.168.0.0/16" disabled={isSettingLocked(cfg, 'securityIpAllowlist')} /></FormGroup>
                <FormGroup><Label>Audit Retention Days {sl(cfg, 'securityAuditRetentionDays')}</Label><Input type="number" min={1} max={3650} value={form.securityAuditRetentionDays} onChange={(e) => set('securityAuditRetentionDays', e.target.value)} disabled={isSettingLocked(cfg, 'securityAuditRetentionDays')} /></FormGroup>
                <FormGroup><Label>OIDC Issuer {sl(cfg, 'oidcIssuer')}</Label><Input value={form.oidcIssuer} onChange={(e) => set('oidcIssuer', e.target.value)} placeholder="https://idp.example.com" disabled={isSettingLocked(cfg, 'oidcIssuer')} /></FormGroup>
                <FormGroup><Label>OIDC Client ID {sl(cfg, 'oidcClientId')}</Label><Input value={form.oidcClientId} onChange={(e) => set('oidcClientId', e.target.value)} disabled={isSettingLocked(cfg, 'oidcClientId')} /></FormGroup>
                <FormGroup><Label>OIDC Client Secret {sl(cfg, 'oidcClientSecret')}</Label><Input type="password" value={form.oidcClientSecret} onChange={(e) => set('oidcClientSecret', e.target.value)} disabled={isSettingLocked(cfg, 'oidcClientSecret')} /></FormGroup>
                <FormGroup><Label>OIDC Scopes {sl(cfg, 'oidcScopes')}</Label><Input value={form.oidcScopes} onChange={(e) => set('oidcScopes', e.target.value)} disabled={isSettingLocked(cfg, 'oidcScopes')} /></FormGroup>
                <FormGroup><Label>OIDC Admin Group {sl(cfg, 'oidcAdminGroup')}</Label><Input value={form.oidcAdminGroup} onChange={(e) => set('oidcAdminGroup', e.target.value)} disabled={isSettingLocked(cfg, 'oidcAdminGroup')} /></FormGroup>
                <FormGroup><Label>OIDC Read-only Group {sl(cfg, 'oidcReadOnlyGroup')}</Label><Input value={form.oidcReadOnlyGroup} onChange={(e) => set('oidcReadOnlyGroup', e.target.value)} disabled={isSettingLocked(cfg, 'oidcReadOnlyGroup')} /></FormGroup>
                <FormGroup><Label>Directory URL {sl(cfg, 'directoryUrl')}</Label><Input value={form.directoryUrl} onChange={(e) => set('directoryUrl', e.target.value)} disabled={isSettingLocked(cfg, 'directoryUrl')} /></FormGroup>
                <FormGroup><Label>Directory Domain {sl(cfg, 'directoryDomain')}</Label><Input value={form.directoryDomain} onChange={(e) => set('directoryDomain', e.target.value)} disabled={isSettingLocked(cfg, 'directoryDomain')} /></FormGroup>
                <FormGroup><Label>Directory Realm {sl(cfg, 'directoryRealm')}</Label><Input value={form.directoryRealm} onChange={(e) => set('directoryRealm', e.target.value)} disabled={isSettingLocked(cfg, 'directoryRealm')} /></FormGroup>
                <FormGroup><Label>Directory Bind DN {sl(cfg, 'directoryBindDn')}</Label><Input value={form.directoryBindDn} onChange={(e) => set('directoryBindDn', e.target.value)} disabled={isSettingLocked(cfg, 'directoryBindDn')} /></FormGroup>
                <FormGroup><Label>Directory Bind Password {sl(cfg, 'directoryBindPassword')}</Label><Input type="password" value={form.directoryBindPassword} onChange={(e) => set('directoryBindPassword', e.target.value)} disabled={isSettingLocked(cfg, 'directoryBindPassword')} /></FormGroup>
                <FormGroup><Label>Workgroup Mappings JSON {sl(cfg, 'workgroupMappingsJson')}</Label><Textarea value={form.workgroupMappingsJson} onChange={(e) => set('workgroupMappingsJson', e.target.value)} rows={2} disabled={isSettingLocked(cfg, 'workgroupMappingsJson')} /></FormGroup>
                <FormGroup><Label>Mount Policy Mode {sl(cfg, 'mountPolicyMode')}</Label><Select value={form.mountPolicyMode} onChange={(e) => set('mountPolicyMode', e.target.value)} disabled={isSettingLocked(cfg, 'mountPolicyMode')}><option value="policy_templates">Policy templates + guarded overrides</option><option value="global_defaults">Single global defaults</option><option value="guidelines">Guidelines only</option></Select></FormGroup>
                <FormGroup><Label>Postgres Host {sl(cfg, 'postgresHost')}</Label><Input value={form.postgresHost} onChange={(e) => set('postgresHost', e.target.value)} disabled={isSettingLocked(cfg, 'postgresHost') || !form.postgresEnabled} /></FormGroup>
                <FormGroup><Label>Postgres Port {sl(cfg, 'postgresPort')}</Label><Input type="number" min={1} max={65535} value={form.postgresPort} onChange={(e) => set('postgresPort', e.target.value)} disabled={isSettingLocked(cfg, 'postgresPort') || !form.postgresEnabled} /></FormGroup>
                <FormGroup><Label>Postgres Database {sl(cfg, 'postgresDatabase')}</Label><Input value={form.postgresDatabase} onChange={(e) => set('postgresDatabase', e.target.value)} disabled={isSettingLocked(cfg, 'postgresDatabase') || !form.postgresEnabled} /></FormGroup>
                <FormGroup><Label>Postgres User {sl(cfg, 'postgresUser')}</Label><Input value={form.postgresUser} onChange={(e) => set('postgresUser', e.target.value)} disabled={isSettingLocked(cfg, 'postgresUser') || !form.postgresEnabled} /></FormGroup>
                <FormGroup><Label>Postgres Password {sl(cfg, 'postgresPassword')}</Label><Input type="password" value={form.postgresPassword} onChange={(e) => set('postgresPassword', e.target.value)} disabled={isSettingLocked(cfg, 'postgresPassword') || !form.postgresEnabled} /></FormGroup>
                <FormGroup><Label>Postgres SSL Mode {sl(cfg, 'postgresSslMode')}</Label><Select value={form.postgresSslMode} onChange={(e) => set('postgresSslMode', e.target.value)} disabled={isSettingLocked(cfg, 'postgresSslMode') || !form.postgresEnabled}><option value="disable">disable</option><option value="require">require</option><option value="verify-ca">verify-ca</option><option value="verify-full">verify-full</option></Select></FormGroup>
              </FormGrid>
            </div>

            <FormActions>
              <Button variant="primary" type="submit" disabled={busy}><Check className="h-3.5 w-3.5" /> Save Settings</Button>
            </FormActions>
          </form>
        </CardBody>
      </Card>

      {/* Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatusCard title="Samba" enabled={!!dashboard.samba?.effectiveEnabled} details={[dashboard.samba?.confDir || '/etc/samba/smb.conf.d/tm-adapter', `Streams: ${dashboard.settings?.smbStreamsBackend || 'xattr'}`]} />
        <StatusCard title="Mount Manager" enabled={!!dashboard.mountManager?.effectiveEnabled} details={[`Poll: ${dashboard.mountManager?.pollSeconds || 30}s`, `Cache: ${dashboard.settings?.vpsCacheEnabled === false ? 'Off' : 'On'} (${dashboard.settings?.vpsCacheMaxSizeGb || 1}GB)`]} />
        <StatusCard title="SFTP" enabled={!!dashboard.sftp?.enabled} details={[dashboard.sftp?.url || 'sftp://<server>']} />
        <StatusCard title="Enterprise" enabled={!!dashboard.settings?.enterpriseFeaturesEnabled} details={[`Admin: ${dashboard.settings?.adminAuthMode || 'local'}`, `SMB: ${dashboard.settings?.smbAuthMode || 'local'}`]} />
      </div>

      {/* SFTP Config */}
      <Card>
        <CardHeader><h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">SFTP Configuration</h3></CardHeader>
        <CardBody>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            <InfoItem label="URL" value={dashboard.sftp?.url || ''} />
            <InfoItem label="Username" value={dashboard.sftp?.username || ''} />
            <InfoItem label="Password" value={dashboard.sftp?.password || ''} />
            <InfoItem label="Root Path" value={dashboard.sftp?.rootPath || '/smb-share'} />
          </div>
        </CardBody>
        <CardFooter>
          <Button size="sm" onClick={() => cp('SFTP URL', dashboard.sftp?.url)}><Copy className="h-3 w-3" /> URL</Button>
          <Button size="sm" onClick={() => cp('SFTP username', dashboard.sftp?.username)}><Copy className="h-3 w-3" /> Username</Button>
          <Button size="sm" onClick={() => cp('SFTP password', dashboard.sftp?.password)}><Copy className="h-3 w-3" /> Password</Button>
        </CardFooter>
      </Card>
    </div>
  );
}

function StatusCard({ title, enabled, details }: { title: string; enabled: boolean; details: string[] }) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
      <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">{title}</div>
      <div className={cn('text-lg font-bold', enabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500')}>{enabled ? 'Enabled' : 'Disabled'}</div>
      {details.map((d, i) => <div key={i} className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">{d}</div>)}
    </div>
  );
}

function buildFormFromState(dashboard: DashboardState, currentUser: string): SettingsForm {
  const s = dashboard?.settings;
  return {
    adminUsername: s?.adminUsername || currentUser || 'admin',
    adminPassword: '',
    apiToken: '',
    adminSessionSeconds: String(s?.adminSessionSeconds || 43200),
    hostname: s?.hostname || '',
    rootShareName: s?.rootShareName || 'timemachine',
    browseShareName: s?.browseShareName || s?.rootShareName || 'timemachine',
    browseShareEnabled: s?.browseShareEnabled !== false,
    smbPublicPort: String(s?.smbPublicPort || 445),
    smbEnabled: s?.smbEnabled !== false,
    sftpEnabled: s?.sftpEnabled !== false,
    mountManagementEnabled: s?.mountManagementEnabled !== false,
    smbStreamsBackend: s?.smbStreamsBackend || 'xattr',
    mountPollSeconds: String(s?.mountPollSeconds || 30),
    vpsCacheDir: s?.vpsCacheDir || '/data/vps/rclone-vfs-cache',
    vpsCacheEnabled: s?.vpsCacheEnabled !== false,
    vpsWriteBackSeconds: String(s?.vpsWriteBackSeconds || 120),
    vpsCacheMaxSizeGb: String(s?.vpsCacheMaxSizeGb || 1),
    vpsCacheMaxAgeHours: String(s?.vpsCacheMaxAgeHours || 24),
    vpsReadAheadMb: String(s?.vpsReadAheadMb || 16),
    enterpriseFeaturesEnabled: s?.enterpriseFeaturesEnabled === true,
    adminAuthMode: s?.adminAuthMode || 'local',
    smbAuthMode: s?.smbAuthMode || 'local',
    sftpAuthMode: s?.sftpAuthMode || 'local',
    securityIpAllowlist: s?.securityIpAllowlist || '',
    securityBreakGlassEnabled: s?.securityBreakGlassEnabled !== false,
    securityAuditRetentionDays: String(s?.securityAuditRetentionDays || 180),
    oidcIssuer: s?.oidcIssuer || '',
    oidcClientId: s?.oidcClientId || '',
    oidcClientSecret: s?.oidcClientSecret || '',
    oidcScopes: s?.oidcScopes || 'openid profile email groups',
    oidcAdminGroup: s?.oidcAdminGroup || '',
    oidcReadOnlyGroup: s?.oidcReadOnlyGroup || '',
    directoryDomain: s?.directoryDomain || '',
    directoryRealm: s?.directoryRealm || '',
    directoryUrl: s?.directoryUrl || '',
    directoryBindDn: s?.directoryBindDn || '',
    directoryBindPassword: s?.directoryBindPassword || '',
    workgroupMappingsJson: s?.workgroupMappingsJson || '[]',
    mountPolicyMode: s?.mountPolicyMode || 'policy_templates',
    postgresEnabled: s?.postgresEnabled !== false,
    postgresHost: s?.postgresHost || 'postgres',
    postgresPort: String(s?.postgresPort || 5432),
    postgresDatabase: s?.postgresDatabase || 'tm_adapter',
    postgresUser: s?.postgresUser || 'tm_adapter',
    postgresPassword: s?.postgresPassword || '',
    postgresSslMode: s?.postgresSslMode || 'disable',
  };
}
