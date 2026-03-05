'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const DEFAULT_DISK_FORM = {
  name: '',
  quotaGb: '0',
  storageMode: 'local',
  storageMountId: '',
  storageSubdir: '',
  storagePath: '',
  shareName: '',
  smbUsername: '',
  smbPassword: '',
  applySamba: true
};

const DEFAULT_MOUNT_FORM = {
  name: '',
  provider: 's3',
  remotePath: '',
  mountPath: '',
  bucket: '',
  prefix: '',
  region: 'us-east-1',
  endpoint: '',
  accessKeyId: '',
  secretAccessKey: '',
  s3Provider: 'AWS',
  extraArgs: '',
  rcloneBinary: 'rclone',
  enabled: true,
  ensureMounted: false
};

const DEFAULT_SETTINGS_FORM = {
  hostname: '',
  rootShareName: 'timemachine',
  smbPublicPort: '445',
  smbEnabled: true,
  sftpEnabled: true,
  mountManagementEnabled: true
};

const MAX_DASHBOARD_LOGS = 1000;
const MAX_TAIL_LINES = 4000;
const DEFAULT_TAIL_LINE_COUNT = 200;
const MAX_TERMINAL_CHARS = 160000;

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body !== undefined && !headers['content-type']) {
    headers['content-type'] = 'application/json';
  }

  const res = await fetch(path, {
    ...options,
    headers
  });

  const text = await res.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!res.ok) {
    throw new Error(payload?.error || payload?.message || `Request failed (${res.status})`);
  }

  return payload;
}

function mountStatus(mount) {
  const status = String(mount?.runtime?.lastStatus || '').toLowerCase();
  if (status === 'mounted') return { label: 'Mounted', tone: 'success' };
  if (status === 'unmounted') return { label: 'Not mounted', tone: 'warning' };
  if (status === 'error') return { label: 'Error', tone: 'error' };
  if (status === 'disabled') return { label: 'Disabled', tone: 'warning' };
  return { label: status || 'Unknown', tone: 'muted' };
}

function trimSlashes(value) {
  return String(value || '').replace(/^\/+|\/+$/g, '');
}

function mountRemoteDisplay(mount) {
  if (String(mount.provider || '').toLowerCase() === 's3') {
    const bucket = trimSlashes(mount.bucket);
    if (!bucket) {
      return '<missing bucket>';
    }
    const prefix = trimSlashes(mount.prefix);
    return `s3://${bucket}${prefix ? `/${prefix}` : ''}`;
  }

  return mount.remotePath || '<empty>';
}

function parseExtraArgs(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    return [];
  }
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return trimmed
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatExtraArgs(value) {
  if (!Array.isArray(value) || value.length === 0) {
    return '';
  }
  return value.map(String).join(', ');
}

function subdirFromPaths(basePath, fullPath) {
  const base = String(basePath || '');
  const full = String(fullPath || '');
  if (!base || !full) {
    return '';
  }
  if (full === base) {
    return '';
  }
  if (full.startsWith(`${base}/`)) {
    return full.slice(base.length + 1);
  }
  return '';
}

function formatTimestamp(value) {
  if (!value) {
    return 'Never';
  }
  return new Date(value).toLocaleString();
}

function normalizeLogLevel(value) {
  const level = String(value || '').toLowerCase();
  if (level === 'error') return 'error';
  if (level === 'warning' || level === 'warn') return 'warning';
  return 'muted';
}

function parseEventData(event) {
  try {
    return JSON.parse(event?.data || '{}');
  } catch {
    return null;
  }
}

function formatTailSourceLabel(source) {
  if (!source) {
    return '';
  }
  const prefix = source.type === 'container' ? 'Container' : 'Service';
  return `${prefix}: ${source.label}`;
}

function Icon({ name }) {
  const icons = {
    drives: '💾',
    cloud: '☁️',
    logs: '📜',
    settings: '⚙️',
    logout: '👋',
    add: '✨',
    delete: '🗑️',
    refresh: '🔄',
    check: '✓',
    warning: '⚠️',
    error: '✕',
    key: '🔑',
    folder: '📁',
    server: '🖥️',
    mount: '📂',
    unmount: '⏏️',
    apply: '🔧',
    setup: '🚀',
    user: '👤',
  };
  return <span>{icons[name] || '•'}</span>;
}

