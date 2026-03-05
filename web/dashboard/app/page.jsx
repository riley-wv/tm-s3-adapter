'use client';

import { useEffect, useMemo, useState } from 'react';

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

function formatTimestamp(value) {
  if (!value) {
    return 'Never';
  }
  return new Date(value).toLocaleString();
}

function Icon({ name }) {
  const icons = {
    drives: '💾',
    cloud: '☁️',
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
  const [settingsForm, setSettingsForm] = useState({ hostname: '', rootShareName: 'timemachine', smbPublicPort: '445' });
  const [setupForm, setSetupForm] = useState({
    adminUsername: '',
    adminPassword: '',
    hostname: '',
    rootShareName: 'timemachine',
    smbPublicPort: '445'
  });
  const [diskForm, setDiskForm] = useState(DEFAULT_DISK_FORM);
  const [mountForm, setMountForm] = useState(DEFAULT_MOUNT_FORM);

  const mounts = dashboard?.mounts || [];
  const disks = dashboard?.disks || [];

  const mountOptions = useMemo(
    () => mounts.map((mount) => ({ id: mount.id, label: `${mount.name} (${mountRemoteDisplay(mount)})` })),
    [mounts]
  );

  const syncFormsFromState = (next) => {
    setSettingsForm({
      hostname: next?.settings?.hostname || '',
      rootShareName: next?.settings?.rootShareName || 'timemachine',
      smbPublicPort: String(next?.settings?.smbPublicPort || 445)
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
          applySamba: true
        })
      });
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
        applySamba: diskForm.applySamba
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
        ensureMounted: mountForm.ensureMounted,
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
                {disks.map((disk) => (
                  <div key={disk.id} className="card">
                    <div className="card-header">
                      <h3>
                        <Icon name="drives" /> {disk.name}
                        <span className="subtitle">• {disk.smbShareName}</span>
                      </h3>
                    </div>

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
                      <button className="btn sm" onClick={() => handleDiskAction(disk.id, 'rotate')} disabled={submitting}>
                        <Icon name="key" /> Rotate Password
                      </button>
                      <button className="btn sm" onClick={() => handleDiskAction(disk.id, 'apply')} disabled={submitting}>
                        <Icon name="apply" /> Apply Samba
                      </button>
                      <button className="btn sm danger" onClick={() => handleDiskAction(disk.id, 'delete')} disabled={submitting}>
                        <Icon name="delete" /> Delete
                      </button>
                    </div>
                  </div>
                ))}
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
                  return (
                    <div key={mount.id} className="card">
                      <div className="card-header">
                        <h3>
                          <Icon name="cloud" /> {mount.name}
                        </h3>
                        <span className={`status-pill ${status.tone}`}>{status.label}</span>
                      </div>

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
                        <button className="btn sm" onClick={() => handleMountAction(mount.id, 'ensure')} disabled={submitting}>
                          <Icon name="mount" /> Mount
                        </button>
                        <button className="btn sm" onClick={() => handleMountAction(mount.id, 'unmount')} disabled={submitting}>
                          <Icon name="unmount" /> Unmount
                        </button>
                        <button className="btn sm danger" onClick={() => handleMountAction(mount.id, 'delete')} disabled={submitting}>
                          <Icon name="delete" /> Delete
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
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

                <div className="form-actions">
                  <button className="btn primary" type="submit" disabled={submitting}>
                    <Icon name="check" /> Save Settings
                  </button>
                </div>
              </form>
            </div>

            <div className="grid-2">
              <div className="status-card">
                <h4>Samba Status</h4>
                <div className="value" style={{ color: dashboard?.samba?.enabled ? 'var(--success)' : 'var(--error)' }}>
                  {dashboard?.samba?.enabled ? 'Enabled' : 'Disabled'}
                </div>
                <div className="detail">{dashboard?.samba?.confDir || '/etc/samba/smb.conf.d/tm-adapter'}</div>
              </div>

              <div className="status-card">
                <h4>Mount Manager</h4>
                <div className="value" style={{ color: dashboard?.mountManager?.enabled ? 'var(--success)' : 'var(--error)' }}>
                  {dashboard?.mountManager?.enabled ? 'Enabled' : 'Disabled'}
                </div>
                <div className="detail">Poll interval: {dashboard?.mountManager?.pollSeconds || 30}s</div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
