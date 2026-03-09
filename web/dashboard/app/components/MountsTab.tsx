'use client';

import { useState, useMemo } from 'react';
import { Cloud, Plus, Check, Pencil, Trash2, Play, Square } from 'lucide-react';
import { Button, Input, Select, Label, FormGroup, FormGrid, FormActions, Checkbox, Card, CardHeader, CardBody, CardFooter, PageHeader, SectionHeader, InfoItem, EmptyState, Badge } from './ui';
import type { DashboardState, MountForm } from '../lib/types';
import { DEFAULT_MOUNT_FORM } from '../lib/constants';
import { api } from '../lib/api';
import { mountStatus, mountRemoteDisplay, formatExtraArgs, parseExtraArgs, formatTimestamp } from '../lib/utils';

interface MountsTabProps {
  dashboard: DashboardState;
  refresh: () => Promise<void>;
  setNotice: (msg: string) => void;
  setError: (msg: string) => void;
}

export function MountsTab({ dashboard, refresh, setNotice, setError }: MountsTabProps) {
  const mounts = dashboard.mounts || [];
  const mountMgmtEnabled = dashboard.settings?.mountManagementEnabled !== false;

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<MountForm>(DEFAULT_MOUNT_FORM);
  const [editId, setEditId] = useState('');
  const [editForm, setEditForm] = useState<MountForm>(DEFAULT_MOUNT_FORM);
  const [busy, setBusy] = useState(false);

  const run = async (msg: string, fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); if (msg) setNotice(msg); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const startEdit = (m: typeof mounts[0]) => {
    setEditId(m.id);
    setEditForm({
      name: m.name || '', provider: m.provider || 's3', remotePath: m.remotePath || '', mountPath: m.mountPath || '',
      bucket: m.bucket || '', prefix: m.prefix || '', region: m.region || 'us-east-1', endpoint: m.endpoint || '',
      accessKeyId: m.accessKeyId || '', secretAccessKey: m.secretAccessKey || '', s3Provider: m.s3Provider || 'AWS',
      extraArgs: formatExtraArgs(m.extraArgs), rcloneBinary: m.rcloneBinary || 'rclone', enabled: m.enabled !== false, ensureMounted: false,
    });
  };

  const buildPayload = (f: MountForm) => {
    const p: Record<string, unknown> = {
      name: f.name.trim(), provider: f.provider, mountPath: f.mountPath.trim(), enabled: f.enabled,
      ensureMounted: mountMgmtEnabled && f.ensureMounted, extraArgs: parseExtraArgs(f.extraArgs), rcloneBinary: f.rcloneBinary.trim() || 'rclone',
    };
    if (f.provider === 's3') {
      Object.assign(p, { bucket: f.bucket.trim(), prefix: f.prefix.trim(), region: f.region.trim(), endpoint: f.endpoint.trim(), accessKeyId: f.accessKeyId.trim(), secretAccessKey: f.secretAccessKey, s3Provider: f.s3Provider.trim() });
    } else { p.remotePath = f.remotePath.trim(); }
    return p;
  };

  const handleCreate = (e: React.FormEvent) => { e.preventDefault(); run('Cloud mount created!', async () => { await api('/admin/api/mounts', { method: 'POST', body: JSON.stringify(buildPayload(form)) }); setForm(DEFAULT_MOUNT_FORM); setShowAdd(false); await refresh(); }); };
  const handleUpdate = (e: React.FormEvent) => { e.preventDefault(); if (!editId) return; run('Cloud mount updated.', async () => { await api(`/admin/api/mounts/${editId}`, { method: 'PUT', body: JSON.stringify(buildPayload(editForm)) }); setEditId(''); setEditForm(DEFAULT_MOUNT_FORM); await refresh(); }); };

  const action = (id: string, act: string) => run('', async () => {
    if (act === 'ensure') { await api(`/admin/api/mounts/${id}/ensure`, { method: 'POST', body: '{}' }); setNotice('Mount activated'); }
    if (act === 'unmount') { await api(`/admin/api/mounts/${id}/unmount`, { method: 'POST', body: '{}' }); setNotice('Mount unmounted'); }
    if (act === 'delete') { if (!window.confirm(`Delete mount "${id}"?`)) return; await api(`/admin/api/mounts/${id}`, { method: 'DELETE', body: '{}' }); setNotice('Mount deleted'); }
    await refresh();
  });

  const renderForm = (f: MountForm, sf: React.Dispatch<React.SetStateAction<MountForm>>, onSubmit: (e: React.FormEvent) => void, isEdit: boolean) => {
    const set = <K extends keyof MountForm>(k: K, v: MountForm[K]) => sf((p) => ({ ...p, [k]: v }));
    const onProviderChange = (provider: string) => {
      sf((p) => {
        let rp = p.remotePath;
        if (provider === 'google-drive' && !rp) rp = 'gdrive:';
        if (provider === 'onedrive' && !rp) rp = 'onedrive:';
        if (provider === 's3') rp = '';
        return { ...p, provider, remotePath: rp };
      });
    };
    return (
      <form onSubmit={onSubmit}>
        <FormGrid>
          <FormGroup><Label>Mount Name</Label><Input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="My Cloud Storage" required /></FormGroup>
          <FormGroup><Label>Provider</Label><Select value={f.provider} onChange={(e) => onProviderChange(e.target.value)}><option value="s3">Amazon S3 / S3 Compatible</option><option value="google-drive">Google Drive</option><option value="onedrive">OneDrive</option><option value="rclone">Custom rclone</option></Select></FormGroup>
          {f.provider === 's3' ? <>
            <FormGroup><Label>Bucket Name</Label><Input value={f.bucket} onChange={(e) => set('bucket', e.target.value)} placeholder="my-backup-bucket" required /></FormGroup>
            <FormGroup><Label>Prefix / Path</Label><Input value={f.prefix} onChange={(e) => set('prefix', e.target.value)} placeholder="backups/timemachine" /></FormGroup>
            <FormGroup><Label>Region</Label><Input value={f.region} onChange={(e) => set('region', e.target.value)} placeholder="us-east-1" /></FormGroup>
            <FormGroup><Label>Custom Endpoint</Label><Input value={f.endpoint} onChange={(e) => set('endpoint', e.target.value)} placeholder="For S3-compatible services" /></FormGroup>
            <FormGroup><Label>Access Key ID</Label><Input value={f.accessKeyId} onChange={(e) => set('accessKeyId', e.target.value)} placeholder="AKIAIOSFODNN7EXAMPLE" required /></FormGroup>
            <FormGroup><Label>Secret Access Key</Label><Input type="password" value={f.secretAccessKey} onChange={(e) => set('secretAccessKey', e.target.value)} required /></FormGroup>
            <FormGroup><Label>S3 Provider</Label><Input value={f.s3Provider} onChange={(e) => set('s3Provider', e.target.value)} placeholder="AWS, Wasabi, Backblaze" /></FormGroup>
          </> : <FormGroup><Label>Remote Path</Label><Input value={f.remotePath} onChange={(e) => set('remotePath', e.target.value)} placeholder="gdrive:, onedrive:, or remote:path" required /></FormGroup>}
          <FormGroup><Label>Local Mount Path</Label><Input value={f.mountPath} onChange={(e) => set('mountPath', e.target.value)} placeholder="/mnt/tm-cloud/main" required /></FormGroup>
          <FormGroup><Label>Extra Arguments</Label><Input value={f.extraArgs} onChange={(e) => set('extraArgs', e.target.value)} placeholder="--buffer-size=16M,--vfs-read-chunk-size=16M" /></FormGroup>
          <FormGroup><Label>rclone Binary</Label><Input value={f.rcloneBinary} onChange={(e) => set('rcloneBinary', e.target.value)} placeholder="rclone" /></FormGroup>
        </FormGrid>
        <div className="flex flex-wrap gap-x-6 gap-y-2 mt-3">
          <Checkbox label="Enable this mount" checked={f.enabled} onChange={(v) => set('enabled', v)} />
          <Checkbox label="Mount immediately" checked={f.ensureMounted} onChange={(v) => set('ensureMounted', v)} />
        </div>
        <FormActions>
          <Button variant="primary" type="submit" disabled={busy}><Check className="h-3.5 w-3.5" /> {isEdit ? 'Save Mount' : 'Create Mount'}</Button>
          <Button variant="ghost" type="button" onClick={() => { if (isEdit) { setEditId(''); setEditForm(DEFAULT_MOUNT_FORM); } else setShowAdd(false); }}>Cancel</Button>
        </FormActions>
      </form>
    );
  };

  return (
    <div className="animate-[fade-in_0.2s_ease]">
      <PageHeader title="Cloud Mounts" description="Connect cloud storage providers for remote backups." />
      <SectionHeader>
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{mounts.length} Mount{mounts.length !== 1 ? 's' : ''} Configured</h3>
        <Button variant="primary" size="sm" onClick={() => setShowAdd(!showAdd)}><Plus className="h-3.5 w-3.5" /> Add Mount</Button>
      </SectionHeader>

      {showAdd && (
        <Card className="mb-4 animate-[fade-in_0.2s_ease]">
          <CardHeader><h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2"><Cloud className="h-4 w-4 text-blue-500" /> Create Cloud Mount</h3></CardHeader>
          <CardBody>{renderForm(form, setForm, handleCreate, false)}</CardBody>
        </Card>
      )}

      {mounts.length === 0 ? (
        <Card><EmptyState icon={<Cloud className="h-10 w-10 mx-auto" />} title="No cloud mounts configured" description="Connect a cloud storage provider to enable remote backups." /></Card>
      ) : (
        <div className="space-y-3">
          {mounts.map((mount) => {
            const status = mountStatus(mount);
            const isEditing = editId === mount.id;
            return (
              <Card key={mount.id}>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Cloud className="h-4 w-4 text-slate-400" />
                    <span className="font-semibold text-sm text-slate-900 dark:text-slate-100">{mount.name}</span>
                    <Badge tone={status.tone} dot>{status.label}</Badge>
                  </div>
                  {!isEditing && <Button size="sm" onClick={() => startEdit(mount)} disabled={busy}><Pencil className="h-3 w-3" /> Edit</Button>}
                </CardHeader>
                {isEditing ? (
                  <CardBody>{renderForm(editForm, setEditForm, handleUpdate, true)}</CardBody>
                ) : (
                  <>
                    <CardBody>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                        <InfoItem label="Remote" value={mountRemoteDisplay(mount)} />
                        <InfoItem label="Mount Path" value={mount.mountPath} />
                        <InfoItem label="Last Checked" value={formatTimestamp(mount.runtime?.lastCheckedAt)} />
                        <InfoItem label="Last Mounted" value={formatTimestamp(mount.runtime?.lastMountedAt)} />
                      </div>
                      {mount.runtime?.lastError && (
                        <div className="mt-3 text-xs font-mono text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 rounded-lg px-3 py-2">{mount.runtime.lastError}</div>
                      )}
                    </CardBody>
                    <CardFooter>
                      <Button size="sm" onClick={() => action(mount.id, 'ensure')} disabled={busy || !mountMgmtEnabled}><Play className="h-3 w-3" /> Mount</Button>
                      <Button size="sm" onClick={() => action(mount.id, 'unmount')} disabled={busy || !mountMgmtEnabled}><Square className="h-3 w-3" /> Unmount</Button>
                      <Button size="sm" variant="danger" onClick={() => action(mount.id, 'delete')} disabled={busy}><Trash2 className="h-3 w-3" /> Delete</Button>
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