export default function DashboardPage() {
  const [sessionLoading, setSessionLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState('');
  const [activeTab, setActiveTab] = useState('drives');
  const [dashboard, setDashboard] = useState(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showAddDrive, setShowAddDrive] = useState(false);
  const [showAddMount, setShowAddMount] = useState(false);

  const [loginForm, setLoginForm] = useState({ username: 'admin', password: '' });
  const [settingsForm, setSettingsForm] = useState(DEFAULT_SETTINGS_FORM);
  const [setupForm, setSetupForm] = useState({
    adminUsername: '',
    adminPassword: '',
    hostname: '',
    rootShareName: 'timemachine',
    smbPublicPort: '445'
  });
  const [diskForm, setDiskForm] = useState(DEFAULT_DISK_FORM);
  const [mountForm, setMountForm] = useState(DEFAULT_MOUNT_FORM);
  const [editingDiskId, setEditingDiskId] = useState('');
  const [editingDiskForm, setEditingDiskForm] = useState(DEFAULT_DISK_FORM);
  const [editingMountId, setEditingMountId] = useState('');
  const [editingMountForm, setEditingMountForm] = useState(DEFAULT_MOUNT_FORM);
  const [logs, setLogs] = useState([]);
  const [logHosts, setLogHosts] = useState([]);
  const [logDrives, setLogDrives] = useState([]);
  const [logsHostFilter, setLogsHostFilter] = useState('all');
  const [logsDriveFilter, setLogsDriveFilter] = useState('all');
  const [logsConnected, setLogsConnected] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState('');
  const logsListRef = useRef(null);
  const [tailSources, setTailSources] = useState([]);
  const [selectedTailSource, setSelectedTailSource] = useState('');
  const [tailLines, setTailLines] = useState([]);
  const [tailConnected, setTailConnected] = useState(false);
  const [tailLoading, setTailLoading] = useState(false);
  const [tailError, setTailError] = useState('');
  const [tailMeta, setTailMeta] = useState(null);
  const [tailAutoScroll, setTailAutoScroll] = useState(true);
  const tailListRef = useRef(null);
  const [terminalSessionId, setTerminalSessionId] = useState('');
  const [terminalConnected, setTerminalConnected] = useState(false);
  const [terminalLoading, setTerminalLoading] = useState(false);
  const [terminalError, setTerminalError] = useState('');
  const [terminalInput, setTerminalInput] = useState('');
  const [terminalOutput, setTerminalOutput] = useState('');
  const terminalOutputRef = useRef(null);

  const mounts = dashboard?.mounts || [];
  const disks = dashboard?.disks || [];

  const mountOptions = useMemo(
    () => mounts.map((mount) => ({ id: mount.id, label: `${mount.name} (${mountRemoteDisplay(mount)})` })),
    [mounts]
  );
  const mountById = useMemo(() => new Map(mounts.map((mount) => [mount.id, mount])), [mounts]);
  const filteredLogs = useMemo(
    () =>
      logs.filter((entry) => {
        const hostMatch = logsHostFilter === 'all' || entry.host === logsHostFilter;
        const driveMatch = logsDriveFilter === 'all' || entry.drive === logsDriveFilter;
        return hostMatch && driveMatch;
      }),
    [logs, logsDriveFilter, logsHostFilter]
  );

  const syncFormsFromState = (next) => {
    setSettingsForm({
      hostname: next?.settings?.hostname || '',
      rootShareName: next?.settings?.rootShareName || 'timemachine',
      smbPublicPort: String(next?.settings?.smbPublicPort || 445),
      smbEnabled: next?.settings?.smbEnabled !== false,
      sftpEnabled: next?.settings?.sftpEnabled !== false,
      mountManagementEnabled: next?.settings?.mountManagementEnabled !== false
    });
    setSetupForm((prev) => ({
      adminUsername: prev.adminUsername || currentUser || 'admin',
      adminPassword: '',
      hostname: next?.settings?.hostname || '',
      rootShareName: next?.settings?.rootShareName || 'timemachine',
      smbPublicPort: String(next?.settings?.smbPublicPort || 445)
    }));
  };

  const refreshState = async () => {
    const next = await api('/admin/api/state');
    setDashboard(next);
    syncFormsFromState(next);
    return next;
  };

  const runAction = async (successMessage, fn) => {
    setError('');
    setNotice('');
    setSubmitting(true);
    try {
      await fn();
      if (successMessage) {
        setNotice(successMessage);
      }
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setSubmitting(false);
    }
  };

  const refreshTailSources = useCallback(async ({ background = false } = {}) => {
    if (!background) {
      setTailLoading(true);
      setTailError('');
    }

    try {
      const payload = await api('/admin/api/log-tail/sources');
      const nextSources = Array.isArray(payload?.sources) ? payload.sources : [];
      setTailSources(nextSources);
      setSelectedTailSource((prev) => {
        if (prev && nextSources.some((source) => source.source === prev)) {
          return prev;
        }
        return nextSources[0]?.source || '';
      });
      if (nextSources.length === 0) {
        setTailError('No log sources available');
      }
    } catch (sourceError) {
      setTailError(sourceError.message || 'Unable to load log sources');
    } finally {
      if (!background) {
        setTailLoading(false);
      }
    }
  }, []);

  const appendTailLine = useCallback((line, stream = 'stdout') => {
    if (line === undefined || line === null) {
      return;
    }
    const prefix = stream === 'stderr' ? '[stderr] ' : '';
    const formatted = `${prefix}${String(line)}`;
    setTailLines((prev) => {
      const next = [...prev, formatted];
      return next.length > MAX_TAIL_LINES ? next.slice(next.length - MAX_TAIL_LINES) : next;
    });
  }, []);

  const appendTerminalChunk = useCallback((chunk) => {
    if (!chunk) {
      return;
    }
    setTerminalOutput((prev) => {
      const next = `${prev}${String(chunk)}`;
      return next.length > MAX_TERMINAL_CHARS ? next.slice(next.length - MAX_TERMINAL_CHARS) : next;
    });
  }, []);

  const sendTerminalInput = useCallback(async (input) => {
    if (!terminalSessionId || !input) {
      return;
    }
    try {
      await api(`/admin/api/terminal/sessions/${terminalSessionId}/input`, {
        method: 'POST',
        body: JSON.stringify({ input })
      });
      setTerminalError('');
    } catch (inputError) {
      setTerminalError(inputError.message || 'Failed to send command');
    }
  }, [terminalSessionId]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const session = await api('/admin/api/session');
        if (cancelled) {
          return;
        }

        if (session.authenticated) {
          setAuthenticated(true);
          setCurrentUser(session.username || 'admin');
          await refreshState();
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) {
          setSessionLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

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
        const payload = await api('/admin/api/logs');
        if (cancelled) {
          return;
        }
        setLogs(Array.isArray(payload?.logs) ? payload.logs.slice(-MAX_DASHBOARD_LOGS) : []);
        setLogHosts(Array.isArray(payload?.hosts) ? payload.hosts : []);
        setLogDrives(Array.isArray(payload?.drives) ? payload.drives : []);
      } catch (snapshotError) {
        if (!cancelled) {
          setLogsError(snapshotError.message || 'Unable to load logs');
        }
      } finally {
        if (!cancelled) {
          setLogsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authenticated]);

  useEffect(() => {
    if (!authenticated) {
      return;
    }

    let closed = false;
    let reconnectTimer = null;
    let stream = null;

    const connect = () => {
      if (closed) {
        return;
      }

      stream = new EventSource('/admin/api/logs/stream');

      stream.onopen = () => {
        setLogsConnected(true);
        setLogsError('');
      };

      stream.addEventListener('snapshot', (event) => {
        const payload = parseEventData(event);
        if (!payload || closed) {
          return;
        }
        setLogs(Array.isArray(payload.logs) ? payload.logs.slice(-MAX_DASHBOARD_LOGS) : []);
        setLogHosts(Array.isArray(payload.hosts) ? payload.hosts : []);
        setLogDrives(Array.isArray(payload.drives) ? payload.drives : []);
      });

      stream.addEventListener('log', (event) => {
        const entry = parseEventData(event);
        if (!entry || closed) {
          return;
        }

        setLogs((prev) => {
          const next = [...prev, entry];
          return next.length > MAX_DASHBOARD_LOGS ? next.slice(next.length - MAX_DASHBOARD_LOGS) : next;
        });

        if (entry.host) {
          setLogHosts((prev) => (prev.includes(entry.host) ? prev : [...prev, entry.host].sort((a, b) => a.localeCompare(b))));
        }

        if (entry.drive) {
          setLogDrives((prev) => (prev.includes(entry.drive) ? prev : [...prev, entry.drive].sort((a, b) => a.localeCompare(b))));
        }
      });

      stream.onerror = () => {
        setLogsConnected(false);
        setLogsError('Live stream disconnected, retrying...');
        stream?.close();
        if (!closed) {
          reconnectTimer = setTimeout(connect, 2000);
        }
      };
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
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
    let intervalId = null;

    (async () => {
      await refreshTailSources();
      if (cancelled) {
        return;
      }
      intervalId = setInterval(() => {
        refreshTailSources({ background: true }).catch(() => { });
      }, 15000);
    })();

    return () => {
      cancelled = true;
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [authenticated, refreshTailSources]);

  useEffect(() => {
    if (!authenticated || activeTab !== 'logs' || !selectedTailSource) {
      setTailConnected(false);
      return;
    }

    let closed = false;
    let reconnectTimer = null;
    let stream = null;

    setTailLines([]);
    setTailMeta(null);
    setTailError('');

    const connect = () => {
      if (closed) {
        return;
      }

      stream = new EventSource(
        `/admin/api/log-tail/stream?source=${encodeURIComponent(selectedTailSource)}&lines=${DEFAULT_TAIL_LINE_COUNT}`
      );

      stream.onopen = () => {
        setTailConnected(true);
        setTailError('');
      };

      stream.addEventListener('source', (event) => {
        const payload = parseEventData(event);
        if (!payload || closed) {
          return;
        }
        setTailMeta(payload);
      });

      stream.addEventListener('line', (event) => {
        const payload = parseEventData(event);
        if (!payload || closed) {
          return;
        }
        appendTailLine(payload.line, payload.stream);
      });

      stream.addEventListener('status', (event) => {
        const payload = parseEventData(event);
        if (!payload || closed) {
          return;
        }
        if (payload.state === 'error') {
          setTailError(payload.message || 'Tail stream error');
        }
      });

      stream.onerror = () => {
        setTailConnected(false);
        setTailError('Tail stream disconnected, retrying...');
        stream?.close();
        if (!closed) {
          reconnectTimer = setTimeout(connect, 2000);
        }
      };
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      stream?.close();
    };
  }, [activeTab, appendTailLine, authenticated, selectedTailSource]);

  useEffect(() => {
    if (!authenticated || activeTab !== 'logs' || terminalSessionId) {
      return;
    }

    let cancelled = false;
    setTerminalLoading(true);
    setTerminalError('');

    (async () => {
      try {
        const payload = await api('/admin/api/terminal/sessions', {
          method: 'POST',
          body: '{}'
        });
        if (!cancelled) {
          setTerminalSessionId(payload?.sessionId || '');
        }
      } catch (sessionError) {
        if (!cancelled) {
          setTerminalError(sessionError.message || 'Unable to start terminal session');
        }
      } finally {
        if (!cancelled) {
          setTerminalLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeTab, authenticated, terminalSessionId]);

  useEffect(() => {
    if (authenticated || !terminalSessionId) {
      return;
    }
    fetch(`/admin/api/terminal/sessions/${terminalSessionId}`, { method: 'DELETE' }).catch(() => { });
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
    let reconnectTimer = null;
    let stream = null;

    const connect = () => {
      if (closed) {
        return;
      }

      stream = new EventSource(`/admin/api/terminal/sessions/${terminalSessionId}/stream`);

      stream.onopen = () => {
        setTerminalConnected(true);
        setTerminalError('');
      };

      stream.addEventListener('snapshot', (event) => {
        const payload = parseEventData(event);
        if (!payload || closed) {
          return;
        }
        if (typeof payload.output === 'string') {
          setTerminalOutput(payload.output);
        }
      });

      stream.addEventListener('output', (event) => {
        const payload = parseEventData(event);
        if (!payload || closed) {
          return;
        }
        appendTerminalChunk(payload.chunk);
      });

      stream.addEventListener('status', (event) => {
        const payload = parseEventData(event);
        if (!payload || closed) {
          return;
        }
        if (payload.state === 'closed') {
          setTerminalConnected(false);
        }
        if (payload.state === 'error') {
          setTerminalError(payload.message || 'Terminal error');
        }
      });

      stream.onerror = () => {
        setTerminalConnected(false);
        stream?.close();
        if (!closed) {
          reconnectTimer = setTimeout(connect, 2000);
        }
      };
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      stream?.close();
    };
  }, [activeTab, appendTerminalChunk, authenticated, terminalSessionId]);

  useEffect(() => {
    if (activeTab !== 'logs') {
      return;
    }
    const node = logsListRef.current;
    if (!node) {
      return;
    }
    node.scrollTop = node.scrollHeight;
  }, [activeTab, filteredLogs]);

  useEffect(() => {
    if (activeTab !== 'logs' || !tailAutoScroll) {
      return;
    }
    const node = tailListRef.current;
    if (!node) {
      return;
    }
    node.scrollTop = node.scrollHeight;
  }, [activeTab, tailAutoScroll, tailLines]);

  useEffect(() => {
    if (activeTab !== 'logs') {
      return;
    }
    const node = terminalOutputRef.current;
    if (!node) {
      return;
    }
    node.scrollTop = node.scrollHeight;
  }, [activeTab, terminalOutput]);

  const handleTerminalSubmit = async (event) => {
    event.preventDefault();
    if (!terminalInput.trim()) {
      return;
    }
    await sendTerminalInput(`${terminalInput}\n`);
    setTerminalInput('');
  };

  const handleRestartTerminal = async () => {
    if (terminalSessionId) {
      await api(`/admin/api/terminal/sessions/${terminalSessionId}`, {
        method: 'DELETE'
      }).catch(() => { });
    }
    setTerminalSessionId('');
    setTerminalOutput('');
    setTerminalInput('');
    setTerminalConnected(false);
    setTerminalError('');
  };

  const handleLogin = async (event) => {
    event.preventDefault();

    await runAction('', async () => {
      const res = await api('/admin/api/login', {
        method: 'POST',
        body: JSON.stringify({
          username: loginForm.username,
          password: loginForm.password
        })
      });

      setAuthenticated(true);
      setCurrentUser(res?.username || loginForm.username || 'admin');
      setLoginForm((prev) => ({ ...prev, password: '' }));
      await refreshState();
      setNotice('Welcome back!');
    });
  };

  const handleLogout = async () => {
    await runAction('', async () => {
      await api('/admin/api/logout', {
        method: 'POST',
        body: '{}'
      });

      setAuthenticated(false);
      setDashboard(null);
      setCurrentUser('');
      setNotice('Signed out successfully.');
    });
  };

  const handleSetupSubmit = async (event) => {
    event.preventDefault();

    await runAction('Setup complete! Your server is ready.', async () => {
      await api('/admin/api/setup', {
        method: 'POST',
        body: JSON.stringify({
          adminUsername: setupForm.adminUsername || undefined,
          adminPassword: setupForm.adminPassword || undefined,
          hostname: setupForm.hostname,
          rootShareName: setupForm.rootShareName,
          smbPublicPort: Number(setupForm.smbPublicPort || 445),
          applySamba: true,
          markSetupComplete: true
        })
      });

      await refreshState();
      setSetupForm((prev) => ({ ...prev, adminPassword: '' }));
    });
  };

  const markSetupComplete = async () => {
    await runAction('Setup marked complete.', async () => {
      await api('/admin/api/setup', {
        method: 'POST',
        body: JSON.stringify({
          applySamba: false,
          markSetupComplete: true
        })
      });
      await refreshState();
    });
  };

  const handleSettingsSave = async (event) => {
    event.preventDefault();

    await runAction('Settings saved successfully.', async () => {
      await api('/admin/api/settings', {
        method: 'PUT',
        body: JSON.stringify({
          hostname: settingsForm.hostname,
          rootShareName: settingsForm.rootShareName,
          smbPublicPort: Number(settingsForm.smbPublicPort || 445),
          smbEnabled: settingsForm.smbEnabled,
          sftpEnabled: settingsForm.sftpEnabled,
          mountManagementEnabled: settingsForm.mountManagementEnabled,
          applySamba: settingsForm.smbEnabled
        })
      });
      await refreshState();
    });
  };

  const copyToClipboard = async (label, value) => {
    const text = String(value || '');
    if (!text) {
      setError(`Nothing to copy for ${label}`);
      return;
    }

    setError('');
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'absolute';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setNotice(`${label} copied to clipboard`);
    } catch (copyError) {
      setError(copyError.message || `Unable to copy ${label}`);
    }
  };

  const smbConfigTextForDisk = (disk) =>
    [
      `Drive: ${disk.name}`,
      `Share Name: ${disk.smbShareName || ''}`,
      `Share URL: ${disk.diskShareUrl || ''}`,
      `Root URL: ${disk.rootShareUrl || ''}`,
      `Username: ${disk.smbUsername || ''}`,
      `Password: ${disk.smbPassword || ''}`,
      `Storage Path: ${disk.storagePath || ''}`
    ].join('\n');

  const startEditDisk = (disk) => {
    const mount = disk.storageMountId ? mountById.get(disk.storageMountId) : null;
    setEditingDiskId(disk.id);
    setEditingDiskForm({
      name: disk.name || '',
      quotaGb: String(disk.quotaGb || 0),
      storageMode: disk.storageMode || 'local',
      storageMountId: disk.storageMountId || '',
      storageSubdir: subdirFromPaths(mount?.mountPath || disk.storageBasePath, disk.storagePath),
      storagePath: disk.storageBasePath || disk.storagePath || '',
      shareName: disk.smbShareName || '',
      smbUsername: disk.smbUsername || '',
      smbPassword: disk.smbPassword || '',
      applySamba: true
    });
  };

  const cancelEditDisk = () => {
    setEditingDiskId('');
    setEditingDiskForm(DEFAULT_DISK_FORM);
  };

  const handleUpdateDisk = async (event) => {
    event.preventDefault();
    if (!editingDiskId) {
      return;
    }

    const currentDisk = disks.find((disk) => disk.id === editingDiskId);
    if (!currentDisk) {
      setError('Drive no longer exists');
      return;
    }

    await runAction('Drive updated successfully.', async () => {
      const payload = {
        name: editingDiskForm.name.trim(),
        quotaGb: Number(editingDiskForm.quotaGb || 0),
        smbShareName: editingDiskForm.shareName.trim() || undefined,
        smbUsername: editingDiskForm.smbUsername.trim() || undefined,
        applySamba: settingsForm.smbEnabled && editingDiskForm.applySamba
      };

      if (editingDiskForm.storageMode) {
        payload.storageMode = editingDiskForm.storageMode;
      }

      if (editingDiskForm.storageMode === 'cloud-mount') {
        payload.storageMountId = editingDiskForm.storageMountId || undefined;
        payload.storageSubdir = editingDiskForm.storageSubdir.trim() || undefined;
      }

      if (editingDiskForm.storageMode === 'cloudmounter') {
        payload.storagePath = editingDiskForm.storagePath.trim() || undefined;
      }

      await api(`/admin/api/disks/${editingDiskId}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });

      if (editingDiskForm.smbPassword !== currentDisk.smbPassword) {
        if (!editingDiskForm.smbPassword) {
          throw new Error('SMB password cannot be empty');
        }
        await api(`/admin/api/disks/${editingDiskId}/password`, {
          method: 'POST',
          body: JSON.stringify({ password: editingDiskForm.smbPassword })
        });
      }

      cancelEditDisk();
      await refreshState();
    });
  };

  const startEditMount = (mount) => {
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
      ensureMounted: false
    });
  };

  const cancelEditMount = () => {
    setEditingMountId('');
    setEditingMountForm(DEFAULT_MOUNT_FORM);
  };

  const handleUpdateMount = async (event) => {
    event.preventDefault();
    if (!editingMountId) {
      return;
    }

    await runAction('Cloud mount updated successfully.', async () => {
      const payload = {
        name: editingMountForm.name.trim(),
        provider: editingMountForm.provider,
        mountPath: editingMountForm.mountPath.trim(),
        enabled: editingMountForm.enabled,
        ensureMounted: settingsForm.mountManagementEnabled && editingMountForm.ensureMounted,
        extraArgs: parseExtraArgs(editingMountForm.extraArgs),
        rcloneBinary: editingMountForm.rcloneBinary.trim() || 'rclone'
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
        body: JSON.stringify(payload)
      });

      cancelEditMount();
      await refreshState();
    });
  };

  const handleCreateDisk = async (event) => {
    event.preventDefault();

    await runAction('Drive created successfully!', async () => {
      const payload = {
        name: diskForm.name.trim(),
        quotaGb: Number(diskForm.quotaGb || 0),
        storageMode: diskForm.storageMode,
        shareName: diskForm.shareName.trim() || undefined,
        smbUsername: diskForm.smbUsername.trim() || undefined,
        smbPassword: diskForm.smbPassword || undefined,
        applySamba: settingsForm.smbEnabled && diskForm.applySamba
      };

      if (diskForm.storageMode === 'cloud-mount') {
        payload.storageMountId = diskForm.storageMountId || undefined;
        payload.storageSubdir = diskForm.storageSubdir.trim() || undefined;
      }

      if (diskForm.storageMode === 'cloudmounter') {
        payload.storagePath = diskForm.storagePath.trim() || undefined;
      }

      await api('/admin/api/disks', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      setDiskForm(DEFAULT_DISK_FORM);
      setShowAddDrive(false);
      await refreshState();
    });
  };

  const handleDiskAction = async (diskId, action) => {
    await runAction('', async () => {
      if (action === 'rotate') {
        await api(`/admin/api/disks/${diskId}/password`, {
          method: 'POST',
          body: '{}'
        });
        setNotice(`Password rotated for ${diskId}`);
      }

      if (action === 'apply') {
        await api(`/admin/api/disks/${diskId}/apply-samba`, {
          method: 'POST',
          body: '{}'
        });
        setNotice(`Samba configuration applied for ${diskId}`);
      }

      if (action === 'delete') {
        const confirmed = window.confirm(`Are you sure you want to delete "${diskId}"? This action cannot be undone.`);
        if (!confirmed) {
          return;
        }

        await api(`/admin/api/disks/${diskId}`, {
          method: 'DELETE',
          body: JSON.stringify({ deleteData: false })
        });
        setNotice(`Drive "${diskId}" deleted successfully`);
      }

      await refreshState();
    });
  };

  const handleCreateMount = async (event) => {
    event.preventDefault();

    await runAction('Cloud mount created successfully!', async () => {
      const payload = {
        name: mountForm.name.trim(),
        provider: mountForm.provider,
        mountPath: mountForm.mountPath.trim(),
        enabled: mountForm.enabled,
        ensureMounted: settingsForm.mountManagementEnabled && mountForm.ensureMounted,
        extraArgs: parseExtraArgs(mountForm.extraArgs)
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
        body: JSON.stringify(payload)
      });

      setMountForm(DEFAULT_MOUNT_FORM);
      setShowAddMount(false);
      await refreshState();
    });
  };

  const handleMountAction = async (mountId, action) => {
    await runAction('', async () => {
      if (action === 'ensure') {
        await api(`/admin/api/mounts/${mountId}/ensure`, {
          method: 'POST',
          body: '{}'
        });
        setNotice(`Mount "${mountId}" is now active`);
      }

      if (action === 'unmount') {
        await api(`/admin/api/mounts/${mountId}/unmount`, {
          method: 'POST',
          body: '{}'
        });
        setNotice(`Mount "${mountId}" unmounted`);
      }

      if (action === 'delete') {
        const confirmed = window.confirm(`Are you sure you want to delete "${mountId}"? This action cannot be undone.`);
        if (!confirmed) {
          return;
        }

        await api(`/admin/api/mounts/${mountId}`, {
          method: 'DELETE',
          body: '{}'
        });
        setNotice(`Mount "${mountId}" deleted successfully`);
      }

      await refreshState();
    });
  };

  if (sessionLoading) {
    return (
      <main className="viewport">
        <div className="loading-state">
          <div className="spinner" />
          <p>Loading session...</p>
        </div>
      </main>
    );
  }

  if (!authenticated) {
    return (
      <main className="viewport">
        <div className="auth-card animate-in">
          <div className="auth-logo">💾</div>
          <h1>TM Adapter</h1>
          <p className="subtitle">Sign in to manage your Time Machine backups</p>

          {error && (
            <div className="banner error">
              <Icon name="error" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label htmlFor="username">Username</label>
              <input
                id="username"
                type="text"
                value={loginForm.username}
                onChange={(e) => setLoginForm((prev) => ({ ...prev, username: e.target.value }))}
                placeholder="admin"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={loginForm.password}
                onChange={(e) => setLoginForm((prev) => ({ ...prev, password: e.target.value }))}
                placeholder="Enter your password"
                required
              />
            </div>

            <button className="btn primary full lg" type="submit" disabled={submitting}>
              {submitting ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </div>
      </main>
    );
  }

  if (!dashboard) {
    return (
      <main className="viewport">
        <div className="loading-state">
          <div className="spinner" />
          <p>Loading dashboard...</p>
        </div>
      </main>
    );
  }

  const navItems = [
    { id: 'drives', icon: 'drives', label: 'Drives', count: disks.length },
    { id: 'mounts', icon: 'cloud', label: 'Cloud Mounts', count: mounts.length },
    { id: 'logs', icon: 'logs', label: 'Live Logs', count: logs.length },
    { id: 'settings', icon: 'settings', label: 'Settings' }
  ];

  return (
    <div className="shell">
      {/* Mobile Header */}
      <div className="mobile-header">
        <button className="btn ghost icon-only" onClick={() => setSidebarOpen(!sidebarOpen)}>
          ☰
        </button>
        <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>TM Adapter</h1>
      </div>

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <div className="icon">💾</div>
            <h1>TM Adapter</h1>
          </div>
          <p className="sidebar-user">{currentUser || 'admin'}</p>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section">
            <div className="nav-label">Management</div>
            {navItems.map((item) => (
              <button
                key={item.id}
                className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab(item.id);
                  setSidebarOpen(false);
                }}
              >
                <span className="icon"><Icon name={item.icon} /></span>
                <span>{item.label}</span>
                {item.count !== undefined && <span className="badge">{item.count}</span>}
              </button>
            ))}
          </div>
        </nav>

        <div className="sidebar-footer">
          <button className="nav-item" onClick={handleLogout} disabled={submitting}>
            <span className="icon"><Icon name="logout" /></span>
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        {/* Banners */}
        {notice && (
          <div className="banner success animate-in">
            <span className="icon"><Icon name="check" /></span>
            <span>{notice}</span>
            <button className="close" onClick={() => setNotice('')}>×</button>
          </div>
        )}
        {error && (
          <div className="banner error animate-in">
            <span className="icon"><Icon name="error" /></span>
            <span>{error}</span>
            <button className="close" onClick={() => setError('')}>×</button>
          </div>
        )}

        {/* Setup Banner */}
        {dashboard?.settings?.setupCompleted !== true && (
          <div className="setup-banner animate-in">
            <h3><Icon name="setup" /> Initial Setup Required</h3>
            <p>Configure your server settings to get started. This ensures Samba and cloud mounts are properly configured.</p>

            <form onSubmit={handleSetupSubmit}>
              <div className="form-grid">
                <div className="form-group">
                  <label htmlFor="setup-username">Admin Username</label>
                  <input
                    id="setup-username"
                    type="text"
                    value={setupForm.adminUsername}
                    onChange={(e) => setSetupForm((prev) => ({ ...prev, adminUsername: e.target.value }))}
                    placeholder="admin"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="setup-password">Admin Password</label>
                  <input
                    id="setup-password"
                    type="password"
                    value={setupForm.adminPassword}
                    onChange={(e) => setSetupForm((prev) => ({ ...prev, adminPassword: e.target.value }))}
                    placeholder="Leave blank to keep current"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="setup-hostname">Hostname or IP</label>
                  <input
                    id="setup-hostname"
                    type="text"
                    value={setupForm.hostname}
                    onChange={(e) => setSetupForm((prev) => ({ ...prev, hostname: e.target.value }))}
                    placeholder="127.0.0.1"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="setup-share">Root Share Name</label>
                  <input
                    id="setup-share"
                    type="text"
                    value={setupForm.rootShareName}
                    onChange={(e) => setSetupForm((prev) => ({ ...prev, rootShareName: e.target.value }))}
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="setup-port">SMB Port</label>
                  <input
                    id="setup-port"
                    type="number"
                    min="1"
                    max="65535"
                    value={setupForm.smbPublicPort}
                    onChange={(e) => setSetupForm((prev) => ({ ...prev, smbPublicPort: e.target.value }))}
                    required
                  />
                </div>
              </div>

              <div className="row" style={{ marginTop: 20 }}>
                <button className="btn primary" type="submit" disabled={submitting}>
                  <Icon name="check" /> Complete Setup
                </button>
                <button className="btn ghost" type="button" onClick={markSetupComplete} disabled={submitting}>
                  Skip for now
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Drives Tab */}
        {activeTab === 'drives' && (
          <div className="animate-in">
            <div className="page-header">
              <h2>Time Machine Drives</h2>
              <p>Manage virtual drives for Time Machine backups</p>
            </div>

            <div className="section-header">
              <h3>{disks.length} Drive{disks.length !== 1 ? 's' : ''} Configured</h3>
              <button className="btn primary" onClick={() => setShowAddDrive(!showAddDrive)}>
                <Icon name="add" /> Add Drive
              </button>
            </div>

            {showAddDrive && (
              <div className="card animate-in" style={{ marginBottom: 20 }}>
                <div className="card-header">
                  <h3><Icon name="add" /> Create New Drive</h3>
                </div>

                <form onSubmit={handleCreateDisk}>
                  <div className="form-grid">
                    <div className="form-group">
                      <label htmlFor="disk-name">Drive Name</label>
                      <input
                        id="disk-name"
                        type="text"
                        value={diskForm.name}
                        onChange={(e) => setDiskForm((prev) => ({ ...prev, name: e.target.value }))}
                        placeholder="My Time Machine"
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="disk-quota">Quota (GB)</label>
                      <input
                        id="disk-quota"
                        type="number"
                        min="0"
                        value={diskForm.quotaGb}
                        onChange={(e) => setDiskForm((prev) => ({ ...prev, quotaGb: e.target.value }))}
                        placeholder="0 for unlimited"
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="disk-mode">Storage Mode</label>
                      <select
                        id="disk-mode"
                        value={diskForm.storageMode}
                        onChange={(e) => setDiskForm((prev) => ({ ...prev, storageMode: e.target.value }))}
                      >
                        <option value="local">Local Storage</option>
                        <option value="cloud-mount">Cloud Mount</option>
                        <option value="cloudmounter">Custom Path</option>
                      </select>
                    </div>

                    {diskForm.storageMode === 'cloud-mount' && (
                      <>
                        <div className="form-group">
                          <label htmlFor="disk-mount">Cloud Mount</label>
                          <select
                            id="disk-mount"
                            value={diskForm.storageMountId}
                            onChange={(e) => setDiskForm((prev) => ({ ...prev, storageMountId: e.target.value }))}
                            required
                          >
                            <option value="">Select a mount...</option>
                            {mountOptions.map((mount) => (
                              <option key={mount.id} value={mount.id}>{mount.label}</option>
                            ))}
                          </select>
                        </div>

                        <div className="form-group">
                          <label htmlFor="disk-subdir">Subdirectory</label>
                          <input
                            id="disk-subdir"
                            type="text"
                            value={diskForm.storageSubdir}
                            onChange={(e) => setDiskForm((prev) => ({ ...prev, storageSubdir: e.target.value }))}
                            placeholder="Optional subfolder"
                          />
                        </div>
                      </>
                    )}

                    {diskForm.storageMode === 'cloudmounter' && (
                      <div className="form-group">
                        <label htmlFor="disk-path">Filesystem Path</label>
                        <input
                          id="disk-path"
                          type="text"
                          value={diskForm.storagePath}
                          onChange={(e) => setDiskForm((prev) => ({ ...prev, storagePath: e.target.value }))}
                          placeholder="/mnt/my-storage"
                          required
                        />
                      </div>
                    )}

                    <div className="form-group">
                      <label htmlFor="disk-share">SMB Share Name</label>
                      <input
                        id="disk-share"
                        type="text"
                        value={diskForm.shareName}
                        onChange={(e) => setDiskForm((prev) => ({ ...prev, shareName: e.target.value }))}
                        placeholder="Auto-generated if empty"
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="disk-user">SMB Username</label>
                      <input
                        id="disk-user"
                        type="text"
                        value={diskForm.smbUsername}
                        onChange={(e) => setDiskForm((prev) => ({ ...prev, smbUsername: e.target.value }))}
                        placeholder="Auto-generated if empty"
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="disk-pass">SMB Password</label>
                      <input
                        id="disk-pass"
                        type="text"
                        value={diskForm.smbPassword}
                        onChange={(e) => setDiskForm((prev) => ({ ...prev, smbPassword: e.target.value }))}
                        placeholder="Auto-generated if empty"
                      />
                    </div>
                  </div>

                  <div className="checkbox-group">
                    <input
                      type="checkbox"
                      id="disk-apply"
                      checked={diskForm.applySamba}
                      onChange={(e) => setDiskForm((prev) => ({ ...prev, applySamba: e.target.checked }))}
                    />
                    <span onClick={() => setDiskForm((prev) => ({ ...prev, applySamba: !prev.applySamba }))}>
                      Apply Samba configuration immediately
                    </span>
                  </div>

                  <div className="form-actions">
                    <button className="btn primary" type="submit" disabled={submitting}>
                      <Icon name="add" /> Create Drive
                    </button>
                    <button className="btn ghost" type="button" onClick={() => setShowAddDrive(false)}>
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}

            {disks.length === 0 ? (
              <div className="card">
                <div className="empty-state">
                  <div className="icon">💾</div>
                  <h4>No drives configured</h4>
                  <p>Create your first Time Machine drive to get started with backups.</p>
                </div>
              </div>
            ) : (
              <div className="stack">
                {disks.map((disk) => {
                  const isEditing = editingDiskId === disk.id;
                  return (
                    <div key={disk.id} className="card">
                      <div className="card-header">
                        <h3>
                          <Icon name="drives" /> {disk.name}
                          <span className="subtitle">• {disk.smbShareName}</span>
                        </h3>
                      </div>

                      {isEditing ? (
                        <form onSubmit={handleUpdateDisk}>
                          <div className="form-grid">
                            <div className="form-group">
                              <label htmlFor={`edit-disk-name-${disk.id}`}>Drive Name</label>
                              <input
                                id={`edit-disk-name-${disk.id}`}
                                type="text"
                                value={editingDiskForm.name}
                                onChange={(e) => setEditingDiskForm((prev) => ({ ...prev, name: e.target.value }))}
                                required
                              />
                            </div>

                            <div className="form-group">
                              <label htmlFor={`edit-disk-quota-${disk.id}`}>Quota (GB)</label>
                              <input
                                id={`edit-disk-quota-${disk.id}`}
                                type="number"
                                min="0"
                                value={editingDiskForm.quotaGb}
                                onChange={(e) => setEditingDiskForm((prev) => ({ ...prev, quotaGb: e.target.value }))}
                              />
                            </div>

                            <div className="form-group">
                              <label htmlFor={`edit-disk-mode-${disk.id}`}>Storage Mode</label>
                              <select
                                id={`edit-disk-mode-${disk.id}`}
                                value={editingDiskForm.storageMode}
                                onChange={(e) => setEditingDiskForm((prev) => ({ ...prev, storageMode: e.target.value }))}
                              >
                                <option value="local">Local Storage</option>
                                <option value="cloud-mount">Cloud Mount</option>
                                <option value="cloudmounter">Custom Path</option>
                              </select>
                            </div>

                            {editingDiskForm.storageMode === 'cloud-mount' && (
                              <>
                                <div className="form-group">
                                  <label htmlFor={`edit-disk-mount-${disk.id}`}>Cloud Mount</label>
                                  <select
                                    id={`edit-disk-mount-${disk.id}`}
                                    value={editingDiskForm.storageMountId}
                                    onChange={(e) => setEditingDiskForm((prev) => ({ ...prev, storageMountId: e.target.value }))}
                                    required
                                  >
                                    <option value="">Select a mount...</option>
                                    {mountOptions.map((mount) => (
                                      <option key={mount.id} value={mount.id}>{mount.label}</option>
                                    ))}
                                  </select>
                                </div>
                                <div className="form-group">
                                  <label htmlFor={`edit-disk-subdir-${disk.id}`}>Subdirectory</label>
                                  <input
                                    id={`edit-disk-subdir-${disk.id}`}
                                    type="text"
                                    value={editingDiskForm.storageSubdir}
                                    onChange={(e) => setEditingDiskForm((prev) => ({ ...prev, storageSubdir: e.target.value }))}
                                    placeholder="Optional subfolder"
                                  />
                                </div>
                              </>
                            )}

                            {editingDiskForm.storageMode === 'cloudmounter' && (
                              <div className="form-group">
                                <label htmlFor={`edit-disk-path-${disk.id}`}>Filesystem Path</label>
                                <input
                                  id={`edit-disk-path-${disk.id}`}
                                  type="text"
                                  value={editingDiskForm.storagePath}
                                  onChange={(e) => setEditingDiskForm((prev) => ({ ...prev, storagePath: e.target.value }))}
                                  required
                                />
                              </div>
                            )}

                            <div className="form-group">
                              <label htmlFor={`edit-disk-share-${disk.id}`}>SMB Share Name</label>
                              <input
                                id={`edit-disk-share-${disk.id}`}
                                type="text"
                                value={editingDiskForm.shareName}
                                onChange={(e) => setEditingDiskForm((prev) => ({ ...prev, shareName: e.target.value }))}
                                required
                              />
                            </div>

                            <div className="form-group">
                              <label htmlFor={`edit-disk-user-${disk.id}`}>SMB Username</label>
                              <input
                                id={`edit-disk-user-${disk.id}`}
                                type="text"
                                value={editingDiskForm.smbUsername}
                                onChange={(e) => setEditingDiskForm((prev) => ({ ...prev, smbUsername: e.target.value }))}
                                required
                              />
                            </div>

                            <div className="form-group">
                              <label htmlFor={`edit-disk-pass-${disk.id}`}>SMB Password</label>
                              <input
                                id={`edit-disk-pass-${disk.id}`}
                                type="text"
                                value={editingDiskForm.smbPassword}
                                onChange={(e) => setEditingDiskForm((prev) => ({ ...prev, smbPassword: e.target.value }))}
                                required
                              />
                            </div>
                          </div>

                          <div className="checkbox-group">
                            <input
                              type="checkbox"
                              id={`edit-disk-apply-${disk.id}`}
                              checked={editingDiskForm.applySamba}
                              onChange={(e) => setEditingDiskForm((prev) => ({ ...prev, applySamba: e.target.checked }))}
                            />
                            <span onClick={() => setEditingDiskForm((prev) => ({ ...prev, applySamba: !prev.applySamba }))}>
                              Apply Samba configuration immediately
                            </span>
                          </div>

                          <div className="form-actions">
                            <button className="btn primary" type="submit" disabled={submitting}>
                              <Icon name="check" /> Save Drive
                            </button>
                            <button className="btn ghost" type="button" onClick={cancelEditDisk}>
                              Cancel
                            </button>
                          </div>
                        </form>
                      ) : (
                        <>
                          <div className="info-grid">
                            <div className="info-item">
                              <div className="label">Share URL</div>
                              <div className="value">{disk.diskShareUrl || 'N/A'}</div>
                            </div>
                            <div className="info-item">
                              <div className="label">Root URL</div>
                              <div className="value">{disk.rootShareUrl || 'N/A'}</div>
                            </div>
                            <div className="info-item">
                              <div className="label">Username</div>
                              <div className="value">{disk.smbUsername || 'N/A'}</div>
                            </div>
                            <div className="info-item">
                              <div className="label">Password</div>
                              <div className="value">{disk.smbPassword || 'N/A'}</div>
                            </div>
                            <div className="info-item">
                              <div className="label">Storage Path</div>
                              <div className="value">{disk.storagePath || 'N/A'}</div>
                            </div>
                          </div>

                          <div className="card-footer">
                            <button className="btn sm" onClick={() => copyToClipboard('SMB config', smbConfigTextForDisk(disk))} type="button">
                              Copy SMB Config
                            </button>
                            <button className="btn sm" onClick={() => copyToClipboard('SMB URL', disk.diskShareUrl)} type="button">
                              Copy URL
                            </button>
                            <button className="btn sm" onClick={() => copyToClipboard('SMB username', disk.smbUsername)} type="button">
                              Copy Username
                            </button>
                            <button className="btn sm" onClick={() => copyToClipboard('SMB password', disk.smbPassword)} type="button">
                              Copy Password
                            </button>
                            <button className="btn sm" onClick={() => startEditDisk(disk)} disabled={submitting}>
                              Edit
                            </button>
                            <button className="btn sm" onClick={() => handleDiskAction(disk.id, 'rotate')} disabled={submitting}>
                              <Icon name="key" /> Rotate Password
                            </button>
                            <button
                              className="btn sm"
                              onClick={() => handleDiskAction(disk.id, 'apply')}
                              disabled={submitting || dashboard?.settings?.smbEnabled === false}
                            >
                              <Icon name="apply" /> Apply Samba
                            </button>
                            <button className="btn sm danger" onClick={() => handleDiskAction(disk.id, 'delete')} disabled={submitting}>
                              <Icon name="delete" /> Delete
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Cloud Mounts Tab */}
        {activeTab === 'mounts' && (
          <div className="animate-in">
            <div className="page-header">
              <h2>Cloud Mounts</h2>
              <p>Connect cloud storage providers for remote backups</p>
            </div>

            <div className="section-header">
              <h3>{mounts.length} Mount{mounts.length !== 1 ? 's' : ''} Configured</h3>
              <button className="btn primary" onClick={() => setShowAddMount(!showAddMount)}>
                <Icon name="add" /> Add Mount
              </button>
            </div>

            {showAddMount && (
              <div className="card animate-in" style={{ marginBottom: 20 }}>
                <div className="card-header">
                  <h3><Icon name="cloud" /> Create Cloud Mount</h3>
                </div>

                <form onSubmit={handleCreateMount}>
                  <div className="form-grid">
                    <div className="form-group">
                      <label htmlFor="mount-name">Mount Name</label>
                      <input
                        id="mount-name"
                        type="text"
                        value={mountForm.name}
                        onChange={(e) => setMountForm((prev) => ({ ...prev, name: e.target.value }))}
                        placeholder="My Cloud Storage"
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="mount-provider">Provider</label>
                      <select
                        id="mount-provider"
                        value={mountForm.provider}
                        onChange={(e) => {
                          const provider = e.target.value;
                          setMountForm((prev) => {
                            let remotePath = prev.remotePath;
                            if (provider === 'google-drive' && !remotePath) remotePath = 'gdrive:';
                            if (provider === 'onedrive' && !remotePath) remotePath = 'onedrive:';
                            if (provider === 's3') remotePath = '';
                            return { ...prev, provider, remotePath };
                          });
                        }}
                      >
                        <option value="s3">Amazon S3 / S3 Compatible</option>
                        <option value="google-drive">Google Drive</option>
                        <option value="onedrive">OneDrive</option>
                        <option value="rclone">Custom rclone</option>
                      </select>
                    </div>

                    {mountForm.provider === 's3' ? (
                      <>
                        <div className="form-group">
                          <label htmlFor="mount-bucket">Bucket Name</label>
                          <input
                            id="mount-bucket"
                            type="text"
                            value={mountForm.bucket}
                            onChange={(e) => setMountForm((prev) => ({ ...prev, bucket: e.target.value }))}
                            placeholder="my-backup-bucket"
                            required
                          />
                        </div>

                        <div className="form-group">
                          <label htmlFor="mount-prefix">Prefix / Path</label>
                          <input
                            id="mount-prefix"
                            type="text"
                            value={mountForm.prefix}
                            onChange={(e) => setMountForm((prev) => ({ ...prev, prefix: e.target.value }))}
                            placeholder="backups/timemachine"
                          />
                        </div>

                        <div className="form-group">
                          <label htmlFor="mount-region">Region</label>
                          <input
                            id="mount-region"
                            type="text"
                            value={mountForm.region}
                            onChange={(e) => setMountForm((prev) => ({ ...prev, region: e.target.value }))}
                            placeholder="us-east-1"
                          />
                        </div>

                        <div className="form-group">
                          <label htmlFor="mount-endpoint">Custom Endpoint</label>
                          <input
                            id="mount-endpoint"
                            type="text"
                            value={mountForm.endpoint}
                            onChange={(e) => setMountForm((prev) => ({ ...prev, endpoint: e.target.value }))}
                            placeholder="For S3-compatible services"
                          />
                        </div>

                        <div className="form-group">
                          <label htmlFor="mount-key">Access Key ID</label>
                          <input
                            id="mount-key"
                            type="text"
                            value={mountForm.accessKeyId}
                            onChange={(e) => setMountForm((prev) => ({ ...prev, accessKeyId: e.target.value }))}
                            placeholder="AKIAIOSFODNN7EXAMPLE"
                            required
                          />
                        </div>

                        <div className="form-group">
                          <label htmlFor="mount-secret">Secret Access Key</label>
                          <input
                            id="mount-secret"
                            type="password"
                            value={mountForm.secretAccessKey}
                            onChange={(e) => setMountForm((prev) => ({ ...prev, secretAccessKey: e.target.value }))}
                            placeholder="••••••••••••••••"
                            required
                          />
                        </div>

                        <div className="form-group">
                          <label htmlFor="mount-s3provider">S3 Provider</label>
                          <input
                            id="mount-s3provider"
                            type="text"
                            value={mountForm.s3Provider}
                            onChange={(e) => setMountForm((prev) => ({ ...prev, s3Provider: e.target.value }))}
                            placeholder="AWS, Wasabi, Backblaze, etc."
                          />
                        </div>
                      </>
                    ) : (
                      <div className="form-group">
                        <label htmlFor="mount-remote">Remote Path</label>
                        <input
                          id="mount-remote"
                          type="text"
                          value={mountForm.remotePath}
                          onChange={(e) => setMountForm((prev) => ({ ...prev, remotePath: e.target.value }))}
                          placeholder="gdrive:, onedrive:, or remote:path"
                          required
                        />
                      </div>
                    )}

                    <div className="form-group">
                      <label htmlFor="mount-path">Local Mount Path</label>
                      <input
                        id="mount-path"
                        type="text"
                        value={mountForm.mountPath}
                        onChange={(e) => setMountForm((prev) => ({ ...prev, mountPath: e.target.value }))}
                        placeholder="/mnt/tm-cloud/main"
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="mount-args">Extra Arguments</label>
                      <input
                        id="mount-args"
                        type="text"
                        value={mountForm.extraArgs}
                        onChange={(e) => setMountForm((prev) => ({ ...prev, extraArgs: e.target.value }))}
                        placeholder="--buffer-size=16M,--vfs-read-chunk-size=16M"
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="mount-binary">rclone Binary</label>
                      <input
                        id="mount-binary"
                        type="text"
                        value={mountForm.rcloneBinary}
                        onChange={(e) => setMountForm((prev) => ({ ...prev, rcloneBinary: e.target.value }))}
                        placeholder="rclone"
                      />
                    </div>
                  </div>

                  <div className="row" style={{ marginTop: 16, gap: 24 }}>
                    <div className="checkbox-group">
                      <input
                        type="checkbox"
                        id="mount-enabled"
                        checked={mountForm.enabled}
                        onChange={(e) => setMountForm((prev) => ({ ...prev, enabled: e.target.checked }))}
                      />
                      <span onClick={() => setMountForm((prev) => ({ ...prev, enabled: !prev.enabled }))}>
                        Enable this mount
                      </span>
                    </div>

                    <div className="checkbox-group">
                      <input
                        type="checkbox"
                        id="mount-ensure"
                        checked={mountForm.ensureMounted}
                        onChange={(e) => setMountForm((prev) => ({ ...prev, ensureMounted: e.target.checked }))}
                      />
                      <span onClick={() => setMountForm((prev) => ({ ...prev, ensureMounted: !prev.ensureMounted }))}>
                        Mount immediately
                      </span>
                    </div>
                  </div>

                  <div className="form-actions">
                    <button className="btn primary" type="submit" disabled={submitting}>
                      <Icon name="cloud" /> Create Mount
                    </button>
                    <button className="btn ghost" type="button" onClick={() => setShowAddMount(false)}>
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}

            {mounts.length === 0 ? (
              <div className="card">
                <div className="empty-state">
                  <div className="icon">☁️</div>
                  <h4>No cloud mounts configured</h4>
                  <p>Connect a cloud storage provider to enable remote backups.</p>
                </div>
              </div>
            ) : (
              <div className="stack">
                {mounts.map((mount) => {
                  const status = mountStatus(mount);
                  const isEditing = editingMountId === mount.id;
                  return (
                    <div key={mount.id} className="card">
                      <div className="card-header">
                        <h3>
                          <Icon name="cloud" /> {mount.name}
                        </h3>
                        <span className={`status-pill ${status.tone}`}>{status.label}</span>
                      </div>

                      {isEditing ? (
                        <form onSubmit={handleUpdateMount}>
                          <div className="form-grid">
                            <div className="form-group">
                              <label htmlFor={`edit-mount-name-${mount.id}`}>Mount Name</label>
                              <input
                                id={`edit-mount-name-${mount.id}`}
                                type="text"
                                value={editingMountForm.name}
                                onChange={(e) => setEditingMountForm((prev) => ({ ...prev, name: e.target.value }))}
                                required
                              />
                            </div>

                            <div className="form-group">
                              <label htmlFor={`edit-mount-provider-${mount.id}`}>Provider</label>
                              <select
                                id={`edit-mount-provider-${mount.id}`}
                                value={editingMountForm.provider}
                                onChange={(e) => {
                                  const provider = e.target.value;
                                  setEditingMountForm((prev) => {
                                    let remotePath = prev.remotePath;
                                    if (provider === 'google-drive' && !remotePath) remotePath = 'gdrive:';
                                    if (provider === 'onedrive' && !remotePath) remotePath = 'onedrive:';
                                    if (provider === 's3') remotePath = '';
                                    return { ...prev, provider, remotePath };
                                  });
                                }}
                              >
                                <option value="s3">Amazon S3 / S3 Compatible</option>
                                <option value="google-drive">Google Drive</option>
                                <option value="onedrive">OneDrive</option>
                                <option value="rclone">Custom rclone</option>
                              </select>
                            </div>

                            {editingMountForm.provider === 's3' ? (
                              <>
                                <div className="form-group">
                                  <label htmlFor={`edit-mount-bucket-${mount.id}`}>Bucket Name</label>
                                  <input
                                    id={`edit-mount-bucket-${mount.id}`}
                                    type="text"
                                    value={editingMountForm.bucket}
                                    onChange={(e) => setEditingMountForm((prev) => ({ ...prev, bucket: e.target.value }))}
                                    required
                                  />
                                </div>
                                <div className="form-group">
                                  <label htmlFor={`edit-mount-prefix-${mount.id}`}>Prefix / Path</label>
                                  <input
                                    id={`edit-mount-prefix-${mount.id}`}
                                    type="text"
                                    value={editingMountForm.prefix}
                                    onChange={(e) => setEditingMountForm((prev) => ({ ...prev, prefix: e.target.value }))}
                                  />
                                </div>
                                <div className="form-group">
                                  <label htmlFor={`edit-mount-region-${mount.id}`}>Region</label>
                                  <input
                                    id={`edit-mount-region-${mount.id}`}
                                    type="text"
                                    value={editingMountForm.region}
                                    onChange={(e) => setEditingMountForm((prev) => ({ ...prev, region: e.target.value }))}
                                  />
                                </div>
                                <div className="form-group">
                                  <label htmlFor={`edit-mount-endpoint-${mount.id}`}>Custom Endpoint</label>
                                  <input
                                    id={`edit-mount-endpoint-${mount.id}`}
                                    type="text"
                                    value={editingMountForm.endpoint}
                                    onChange={(e) => setEditingMountForm((prev) => ({ ...prev, endpoint: e.target.value }))}
                                  />
                                </div>
                                <div className="form-group">
                                  <label htmlFor={`edit-mount-key-${mount.id}`}>Access Key ID</label>
                                  <input
                                    id={`edit-mount-key-${mount.id}`}
                                    type="text"
                                    value={editingMountForm.accessKeyId}
                                    onChange={(e) => setEditingMountForm((prev) => ({ ...prev, accessKeyId: e.target.value }))}
                                    required
                                  />
                                </div>
                                <div className="form-group">
                                  <label htmlFor={`edit-mount-secret-${mount.id}`}>Secret Access Key</label>
                                  <input
                                    id={`edit-mount-secret-${mount.id}`}
                                    type="password"
                                    value={editingMountForm.secretAccessKey}
                                    onChange={(e) => setEditingMountForm((prev) => ({ ...prev, secretAccessKey: e.target.value }))}
                                    required
                                  />
                                </div>
                                <div className="form-group">
                                  <label htmlFor={`edit-mount-s3provider-${mount.id}`}>S3 Provider</label>
                                  <input
                                    id={`edit-mount-s3provider-${mount.id}`}
                                    type="text"
                                    value={editingMountForm.s3Provider}
                                    onChange={(e) => setEditingMountForm((prev) => ({ ...prev, s3Provider: e.target.value }))}
                                  />
                                </div>
                              </>
                            ) : (
                              <div className="form-group">
                                <label htmlFor={`edit-mount-remote-${mount.id}`}>Remote Path</label>
                                <input
                                  id={`edit-mount-remote-${mount.id}`}
                                  type="text"
                                  value={editingMountForm.remotePath}
                                  onChange={(e) => setEditingMountForm((prev) => ({ ...prev, remotePath: e.target.value }))}
                                  required
                                />
                              </div>
                            )}

                            <div className="form-group">
                              <label htmlFor={`edit-mount-path-${mount.id}`}>Local Mount Path</label>
                              <input
                                id={`edit-mount-path-${mount.id}`}
                                type="text"
                                value={editingMountForm.mountPath}
                                onChange={(e) => setEditingMountForm((prev) => ({ ...prev, mountPath: e.target.value }))}
                                required
                              />
                            </div>
                            <div className="form-group">
                              <label htmlFor={`edit-mount-args-${mount.id}`}>Extra Arguments</label>
                              <input
                                id={`edit-mount-args-${mount.id}`}
                                type="text"
                                value={editingMountForm.extraArgs}
                                onChange={(e) => setEditingMountForm((prev) => ({ ...prev, extraArgs: e.target.value }))}
                              />
                            </div>
                            <div className="form-group">
                              <label htmlFor={`edit-mount-binary-${mount.id}`}>rclone Binary</label>
                              <input
                                id={`edit-mount-binary-${mount.id}`}
                                type="text"
                                value={editingMountForm.rcloneBinary}
                                onChange={(e) => setEditingMountForm((prev) => ({ ...prev, rcloneBinary: e.target.value }))}
                              />
                            </div>
                          </div>

                          <div className="row" style={{ marginTop: 16, gap: 24 }}>
                            <div className="checkbox-group">
                              <input
                                type="checkbox"
                                id={`edit-mount-enabled-${mount.id}`}
                                checked={editingMountForm.enabled}
                                onChange={(e) => setEditingMountForm((prev) => ({ ...prev, enabled: e.target.checked }))}
                              />
                              <span onClick={() => setEditingMountForm((prev) => ({ ...prev, enabled: !prev.enabled }))}>
                                Enable this mount
                              </span>
                            </div>

                            <div className="checkbox-group">
                              <input
                                type="checkbox"
                                id={`edit-mount-ensure-${mount.id}`}
                                checked={editingMountForm.ensureMounted}
                                onChange={(e) => setEditingMountForm((prev) => ({ ...prev, ensureMounted: e.target.checked }))}
                              />
                              <span onClick={() => setEditingMountForm((prev) => ({ ...prev, ensureMounted: !prev.ensureMounted }))}>
                                Mount immediately
                              </span>
                            </div>
                          </div>

                          <div className="form-actions">
                            <button className="btn primary" type="submit" disabled={submitting}>
                              <Icon name="check" /> Save Mount
                            </button>
                            <button className="btn ghost" type="button" onClick={cancelEditMount}>
                              Cancel
                            </button>
                          </div>
                        </form>
                      ) : (
                        <>
                          <div className="info-grid">
                            <div className="info-item">
                              <div className="label">Remote</div>
                              <div className="value">{mountRemoteDisplay(mount)}</div>
                            </div>
                            <div className="info-item">
                              <div className="label">Mount Path</div>
                              <div className="value">{mount.mountPath}</div>
                            </div>
                            <div className="info-item">
                              <div className="label">Last Checked</div>
                              <div className="value">{formatTimestamp(mount.runtime?.lastCheckedAt)}</div>
                            </div>
                            <div className="info-item">
                              <div className="label">Last Mounted</div>
                              <div className="value">{formatTimestamp(mount.runtime?.lastMountedAt)}</div>
                            </div>
                          </div>

                          {mount.runtime?.lastError && (
                            <div className="error-msg">{mount.runtime.lastError}</div>
                          )}

                          <div className="card-footer">
                            <button className="btn sm" onClick={() => startEditMount(mount)} disabled={submitting}>
                              Edit
                            </button>
                            <button
                              className="btn sm"
                              onClick={() => handleMountAction(mount.id, 'ensure')}
                              disabled={submitting || dashboard?.settings?.mountManagementEnabled === false}
                            >
                              <Icon name="mount" /> Mount
                            </button>
                            <button
                              className="btn sm"
                              onClick={() => handleMountAction(mount.id, 'unmount')}
                              disabled={submitting || dashboard?.settings?.mountManagementEnabled === false}
                            >
                              <Icon name="unmount" /> Unmount
                            </button>
                            <button className="btn sm danger" onClick={() => handleMountAction(mount.id, 'delete')} disabled={submitting}>
                              <Icon name="delete" /> Delete
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Logs Tab */}
        {activeTab === 'logs' && (
          <div className="animate-in">
            <div className="page-header">
              <h2>Live Logs</h2>
              <p>Full tail output with source switching and built-in shell access</p>
            </div>

            {tailError && (
              <div className="banner error">
                <span className="icon"><Icon name="warning" /></span>
                <span>{tailError}</span>
              </div>
            )}

            {terminalError && (
              <div className="banner error">
                <span className="icon"><Icon name="warning" /></span>
                <span>{terminalError}</span>
              </div>
            )}

            <div className="logs-terminal-grid">
              <div className="card">
                <div className="section-header" style={{ marginBottom: 16 }}>
                  <h3>Tail Output</h3>
                  <div className="row">
                    <span className={`status-pill ${tailConnected ? 'success' : 'warning'}`}>
                      {tailConnected ? 'Live' : 'Reconnecting'}
                    </span>
                    <button className="btn sm" type="button" onClick={() => refreshTailSources()}>
                      <Icon name="refresh" /> Refresh Sources
                    </button>
                  </div>
                </div>

                <div className="terminal-toolbar">
                  <div className="form-group" style={{ marginBottom: 0, minWidth: 260 }}>
                    <label htmlFor="tail-source">Source</label>
                    <select
                      id="tail-source"
                      value={selectedTailSource}
                      onChange={(event) => setSelectedTailSource(event.target.value)}
                      disabled={tailLoading || tailSources.length === 0}
                    >
                      {tailSources.length === 0 ? (
                        <option value="">No sources</option>
                      ) : (
                        tailSources.map((source) => (
                          <option key={source.source} value={source.source}>
                            {formatTailSourceLabel(source)}
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  <label className="terminal-toggle">
                    <input
                      type="checkbox"
                      checked={tailAutoScroll}
                      onChange={(event) => setTailAutoScroll(event.target.checked)}
                    />
                    <span>Auto-scroll</span>
                  </label>
                </div>

                {tailMeta?.label && (
                  <div className="terminal-meta">
                    Streaming {tailMeta.type === 'container' ? 'container' : 'service'}: <strong>{tailMeta.label}</strong>
                  </div>
                )}

                <div className="terminal-screen" ref={tailListRef}>
                  {tailLines.length === 0 ? (
                    <div className="terminal-empty">
                      {tailLoading ? 'Loading log sources...' : 'Waiting for log output...'}
                    </div>
                  ) : (
                    tailLines.map((line, index) => (
                      <div key={`${selectedTailSource}-${index}`} className="terminal-line">
                        {line || ' '}
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="card">
                <div className="section-header" style={{ marginBottom: 16 }}>
                  <h3>Terminal</h3>
                  <div className="row">
                    <span className={`status-pill ${terminalConnected ? 'success' : 'warning'}`}>
                      {terminalConnected ? 'Connected' : 'Reconnecting'}
                    </span>
                    <button className="btn sm" type="button" onClick={handleRestartTerminal} disabled={terminalLoading}>
                      <Icon name="refresh" /> Restart Session
                    </button>
                  </div>
                </div>

                <div className="terminal-screen terminal-interactive" ref={terminalOutputRef}>
                  {terminalOutput ? (
                    <pre>{terminalOutput}</pre>
                  ) : (
                    <div className="terminal-empty">
                      {terminalLoading ? 'Starting terminal session...' : 'Terminal output appears here.'}
                    </div>
                  )}
                </div>

                <form className="terminal-form" onSubmit={handleTerminalSubmit}>
                  <span className="terminal-prompt">$</span>
                  <input
                    type="text"
                    value={terminalInput}
                    onChange={(event) => setTerminalInput(event.target.value)}
                    placeholder="Type a command and press Enter"
                    disabled={!terminalSessionId || terminalLoading}
                  />
                  <button className="btn sm" type="submit" disabled={!terminalSessionId || terminalLoading}>
                    Run
                  </button>
                </form>

                <div className="row" style={{ marginTop: 12 }}>
                  <button className="btn sm" type="button" onClick={() => sendTerminalInput('\u0003')}>
                    Send Ctrl+C
                  </button>
                  <button className="btn sm" type="button" onClick={() => setTerminalOutput('')}>
                    Clear Output
                  </button>
                </div>
              </div>
            </div>

            <div className="card" style={{ marginTop: 20 }}>
              <div className="section-header" style={{ marginBottom: 16 }}>
                <h3>{filteredLogs.length} Adapter Event Entr{filteredLogs.length === 1 ? 'y' : 'ies'}</h3>
                <div className="row">
                  <span className={`status-pill ${logsConnected ? 'success' : 'warning'}`}>
                    {logsConnected ? 'Live' : 'Reconnecting'}
                  </span>
                  <button
                    className="btn sm"
                    type="button"
                    onClick={() => {
                      setLogsHostFilter('all');
                      setLogsDriveFilter('all');
                    }}
                  >
                    Reset Filters
                  </button>
                </div>
              </div>

              <div className="logs-filters">
                <div className="form-group">
                  <label htmlFor="logs-host-filter">Host</label>
                  <select
                    id="logs-host-filter"
                    value={logsHostFilter}
                    onChange={(event) => setLogsHostFilter(event.target.value)}
                  >
                    <option value="all">All hosts</option>
                    {logHosts.map((host) => (
                      <option key={host} value={host}>{host}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="logs-drive-filter">Drive</label>
                  <select
                    id="logs-drive-filter"
                    value={logsDriveFilter}
                    onChange={(event) => setLogsDriveFilter(event.target.value)}
                  >
                    <option value="all">All drives</option>
                    {logDrives.map((drive) => (
                      <option key={drive} value={drive}>{drive}</option>
                    ))}
                  </select>
                </div>
              </div>

              {logsError && (
                <div className="banner error">
                  <span className="icon"><Icon name="warning" /></span>
                  <span>{logsError}</span>
                </div>
              )}

              {logsLoading ? (
                <div className="loading-state" style={{ padding: '12px 0 6px' }}>
                  <div className="spinner" />
                  <p>Loading logs...</p>
                </div>
              ) : filteredLogs.length === 0 ? (
                <div className="empty-state" style={{ padding: '28px 12px 12px' }}>
                  <div className="icon">📜</div>
                  <h4>No logs available</h4>
                  <p>Activity will appear here as requests and backup events happen.</p>
                </div>
              ) : (
                <div className="logs-list" ref={logsListRef}>
                  {filteredLogs.map((entry) => (
                    <div key={entry.id} className="log-entry">
                      <div className="log-entry-meta">
                        <span className="log-time">{formatTimestamp(entry.timestamp)}</span>
                        <span className={`status-pill ${normalizeLogLevel(entry.level)}`}>
                          {String(entry.level || 'info').toUpperCase()}
                        </span>
                        {entry.host && <span className="log-chip">Host: {entry.host}</span>}
                        {entry.drive && <span className="log-chip">Drive: {entry.drive}</span>}
                      </div>
                      <div className="log-message">{entry.message}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div className="animate-in">
            <div className="page-header">
              <h2>Server Settings</h2>
              <p>Configure your TM Adapter server</p>
            </div>

            <div className="card" style={{ marginBottom: 20 }}>
              <div className="card-header">
                <h3><Icon name="server" /> Server Configuration</h3>
              </div>

              <form onSubmit={handleSettingsSave}>
                <div className="form-grid">
                  <div className="form-group">
                    <label htmlFor="settings-hostname">Hostname or IP</label>
                    <input
                      id="settings-hostname"
                      type="text"
                      value={settingsForm.hostname}
                      onChange={(e) => setSettingsForm((prev) => ({ ...prev, hostname: e.target.value }))}
                      placeholder="backup.example.com"
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="settings-share">Root Share Name</label>
                    <input
                      id="settings-share"
                      type="text"
                      value={settingsForm.rootShareName}
                      onChange={(e) => setSettingsForm((prev) => ({ ...prev, rootShareName: e.target.value }))}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="settings-port">SMB Public Port</label>
                    <input
                      id="settings-port"
                      type="number"
                      min="1"
                      max="65535"
                      value={settingsForm.smbPublicPort}
                      onChange={(e) => setSettingsForm((prev) => ({ ...prev, smbPublicPort: e.target.value }))}
                      required
                    />
                  </div>
                </div>

                <div className="row" style={{ marginTop: 12, gap: 24 }}>
                  <label className="checkbox-group" htmlFor="settings-smb-enabled">
                    <input
                      id="settings-smb-enabled"
                      type="checkbox"
                      checked={settingsForm.smbEnabled}
                      onChange={(e) => setSettingsForm((prev) => ({ ...prev, smbEnabled: e.target.checked }))}
                    />
                    <span>Enable SMB management</span>
                  </label>

                  <label className="checkbox-group" htmlFor="settings-sftp-enabled">
                    <input
                      id="settings-sftp-enabled"
                      type="checkbox"
                      checked={settingsForm.sftpEnabled}
                      onChange={(e) => setSettingsForm((prev) => ({ ...prev, sftpEnabled: e.target.checked }))}
                    />
                    <span>Enable SFTP access</span>
                  </label>

                  <label className="checkbox-group" htmlFor="settings-mount-enabled">
                    <input
                      id="settings-mount-enabled"
                      type="checkbox"
                      checked={settingsForm.mountManagementEnabled}
                      onChange={(e) => setSettingsForm((prev) => ({ ...prev, mountManagementEnabled: e.target.checked }))}
                    />
                    <span>Enable mount manager</span>
                  </label>
                </div>

                <div className="form-actions">
                  <button className="btn primary" type="submit" disabled={submitting}>
                    <Icon name="check" /> Save Settings
                  </button>
                </div>
              </form>
            </div>

            <div className="grid-auto">
              <div className="status-card">
                <h4>Samba Status</h4>
                <div className="value" style={{ color: dashboard?.samba?.effectiveEnabled ? 'var(--success)' : 'var(--error)' }}>
                  {dashboard?.samba?.effectiveEnabled ? 'Enabled' : 'Disabled'}
                </div>
                <div className="detail">{dashboard?.samba?.confDir || '/etc/samba/smb.conf.d/tm-adapter'}</div>
                {dashboard?.samba?.settingEnabled === false && (
                  <div className="detail">Disabled in dashboard settings</div>
                )}
              </div>

              <div className="status-card">
                <h4>Mount Manager</h4>
                <div className="value" style={{ color: dashboard?.mountManager?.effectiveEnabled ? 'var(--success)' : 'var(--error)' }}>
                  {dashboard?.mountManager?.effectiveEnabled ? 'Enabled' : 'Disabled'}
                </div>
                <div className="detail">Poll interval: {dashboard?.mountManager?.pollSeconds || 30}s</div>
                {dashboard?.mountManager?.settingEnabled === false && (
                  <div className="detail">Disabled in dashboard settings</div>
                )}
              </div>

              <div className="status-card">
                <h4>SFTP Status</h4>
                <div className="value" style={{ color: dashboard?.sftp?.enabled ? 'var(--success)' : 'var(--error)' }}>
                  {dashboard?.sftp?.enabled ? 'Enabled' : 'Disabled'}
                </div>
                <div className="detail">{dashboard?.sftp?.url || 'sftp://<server>'}</div>
              </div>
            </div>

            <div className="card" style={{ marginTop: 20 }}>
              <div className="card-header">
                <h3><Icon name="user" /> SFTP Configuration</h3>
              </div>

              <div className="info-grid">
                <div className="info-item">
                  <div className="label">URL</div>
                  <div className="value">{dashboard?.sftp?.url || 'N/A'}</div>
                </div>
                <div className="info-item">
                  <div className="label">Username</div>
                  <div className="value">{dashboard?.sftp?.username || 'N/A'}</div>
                </div>
                <div className="info-item">
                  <div className="label">Password</div>
                  <div className="value">{dashboard?.sftp?.password || 'N/A'}</div>
                </div>
                <div className="info-item">
                  <div className="label">Root Path</div>
                  <div className="value">{dashboard?.sftp?.rootPath || '/smb-share'}</div>
                </div>
              </div>

              <div className="card-footer">
                <button className="btn sm" onClick={() => copyToClipboard('SFTP URL', dashboard?.sftp?.url)} type="button">
                  Copy URL
                </button>
                <button className="btn sm" onClick={() => copyToClipboard('SFTP username', dashboard?.sftp?.username)} type="button">
                  Copy Username
                </button>
                <button className="btn sm" onClick={() => copyToClipboard('SFTP password', dashboard?.sftp?.password)} type="button">
                  Copy Password
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
