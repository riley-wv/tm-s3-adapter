'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  TabId,
  DashboardState,
  DiskForm,
  MountForm,
  SettingsForm,
  UserForm,
  GroupForm,
  ProviderForm,
  LogEntry,
  TailSource,
  Disk,
  Mount,
} from './lib/types';
import { api, parseEventData } from './lib/api';
import {
  DEFAULT_DISK_FORM,
  DEFAULT_MOUNT_FORM,
  DEFAULT_SETTINGS_FORM,
  DEFAULT_USER_FORM,
  DEFAULT_GROUP_FORM,
  DEFAULT_PROVIDER_FORM,
  MAX_DASHBOARD_LOGS,
  MAX_TAIL_LINES,
  DEFAULT_TAIL_LINE_COUNT,
  MAX_TERMINAL_CHARS,
} from './lib/constants';
import {
  mountRemoteDisplay,
  parseExtraArgs,
  formatExtraArgs,
  subdirFromPaths,
  parseIdList,
  formatIdList,
  copyToClipboard as clipCopy,
} from './lib/utils';
import { useTheme } from './hooks/useTheme';
import { Sidebar } from './components/Sidebar';
import { LoginPage } from './components/LoginPage';
import { SetupBanner } from './components/SetupBanner';
import { SharesTab } from './components/SharesTab';
import { MountsTab } from './components/MountsTab';
import { LogsTab } from './components/LogsTab';
import { SettingsTab } from './components/SettingsTab';
import { Banner, Spinner } from './components/ui';

const DEFAULT_SETUP_FORM: SettingsForm = {
  ...DEFAULT_SETTINGS_FORM,
};

