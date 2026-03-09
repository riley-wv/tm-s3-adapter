import type { Mount, Disk, SettingDescriptor, StatusTone } from './types';

export function mountStatus(mount: Mount): { label: string; tone: StatusTone } {
  const status = String(mount?.runtime?.lastStatus || '').toLowerCase();
  if (status === 'mounted') return { label: 'Mounted', tone: 'success' };
  if (status === 'unmounted') return { label: 'Not mounted', tone: 'warning' };
  if (status === 'error') return { label: 'Error', tone: 'error' };
  if (status === 'disabled') return { label: 'Disabled', tone: 'warning' };
  return { label: status || 'Unknown', tone: 'muted' };
}

export function trimSlashes(value: string): string {
  return String(value || '').replace(/^\/+|\/+$/g, '');
}

export function mountRemoteDisplay(mount: Mount): string {
  if (String(mount.provider || '').toLowerCase() === 's3') {
    const bucket = trimSlashes(mount.bucket || '');
    if (!bucket) return '<missing bucket>';
    const prefix = trimSlashes(mount.prefix || '');
    return `s3://${bucket}${prefix ? `/${prefix}` : ''}`;
  }
  return mount.remotePath || '<empty>';
}

export function parseExtraArgs(value: string): string[] {
  const trimmed = String(value || '').trim();
  if (!trimmed) return [];
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

export function formatExtraArgs(value: string[] | undefined): string {
  if (!Array.isArray(value) || value.length === 0) return '';
  return value.map(String).join(', ');
}

export function subdirFromPaths(basePath: string, fullPath: string): string {
  const base = String(basePath || '');
  const full = String(fullPath || '');
  if (!base || !full || full === base) return '';
  if (full.startsWith(`${base}/`)) return full.slice(base.length + 1);
  return '';
}

export function formatTimestamp(value: string | undefined | null): string {
  if (!value) return 'Never';
  return new Date(value).toLocaleString();
}

export function parseIdList(value: string): string[] {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function formatIdList(values: string[]): string {
  return Array.isArray(values) ? values.join(', ') : '';
}

export function normalizeLogLevel(
  value: string,
): 'error' | 'warning' | 'muted' {
  const level = String(value || '').toLowerCase();
  if (level === 'error') return 'error';
  if (level === 'warning' || level === 'warn') return 'warning';
  return 'muted';
}

export function formatTailSourceLabel(source: {
  type: string;
  label: string;
}): string {
  if (!source) return '';
  const prefix = source.type === 'container' ? 'Container' : 'Service';
  return `${prefix}: ${source.label}`;
}

export function settingSourceLabel(
  config: Record<string, SettingDescriptor> | undefined,
  key: string,
): string {
  const source = config?.[key]?.source || 'app_default';
  if (source === 'force_env') return 'forced by env';
  if (source === 'default_env') return 'env default';
  if (source === 'ui') return 'ui';
  return 'app default';
}

export function isSettingLocked(
  config: Record<string, SettingDescriptor> | undefined,
  key: string,
): boolean {
  return config?.[key]?.locked === true;
}

export async function copyToClipboard(text: string): Promise<void> {
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
}

export function smbConfigTextForDisk(disk: Disk): string {
  return [
    `Share: ${disk.name}`,
    `Share Name: ${disk.smbShareName || disk?.smb?.shareName || ''}`,
    `Share URL: ${disk.diskShareUrl || disk?.smb?.url || ''}`,
    `Browse URL: ${disk.rootShareUrl || disk?.smb?.rootUrl || ''}`,
    `Mode: ${disk?.smb?.authMode || disk.accessMode || 'legacy-per-share'}`,
    `Username: ${disk.smbUsername || disk?.smb?.legacyUsername || ''}`,
    `Password: ${disk.smbPassword || disk?.smb?.legacyPassword || ''}`,
    `Storage Path: ${disk.storagePath || ''}`,
  ].join('\n');
}

export function sftpConfigTextForDisk(disk: Disk): string {
  return [
    `Share: ${disk.name}`,
    `URL: ${disk.sftpUrl || disk?.sftp?.url || ''}`,
    `Path: ${disk.sftpPath || disk?.sftp?.path || ''}`,
    `Mode: ${disk?.sftp?.authMode || disk.accessMode || 'legacy-per-share'}`,
    `Username: ${disk.sftpUsername || disk?.sftp?.legacyUsername || ''}`,
    `Password: ${disk.sftpPassword || disk?.sftp?.legacyPassword || ''}`,
    `Storage Path: ${disk.storagePath || ''}`,
  ].join('\n');
}

export function cn(
  ...classes: (string | false | null | undefined)[]
): string {
  return classes.filter(Boolean).join(' ');
}
