import type { Mount, SettingDescriptor } from './types';

export function mountStatus(mount: Mount): { label: string; tone: 'success' | 'warning' | 'error' | 'muted' } {
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
    } catch { return []; }
  }
  return trimmed.split(',').map((s) => s.trim()).filter(Boolean);
}

export function formatExtraArgs(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) return '';
  return value.map(String).join(', ');
}

export function subdirFromPaths(basePath: string, fullPath: string): string {
  const base = String(basePath || '');
  const full = String(fullPath || '');
  if (!base || !full || full === base) return '';
  return full.startsWith(`${base}/`) ? full.slice(base.length + 1) : '';
}

export function formatTimestamp(value?: string | null): string {
  return value ? new Date(value).toLocaleString() : 'Never';
}

export function parseIdList(value: string): string[] {
  return String(value || '').split(',').map((s) => s.trim()).filter(Boolean);
}

export function formatIdList(values: string[] | undefined): string {
  return Array.isArray(values) ? values.join(', ') : '';
}

export function normalizeLogLevel(value: string): 'error' | 'warning' | 'muted' {
  const level = String(value || '').toLowerCase();
  if (level === 'error') return 'error';
  if (level === 'warning' || level === 'warn') return 'warning';
  return 'muted';
}

export function parseEventData<T = unknown>(event: MessageEvent | null): T | null {
  try { return JSON.parse(event?.data || '{}'); } catch { return null; }
}

export function formatTailSourceLabel(source: { type?: string; label?: string } | null): string {
  if (!source) return '';
  return `${source.type === 'container' ? 'Container' : 'Service'}: ${source.label}`;
}

export function settingSourceLabel(config: Record<string, SettingDescriptor>, key: string): string {
  const source = config?.[key]?.source || 'app_default';
  if (source === 'force_env') return 'forced by env';
  if (source === 'default_env') return 'env default';
  if (source === 'ui') return 'ui';
  return 'app default';
}

export function isSettingLocked(config: Record<string, SettingDescriptor>, key: string): boolean {
  return config?.[key]?.locked === true;
}

export async function copyToClipboard(label: string, value: string | undefined): Promise<{ ok: boolean; message: string }> {
  const text = String(value || '');
  if (!text) return { ok: false, message: `Nothing to copy for ${label}` };
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'absolute';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    return { ok: true, message: `${label} copied to clipboard` };
  } catch (e) {
    return { ok: false, message: (e as Error).message || `Unable to copy ${label}` };
  }
}

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}
