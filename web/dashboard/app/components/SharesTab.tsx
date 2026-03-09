'use client';

import { useState, useMemo } from 'react';
import { HardDrive, Plus, Check, Copy, Key, Wrench, Trash2, Pencil, X } from 'lucide-react';
import { Button, Input, Select, Label, FormGroup, FormGrid, FormActions, Checkbox, Card, CardHeader, CardBody, CardFooter, PageHeader, SectionHeader, InfoItem, EmptyState, Badge } from './ui';
import type { DashboardState, Disk, DiskForm, Mount } from '../lib/types';
import { DEFAULT_DISK_FORM } from '../lib/constants';
import { api } from '../lib/api';
import { subdirFromPaths, formatIdList, parseIdList, mountRemoteDisplay, copyToClipboard } from '../lib/utils';

interface SharesTabProps {
  dashboard: DashboardState;
  refresh: () => Promise<void>;
  setNotice: (msg: string) => void;
  setError: (msg: string) => void;
}

export function SharesTab({ dashboard, refresh, setNotice, setError }: SharesTabProps) {
  const shares = dashboard.shares || dashboard.disks || [];
  const mounts = dashboard.mounts || [];
  const users = dashboard.users || [];
  const groups = dashboard.groups || [];
  const smbEnabled = dashboard.settings?.smbEnabled !== false;
  const sftpEnabled = dashboard.settings?.sftpEnabled !== false;

  const [showAdd, setShowAdd] = useState(false);
  const [diskForm, setDiskForm] = useState<DiskForm>(DEFAULT_DISK_FORM);
  const [editId, setEditId] = useState('');
  const [editForm, setEditForm] = useState<DiskForm>(DEFAULT_DISK_FORM);
  const [busy, setBusy] = useState(false);

  const mountOptions = useMemo(() => mounts.map((m) => ({ id: m.id, label: `${m.name} (${mountRemoteDisplay(m)})` })), [mounts]);
  const mountById = useMemo(() => new Map(mounts.map((m) => [m.id, m])), [mounts]);
  const userOptions = useMemo(() => users.map((u) => ({ id: u.id, label: `${u.username}${u.displayName ? ` (${u.displayName})` : ''}` })), [users]);
  const groupOptions = useMemo(() => groups.map((g) => ({ id: g.id, label: g.name })), [groups]);

  const run = async (msg: string, fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); if (msg) setNotice(msg); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const startEdit = (disk: Disk) => {
    const mount = disk.storageMountId ? mountById.get(disk.storageMountId) : null;
    setEditId(disk.id);
    setEditForm({
      name: disk.name || '',
      timeMachineEnabled: disk.timeMachineEnabled === true || disk?.smb?.timeMachineEnabled === true,
      timeMachineQuotaGb: String(disk.timeMachineQuotaGb ?? disk.quotaGb ?? 0),
      accessMode: disk.accessMode || disk?.access?.mode || 'legacy-per-share',
      smbUserIds: formatIdList(disk?.access?.policy?.smb?.userIds),
      smbGroupIds: formatIdList(disk?.access?.policy?.smb?.groupIds),
      sftpUserIds: formatIdList(disk?.access?.policy?.sftp?.userIds),
      sftpGroupIds: formatIdList(disk?.access?.policy?.sftp?.groupIds),
      storageMode: disk.storageMode || 'local',
      storageMountId: disk.storageMountId || '',
      storageSubdir: subdirFromPaths(mount?.mountPath || disk.storageBasePath || '', disk.storagePath || ''),
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

  const buildPayload = (form: DiskForm) => {
    const p: Record<string, unknown> = {
      name: form.name.trim(),
      timeMachineEnabled: form.timeMachineEnabled,
      timeMachineQuotaGb: Number(form.timeMachineQuotaGb || 0),
      accessMode: form.accessMode,
      accessPolicy: { smb: { userIds: parseIdList(form.smbUserIds), groupIds: parseIdList(form.smbGroupIds) }, sftp: { userIds: parseIdList(form.sftpUserIds), groupIds: parseIdList(form.sftpGroupIds) } },
      storageMode: form.storageMode,
      applySamba: smbEnabled && form.applySamba,
      applySftp: sftpEnabled && form.applySftp,
    };
    if (form.shareName.trim()) p.smbShareName = form.shareName.trim();
    if (form.accessMode === 'legacy-per-share') {
      if (form.smbUsername.trim()) p.smbUsername = form.smbUsername.trim();
      if (form.smbPassword) p.smbPassword = form.smbPassword;
      if (form.sftpUsername.trim()) p.sftpUsername = form.sftpUsername.trim();
      if (form.sftpPassword) p.sftpPassword = form.sftpPassword;
    }
    if (form.storageMode === 'cloud-mount') { p.storageMountId = form.storageMountId || undefined; p.storageSubdir = form.storageSubdir.trim() || undefined; }
    if (form.storageMode === 'cloudmounter') { p.storagePath = form.storagePath.trim() || undefined; }
    return p;
  };

  const handleCreate = (e: React.FormEvent) => { e.preventDefault(); run('Share created successfully!', async () => { await api('/admin/api/shares', { method: 'POST', body: JSON.stringify(buildPayload(diskForm)) }); setDiskForm(DEFAULT_DISK_FORM); setShowAdd(false); await refresh(); }); };

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editId) return;
    const currentDisk = shares.find((d) => d.id === editId);
    if (!currentDisk) { setError('Share no longer exists'); return; }
    run('Share updated successfully.', async () => {
      const payload = buildPayload(editForm);
      await api(`/admin/api/shares/${editId}`, { method: 'PUT', body: JSON.stringify(payload) });
      if (editForm.accessMode === 'legacy-per-share' && editForm.smbPassword !== currentDisk.smbPassword) {
        if (!editForm.smbPassword) throw new Error('SMB password cannot be empty');
        await api(`/admin/api/shares/${editId}/password`, { method: 'POST', body: JSON.stringify({ password: editForm.smbPassword }) });
      }
      if (editForm.accessMode === 'legacy-per-share' && editForm.sftpPassword !== currentDisk.sftpPassword) {
        if (!editForm.sftpPassword) throw new Error('SFTP password cannot be empty');
        await api(`/admin/api/shares/${editId}/sftp-password`, { method: 'POST', body: JSON.stringify({ password: editForm.sftpPassword }) });
      }
      setEditId(''); setEditForm(DEFAULT_DISK_FORM); await refresh();
    });
  };

  const action = (id: string, act: string) => run('', async () => {
    if (act === 'rotate') { await api(`/admin/api/shares/${id}/password`, { method: 'POST', body: '{}' }); setNotice('SMB password rotated'); }
    if (act === 'rotate-sftp') { await api(`/admin/api/shares/${id}/sftp-password`, { method: 'POST', body: '{}' }); setNotice('SFTP password rotated'); }
    if (act === 'apply') { await api(`/admin/api/shares/${id}/apply-samba`, { method: 'POST', body: '{}' }); setNotice('Samba configuration applied'); }
    if (act === 'apply-sftp') { await api(`/admin/api/shares/${id}/apply-sftp`, { method: 'POST', body: '{}' }); setNotice('SFTP configuration applied'); }
    if (act === 'delete') { if (!window.confirm(`Delete share "${id}"? This cannot be undone.`)) return; await api(`/admin/api/shares/${id}`, { method: 'DELETE', body: JSON.stringify({ deleteData: false }) }); setNotice('Share deleted'); }
    await refresh();
  });

  const cp = async (label: string, value?: string) => { const r = await copyToClipboard(label, value); r.ok ? setNotice(r.message) : setError(r.message); };

  const renderForm = (form: DiskForm, setForm: React.Dispatch<React.SetStateAction<DiskForm>>, onSubmit: (e: React.FormEvent) => void, isEdit: boolean) => {
    const set = <K extends keyof DiskForm>(k: K, v: DiskForm[K]) => setForm((p) => ({ ...p, [k]: v }));
    return (
      <form onSubmit={onSubmit}>
        <FormGrid>
          <FormGroup><Label>Share Name</Label><Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Design Share" required /></FormGroup>
          <FormGroup><Label>Time Machine Destination</Label><Select value={form.timeMachineEnabled ? 'enabled' : 'disabled'} onChange={(e) => set('timeMachineEnabled', e.target.value === 'enabled')}><option value="disabled">Disabled</option><option value="enabled">Enabled</option></Select></FormGroup>
          <FormGroup><Label>Time Machine Quota (GB)</Label><Input type="number" min={0} value={form.timeMachineQuotaGb} onChange={(e) => set('timeMachineQuotaGb', e.target.value)} placeholder="0 for unlimited" disabled={!form.timeMachineEnabled} /></FormGroup>
          <FormGroup><Label>Storage Mode</Label><Select value={form.storageMode} onChange={(e) => set('storageMode', e.target.value)}><option value="local">Local Storage</option><option value="cloud-mount">Cloud Mount</option><option value="cloudmounter">Custom Path</option></Select></FormGroup>
          {form.storageMode === 'cloud-mount' && <>
            <FormGroup><Label>Cloud Mount</Label><Select value={form.storageMountId} onChange={(e) => set('storageMountId', e.target.value)} required><option value="">Select a mount...</option>{mountOptions.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</Select></FormGroup>
            <FormGroup><Label>Subdirectory</Label><Input value={form.storageSubdir} onChange={(e) => set('storageSubdir', e.target.value)} placeholder="Optional subfolder" /></FormGroup>
          </>}
          {form.storageMode === 'cloudmounter' && <FormGroup><Label>Filesystem Path</Label><Input value={form.storagePath} onChange={(e) => set('storagePath', e.target.value)} placeholder="/mnt/my-storage" required /></FormGroup>}
          <FormGroup><Label>SMB Share Name</Label><Input value={form.shareName} onChange={(e) => set('shareName', e.target.value)} placeholder={isEdit ? '' : 'Auto-generated if empty'} required={isEdit} /></FormGroup>
          <FormGroup><Label>Access Mode</Label><Select value={form.accessMode} onChange={(e) => set('accessMode', e.target.value)}><option value="legacy-per-share">Legacy per-share credentials</option><option value="centralized">Centralized users and groups</option></Select></FormGroup>
          {form.accessMode === 'centralized' && <>
            <FormGroup><Label>SMB User IDs</Label><Input value={form.smbUserIds} onChange={(e) => set('smbUserIds', e.target.value)} placeholder={userOptions.map((u) => u.id).join(', ') || 'user-id-1, user-id-2'} /></FormGroup>
            <FormGroup><Label>SMB Group IDs</Label><Input value={form.smbGroupIds} onChange={(e) => set('smbGroupIds', e.target.value)} placeholder={groupOptions.map((g) => g.id).join(', ') || 'group-id-1'} /></FormGroup>
            <FormGroup><Label>SFTP User IDs</Label><Input value={form.sftpUserIds} onChange={(e) => set('sftpUserIds', e.target.value)} /></FormGroup>
            <FormGroup><Label>SFTP Group IDs</Label><Input value={form.sftpGroupIds} onChange={(e) => set('sftpGroupIds', e.target.value)} /></FormGroup>
          </>}
          {form.accessMode === 'legacy-per-share' && <>
            <FormGroup><Label>SMB Username</Label><Input value={form.smbUsername} onChange={(e) => set('smbUsername', e.target.value)} placeholder={isEdit ? '' : 'Auto-generated if empty'} required={isEdit} /></FormGroup>
            <FormGroup><Label>SMB Password</Label><Input value={form.smbPassword} onChange={(e) => set('smbPassword', e.target.value)} placeholder={isEdit ? '' : 'Auto-generated if empty'} required={isEdit} /></FormGroup>
            <FormGroup><Label>SFTP Username</Label><Input value={form.sftpUsername} onChange={(e) => set('sftpUsername', e.target.value)} placeholder={isEdit ? '' : 'Auto-generated if empty'} required={isEdit} /></FormGroup>
            <FormGroup><Label>SFTP Password</Label><Input value={form.sftpPassword} onChange={(e) => set('sftpPassword', e.target.value)} placeholder={isEdit ? '' : 'Auto-generated if empty'} required={isEdit} /></FormGroup>
          </>}
        </FormGrid>
        <div className="flex flex-wrap gap-x-6 gap-y-2 mt-3">
          <Checkbox label="Apply SMB share configuration immediately" checked={form.applySamba} onChange={(v) => set('applySamba', v)} />
          <Checkbox label="Apply SFTP access configuration immediately" checked={form.applySftp} onChange={(v) => set('applySftp', v)} />
        </div>
        <FormActions>
          <Button variant="primary" type="submit" disabled={busy}><Check className="h-3.5 w-3.5" /> {isEdit ? 'Save Share' : 'Create Share'}</Button>
          <Button variant="ghost" type="button" onClick={() => { if (isEdit) { setEditId(''); setEditForm(DEFAULT_DISK_FORM); } else setShowAdd(false); }}>Cancel</Button>
        </FormActions>
      </form>
    );
  };

  return (
    <div className="animate-[fade-in_0.2s_ease]">
      <PageHeader title="Shares" description="Manage SMB Mac Shares, Time Machine destinations, and secondary protocol access." />
      <SectionHeader>
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{shares.length} Share{shares.length !== 1 ? 's' : ''} Configured</h3>
        <Button variant="primary" size="sm" onClick={() => setShowAdd(!showAdd)}><Plus className="h-3.5 w-3.5" /> Add Share</Button>
      </SectionHeader>

      {showAdd && (
        <Card className="mb-4 animate-[fade-in_0.2s_ease]">
          <CardHeader><h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2"><Plus className="h-4 w-4 text-blue-500" /> Create New Share</h3></CardHeader>
          <CardBody>{renderForm(diskForm, setDiskForm, handleCreate, false)}</CardBody>
        </Card>
      )}

      {shares.length === 0 ? (
        <Card><EmptyState icon={<HardDrive className="h-10 w-10 mx-auto" />} title="No shares configured" description="Create your first SMB Mac Share, then enable Time Machine only where you need it." /></Card>
      ) : (
        <div className="space-y-3">
          {shares.map((disk) => {
            const isEditing = editId === disk.id;
            return (
              <Card key={disk.id}>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <HardDrive className="h-4 w-4 text-slate-400" />
                    <span className="font-semibold text-sm text-slate-900 dark:text-slate-100">{disk.name}</span>
                    <Badge tone="muted">{disk.smbShareName}</Badge>
                    {(disk.timeMachineEnabled || disk?.smb?.timeMachineEnabled) && <Badge tone="info" dot>Time Machine</Badge>}
                  </div>
                  {!isEditing && <Button size="sm" onClick={() => startEdit(disk)} disabled={busy}><Pencil className="h-3 w-3" /> Edit</Button>}
                </CardHeader>
                {isEditing ? (
                  <CardBody>{renderForm(editForm, setEditForm, handleUpdate, true)}</CardBody>
                ) : (
                  <>
                    <CardBody>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                        <InfoItem label="SMB Share URL" value={disk.diskShareUrl || disk?.smb?.url || ''} />
                        <InfoItem label="Browse URL" value={disk.rootShareUrl || disk?.smb?.rootUrl || ''} />
                        <InfoItem label="Access Mode" value={disk.accessMode || disk?.access?.mode || 'legacy-per-share'} />
                        <InfoItem label="SFTP URL" value={disk.sftpUrl || disk?.sftp?.url || ''} />
                        <InfoItem label="Assigned Users" value={disk?.access?.users?.map((u) => u.username).join(', ') || 'N/A'} mono={false} />
                        <InfoItem label="Storage Path" value={disk.storagePath || ''} />
                      </div>
                    </CardBody>
                    <CardFooter>
                      <Button size="sm" onClick={() => cp('SMB URL', disk.diskShareUrl)}><Copy className="h-3 w-3" /> SMB URL</Button>
                      <Button size="sm" onClick={() => cp('SFTP URL', disk.sftpUrl)}><Copy className="h-3 w-3" /> SFTP URL</Button>
                      <Button size="sm" onClick={() => cp('SMB password', disk.smbPassword)}><Copy className="h-3 w-3" /> Password</Button>
                      <Button size="sm" onClick={() => action(disk.id, 'rotate')} disabled={busy}><Key className="h-3 w-3" /> Rotate SMB</Button>
                      <Button size="sm" onClick={() => action(disk.id, 'rotate-sftp')} disabled={busy}><Key className="h-3 w-3" /> Rotate SFTP</Button>
                      <Button size="sm" onClick={() => action(disk.id, 'apply')} disabled={busy || !smbEnabled}><Wrench className="h-3 w-3" /> Apply Samba</Button>
                      <Button size="sm" onClick={() => action(disk.id, 'apply-sftp')} disabled={busy || !sftpEnabled}><Wrench className="h-3 w-3" /> Apply SFTP</Button>
                      <Button size="sm" variant="danger" onClick={() => action(disk.id, 'delete')} disabled={busy}><Trash2 className="h-3 w-3" /> Delete</Button>
                    </CardFooter>
                  </>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