export default function DashboardPage() {
  const [sessionLoading, setSessionLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState('');
  const [activeTab, setActiveTab] = useState<TabId>('shares');
  const [dashboard, setDashboard] = useState<DashboardState | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showAddDrive, setShowAddDrive] = useState(false);
  const [showAddMount, setShowAddMount] = useState(false);

  const [loginForm, setLoginForm] = useState({ username: 'admin', password: '' });
  const [settingsForm, setSettingsForm] = useState<SettingsForm>(DEFAULT_SETTINGS_FORM);
  const [setupForm, setSetupForm] = useState<SettingsForm>(DEFAULT_SETUP_FORM);
  const [diskForm, setDiskForm] = useState<DiskForm>(DEFAULT_DISK_FORM);
  const [mountForm, setMountForm] = useState<MountForm>(DEFAULT_MOUNT_FORM);
  const [userForm, setUserForm] = useState<UserForm>(DEFAULT_USER_FORM);
  const [groupForm, setGroupForm] = useState<GroupForm>(DEFAULT_GROUP_FORM);
  const [providerForm, setProviderForm] = useState<ProviderForm>(DEFAULT_PROVIDER_FORM);
  const [editingDiskId, setEditingDiskId] = useState('');
  const [editingDiskForm, setEditingDiskForm] = useState<DiskForm>(DEFAULT_DISK_FORM);
  const [editingMountId, setEditingMountId] = useState('');
  const [editingMountForm, setEditingMountForm] = useState<MountForm>(DEFAULT_MOUNT_FORM);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logHosts, setLogHosts] = useState<string[]>([]);
  const [logDrives, setLogDrives] = useState<string[]>([]);
  const [logsHostFilter, setLogsHostFilter] = useState('');
  const [logsDriveFilter, setLogsDriveFilter] = useState('');
  const [logsConnected, setLogsConnected] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState('');
  const logsListRef = useRef<HTMLDivElement | null>(null);
  const [tailSources, setTailSources] = useState<TailSource[]>([]);
  const [selectedTailSource, setSelectedTailSource] = useState('');
  const [tailLines, setTailLines] = useState<string[]>([]);
  const [tailConnected, setTailConnected] = useState(false);
  const [tailLoading, setTailLoading] = useState(false);
  const [tailError, setTailError] = useState('');
  const [tailMeta, setTailMeta] = useState<{ type: string; label: string } | null>(null);
  const [tailAutoScroll, setTailAutoScroll] = useState(true);
  const tailListRef = useRef<HTMLDivElement | null>(null);
  const [terminalSessionId, setTerminalSessionId] = useState('');
  const [terminalConnected, setTerminalConnected] = useState(false);
  const [terminalLoading, setTerminalLoading] = useState(false);
  const [terminalError, setTerminalError] = useState('');
  const [terminalInput, setTerminalInput] = useState('');
  const [terminalOutput, setTerminalOutput] = useState('');
  const terminalOutputRef = useRef<HTMLDivElement | null>(null);

  const { theme, setTheme } = useTheme();

  const mounts = dashboard?.mounts || [];
  const shares = dashboard?.shares || dashboard?.disks || [];
  const users = dashboard?.users || [];
  const groups = dashboard?.groups || [];
  const identityProviders = dashboard?.identityProviders || [];
  const settingsConfig = dashboard?.settingsConfig || {};

  const mountOptions = useMemo(
    () =>
      mounts.map((mount) => ({
        id: mount.id,
        label: `${mount.name} (${mountRemoteDisplay(mount)})`,
      })),
    [mounts],
  );
  const mountById = useMemo(
    () => new Map(mounts.map((mount) => [mount.id, mount])),
    [mounts],
  );
  const userOptions = useMemo(
    () =>
      users.map((user) => ({
        id: user.id,
        label: `${user.username}${user.displayName ? ` (${user.displayName})` : ''}`,
      })),
    [users],
  );
  const groupOptions = useMemo(
    () => groups.map((group) => ({ id: group.id, label: group.name })),
    [groups],
  );
  const filteredLogs = useMemo(
    () =>
      logs.filter((entry) => {
        const hostMatch =
          !logsHostFilter || logsHostFilter === 'all' || entry.host === logsHostFilter;
        const driveMatch =
          !logsDriveFilter || logsDriveFilter === 'all' || entry.drive === logsDriveFilter;
        return hostMatch && driveMatch;
      }),
    [logs, logsDriveFilter, logsHostFilter],
  );
  const stripLockedSettingsFromPayload = useCallback(
    (payload: Record<string, unknown>) => {
      if (!settingsConfig || typeof settingsConfig !== 'object') {
        return payload;
      }
      const next = { ...payload };
      for (const [key, descriptor] of Object.entries(settingsConfig)) {
        if (descriptor?.locked) {
          delete next[key];
        }
      }
      return next;
    },
    [settingsConfig],
  );

  const syncFormsFromState = useCallback(
    (next: DashboardState | null) => {
      if (!next) return;
      setSettingsForm({
        adminUsername: next?.settings?.adminUsername || currentUser || 'admin',
        adminPassword: '',
        apiToken: '',
        adminSessionSeconds: String(next?.settings?.adminSessionSeconds || 43200),
        hostname: next?.settings?.hostname || '',
        rootShareName: next?.settings?.rootShareName || 'timemachine',
        browseShareName:
          next?.settings?.browseShareName ||
          next?.settings?.rootShareName ||
          'timemachine',
        browseShareEnabled: next?.settings?.browseShareEnabled !== false,
        smbPublicPort: String(next?.settings?.smbPublicPort || 445),
        smbEnabled: next?.settings?.smbEnabled !== false,
        sftpEnabled: next?.settings?.sftpEnabled !== false,
        mountManagementEnabled:
          next?.settings?.mountManagementEnabled !== false,
        smbStreamsBackend: next?.settings?.smbStreamsBackend || 'xattr',
        mountPollSeconds: String(next?.settings?.mountPollSeconds || 30),
        vpsCacheDir:
          next?.settings?.vpsCacheDir || '/data/vps/rclone-vfs-cache',
        vpsCacheEnabled: next?.settings?.vpsCacheEnabled !== false,
        vpsWriteBackSeconds: String(
          next?.settings?.vpsWriteBackSeconds || 120,
        ),
        vpsCacheMaxSizeGb: String(next?.settings?.vpsCacheMaxSizeGb || 1),
        vpsCacheMaxAgeHours: String(next?.settings?.vpsCacheMaxAgeHours || 24),
        vpsReadAheadMb: String(next?.settings?.vpsReadAheadMb || 16),
        enterpriseFeaturesEnabled:
          next?.settings?.enterpriseFeaturesEnabled === true,
        adminAuthMode: next?.settings?.adminAuthMode || 'local',
        smbAuthMode: next?.settings?.smbAuthMode || 'local',
        sftpAuthMode: next?.settings?.sftpAuthMode || 'local',
        securityIpAllowlist: next?.settings?.securityIpAllowlist || '',
        securityBreakGlassEnabled:
          next?.settings?.securityBreakGlassEnabled !== false,
        securityAuditRetentionDays: String(
          next?.settings?.securityAuditRetentionDays || 180,
        ),
        oidcIssuer: next?.settings?.oidcIssuer || '',
        oidcClientId: next?.settings?.oidcClientId || '',
        oidcClientSecret: next?.settings?.oidcClientSecret || '',
        oidcScopes: next?.settings?.oidcScopes || 'openid profile email groups',
        oidcAdminGroup: next?.settings?.oidcAdminGroup || '',
        oidcReadOnlyGroup: next?.settings?.oidcReadOnlyGroup || '',
        directoryDomain: next?.settings?.directoryDomain || '',
        directoryRealm: next?.settings?.directoryRealm || '',
        directoryUrl: next?.settings?.directoryUrl || '',
        directoryBindDn: next?.settings?.directoryBindDn || '',
        directoryBindPassword: next?.settings?.directoryBindPassword || '',
        workgroupMappingsJson:
          next?.settings?.workgroupMappingsJson || '[]',
        mountPolicyMode: next?.settings?.mountPolicyMode || 'policy_templates',
        postgresEnabled: next?.settings?.postgresEnabled !== false,
        postgresHost: next?.settings?.postgresHost || 'postgres',
        postgresPort: String(next?.settings?.postgresPort || 5432),
        postgresDatabase: next?.settings?.postgresDatabase || 'tm_adapter',
        postgresUser: next?.settings?.postgresUser || 'tm_adapter',
        postgresPassword: next?.settings?.postgresPassword || '',
        postgresSslMode: next?.settings?.postgresSslMode || 'disable',
      });
      setSetupForm((prev) => ({
        ...prev,
        adminUsername: prev.adminUsername || currentUser || 'admin',
        adminPassword: '',
        apiToken: '',
        adminSessionSeconds: String(next?.settings?.adminSessionSeconds || 43200),
        vpsCacheDir: next?.settings?.vpsCacheDir || '/data/vps/rclone-vfs-cache',
        hostname: next?.settings?.hostname || '',
        rootShareName: next?.settings?.rootShareName || 'timemachine',
        browseShareName:
          next?.settings?.browseShareName ||
          next?.settings?.rootShareName ||
          'timemachine',
        browseShareEnabled: next?.settings?.browseShareEnabled !== false,
        smbPublicPort: String(next?.settings?.smbPublicPort || 445),
        smbStreamsBackend: next?.settings?.smbStreamsBackend || 'xattr',
        mountPollSeconds: String(next?.settings?.mountPollSeconds || 30),
        enterpriseFeaturesEnabled:
          next?.settings?.enterpriseFeaturesEnabled === true,
        adminAuthMode: next?.settings?.adminAuthMode || 'local',
        smbAuthMode: next?.settings?.smbAuthMode || 'local',
        sftpAuthMode: next?.settings?.sftpAuthMode || 'local',
        securityIpAllowlist: next?.settings?.securityIpAllowlist || '',
        securityBreakGlassEnabled:
          next?.settings?.securityBreakGlassEnabled !== false,
        securityAuditRetentionDays: String(
          next?.settings?.securityAuditRetentionDays || 180,
        ),
        oidcIssuer: next?.settings?.oidcIssuer || '',
        oidcClientId: next?.settings?.oidcClientId || '',
        oidcClientSecret: next?.settings?.oidcClientSecret || '',
        oidcScopes: next?.settings?.oidcScopes || 'openid profile email groups',
        oidcAdminGroup: next?.settings?.oidcAdminGroup || '',
        oidcReadOnlyGroup: next?.settings?.oidcReadOnlyGroup || '',
        directoryDomain: next?.settings?.directoryDomain || '',
        directoryRealm: next?.settings?.directoryRealm || '',
        directoryUrl: next?.settings?.directoryUrl || '',
        directoryBindDn: next?.settings?.directoryBindDn || '',
        directoryBindPassword: next?.settings?.directoryBindPassword || '',
        workgroupMappingsJson:
          next?.settings?.workgroupMappingsJson || '[]',
        mountPolicyMode: next?.settings?.mountPolicyMode || 'policy_templates',
        postgresEnabled: next?.settings?.postgresEnabled !== false,
        postgresHost: next?.settings?.postgresHost || 'postgres',
        postgresPort: String(next?.settings?.postgresPort || 5432),
        postgresDatabase: next?.settings?.postgresDatabase || 'tm_adapter',
        postgresUser: next?.settings?.postgresUser || 'tm_adapter',
        postgresPassword: next?.settings?.postgresPassword || '',
        postgresSslMode: next?.settings?.postgresSslMode || 'disable',
      }));
    },
    [currentUser],
  );

  const refreshState = useCallback(async () => {
    const next = await api<DashboardState>('/admin/api/state');
    setDashboard(next);
    syncFormsFromState(next);
    return next;
  }, [syncFormsFromState]);

  const runAction = useCallback(
    async (successMessage: string, fn: () => Promise<void>) => {
      setError('');
      setNotice('');
      setSubmitting(true);
      try {
        await fn();
        if (successMessage) {
          setNotice(successMessage);
        }
      } catch (actionError) {
        setError(
          actionError instanceof Error ? actionError.message : String(actionError),
        );
      } finally {
        setSubmitting(false);
      }
    },
    [],
  );

  const refreshTailSources = useCallback(
    async ({ background = false }: { background?: boolean } = {}) => {
      if (!background) {
        setTailLoading(true);
        setTailError('');
      }
      try {
        const payload = await api<{ sources?: TailSource[] }>(
          '/admin/api/log-tail/sources',
        );
        const nextSources = Array.isArray(payload?.sources) ? payload.sources : [];
        setTailSources(nextSources);
        setSelectedTailSource((prev) => {
          if (prev && nextSources.some((s) => s.source === prev)) return prev;
          return nextSources[0]?.source || '';
        });
        if (nextSources.length === 0) {
          setTailError('No log sources available');
        }
      } catch (sourceError) {
        setTailError(
          sourceError instanceof Error
            ? sourceError.message
            : 'Unable to load log sources',
        );
      } finally {
        if (!background) setTailLoading(false);
      }
    },
    [],
  );

  const appendTailLine = useCallback((line: unknown, stream = 'stdout') => {
    if (line === undefined || line === null) return;
    const prefix = stream === 'stderr' ? '[stderr] ' : '';
    const formatted = `${prefix}${String(line)}`;
    setTailLines((prev) => {
      const next = [...prev, formatted];
      return next.length > MAX_TAIL_LINES
        ? next.slice(next.length - MAX_TAIL_LINES)
        : next;
    });
  }, []);

  const appendTerminalChunk = useCallback((chunk: unknown) => {
    if (!chunk) return;
    setTerminalOutput((prev) => {
      const next = `${prev}${String(chunk)}`;
      return next.length > MAX_TERMINAL_CHARS
        ? next.slice(next.length - MAX_TERMINAL_CHARS)
        : next;
    });
  }, []);

  const sendTerminalInput = useCallback(
    async (input: string) => {
      if (!terminalSessionId || !input) return;
      try {
        await api(`/admin/api/terminal/sessions/${terminalSessionId}/input`, {
          method: 'POST',
          body: JSON.stringify({ input }),
        });
        setTerminalError('');
      } catch (inputError) {
        setTerminalError(
          inputError instanceof Error
            ? inputError.message
            : 'Failed to send command',
        );
      }
    },
    [terminalSessionId],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const session = await api<{
          authenticated?: boolean;
          username?: string;
        }>('/admin/api/session');
        if (cancelled) return;
        if (session.authenticated) {
          setAuthenticated(true);
          setCurrentUser(session.username || 'admin');
          await refreshState();
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setSessionLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshState]);

  useEffect(() => {
    if (!authenticated) {
      setLogs([]);
      setLogHosts([]);
      setLogDrives([]);
      setLogsConnected(false);
      setLogsLoading(false);
      setLogsError('');
      return;
    }
    let cancelled = false;
    setLogsLoading(true);
    setLogsError('');
    (async () => {
      try {
        const payload = await api<{
          logs?: LogEntry[];
          hosts?: string[];
          drives?: string[];
        }>('/admin/api/logs');
        if (cancelled) return;
        setLogs(
          Array.isArray(payload?.logs)
            ? payload.logs.slice(-MAX_DASHBOARD_LOGS)
            : [],
        );
        setLogHosts(Array.isArray(payload?.hosts) ? payload.hosts : []);
        setLogDrives(Array.isArray(payload?.drives) ? payload.drives : []);
      } catch (snapshotError) {
        if (!cancelled) {
          setLogsError(
            snapshotError instanceof Error
              ? snapshotError.message
              : 'Unable to load logs',
          );
        }
      } finally {
        if (!cancelled) setLogsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authenticated]);

  useEffect(() => {
    if (!authenticated) return;
    let closed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let stream: EventSource | null = null;
    const connect = () => {
      if (closed) return;
      stream = new EventSource('/admin/api/logs/stream');
      stream.onopen = () => {
        setLogsConnected(true);
        setLogsError('');
      };
      stream.addEventListener('snapshot', (event) => {
        const payload = parseEventData<{
          logs?: LogEntry[];
          hosts?: string[];
          drives?: string[];
        }>(event);
        if (!payload || closed) return;
        setLogs(
          Array.isArray(payload.logs)
            ? payload.logs.slice(-MAX_DASHBOARD_LOGS)
            : [],
        );
        setLogHosts(Array.isArray(payload.hosts) ? payload.hosts : []);
        setLogDrives(Array.isArray(payload.drives) ? payload.drives : []);
      });
      stream.addEventListener('log', (event) => {
        const entry = parseEventData<LogEntry>(event);
        if (!entry || closed) return;
        setLogs((prev) => {
          const next = [...prev, entry];
          return next.length > MAX_DASHBOARD_LOGS
            ? next.slice(next.length - MAX_DASHBOARD_LOGS)
            : next;
        });
        if (entry.host) {
          setLogHosts((prev) =>
            prev.includes(entry.host!)
              ? prev
              : [...prev, entry.host!].sort((a, b) => a.localeCompare(b)),
          );
        }
        if (entry.drive) {
          setLogDrives((prev) =>
            prev.includes(entry.drive!)
              ? prev
              : [...prev, entry.drive!].sort((a, b) => a.localeCompare(b)),
          );
        }
      });
      stream.onerror = () => {
        setLogsConnected(false);
        setLogsError('Live stream disconnected, retrying...');
        stream?.close();
        if (!closed) reconnectTimer = setTimeout(connect, 2000);
      };
    };
    connect();
    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      stream?.close();
    };
  }, [authenticated]);

  useEffect(() => {
    if (!authenticated) {
      setTailSources([]);
      setSelectedTailSource('');
      setTailLines([]);
      setTailConnected(false);
      setTailLoading(false);
      setTailError('');
      setTailMeta(null);
      return;
    }
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    (async () => {
      await refreshTailSources();
      if (cancelled) return;
      intervalId = setInterval(() => {
        refreshTailSources({ background: true }).catch(() => {});
      }, 15000);
    })();
    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [authenticated, refreshTailSources]);

  useEffect(() => {
    if (!authenticated || activeTab !== 'logs' || !selectedTailSource) {
      setTailConnected(false);
      return;
    }
    let closed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let stream: EventSource | null = null;
    setTailLines([]);
    setTailMeta(null);
    setTailError('');
    const connect = () => {
      if (closed) return;
      stream = new EventSource(
        `/admin/api/log-tail/stream?source=${encodeURIComponent(selectedTailSource)}&lines=${DEFAULT_TAIL_LINE_COUNT}`,
      );
      stream.onopen = () => {
        setTailConnected(true);
        setTailError('');
      };
      stream.addEventListener('source', (event) => {
        const payload = parseEventData<{ type?: string; label?: string }>(
          event,
        );
        if (!payload || closed) return;
        setTailMeta({
          type: payload.type ?? '',
          label: payload.label ?? '',
        });
      });
      stream.addEventListener('line', (event) => {
        const payload = parseEventData<{ line?: unknown; stream?: string }>(
          event,
        );
        if (!payload || closed) return;
        appendTailLine(payload.line, payload.stream);
      });
      stream.addEventListener('status', (event) => {
        const payload = parseEventData<{ state?: string; message?: string }>(
          event,
        );
        if (!payload || closed) return;
        if (payload.state === 'error') {
          setTailError(payload.message || 'Tail stream error');
        }
      });
      stream.onerror = () => {
        setTailConnected(false);
        setTailError('Tail stream disconnected, retrying...');
        stream?.close();
        if (!closed) reconnectTimer = setTimeout(connect, 2000);
      };
    };
    connect();
    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      stream?.close();
    };
  }, [activeTab, appendTailLine, authenticated, selectedTailSource]);

  useEffect(() => {
    if (!authenticated || activeTab !== 'logs' || terminalSessionId) return;
    let cancelled = false;
    setTerminalLoading(true);
    setTerminalError('');
    (async () => {
      try {
        const payload = await api<{ sessionId?: string }>(
          '/admin/api/terminal/sessions',
          { method: 'POST', body: '{}' },
        );
        if (!cancelled) {
          setTerminalSessionId(payload?.sessionId || '');
        }
      } catch (sessionError) {
        if (!cancelled) {
          setTerminalError(
            sessionError instanceof Error
              ? sessionError.message
              : 'Unable to start terminal session',
          );
        }
      } finally {
        if (!cancelled) setTerminalLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab, authenticated, terminalSessionId]);

  useEffect(() => {
    if (authenticated || !terminalSessionId) return;
    fetch(`/admin/api/terminal/sessions/${terminalSessionId}`, {
      method: 'DELETE',
    }).catch(() => {});
    setTerminalSessionId('');
    setTerminalOutput('');
    setTerminalInput('');
    setTerminalConnected(false);
    setTerminalError('');
  }, [authenticated, terminalSessionId]);

  useEffect(() => {
    if (!authenticated || activeTab !== 'logs' || !terminalSessionId) {
      setTerminalConnected(false);
      return;
    }
    let closed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let stream: EventSource | null = null;
    const connect = () => {
      if (closed) return;
      stream = new EventSource(
        `/admin/api/terminal/sessions/${terminalSessionId}/stream`,
      );
      stream.onopen = () => {
        setTerminalConnected(true);
        setTerminalError('');
      };
      stream.addEventListener('snapshot', (event) => {
        const payload = parseEventData<{ output?: string }>(event);
        if (!payload || closed) return;
        if (typeof payload.output === 'string') {
          setTerminalOutput(payload.output);
        }
      });
      stream.addEventListener('output', (event) => {
        const payload = parseEventData<{ chunk?: unknown }>(event);
        if (!payload || closed) return;
        appendTerminalChunk(payload.chunk);
      });
      stream.addEventListener('status', (event) => {
        const payload = parseEventData<{ state?: string; message?: string }>(
          event,
        );
        if (!payload || closed) return;
        if (payload.state === 'closed') setTerminalConnected(false);
        if (payload.state === 'error') {
          setTerminalError(payload.message || 'Terminal error');
        }
      });
      stream.onerror = () => {
        setTerminalConnected(false);
        stream?.close();
        if (!closed) reconnectTimer = setTimeout(connect, 2000);
      };
    };
    connect();
    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      stream?.close();
    };
  }, [activeTab, appendTerminalChunk, authenticated, terminalSessionId]);

  useEffect(() => {
    if (activeTab !== 'logs') return;
    const node = logsListRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [activeTab, filteredLogs]);

  useEffect(() => {
    if (activeTab !== 'logs' || !tailAutoScroll) return;
    const node = tailListRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [activeTab, tailAutoScroll, tailLines]);

  useEffect(() => {
    if (activeTab !== 'logs') return;
    const node = terminalOutputRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [activeTab, terminalOutput]);

  const handleTerminalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!terminalInput.trim()) return;
    await sendTerminalInput(`${terminalInput}\n`);
    setTerminalInput('');
  };

  const handleRestartTerminal = async () => {
    if (terminalSessionId) {
      await api(`/admin/api/terminal/sessions/${terminalSessionId}`, {
        method: 'DELETE',
      }).catch(() => {});
    }
    setTerminalSessionId('');
    setTerminalOutput('');
    setTerminalInput('');
    setTerminalConnected(false);
    setTerminalError('');
  };

  const handleLogin = async (username: string, password: string) => {
    await runAction('', async () => {
      const res = await api<{ username?: string }>('/admin/api/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      setAuthenticated(true);
      setCurrentUser(res?.username || username || 'admin');
      setLoginForm((prev) => ({ ...prev, password: '' }));
      await refreshState();
      setNotice('Welcome back!');
    });
  };

  const handleLogout = async () => {
    await runAction('', async () => {
      await api('/admin/api/logout', { method: 'POST', body: '{}' });
      setAuthenticated(false);
      setDashboard(null);
      setCurrentUser('');
      setNotice('Signed out successfully.');
    });
  };

  const handleSetupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await runAction('Setup complete! Your server is ready.', async () => {
      await api('/admin/api/setup', {
        method: 'POST',
        body: JSON.stringify(
          stripLockedSettingsFromPayload({
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
            securityAuditRetentionDays: Number(
              setupForm.securityAuditRetentionDays || 180,
            ),
            oidcIssuer: setupForm.oidcIssuer,
            oidcClientId: setupForm.oidcClientId,
            oidcClientSecret: setupForm.oidcClientSecret,
            oidcScopes: setupForm.oidcScopes,
            oidcAdminGroup: setupForm.oidcAdminGroup,
            oidcReadOnlyGroup: setupForm.oidcReadOnlyGroup,
            directoryDomain: setupForm.directoryDomain,
            directoryRealm: setupForm.directoryRealm,
            directoryUrl: setupForm.directoryUrl,
            directoryBindDn: setupForm.directoryBindDn,
            directoryBindPassword: setupForm.directoryBindPassword,
            workgroupMappingsJson: setupForm.workgroupMappingsJson,
            mountPolicyMode: setupForm.mountPolicyMode,
            postgresEnabled: setupForm.postgresEnabled,
            postgresHost: setupForm.postgresHost,
            postgresPort: Number(setupForm.postgresPort || 5432),
            postgresDatabase: setupForm.postgresDatabase,
            postgresUser: setupForm.postgresUser,
            postgresPassword: setupForm.postgresPassword,
            postgresSslMode: setupForm.postgresSslMode,
            applySamba: true,
            markSetupComplete: true,
          }),
        ),
      });
      await refreshState();
      setSetupForm((prev) => ({ ...prev, adminPassword: '', apiToken: '' }));
    });
  };

  const markSetupComplete = async () => {
    await runAction('Setup marked complete.', async () => {
      await api('/admin/api/setup', {
        method: 'POST',
        body: JSON.stringify({
          applySamba: false,
          markSetupComplete: true,
        }),
      });
      await refreshState();
    });
  };

  const handleSettingsSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await runAction('Settings saved successfully.', async () => {
      await api('/admin/api/settings', {
        method: 'PUT',
        body: JSON.stringify(
          stripLockedSettingsFromPayload({
            adminUsername: settingsForm.adminUsername.trim() || undefined,
            adminPassword: settingsForm.adminPassword || undefined,
            apiToken: settingsForm.apiToken.trim() || undefined,
            adminSessionSeconds: Number(settingsForm.adminSessionSeconds || 43200),
            hostname: settingsForm.hostname,
            browseShareName: settingsForm.browseShareName,
            browseShareEnabled: settingsForm.browseShareEnabled,
            rootShareName: settingsForm.browseShareName,
            smbPublicPort: Number(settingsForm.smbPublicPort || 445),
            smbEnabled: settingsForm.smbEnabled,
            sftpEnabled: settingsForm.sftpEnabled,
            mountManagementEnabled: settingsForm.mountManagementEnabled,
            smbStreamsBackend: settingsForm.smbStreamsBackend,
            mountPollSeconds: Number(settingsForm.mountPollSeconds || 30),
            vpsCacheDir: settingsForm.vpsCacheDir,
            vpsCacheEnabled: settingsForm.vpsCacheEnabled,
            vpsWriteBackSeconds: Number(settingsForm.vpsWriteBackSeconds || 120),
            vpsCacheMaxSizeGb: Number(settingsForm.vpsCacheMaxSizeGb || 1),
            vpsCacheMaxAgeHours: Number(settingsForm.vpsCacheMaxAgeHours || 24),
            vpsReadAheadMb: Number(settingsForm.vpsReadAheadMb || 16),
            enterpriseFeaturesEnabled: settingsForm.enterpriseFeaturesEnabled,
            adminAuthMode: settingsForm.adminAuthMode,
            smbAuthMode: settingsForm.smbAuthMode,
            sftpAuthMode: settingsForm.sftpAuthMode,
            securityIpAllowlist: settingsForm.securityIpAllowlist,
            securityBreakGlassEnabled:
              settingsForm.securityBreakGlassEnabled,
            securityAuditRetentionDays: Number(
              settingsForm.securityAuditRetentionDays || 180,
            ),
            oidcIssuer: settingsForm.oidcIssuer,
            oidcClientId: settingsForm.oidcClientId,
            oidcClientSecret: settingsForm.oidcClientSecret,
            oidcScopes: settingsForm.oidcScopes,
            oidcAdminGroup: settingsForm.oidcAdminGroup,
            oidcReadOnlyGroup: settingsForm.oidcReadOnlyGroup,
            directoryDomain: settingsForm.directoryDomain,
            directoryRealm: settingsForm.directoryRealm,
            directoryUrl: settingsForm.directoryUrl,
            directoryBindDn: settingsForm.directoryBindDn,
            directoryBindPassword: settingsForm.directoryBindPassword,
            workgroupMappingsJson: settingsForm.workgroupMappingsJson,
            mountPolicyMode: settingsForm.mountPolicyMode,
            postgresEnabled: settingsForm.postgresEnabled,
            postgresHost: settingsForm.postgresHost,
            postgresPort: Number(settingsForm.postgresPort || 5432),
            postgresDatabase: settingsForm.postgresDatabase,
            postgresUser: settingsForm.postgresUser,
            postgresPassword: settingsForm.postgresPassword,
            postgresSslMode: settingsForm.postgresSslMode,
            applySamba: settingsForm.smbEnabled,
          }),
        ),
      });
      await refreshState();
      setSettingsForm((prev) => ({ ...prev, adminPassword: '', apiToken: '' }));
    });
  };

  const copyToClipboard = async (label: string, value: string) => {
    const text = String(value || '');
    if (!text) {
      setError(`Nothing to copy for ${label}`);
      return;
    }
    setError('');
    try {
      await clipCopy(text);
      setNotice(`${label} copied to clipboard`);
    } catch (copyError) {
      setError(
        copyError instanceof Error ? copyError.message : `Unable to copy ${label}`,
      );
    }
  };

  const startEditDisk = (disk: Disk) => {
    const mount = disk.storageMountId
      ? mountById.get(disk.storageMountId)
      : null;
    setEditingDiskId(disk.id);
    setEditingDiskForm({
      name: disk.name || '',
      timeMachineEnabled:
        disk.timeMachineEnabled === true ||
        disk?.smb?.timeMachineEnabled === true,
      timeMachineQuotaGb: String(disk.timeMachineQuotaGb ?? disk.quotaGb ?? 0),
      accessMode: disk.accessMode || disk?.access?.mode || 'legacy-per-share',
      smbUserIds: formatIdList(disk?.access?.policy?.smb?.userIds || []),
      smbGroupIds: formatIdList(disk?.access?.policy?.smb?.groupIds || []),
      sftpUserIds: formatIdList(disk?.access?.policy?.sftp?.userIds || []),
      sftpGroupIds: formatIdList(disk?.access?.policy?.sftp?.groupIds || []),
      storageMode: disk.storageMode || 'local',
      storageMountId: disk.storageMountId || '',
      storageSubdir: subdirFromPaths(
        mount?.mountPath || disk.storageBasePath || '',
        disk.storagePath || '',
      ),
      storagePath: disk.storageBasePath || disk.storagePath || '',
      shareName: disk.smbShareName || disk?.smb?.shareName || '',
      smbUsername: disk.smbUsername || disk?.smb?.legacyUsername || '',
      smbPassword: disk.smbPassword || disk?.smb?.legacyPassword || '',
      sftpUsername: disk.sftpUsername || disk?.sftp?.legacyUsername || '',
      sftpPassword: disk.sftpPassword || disk?.sftp?.legacyPassword || '',
      applySamba: true,
      applySftp: true,
    });
  };

  const cancelEditDisk = () => {
    setEditingDiskId('');
    setEditingDiskForm(DEFAULT_DISK_FORM);
  };

  const handleUpdateDisk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDiskId) return;
    const currentDisk = shares.find((d) => d.id === editingDiskId);
    if (!currentDisk) {
      setError('Share no longer exists');
      return;
    }
    await runAction('Share updated successfully.', async () => {
      const payload: Record<string, unknown> = {
        name: editingDiskForm.name.trim(),
        timeMachineEnabled: editingDiskForm.timeMachineEnabled,
        timeMachineQuotaGb: Number(editingDiskForm.timeMachineQuotaGb || 0),
        accessMode: editingDiskForm.accessMode,
        accessPolicy: {
          smb: {
            userIds: parseIdList(editingDiskForm.smbUserIds),
            groupIds: parseIdList(editingDiskForm.smbGroupIds),
          },
          sftp: {
            userIds: parseIdList(editingDiskForm.sftpUserIds),
            groupIds: parseIdList(editingDiskForm.sftpGroupIds),
          },
        },
        smbShareName: editingDiskForm.shareName.trim() || undefined,
        smbUsername:
          editingDiskForm.accessMode === 'legacy-per-share'
            ? editingDiskForm.smbUsername.trim() || undefined
            : undefined,
        sftpUsername:
          editingDiskForm.accessMode === 'legacy-per-share'
            ? editingDiskForm.sftpUsername.trim() || undefined
            : undefined,
        applySamba: settingsForm.smbEnabled && editingDiskForm.applySamba,
        applySftp: settingsForm.sftpEnabled && editingDiskForm.applySftp,
      };
      if (editingDiskForm.storageMode) {
        payload.storageMode = editingDiskForm.storageMode;
      }
      if (editingDiskForm.storageMode === 'cloud-mount') {
        payload.storageMountId =
          editingDiskForm.storageMountId || undefined;
        payload.storageSubdir =
          editingDiskForm.storageSubdir.trim() || undefined;
      }
      if (editingDiskForm.storageMode === 'cloudmounter') {
        payload.storagePath =
          editingDiskForm.storagePath.trim() || undefined;
      }
      await api(`/admin/api/shares/${editingDiskId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      if (
        editingDiskForm.accessMode === 'legacy-per-share' &&
        editingDiskForm.smbPassword !== currentDisk.smbPassword
      ) {
        if (!editingDiskForm.smbPassword) {
          throw new Error('SMB password cannot be empty');
        }
        await api(`/admin/api/shares/${editingDiskId}/password`, {
          method: 'POST',
          body: JSON.stringify({ password: editingDiskForm.smbPassword }),
        });
      }
      if (
        editingDiskForm.accessMode === 'legacy-per-share' &&
        editingDiskForm.sftpPassword !== currentDisk.sftpPassword
      ) {
        if (!editingDiskForm.sftpPassword) {
          throw new Error('SFTP password cannot be empty');
        }
        await api(`/admin/api/shares/${editingDiskId}/sftp-password`, {
          method: 'POST',
          body: JSON.stringify({ password: editingDiskForm.sftpPassword }),
        });
      }
      cancelEditDisk();
      await refreshState();
    });
  };

  const startEditMount = (mount: Mount) => {
    setEditingMountId(mount.id);
    setEditingMountForm({
      name: mount.name || '',
      provider: mount.provider || 's3',
      remotePath: mount.remotePath || '',
      mountPath: mount.mountPath || '',
      bucket: mount.bucket || '',
      prefix: mount.prefix || '',
      region: mount.region || 'us-east-1',
      endpoint: mount.endpoint || '',
      accessKeyId: mount.accessKeyId || '',
      secretAccessKey: mount.secretAccessKey || '',
      s3Provider: mount.s3Provider || 'AWS',
      extraArgs: formatExtraArgs(mount.extraArgs),
      rcloneBinary: mount.rcloneBinary || 'rclone',
      enabled: mount.enabled !== false,
      ensureMounted: false,
    });
  };

  const cancelEditMount = () => {
    setEditingMountId('');
    setEditingMountForm(DEFAULT_MOUNT_FORM);
  };

  const handleUpdateMount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMountId) return;
    await runAction('Cloud mount updated successfully.', async () => {
      const payload: Record<string, unknown> = {
        name: editingMountForm.name.trim(),
        provider: editingMountForm.provider,
        mountPath: editingMountForm.mountPath.trim(),
        enabled: editingMountForm.enabled,
        ensureMounted:
          settingsForm.mountManagementEnabled &&
          editingMountForm.ensureMounted,
        extraArgs: parseExtraArgs(editingMountForm.extraArgs),
        rcloneBinary: editingMountForm.rcloneBinary.trim() || 'rclone',
      };
      if (editingMountForm.provider === 's3') {
        payload.bucket = editingMountForm.bucket.trim();
        payload.prefix = editingMountForm.prefix.trim();
        payload.region = editingMountForm.region.trim();
        payload.endpoint = editingMountForm.endpoint.trim();
        payload.accessKeyId = editingMountForm.accessKeyId.trim();
        payload.secretAccessKey = editingMountForm.secretAccessKey;
        payload.s3Provider = editingMountForm.s3Provider.trim();
      } else {
        payload.remotePath = editingMountForm.remotePath.trim();
      }
      await api(`/admin/api/mounts/${editingMountId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      cancelEditMount();
      await refreshState();
    });
  };

  const handleCreateDisk = async (e: React.FormEvent) => {
    e.preventDefault();
    await runAction('Share created successfully!', async () => {
      const payload: Record<string, unknown> = {
        name: diskForm.name.trim(),
        timeMachineEnabled: diskForm.timeMachineEnabled,
        timeMachineQuotaGb: Number(diskForm.timeMachineQuotaGb || 0),
        accessMode: diskForm.accessMode,
        accessPolicy: {
          smb: {
            userIds: parseIdList(diskForm.smbUserIds),
            groupIds: parseIdList(diskForm.smbGroupIds),
          },
          sftp: {
            userIds: parseIdList(diskForm.sftpUserIds),
            groupIds: parseIdList(diskForm.sftpGroupIds),
          },
        },
        storageMode: diskForm.storageMode,
        shareName: diskForm.shareName.trim() || undefined,
        smbUsername:
          diskForm.accessMode === 'legacy-per-share'
            ? diskForm.smbUsername.trim() || undefined
            : undefined,
        smbPassword:
          diskForm.accessMode === 'legacy-per-share'
            ? diskForm.smbPassword || undefined
            : undefined,
        sftpUsername:
          diskForm.accessMode === 'legacy-per-share'
            ? diskForm.sftpUsername.trim() || undefined
            : undefined,
        sftpPassword:
          diskForm.accessMode === 'legacy-per-share'
            ? diskForm.sftpPassword || undefined
            : undefined,
        applySamba: settingsForm.smbEnabled && diskForm.applySamba,
        applySftp: settingsForm.sftpEnabled && diskForm.applySftp,
      };
      if (diskForm.storageMode === 'cloud-mount') {
        payload.storageMountId = diskForm.storageMountId || undefined;
        payload.storageSubdir = diskForm.storageSubdir.trim() || undefined;
      }
      if (diskForm.storageMode === 'cloudmounter') {
        payload.storagePath = diskForm.storagePath.trim() || undefined;
      }
      await api('/admin/api/shares', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setDiskForm(DEFAULT_DISK_FORM);
      setShowAddDrive(false);
      await refreshState();
    });
  };

  const handleDiskAction = async (diskId: string, action: string) => {
    await runAction('', async () => {
      if (action === 'rotate') {
        await api(`/admin/api/shares/${diskId}/password`, {
          method: 'POST',
          body: '{}',
        });
        setNotice(`SMB password rotated for ${diskId}`);
      }
      if (action === 'rotate-sftp') {
        await api(`/admin/api/shares/${diskId}/sftp-password`, {
          method: 'POST',
          body: '{}',
        });
        setNotice(`SFTP password rotated for ${diskId}`);
      }
      if (action === 'apply') {
        await api(`/admin/api/shares/${diskId}/apply-samba`, {
          method: 'POST',
          body: '{}',
        });
        setNotice(`Samba configuration applied for ${diskId}`);
      }
      if (action === 'apply-sftp') {
        await api(`/admin/api/shares/${diskId}/apply-sftp`, {
          method: 'POST',
          body: '{}',
        });
        setNotice(`SFTP configuration applied for ${diskId}`);
      }
      if (action === 'delete') {
        const confirmed = window.confirm(
          `Are you sure you want to delete share "${diskId}"? This action cannot be undone.`,
        );
        if (!confirmed) return;
        await api(`/admin/api/shares/${diskId}`, {
          method: 'DELETE',
          body: JSON.stringify({ deleteData: false }),
        });
        setNotice(`Share "${diskId}" deleted successfully`);
      }
      await refreshState();
    });
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    await runAction('Central user created.', async () => {
      await api('/admin/api/users', {
        method: 'POST',
        body: JSON.stringify({
          username: userForm.username.trim(),
          displayName: userForm.displayName.trim() || undefined,
          authType: userForm.authType,
          password:
            userForm.authType === 'local' ? userForm.password : undefined,
          protocolUsername: userForm.protocolUsername.trim() || undefined,
          protocolPassword: userForm.protocolPassword || undefined,
          groupIds: parseIdList(userForm.groupIds),
          enabled: userForm.enabled,
          isAdmin: userForm.isAdmin,
          smbEnabled: userForm.smbEnabled,
          sftpEnabled: userForm.sftpEnabled,
          identityProviderId: userForm.identityProviderId || undefined,
          externalSubject: userForm.externalSubject.trim() || undefined,
        }),
      });
      setUserForm(DEFAULT_USER_FORM);
      await refreshState();
    });
  };

  const handleDeleteUser = async (userId: string) => {
    await runAction('', async () => {
      await api(`/admin/api/users/${userId}`, { method: 'DELETE' });
      setNotice(`User "${userId}" deleted.`);
      await refreshState();
    });
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    await runAction('Group created.', async () => {
      await api('/admin/api/groups', {
        method: 'POST',
        body: JSON.stringify({
          name: groupForm.name.trim(),
          description: groupForm.description.trim() || undefined,
          memberUserIds: parseIdList(groupForm.memberUserIds),
        }),
      });
      setGroupForm(DEFAULT_GROUP_FORM);
      await refreshState();
    });
  };

  const handleDeleteGroup = async (groupId: string) => {
    await runAction('', async () => {
      await api(`/admin/api/groups/${groupId}`, { method: 'DELETE' });
      setNotice(`Group "${groupId}" deleted.`);
      await refreshState();
    });
  };

  const handleCreateProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    await runAction('Identity provider created.', async () => {
      const config =
        providerForm.type === 'oidc'
          ? {
              issuer: providerForm.issuer.trim(),
              clientId: providerForm.clientId.trim(),
              clientSecret: providerForm.clientSecret,
              scopes: providerForm.scopes.trim(),
            }
          : {
              directoryUrl: providerForm.directoryUrl.trim(),
              directoryDomain: providerForm.directoryDomain.trim(),
              directoryRealm: providerForm.directoryRealm.trim(),
              directoryBindDn: providerForm.directoryBindDn.trim(),
              directoryBindPassword: providerForm.directoryBindPassword,
            };
      await api('/admin/api/identity-providers', {
        method: 'POST',
        body: JSON.stringify({
          name: providerForm.name.trim(),
          type: providerForm.type,
          enabled: providerForm.enabled,
          config,
        }),
      });
      setProviderForm(DEFAULT_PROVIDER_FORM);
      await refreshState();
    });
  };

  const handleDeleteProvider = async (providerId: string) => {
    await runAction('', async () => {
      await api(`/admin/api/identity-providers/${providerId}`, {
        method: 'DELETE',
      });
      setNotice(`Identity provider "${providerId}" deleted.`);
      await refreshState();
    });
  };

  const handleCreateMount = async (e: React.FormEvent) => {
    e.preventDefault();
    await runAction('Cloud mount created successfully!', async () => {
      const payload: Record<string, unknown> = {
        name: mountForm.name.trim(),
        provider: mountForm.provider,
        mountPath: mountForm.mountPath.trim(),
        enabled: mountForm.enabled,
        ensureMounted:
          settingsForm.mountManagementEnabled && mountForm.ensureMounted,
        extraArgs: parseExtraArgs(mountForm.extraArgs),
      };
      if (mountForm.rcloneBinary.trim()) {
        payload.rcloneBinary = mountForm.rcloneBinary.trim();
      }
      if (mountForm.provider === 's3') {
        payload.bucket = mountForm.bucket.trim();
        payload.prefix = mountForm.prefix.trim();
        payload.region = mountForm.region.trim();
        payload.endpoint = mountForm.endpoint.trim();
        payload.accessKeyId = mountForm.accessKeyId.trim();
        payload.secretAccessKey = mountForm.secretAccessKey;
        payload.s3Provider = mountForm.s3Provider.trim();
      } else {
        payload.remotePath = mountForm.remotePath.trim();
      }
      await api('/admin/api/mounts', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setMountForm(DEFAULT_MOUNT_FORM);
      setShowAddMount(false);
      await refreshState();
    });
  };

  const handleMountAction = async (mountId: string, action: string) => {
    await runAction('', async () => {
      if (action === 'ensure') {
        await api(`/admin/api/mounts/${mountId}/ensure`, {
          method: 'POST',
          body: '{}',
        });
        setNotice(`Mount "${mountId}" is now active`);
      }
      if (action === 'unmount') {
        await api(`/admin/api/mounts/${mountId}/unmount`, {
          method: 'POST',
          body: '{}',
        });
        setNotice(`Mount "${mountId}" unmounted`);
      }
      if (action === 'delete') {
        const confirmed = window.confirm(
          `Are you sure you want to delete "${mountId}"? This action cannot be undone.`,
        );
        if (!confirmed) return;
        await api(`/admin/api/mounts/${mountId}`, {
          method: 'DELETE',
          body: '{}',
        });
        setNotice(`Mount "${mountId}" deleted successfully`);
      }
      await refreshState();
    });
  };

  if (sessionLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="flex flex-col items-center gap-3">
          <Spinner label="Loading session..." />
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Loading session...
          </p>
        </div>
      </main>
    );
  }

  if (!authenticated) {
    return (
      <LoginPage
        onLogin={handleLogin}
        error={error}
        submitting={submitting}
      />
    );
  }

  if (!dashboard) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="flex flex-col items-center gap-3">
          <Spinner label="Loading dashboard..." />
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Loading dashboard...
          </p>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        currentUser={currentUser || 'admin'}
        theme={theme}
        onThemeChange={setTheme}
        onLogout={handleLogout}
        submitting={submitting}
        sidebarOpen={sidebarOpen}
        onSidebarToggle={() => setSidebarOpen((prev) => !prev)}
        counts={{
          shares: shares.length,
          mounts: mounts.length,
          logs: filteredLogs.length,
        }}
      />
      <main className="min-w-0 p-4 sm:p-6 lg:p-8 max-w-5xl">
        {notice && (
          <Banner tone="success" onClose={() => setNotice('')}>
            {notice}
          </Banner>
        )}
        {error && (
          <Banner tone="error" onClose={() => setError('')}>
            {error}
          </Banner>
        )}
        {dashboard?.settings?.setupCompleted !== true && (
          <SetupBanner
            form={setupForm}
            onChange={(patch) =>
              setSetupForm((prev) => ({ ...prev, ...patch }))
            }
            settingsConfig={settingsConfig}
            onSubmit={handleSetupSubmit}
            onSkip={markSetupComplete}
            submitting={submitting}
          />
        )}
        {activeTab === 'shares' && (
          <SharesTab
            shares={shares}
            mounts={mounts}
            mountOptions={mountOptions}
            userOptions={userOptions}
            groupOptions={groupOptions}
            showAddDrive={showAddDrive}
            onToggleAdd={() => setShowAddDrive((prev) => !prev)}
            diskForm={diskForm}
            onDiskFormChange={(patch) =>
              setDiskForm((prev) => ({ ...prev, ...patch }))
            }
            onCreateDisk={handleCreateDisk}
            editingDiskId={editingDiskId}
            editingDiskForm={editingDiskForm}
            onEditingDiskFormChange={(patch) =>
              setEditingDiskForm((prev) => ({ ...prev, ...patch }))
            }
            onStartEdit={startEditDisk}
            onCancelEdit={cancelEditDisk}
            onUpdateDisk={handleUpdateDisk}
            onDiskAction={handleDiskAction}
            submitting={submitting}
            smbEnabled={settingsForm.smbEnabled}
            sftpEnabled={settingsForm.sftpEnabled}
            onNotice={setNotice}
            onError={setError}
          />
        )}
        {activeTab === 'mounts' && (
          <MountsTab
            mounts={mounts}
            showAddMount={showAddMount}
            onToggleAdd={() => setShowAddMount((prev) => !prev)}
            mountForm={mountForm}
            onMountFormChange={(patch) =>
              setMountForm((prev) => ({ ...prev, ...patch }))
            }
            onCreateMount={handleCreateMount}
            editingMountId={editingMountId}
            editingMountForm={editingMountForm}
            onEditingMountFormChange={(patch) =>
              setEditingMountForm((prev) => ({ ...prev, ...patch }))
            }
            onStartEdit={startEditMount}
            onCancelEdit={cancelEditMount}
            onUpdateMount={handleUpdateMount}
            onMountAction={handleMountAction}
            submitting={submitting}
            mountManagementEnabled={settingsForm.mountManagementEnabled}
          />
        )}
        {activeTab === 'logs' && (
          <LogsTab
            tailSources={tailSources}
            selectedTailSource={selectedTailSource}
            onTailSourceChange={setSelectedTailSource}
            tailLines={tailLines}
            tailConnected={tailConnected}
            tailLoading={tailLoading}
            tailError={tailError}
            tailMeta={tailMeta}
            tailAutoScroll={tailAutoScroll}
            onTailAutoScrollChange={setTailAutoScroll}
            tailListRef={tailListRef}
            onRefreshTailSources={() => refreshTailSources()}
            terminalSessionId={terminalSessionId}
            terminalConnected={terminalConnected}
            terminalLoading={terminalLoading}
            terminalError={terminalError}
            terminalInput={terminalInput}
            onTerminalInputChange={setTerminalInput}
            terminalOutput={terminalOutput}
            terminalOutputRef={terminalOutputRef}
            onTerminalSubmit={handleTerminalSubmit}
            onTerminalRestart={handleRestartTerminal}
            onSendCtrlC={() => sendTerminalInput('\u0003')}
            onClearOutput={() => setTerminalOutput('')}
            filteredLogs={filteredLogs}
            logsConnected={logsConnected}
            logsLoading={logsLoading}
            logsError={logsError}
            logHosts={logHosts}
            logDrives={logDrives}
            logsHostFilter={logsHostFilter}
            logsDriveFilter={logsDriveFilter}
            onHostFilterChange={setLogsHostFilter}
            onDriveFilterChange={setLogsDriveFilter}
            onResetFilters={() => {
              setLogsHostFilter('');
              setLogsDriveFilter('');
            }}
            logsListRef={logsListRef}
          />
        )}
        {activeTab === 'settings' && (
          <SettingsTab
            form={settingsForm}
            onChange={(patch) =>
              setSettingsForm((prev) => ({ ...prev, ...patch }))
            }
            settingsConfig={settingsConfig}
            onSubmit={handleSettingsSave}
            submitting={submitting}
            dashboard={dashboard}
            theme={theme}
            onThemeChange={setTheme}
            onNotice={setNotice}
            onError={setError}
          />
        )}
      </main>
    </div>
  );
}
