'use client';

import { useCallback, useEffect, useState } from 'react';
import { HardDrive, Cloud, ScrollText, Settings, Menu } from 'lucide-react';
import { api } from './lib/api';
import { DEFAULT_SETTINGS_FORM } from './lib/constants';
import type { DashboardState, SettingsForm, SettingDescriptor, TabId } from './lib/types';
import { isSettingLocked } from './lib/utils';
import { useTheme } from './hooks/useTheme';
import { Banner, Spinner } from './components/ui';
import { Sidebar } from './components/Sidebar';
import { LoginPage } from './components/LoginPage';
import { SetupBanner } from './components/SetupBanner';
import { SharesTab } from './components/SharesTab';
import { MountsTab } from './components/MountsTab';
import { LogsTab } from './components/LogsTab';
import { SettingsTab } from './components/SettingsTab';

export default function DashboardPage() {
  const [sessionLoading, setSessionLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState('');
  const [activeTab, setActiveTab] = useState<TabId>('drives');
  const [dashboard, setDashboard] = useState<DashboardState | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loginForm, setLoginForm] = useState({ username: 'admin', password: '' });

  const [setupForm, setSetupForm] = useState<SettingsForm>({ ...DEFAULT_SETTINGS_FORM });

  const { theme, setTheme } = useTheme();
  const settingsConfig: Record<string, SettingDescriptor> = dashboard?.settingsConfig || {};

  const refreshState = useCallback(async () => {
    const next = await api<DashboardState>('/admin/api/state');
    setDashboard(next);
    syncSetupForm(next);
    return next;
  }, []);

  const syncSetupForm = (next: DashboardState) => {
    const s = next?.settings;
    setSetupForm((prev) => ({
      ...prev,
      adminUsername: prev.adminUsername || currentUser || 'admin',
      adminPassword: '',
      apiToken: '',
      adminSessionSeconds: String(s?.adminSessionSeconds || 43200),
      vpsCacheDir: s?.vpsCacheDir || '/data/vps/rclone-vfs-cache',
      hostname: s?.hostname || '',
      rootShareName: s?.rootShareName || 'timemachine',
      browseShareName: s?.browseShareName || s?.rootShareName || 'timemachine',
      browseShareEnabled: s?.browseShareEnabled !== false,
      smbPublicPort: String(s?.smbPublicPort || 445),
      smbStreamsBackend: s?.smbStreamsBackend || 'xattr',
      mountPollSeconds: String(s?.mountPollSeconds || 30),
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
    }));
  };

  const stripLocked = useCallback((payload: Record<string, unknown>) => {
    if (!settingsConfig) return payload;
    const next = { ...payload };
    for (const [key, desc] of Object.entries(settingsConfig)) { if (desc?.locked) delete next[key]; }
    return next;
  }, [settingsConfig]);

  // Check session on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const session = await api<{ authenticated: boolean; username?: string }>('/admin/api/session');
        if (cancelled) return;
        if (session.authenticated) {
          setAuthenticated(true);
          setCurrentUser(session.username || 'admin');
          await refreshState();
        }
      } catch { /* ignore */ }
      finally { if (!cancelled) setSessionLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [refreshState]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setSubmitting(true);
    try {
      const res = await api<{ username?: string }>('/admin/api/login', { method: 'POST', body: JSON.stringify(loginForm) });
      setAuthenticated(true);
      setCurrentUser(res?.username || loginForm.username || 'admin');
      setLoginForm((p) => ({ ...p, password: '' }));
      await refreshState();
      setNotice('Welcome back!');
    } catch (err) { setError((err as Error).message); }
    finally { setSubmitting(false); }
  };

  const handleLogout = async () => {
    setSubmitting(true);
    try {
      await api('/admin/api/logout', { method: 'POST', body: '{}' });
      setAuthenticated(false);
      setDashboard(null);
      setCurrentUser('');
      setNotice('Signed out successfully.');
    } catch (err) { setError((err as Error).message); }
    finally { setSubmitting(false); }
  };

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setSubmitting(true);
    try {
      await api('/admin/api/setup', {
        method: 'POST',
        body: JSON.stringify(stripLocked({
          adminUsername: setupForm.adminUsername || undefined,
          adminPassword: setupForm.adminPassword || undefined,
          apiToken: setupForm.apiToken.trim() || undefined,
          adminSessionSeconds: Number(setupForm.adminSessionSeconds || 43200),
          vpsCacheDir: setupForm.vpsCacheDir,
          hostname: setupForm.hostname,
          browseShareName: setupForm.browseShareName,
          browseShareEnabled: setupForm.browseShareEnabled,
          rootShareName: setupForm.browseShareName,
          smbPublicPort: Number(setupForm.smbPublicPort || 445),
          smbStreamsBackend: setupForm.smbStreamsBackend,
          mountPollSeconds: Number(setupForm.mountPollSeconds || 30),
          enterpriseFeaturesEnabled: setupForm.enterpriseFeaturesEnabled,
          adminAuthMode: setupForm.adminAuthMode,
          smbAuthMode: setupForm.smbAuthMode,
          sftpAuthMode: setupForm.sftpAuthMode,
          securityIpAllowlist: setupForm.securityIpAllowlist,
          securityBreakGlassEnabled: setupForm.securityBreakGlassEnabled,
          securityAuditRetentionDays: Number(setupForm.securityAuditRetentionDays || 180),
          oidcIssuer: setupForm.oidcIssuer, oidcClientId: setupForm.oidcClientId,
          oidcClientSecret: setupForm.oidcClientSecret, oidcScopes: setupForm.oidcScopes,
          oidcAdminGroup: setupForm.oidcAdminGroup, oidcReadOnlyGroup: setupForm.oidcReadOnlyGroup,
          directoryDomain: setupForm.directoryDomain, directoryRealm: setupForm.directoryRealm,
          directoryUrl: setupForm.directoryUrl, directoryBindDn: setupForm.directoryBindDn,
          directoryBindPassword: setupForm.directoryBindPassword,
          workgroupMappingsJson: setupForm.workgroupMappingsJson, mountPolicyMode: setupForm.mountPolicyMode,
          postgresEnabled: setupForm.postgresEnabled, postgresHost: setupForm.postgresHost,
          postgresPort: Number(setupForm.postgresPort || 5432), postgresDatabase: setupForm.postgresDatabase,
          postgresUser: setupForm.postgresUser, postgresPassword: setupForm.postgresPassword,
          postgresSslMode: setupForm.postgresSslMode,
          applySamba: true, markSetupComplete: true,
        }))
      });
      await refreshState();
      setSetupForm((p) => ({ ...p, adminPassword: '', apiToken: '' }));
      setNotice('Setup complete! Your server is ready.');
    } catch (err) { setError((err as Error).message); }
    finally { setSubmitting(false); }
  };

  const markSetupComplete = async () => {
    setSubmitting(true);
    try {
      await api('/admin/api/setup', { method: 'POST', body: JSON.stringify({ applySamba: false, markSetupComplete: true }) });
      await refreshState();
      setNotice('Setup marked complete.');
    } catch (err) { setError((err as Error).message); }
    finally { setSubmitting(false); }
  };

  // Unauthenticated views
  if (sessionLoading || !authenticated) {
    return <LoginPage loginForm={loginForm} setLoginForm={setLoginForm} onSubmit={handleLogin} submitting={submitting} error={error} sessionLoading={sessionLoading} />;
  }

  if (!dashboard) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="text-center"><Spinner className="mx-auto mb-3" /><p className="text-sm text-slate-500">Loading dashboard...</p></div>
      </main>
    );
  }

  const shares = dashboard.shares || dashboard.disks || [];
  const mounts = dashboard.mounts || [];
  const navItems = [
    { id: 'drives' as const, icon: HardDrive, label: 'Shares', count: shares.length },
    { id: 'mounts' as const, icon: Cloud, label: 'Cloud Mounts', count: mounts.length },
    { id: 'logs' as const, icon: ScrollText, label: 'Live Logs' },
    { id: 'settings' as const, icon: Settings, label: 'Settings' },
  ];

  const refresh = async () => { await refreshState(); };

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Mobile Header */}
      <div className="fixed top-0 left-0 right-0 z-30 flex items-center gap-3 px-4 py-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 lg:hidden">
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
          <Menu className="h-5 w-5 text-slate-600 dark:text-slate-400" />
        </button>
        <span className="font-semibold text-sm text-slate-900 dark:text-slate-100">TM Adapter</span>
      </div>

      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        navItems={navItems}
        currentUser={currentUser}
        theme={theme}
        onThemeChange={setTheme}
        onLogout={handleLogout}
        submitting={submitting}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <main className="flex-1 min-w-0 pt-14 lg:pt-0">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* Notifications */}
          <div className="space-y-2 mb-4">
            {notice && <Banner variant="success" onClose={() => setNotice('')}>{notice}</Banner>}
            {error && <Banner variant="error" onClose={() => setError('')}>{error}</Banner>}
          </div>

          {/* Setup Banner */}
          {dashboard.settings?.setupCompleted !== true && (
            <SetupBanner
              form={setupForm}
              setForm={setSetupForm}
              settingsConfig={settingsConfig}
              onSubmit={handleSetup}
              onSkip={markSetupComplete}
              submitting={submitting}
            />
          )}

          {/* Tab Content */}
          {activeTab === 'drives' && <SharesTab dashboard={dashboard} refresh={refresh} setNotice={setNotice} setError={setError} />}
          {activeTab === 'mounts' && <MountsTab dashboard={dashboard} refresh={refresh} setNotice={setNotice} setError={setError} />}
          {activeTab === 'logs' && <LogsTab dashboard={dashboard} authenticated={authenticated} />}
          {activeTab === 'settings' && <SettingsTab dashboard={dashboard} refresh={refresh} setNotice={setNotice} setError={setError} currentUser={currentUser} theme={theme} onThemeChange={setTheme} settingsConfig={settingsConfig} />}
        </div>
      </main>
    </div>
  );
}
