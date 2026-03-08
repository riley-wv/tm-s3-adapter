import { createReadStream, createWriteStream } from 'node:fs';
import { readFile, unlink, utimes, writeFile } from 'node:fs/promises';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { dirname, extname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

import { ensureDir, safeJoin, walkFiles } from '../shared/fsUtils.mjs';
import { handleError, parseUrl, readJsonBody, sendJson, sendNoContent } from '../shared/http.mjs';
import { JsonStore } from '../shared/jsonStore.mjs';
import { PostgresSettingsStore } from '../shared/postgresSettingsStore.mjs';
import { buildXattrProbeFailureMessage, probeXattrSupport, SambaManager } from './sambaManager.mjs';
import { CloudMountManager } from './cloudMountManager.mjs';
import { emptyAccessPolicy, normalizeAccessMode, normalizeAccessPolicy, normalizeIdentityProviderType, normalizeMemberUserIds, resolveAssignedUsers } from './shareAccess.mjs';
import { SftpManager } from './sftpManager.mjs';

const legacyPort = process.env.VPS_PORT ? Number(process.env.VPS_PORT) : null;
const dashboardPort = Number(process.env.VPS_ADMIN_DASHBOARD_PORT || legacyPort || 8787);
const adminApiPort = Number(process.env.VPS_ADMIN_API_PORT || legacyPort || 8788);
const dataDir = process.env.VPS_DATA_DIR || join(process.cwd(), 'data', 'vps');
const adminWebRoot = process.env.VPS_ADMIN_WEB_ROOT || join(process.cwd(), 'web', 'vps-public');
const smbShareRoot = process.env.VPS_SMB_SHARE_ROOT || join(dataDir, 'smb-share');
const smbPublicPort = Number(process.env.VPS_SMB_PUBLIC_PORT || 445);
const smbPublicPortFromEnv = process.env.VPS_SMB_PUBLIC_PORT !== undefined && process.env.VPS_SMB_PUBLIC_PORT !== '';
const sftpPort = Number(process.env.VPS_SFTP_PORT || 2222);
const sftpUsername = process.env.VPS_SFTP_USERNAME || 'tmbackup';
const sftpPassword = process.env.VPS_SFTP_PASSWORD || '';
const sftpRootPath = process.env.VPS_SFTP_ROOT_PATH || '/smb-share';
const defaultVpsCacheDir = process.env.VPS_RCLONE_CACHE_DIR || join(dataDir, 'rclone-vfs-cache');
const apiToken = process.env.VPS_API_TOKEN || 'change-me';
const adminUsername = process.env.VPS_ADMIN_USERNAME || 'admin';
const adminPassword = process.env.VPS_ADMIN_PASSWORD || 'change-admin-password';
const adminSessionSeconds = Number(process.env.VPS_ADMIN_SESSION_SECONDS || 43200);
const mountPollSeconds = Number(process.env.VPS_MOUNT_POLL_SECONDS || 30);
const smbStreamsBackend = normalizeSambaStreamsBackend(process.env.VPS_SAMBA_STREAMS_BACKEND);
const cookieName = 'tm_admin_session';
const defaultVpsCacheSettings = Object.freeze({
  enabled: true,
  writeBackSeconds: 120,
  maxSizeGb: 1,
  maxAgeHours: 24,
  readAheadMb: 16
});

function envFirstString(keys, fallback = '') {
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(process.env, key)) {
      continue;
    }
    const value = String(process.env[key] || '').trim();
    if (value) {
      return value;
    }
  }
  return fallback;
}

function envFirstNumber(keys, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const raw = envFirstString(keys, '');
  if (!raw) {
    return fallback;
  }
  return parsePositiveInt(raw, fallback, { min, max });
}

function envFirstSslMode(keys, fallback = 'disable') {
  const raw = envFirstString(keys, fallback).toLowerCase();
  if (['disable', 'require', 'verify-ca', 'verify-full'].includes(raw)) {
    return raw;
  }
  return fallback;
}

const postgresBootstrapConfig = Object.freeze({
  host: envFirstString(['VPS_POSTGRES_HOST', 'VPS_POSTGRES_HOST_FORCE', 'VPS_POSTGRES_HOST_DEFAULT'], 'postgres'),
  port: envFirstNumber(['VPS_POSTGRES_PORT', 'VPS_POSTGRES_PORT_FORCE', 'VPS_POSTGRES_PORT_DEFAULT'], 5432, { min: 1, max: 65535 }),
  database: envFirstString(['VPS_POSTGRES_DATABASE', 'VPS_POSTGRES_DATABASE_FORCE', 'VPS_POSTGRES_DATABASE_DEFAULT'], 'tm_adapter'),
  user: envFirstString(['VPS_POSTGRES_USER', 'VPS_POSTGRES_USER_FORCE', 'VPS_POSTGRES_USER_DEFAULT'], 'tm_adapter'),
  password: envFirstString(['VPS_POSTGRES_PASSWORD', 'VPS_POSTGRES_PASSWORD_FORCE', 'VPS_POSTGRES_PASSWORD_DEFAULT'], ''),
  sslMode: envFirstSslMode(['VPS_POSTGRES_SSL_MODE', 'VPS_POSTGRES_SSL_MODE_FORCE', 'VPS_POSTGRES_SSL_MODE_DEFAULT'], 'disable')
});
const defaultDualSourceSettings = Object.freeze({
  enterpriseFeaturesEnabled: false,
  adminAuthMode: 'local',
  smbAuthMode: 'local',
  sftpAuthMode: 'local',
  securityIpAllowlist: '',
  securityBreakGlassEnabled: true,
  securityAuditRetentionDays: 180,
  oidcIssuer: '',
  oidcClientId: '',
  oidcClientSecret: '',
  oidcScopes: 'openid profile email groups',
  oidcAdminGroup: '',
  oidcReadOnlyGroup: '',
  directoryDomain: '',
  directoryRealm: '',
  directoryUrl: '',
  directoryBindDn: '',
  directoryBindPassword: '',
  workgroupMappingsJson: '[]',
  mountPolicyMode: 'policy_templates',
  postgresEnabled: true,
  postgresHost: postgresBootstrapConfig.host,
  postgresPort: postgresBootstrapConfig.port,
  postgresDatabase: postgresBootstrapConfig.database,
  postgresUser: postgresBootstrapConfig.user,
  postgresPassword: postgresBootstrapConfig.password,
  postgresSslMode: postgresBootstrapConfig.sslMode
});

const metadataStore = new JsonStore(join(dataDir, 'metadata.json'), {
  version: 5,
  settings: {
    hostname: '',
    rootShareName: 'timemachine',
    browseShareName: 'timemachine',
    browseShareEnabled: true,
    smbPublicPort,
    smbEnabled: true,
    sftpEnabled: true,
    mountManagementEnabled: true,
    smbStreamsBackend,
    mountPollSeconds,
    vpsCacheDir: defaultVpsCacheDir,
    vpsCacheEnabled: defaultVpsCacheSettings.enabled,
    vpsWriteBackSeconds: defaultVpsCacheSettings.writeBackSeconds,
    vpsCacheMaxSizeGb: defaultVpsCacheSettings.maxSizeGb,
    vpsCacheMaxAgeHours: defaultVpsCacheSettings.maxAgeHours,
    vpsReadAheadMb: defaultVpsCacheSettings.readAheadMb,
    apiToken: '',
    adminSessionSeconds,
    setupCompleted: false,
    adminUsername: '',
    adminPassword: '',
    ...defaultDualSourceSettings
  },
  cloudMounts: {},
  disks: {},
  users: {},
  groups: {},
  identityProviders: {},
  groupMappings: {}
});

const sambaManager = new SambaManager();
const mountManager = new CloudMountManager();
const sftpManager = new SftpManager();
const sessions = new Map();
const postgresSettingsStore = new PostgresSettingsStore(postgresBootstrapConfig);

const contentTypeByExt = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
};

const rawLogBufferSize = Number(process.env.VPS_LOG_BUFFER_SIZE || 2000);
const maxLogEntries = Number.isFinite(rawLogBufferSize) && rawLogBufferSize > 0 ? Math.max(100, Math.floor(rawLogBufferSize)) : 2000;
const logHeartbeatMs = 15000;
const runtimeLogsDir = process.env.VPS_RUNTIME_LOG_DIR || join(dataDir, 'runtime-logs');
const runtimeLogSources = Object.freeze([
  {
    id: 'admin-api',
    source: 'service:admin-api',
    label: 'Admin API',
    type: 'service',
    description: 'Node admin/public API runtime logs',
    path: join(runtimeLogsDir, 'admin-api.log')
  },
  {
    id: 'samba',
    source: 'service:samba',
    label: 'Samba',
    type: 'service',
    description: 'smbd daemon logs',
    path: join(runtimeLogsDir, 'samba.log')
  },
  {
    id: 'sftp',
    source: 'service:sftp',
    label: 'SFTP / SSH',
    type: 'service',
    description: 'sshd daemon logs',
    path: join(runtimeLogsDir, 'sftp.log')
  }
]);
const defaultTailLines = Number(process.env.VPS_TAIL_DEFAULT_LINES || 200);
const maxTailLines = Number(process.env.VPS_TAIL_MAX_LINES || 5000);
const terminalHeartbeatMs = 15000;
const terminalIdleMs = Number(process.env.VPS_TERMINAL_IDLE_MS || 20 * 60 * 1000);
const terminalOutputBufferChars = Number(process.env.VPS_TERMINAL_BUFFER_CHARS || 300000);
const terminalSnapshotChars = Number(process.env.VPS_TERMINAL_SNAPSHOT_CHARS || 120000);
const liveLogs = [];
const logSubscribers = new Set();
const terminalSessions = new Map();
let nextLogId = 1;
let terminalGcTimer = null;

function parsePositiveInt(value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  const normalized = Math.floor(parsed);
  if (normalized < min) {
    return min;
  }
  if (normalized > max) {
    return max;
  }
  return normalized;
}

function normalizeSambaStreamsBackend(value) {
  const normalized = String(value || 'xattr').trim().toLowerCase();
  if (normalized === 'depot' || normalized === 'streams_depot') {
    return 'depot';
  }
  return 'xattr';
}

function normalizeBooleanValue(value, fallback = false) {
  if (value === undefined || value === null) {
    return fallback;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }
  return fallback;
}

function normalizeStringValue(value, fallback = '') {
  if (value === undefined || value === null) {
    return fallback;
  }
  return String(value).trim();
}

function normalizeNonEmptyStringValue(value, fallback = '') {
  const normalized = normalizeStringValue(value, fallback);
  return normalized || fallback;
}

function normalizeAdminAuthMode(value, fallback = 'local') {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'centralized' || normalized === 'centralised' || normalized === 'enterprise') {
    return 'centralized';
  }
  if (normalized === 'oidc') {
    return 'oidc';
  }
  if (normalized === 'ldap' || normalized === 'ad' || normalized === 'active-directory') {
    return 'ldap';
  }
  if (normalized === 'local') {
    return 'local';
  }
  return fallback;
}

function normalizeProtocolAuthMode(value, fallback = 'local') {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'centralized' || normalized === 'centralised' || normalized === 'enterprise') {
    return 'centralized';
  }
  if (normalized === 'legacy' || normalized === 'legacy-per-share') {
    return 'legacy-per-share';
  }
  if (normalized === 'enterprise') {
    return 'enterprise';
  }
  if (normalized === 'local') {
    return 'local';
  }
  return fallback;
}

function normalizeMountPolicyMode(value, fallback = 'policy_templates') {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'global_defaults') {
    return 'global_defaults';
  }
  if (normalized === 'guidelines') {
    return 'guidelines';
  }
  if (normalized === 'policy_templates' || normalized === 'policy_templates_guarded_overrides') {
    return 'policy_templates';
  }
  return fallback;
}

function normalizePostgresSslMode(value, fallback = 'disable') {
  const normalized = String(value || '').trim().toLowerCase();
  if (['disable', 'require', 'verify-ca', 'verify-full'].includes(normalized)) {
    return normalized;
  }
  return fallback;
}

function normalizeWorkgroupMappingsJson(value, fallback = '[]') {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    return '[]';
  }
  try {
    const parsed = JSON.parse(normalized);
    if (!Array.isArray(parsed)) {
      return fallback;
    }
    return JSON.stringify(parsed);
  } catch {
    return fallback;
  }
}

function isValidWorkgroupMappingsJson(value) {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    return true;
  }
  try {
    const parsed = JSON.parse(normalized);
    return Array.isArray(parsed);
  } catch {
    return false;
  }
}

const dualSourceSettingSpecs = Object.freeze({
  enterpriseFeaturesEnabled: {
    envBase: 'VPS_ENTERPRISE_FEATURES_ENABLED',
    defaultValue: defaultDualSourceSettings.enterpriseFeaturesEnabled,
    parse: (value, fallback) => normalizeBooleanValue(value, fallback)
  },
  adminAuthMode: {
    envBase: 'VPS_ADMIN_AUTH_MODE',
    defaultValue: defaultDualSourceSettings.adminAuthMode,
    parse: (value, fallback) => normalizeAdminAuthMode(value, fallback)
  },
  smbAuthMode: {
    envBase: 'VPS_SMB_AUTH_MODE',
    defaultValue: defaultDualSourceSettings.smbAuthMode,
    parse: (value, fallback) => normalizeProtocolAuthMode(value, fallback)
  },
  sftpAuthMode: {
    envBase: 'VPS_SFTP_AUTH_MODE',
    defaultValue: defaultDualSourceSettings.sftpAuthMode,
    parse: (value, fallback) => normalizeProtocolAuthMode(value, fallback)
  },
  securityIpAllowlist: {
    envBase: 'VPS_SECURITY_IP_ALLOWLIST',
    defaultValue: defaultDualSourceSettings.securityIpAllowlist,
    parse: (value, fallback) => normalizeStringValue(value, fallback)
  },
  securityBreakGlassEnabled: {
    envBase: 'VPS_SECURITY_BREAK_GLASS_ENABLED',
    defaultValue: defaultDualSourceSettings.securityBreakGlassEnabled,
    parse: (value, fallback) => normalizeBooleanValue(value, fallback)
  },
  securityAuditRetentionDays: {
    envBase: 'VPS_SECURITY_AUDIT_RETENTION_DAYS',
    defaultValue: defaultDualSourceSettings.securityAuditRetentionDays,
    parse: (value, fallback) => parsePositiveInt(value, fallback, { min: 1, max: 3650 })
  },
  oidcIssuer: {
    envBase: 'VPS_OIDC_ISSUER',
    defaultValue: defaultDualSourceSettings.oidcIssuer,
    parse: (value, fallback) => normalizeStringValue(value, fallback)
  },
  oidcClientId: {
    envBase: 'VPS_OIDC_CLIENT_ID',
    defaultValue: defaultDualSourceSettings.oidcClientId,
    parse: (value, fallback) => normalizeStringValue(value, fallback)
  },
  oidcClientSecret: {
    envBase: 'VPS_OIDC_CLIENT_SECRET',
    defaultValue: defaultDualSourceSettings.oidcClientSecret,
    parse: (value, fallback) => normalizeStringValue(value, fallback)
  },
  oidcScopes: {
    envBase: 'VPS_OIDC_SCOPES',
    defaultValue: defaultDualSourceSettings.oidcScopes,
    parse: (value, fallback) => normalizeStringValue(value, fallback)
  },
  oidcAdminGroup: {
    envBase: 'VPS_OIDC_ADMIN_GROUP',
    defaultValue: defaultDualSourceSettings.oidcAdminGroup,
    parse: (value, fallback) => normalizeStringValue(value, fallback)
  },
  oidcReadOnlyGroup: {
    envBase: 'VPS_OIDC_READONLY_GROUP',
    defaultValue: defaultDualSourceSettings.oidcReadOnlyGroup,
    parse: (value, fallback) => normalizeStringValue(value, fallback)
  },
  directoryDomain: {
    envBase: 'VPS_DIRECTORY_DOMAIN',
    defaultValue: defaultDualSourceSettings.directoryDomain,
    parse: (value, fallback) => normalizeStringValue(value, fallback)
  },
  directoryRealm: {
    envBase: 'VPS_DIRECTORY_REALM',
    defaultValue: defaultDualSourceSettings.directoryRealm,
    parse: (value, fallback) => normalizeStringValue(value, fallback)
  },
  directoryUrl: {
    envBase: 'VPS_DIRECTORY_URL',
    defaultValue: defaultDualSourceSettings.directoryUrl,
    parse: (value, fallback) => normalizeStringValue(value, fallback)
  },
  directoryBindDn: {
    envBase: 'VPS_DIRECTORY_BIND_DN',
    defaultValue: defaultDualSourceSettings.directoryBindDn,
    parse: (value, fallback) => normalizeStringValue(value, fallback)
  },
  directoryBindPassword: {
    envBase: 'VPS_DIRECTORY_BIND_PASSWORD',
    defaultValue: defaultDualSourceSettings.directoryBindPassword,
    parse: (value, fallback) => normalizeStringValue(value, fallback)
  },
  workgroupMappingsJson: {
    envBase: 'VPS_WORKGROUP_MAPPINGS_JSON',
    defaultValue: defaultDualSourceSettings.workgroupMappingsJson,
    parse: (value, fallback) => normalizeWorkgroupMappingsJson(value, fallback)
  },
  mountPolicyMode: {
    envBase: 'VPS_MOUNT_POLICY_MODE',
    defaultValue: defaultDualSourceSettings.mountPolicyMode,
    parse: (value, fallback) => normalizeMountPolicyMode(value, fallback)
  },
  postgresEnabled: {
    envBase: 'VPS_POSTGRES_ENABLED',
    defaultValue: defaultDualSourceSettings.postgresEnabled,
    parse: (value, fallback) => normalizeBooleanValue(value, fallback)
  },
  postgresHost: {
    envBase: 'VPS_POSTGRES_HOST',
    defaultValue: defaultDualSourceSettings.postgresHost,
    parse: (value, fallback) => normalizeNonEmptyStringValue(value, fallback)
  },
  postgresPort: {
    envBase: 'VPS_POSTGRES_PORT',
    defaultValue: defaultDualSourceSettings.postgresPort,
    parse: (value, fallback) => parsePositiveInt(value, fallback, { min: 1, max: 65535 })
  },
  postgresDatabase: {
    envBase: 'VPS_POSTGRES_DATABASE',
    defaultValue: defaultDualSourceSettings.postgresDatabase,
    parse: (value, fallback) => normalizeNonEmptyStringValue(value, fallback)
  },
  postgresUser: {
    envBase: 'VPS_POSTGRES_USER',
    defaultValue: defaultDualSourceSettings.postgresUser,
    parse: (value, fallback) => normalizeNonEmptyStringValue(value, fallback)
  },
  postgresPassword: {
    envBase: 'VPS_POSTGRES_PASSWORD',
    defaultValue: defaultDualSourceSettings.postgresPassword,
    parse: (value, fallback) => normalizeNonEmptyStringValue(value, fallback)
  },
  postgresSslMode: {
    envBase: 'VPS_POSTGRES_SSL_MODE',
    defaultValue: defaultDualSourceSettings.postgresSslMode,
    parse: (value, fallback) => normalizePostgresSslMode(value, fallback)
  }
});

function resolveDualSourceDefaultValue(spec) {
  let value = spec.defaultValue;
  const directEnvKey = spec.envBase;
  if (Object.prototype.hasOwnProperty.call(process.env, directEnvKey)) {
    value = spec.parse(process.env[directEnvKey], value);
  }
  const envDefaultKey = `${spec.envBase}_DEFAULT`;
  if (Object.prototype.hasOwnProperty.call(process.env, envDefaultKey)) {
    value = spec.parse(process.env[envDefaultKey], value);
  }
  return value;
}

function resolveDualSourceSettings(settings = {}) {
  const values = {};
  const config = {};
  for (const [key, spec] of Object.entries(dualSourceSettingSpecs)) {
    let value = spec.defaultValue;
    let source = 'app_default';
    let locked = false;

    const directEnvKey = spec.envBase;
    if (Object.prototype.hasOwnProperty.call(process.env, directEnvKey)) {
      value = spec.parse(process.env[directEnvKey], value);
      source = 'default_env';
    }

    const envDefaultKey = `${spec.envBase}_DEFAULT`;
    if (Object.prototype.hasOwnProperty.call(process.env, envDefaultKey)) {
      value = spec.parse(process.env[envDefaultKey], value);
      source = 'default_env';
    }

    if (Object.prototype.hasOwnProperty.call(settings, key)) {
      value = spec.parse(settings[key], value);
      source = 'ui';
    }

    const envForceKey = `${spec.envBase}_FORCE`;
    if (Object.prototype.hasOwnProperty.call(process.env, envForceKey)) {
      value = spec.parse(process.env[envForceKey], value);
      source = 'force_env';
      locked = true;
    }

    values[key] = value;
    config[key] = { value, source, locked };
  }
  return { values, config };
}

function ensureDualSourceSettingsShape(settings) {
  let changed = false;
  for (const [key, spec] of Object.entries(dualSourceSettingSpecs)) {
    const current = Object.prototype.hasOwnProperty.call(settings, key) ? settings[key] : undefined;
    const normalized = spec.parse(current, resolveDualSourceDefaultValue(spec));
    if (current === undefined || current !== normalized) {
      settings[key] = normalized;
      changed = true;
    }
  }
  return changed;
}

function normalizeBrowseShareSettings(settings) {
  let changed = false;
  if (!settings.rootShareName) {
    settings.rootShareName = 'timemachine';
    changed = true;
  }
  if (!settings.browseShareName) {
    settings.browseShareName = settings.rootShareName || 'timemachine';
    changed = true;
  }
  const normalizedBrowseShareName = sanitizeShareName(settings.browseShareName || settings.rootShareName || 'timemachine');
  if (settings.browseShareName !== normalizedBrowseShareName) {
    settings.browseShareName = normalizedBrowseShareName;
    changed = true;
  }
  if (settings.rootShareName !== normalizedBrowseShareName) {
    settings.rootShareName = normalizedBrowseShareName;
    changed = true;
  }
  if (settings.browseShareEnabled === undefined) {
    settings.browseShareEnabled = true;
    changed = true;
  }
  return changed;
}

function normalizeCentralUserShape(userId, user = {}) {
  let changed = false;
  if (!user.id) {
    user.id = userId;
    changed = true;
  }
  if (!user.username) {
    user.username = sanitizeUsername(userId);
    changed = true;
  }
  if (!user.displayName) {
    user.displayName = user.username;
    changed = true;
  }
  const normalizedAuthType = normalizeIdentityProviderType(user.authType || user.providerType || 'local', 'local');
  if (user.authType !== normalizedAuthType) {
    user.authType = normalizedAuthType;
    changed = true;
  }
  if (user.password === undefined) {
    user.password = '';
    changed = true;
  }
  if (!user.protocolUsername) {
    user.protocolUsername = sanitizeUsername(user.username);
    changed = true;
  }
  if (!user.protocolPassword) {
    user.protocolPassword = randomPassword();
    changed = true;
  }
  if (user.enabled === undefined) {
    user.enabled = true;
    changed = true;
  }
  if (user.isAdmin === undefined) {
    user.isAdmin = false;
    changed = true;
  }
  if (user.smbEnabled === undefined) {
    user.smbEnabled = true;
    changed = true;
  }
  if (user.sftpEnabled === undefined) {
    user.sftpEnabled = true;
    changed = true;
  }
  if (user.identityProviderId === undefined) {
    user.identityProviderId = '';
    changed = true;
  }
  if (user.externalSubject === undefined) {
    user.externalSubject = '';
    changed = true;
  }
  if (!user.createdAt) {
    user.createdAt = new Date().toISOString();
    changed = true;
  }
  if (!user.updatedAt) {
    user.updatedAt = user.createdAt;
    changed = true;
  }
  return { user, changed };
}

function normalizeGroupShape(groupId, group = {}) {
  let changed = false;
  if (!group.id) {
    group.id = groupId;
    changed = true;
  }
  if (!group.name) {
    group.name = groupId;
    changed = true;
  }
  const normalizedMembers = normalizeMemberUserIds(group.memberUserIds);
  if (JSON.stringify(group.memberUserIds || []) !== JSON.stringify(normalizedMembers)) {
    group.memberUserIds = normalizedMembers;
    changed = true;
  }
  if (group.description === undefined) {
    group.description = '';
    changed = true;
  }
  if (!group.createdAt) {
    group.createdAt = new Date().toISOString();
    changed = true;
  }
  if (!group.updatedAt) {
    group.updatedAt = group.createdAt;
    changed = true;
  }
  return { group, changed };
}

function normalizeIdentityProviderShape(providerId, provider = {}) {
  let changed = false;
  if (!provider.id) {
    provider.id = providerId;
    changed = true;
  }
  if (!provider.name) {
    provider.name = providerId;
    changed = true;
  }
  const normalizedType = normalizeIdentityProviderType(provider.type || 'local', 'local');
  if (provider.type !== normalizedType) {
    provider.type = normalizedType;
    changed = true;
  }
  if (provider.enabled === undefined) {
    provider.enabled = true;
    changed = true;
  }
  if (!provider.config || typeof provider.config !== 'object') {
    provider.config = {};
    changed = true;
  }
  if (!provider.createdAt) {
    provider.createdAt = new Date().toISOString();
    changed = true;
  }
  if (!provider.updatedAt) {
    provider.updatedAt = provider.createdAt;
    changed = true;
  }
  return { provider, changed };
}

function syncUserGroupMembership(draft, userId, groupIds = []) {
  const normalizedGroupIds = normalizeMemberUserIds(groupIds);
  for (const group of Object.values(draft.groups || {})) {
    if (!group || typeof group !== 'object') {
      continue;
    }
    const members = new Set(normalizeMemberUserIds(group.memberUserIds));
    if (normalizedGroupIds.includes(group.id)) {
      members.add(userId);
    } else {
      members.delete(userId);
    }
    group.memberUserIds = [...members].sort((left, right) => left.localeCompare(right));
    group.updatedAt = new Date().toISOString();
  }
}

function assertMutableDualSourcePayload(payload, settings) {
  const { config } = resolveDualSourceSettings(settings);
  const lockedKeys = Object.entries(config)
    .filter(([, value]) => value.locked)
    .map(([key]) => key);
  for (const key of lockedKeys) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) {
      throw Object.assign(new Error(`Setting "${key}" is locked by environment`), { statusCode: 400 });
    }
  }
}

function applyDualSourcePayload(settings, payload = {}) {
  for (const [key, spec] of Object.entries(dualSourceSettingSpecs)) {
    if (!Object.prototype.hasOwnProperty.call(payload, key)) {
      continue;
    }
    settings[key] = spec.parse(payload[key], spec.defaultValue);
  }
}

function effectiveConfigSourceSummary(settings) {
  const resolved = resolveDualSourceSettings(settings);
  const requiresPostgres = true;
  const postgresConfigured = Boolean(
    resolved.values.postgresHost &&
    resolved.values.postgresDatabase &&
    resolved.values.postgresUser &&
    resolved.values.postgresPassword
  );
  return {
    values: resolved.values,
    config: resolved.config,
    postgres: {
      required: requiresPostgres,
      configured: !requiresPostgres || postgresConfigured
    }
  };
}

function assertPostgresConfigured(settings) {
  const summary = effectiveConfigSourceSummary(settings);
  if (!summary.values.postgresEnabled) {
    throw Object.assign(new Error('postgresEnabled must be true because settings/config now use Postgres storage'), { statusCode: 400 });
  }
  if (!summary.postgres.configured) {
    throw Object.assign(new Error('Postgres host, database, user, and password are required'), { statusCode: 400 });
  }
  return summary;
}

function resolveApiToken(settings = {}) {
  const token = String(settings?.apiToken || '').trim();
  return token || apiToken;
}

function resolveAdminSessionSeconds(settings = {}) {
  return parsePositiveInt(settings?.adminSessionSeconds, adminSessionSeconds, { min: 60, max: 30 * 24 * 60 * 60 });
}

function resolveMountPollSeconds(settings = {}) {
  return parsePositiveInt(settings?.mountPollSeconds, mountPollSeconds, { min: 10, max: 86400 });
}

function normalizeCacheDir(value, fallback = defaultVpsCacheDir) {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    return fallback;
  }
  return trimmed.replace(/[\\\r\n\t\0]/g, '');
}

function normalizeVpsCacheSettings(settings = {}) {
  return {
    cacheDir: normalizeCacheDir(settings?.vpsCacheDir, defaultVpsCacheDir),
    enabled: settings?.vpsCacheEnabled !== false,
    writeBackSeconds: parsePositiveInt(
      settings?.vpsWriteBackSeconds,
      defaultVpsCacheSettings.writeBackSeconds,
      { min: 5, max: 86400 }
    ),
    maxSizeGb: parsePositiveInt(settings?.vpsCacheMaxSizeGb, defaultVpsCacheSettings.maxSizeGb, { min: 1, max: 10240 }),
    maxAgeHours: parsePositiveInt(settings?.vpsCacheMaxAgeHours, defaultVpsCacheSettings.maxAgeHours, { min: 1, max: 720 }),
    readAheadMb: parsePositiveInt(settings?.vpsReadAheadMb, defaultVpsCacheSettings.readAheadMb, { min: 1, max: 2048 })
  };
}

function applyNormalizedVpsCacheSettings(settings, normalized) {
  let changed = false;
  if (settings.vpsCacheDir !== normalized.cacheDir) {
    settings.vpsCacheDir = normalized.cacheDir;
    changed = true;
  }
  if (settings.vpsCacheEnabled !== normalized.enabled) {
    settings.vpsCacheEnabled = normalized.enabled;
    changed = true;
  }
  if (settings.vpsWriteBackSeconds !== normalized.writeBackSeconds) {
    settings.vpsWriteBackSeconds = normalized.writeBackSeconds;
    changed = true;
  }
  if (settings.vpsCacheMaxSizeGb !== normalized.maxSizeGb) {
    settings.vpsCacheMaxSizeGb = normalized.maxSizeGb;
    changed = true;
  }
  if (settings.vpsCacheMaxAgeHours !== normalized.maxAgeHours) {
    settings.vpsCacheMaxAgeHours = normalized.maxAgeHours;
    changed = true;
  }
  if (settings.vpsReadAheadMb !== normalized.readAheadMb) {
    settings.vpsReadAheadMb = normalized.readAheadMb;
    changed = true;
  }
  return changed;
}

function trimTextBuffer(text, maxChars) {
  if (text.length <= maxChars) {
    return text;
  }
  return text.slice(text.length - maxChars);
}

function commandOutput(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { ...options, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function listServiceTailSources() {
  return runtimeLogSources.map((entry) => ({
    id: entry.id,
    source: entry.source,
    label: entry.label,
    type: entry.type,
    description: entry.description,
    available: existsSync(entry.path)
  }));
}

async function listContainerTailSources() {
  try {
    const { stdout } = await commandOutput('docker', ['ps', '--format', '{{.Names}}\t{{.Image}}\t{{.Status}}']);
    return String(stdout || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [name = '', image = '', status = ''] = line.split('\t');
        return {
          id: name,
          source: `docker:${name}`,
          label: name,
          type: 'container',
          description: [image, status].filter(Boolean).join(' - '),
          available: true
        };
      })
      .filter((entry) => entry.id);
  } catch {
    return [];
  }
}

async function listTailSources() {
  await ensureRuntimeLogFiles();
  const [containers, services] = await Promise.all([
    listContainerTailSources(),
    Promise.resolve(listServiceTailSources())
  ]);
  return [...containers, ...services];
}

async function ensureRuntimeLogFiles() {
  await ensureDir(runtimeLogsDir);
  await Promise.all(runtimeLogSources.map((entry) => writeFile(entry.path, '', { flag: 'a' }).catch(() => { })));
}

function resolveServiceLogSource(source) {
  const normalized = String(source || '').trim();
  if (!normalized) {
    return null;
  }
  const id = normalized.startsWith('service:') ? normalized.slice('service:'.length) : normalized;
  return runtimeLogSources.find((entry) => entry.id === id || entry.source === normalized) || null;
}

function sanitizeContainerName(name) {
  const value = String(name || '').trim();
  if (!value || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(value)) {
    return '';
  }
  return value;
}

async function resolveTailCommand(source, linesValue) {
  const sourceValue = String(source || '').trim();
  if (!sourceValue) {
    throw Object.assign(new Error('Missing required query parameter: source'), { statusCode: 400 });
  }

  const lines = parsePositiveInt(linesValue, defaultTailLines, { min: 1, max: maxTailLines });

  if (sourceValue.startsWith('docker:')) {
    const container = sanitizeContainerName(sourceValue.slice('docker:'.length));
    if (!container) {
      throw Object.assign(new Error('Invalid docker container name'), { statusCode: 400 });
    }

    return {
      metadata: {
        source: `docker:${container}`,
        label: container,
        type: 'container'
      },
      command: 'docker',
      args: ['logs', '--tail', String(lines), '-f', '--timestamps', container]
    };
  }

  const service = resolveServiceLogSource(sourceValue);
  if (!service) {
    throw Object.assign(new Error(`Unknown log source: ${sourceValue}`), { statusCode: 404 });
  }

  await ensureRuntimeLogFiles();

  return {
    metadata: {
      source: service.source,
      label: service.label,
      type: service.type
    },
    command: 'tail',
    args: ['-n', String(lines), '-F', service.path]
  };
}

function writeSseHeaders(res) {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive'
  });
  res.write('\n');
}

function startCommandTailStream(res, { metadata, command, args }) {
  writeSseHeaders(res);
  const safeSseWrite = (event, payload) => {
    if (res.writableEnded || res.destroyed) {
      return;
    }
    try {
      sseWrite(res, event, payload);
    } catch {
      // Client disconnected.
    }
  };
  safeSseWrite('source', metadata);

  const tailProcess = spawn(command, args, {
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let stdoutRemainder = '';
  let stderrRemainder = '';

  const emitData = (streamName, chunk) => {
    const next = `${streamName === 'stdout' ? stdoutRemainder : stderrRemainder}${String(chunk || '').replace(/\r\n/g, '\n')}`;
    const lines = next.split('\n');
    const remainder = lines.pop() || '';
    for (const line of lines) {
      safeSseWrite('line', { stream: streamName, line });
    }
    if (streamName === 'stdout') {
      stdoutRemainder = remainder;
    } else {
      stderrRemainder = remainder;
    }
  };

  const flushRemainder = () => {
    if (stdoutRemainder) {
      safeSseWrite('line', { stream: 'stdout', line: stdoutRemainder });
      stdoutRemainder = '';
    }
    if (stderrRemainder) {
      safeSseWrite('line', { stream: 'stderr', line: stderrRemainder });
      stderrRemainder = '';
    }
  };

  tailProcess.stdout.on('data', (chunk) => emitData('stdout', chunk));
  tailProcess.stderr.on('data', (chunk) => emitData('stderr', chunk));

  tailProcess.on('error', (error) => {
    safeSseWrite('status', { state: 'error', message: error.message });
    if (!res.writableEnded) {
      res.end();
    }
  });

  tailProcess.on('close', (code, signal) => {
    flushRemainder();
    safeSseWrite('status', { state: 'closed', code, signal });
    if (!res.writableEnded) {
      res.end();
    }
  });

  const cleanup = () => {
    if (tailProcess.exitCode === null && !tailProcess.killed) {
      tailProcess.kill('SIGTERM');
      const forceKillTimer = setTimeout(() => {
        if (tailProcess.exitCode === null && !tailProcess.killed) {
          tailProcess.kill('SIGKILL');
        }
      }, 1500);
      forceKillTimer.unref?.();
    }
  };

  res.on('close', cleanup);
  res.on('error', cleanup);
}

function activeTerminalSessionCount() {
  let count = 0;
  for (const session of terminalSessions.values()) {
    if (!session.closed) {
      count += 1;
    }
  }
  return count;
}

function terminalSummary(session) {
  return {
    sessionId: session.id,
    shell: session.shell,
    cwd: session.cwd,
    createdAt: session.createdAt,
    closed: session.closed,
    exitCode: session.exitCode,
    exitSignal: session.exitSignal
  };
}

function broadcastTerminalEvent(session, event, payload) {
  for (const subscriber of [...session.subscribers]) {
    try {
      sseWrite(subscriber.res, event, payload);
    } catch {
      clearInterval(subscriber.heartbeat);
      session.subscribers.delete(subscriber);
    }
  }
}

function resolveTerminalShell() {
  const configured = String(process.env.VPS_TERMINAL_SHELL || '').trim();
  if (configured) {
    return configured;
  }
  if (existsSync('/bin/bash')) {
    return '/bin/bash';
  }
  return '/bin/sh';
}

function createTerminalSession() {
  const shell = resolveTerminalShell();
  const cwd = process.cwd();
  const sessionId = randomUUID();
  const terminalProcess = spawn(shell, ['-i'], {
    cwd,
    env: {
      ...process.env,
      TERM: process.env.TERM || 'xterm-256color',
      COLORTERM: process.env.COLORTERM || 'truecolor'
    },
    stdio: ['pipe', 'pipe', 'pipe']
  });

  const session = {
    id: sessionId,
    shell,
    cwd,
    process: terminalProcess,
    subscribers: new Set(),
    output: '',
    createdAt: new Date().toISOString(),
    lastActiveAt: Date.now(),
    closed: false,
    exitCode: null,
    exitSignal: null
  };

  const pushOutput = (chunk, stream = 'stdout') => {
    if (session.closed) {
      return;
    }
    const text = String(chunk || '');
    if (!text) {
      return;
    }
    session.output = trimTextBuffer(`${session.output}${text}`, terminalOutputBufferChars);
    session.lastActiveAt = Date.now();
    broadcastTerminalEvent(session, 'output', { stream, chunk: text });
  };

  terminalProcess.stdout.on('data', (chunk) => pushOutput(chunk, 'stdout'));
  terminalProcess.stderr.on('data', (chunk) => pushOutput(chunk, 'stderr'));
  terminalProcess.on('error', (error) => {
    session.output = trimTextBuffer(`${session.output}\n[terminal error] ${error.message}\n`, terminalOutputBufferChars);
    session.closed = true;
    session.lastActiveAt = Date.now();
    broadcastTerminalEvent(session, 'status', {
      state: 'error',
      message: error.message
    });
  });
  terminalProcess.on('close', (code, signal) => {
    session.closed = true;
    session.exitCode = code;
    session.exitSignal = signal || null;
    session.lastActiveAt = Date.now();
    broadcastTerminalEvent(session, 'status', {
      state: 'closed',
      code,
      signal: signal || null
    });
  });

  terminalSessions.set(sessionId, session);
  return session;
}

function closeTerminalSession(sessionId) {
  const session = terminalSessions.get(sessionId);
  if (!session) {
    return false;
  }

  session.closed = true;
  session.lastActiveAt = Date.now();

  if (session.process.exitCode === null && !session.process.killed) {
    session.process.kill('SIGHUP');
    const forceKillTimer = setTimeout(() => {
      if (session.process.exitCode === null && !session.process.killed) {
        session.process.kill('SIGKILL');
      }
    }, 1200);
    forceKillTimer.unref?.();
  }

  for (const subscriber of [...session.subscribers]) {
    clearInterval(subscriber.heartbeat);
    try {
      subscriber.res.end();
    } catch {
      // ignore
    }
  }
  session.subscribers.clear();
  terminalSessions.delete(sessionId);
  return true;
}

function startTerminalStream(res, session) {
  writeSseHeaders(res);
  sseWrite(res, 'snapshot', {
    ...terminalSummary(session),
    output: trimTextBuffer(session.output, terminalSnapshotChars)
  });

  if (session.closed) {
    sseWrite(res, 'status', {
      state: 'closed',
      code: session.exitCode,
      signal: session.exitSignal
    });
    res.end();
    return;
  }

  const subscriber = {
    res,
    heartbeat: setInterval(() => {
      if (!res.writableEnded && !res.destroyed) {
        res.write(': heartbeat\n\n');
      }
    }, terminalHeartbeatMs)
  };

  session.subscribers.add(subscriber);
  session.lastActiveAt = Date.now();

  const cleanup = () => {
    clearInterval(subscriber.heartbeat);
    session.subscribers.delete(subscriber);
    session.lastActiveAt = Date.now();
  };

  res.on('close', cleanup);
  res.on('error', cleanup);
}

function startTerminalGc() {
  if (terminalGcTimer) {
    return;
  }

  terminalGcTimer = setInterval(() => {
    const now = Date.now();
    for (const session of [...terminalSessions.values()]) {
      const idleFor = now - session.lastActiveAt;
      if (session.closed && session.subscribers.size === 0) {
        terminalSessions.delete(session.id);
        continue;
      }
      if (!session.closed && idleFor > terminalIdleMs && session.subscribers.size === 0) {
        closeTerminalSession(session.id);
      }
    }
  }, 60000);

  terminalGcTimer.unref?.();
}

function parseForwardedList(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeClientHost(value) {
  const input = String(value || '').trim();
  if (!input) {
    return '';
  }
  if (input.startsWith('::ffff:')) {
    return input.slice('::ffff:'.length);
  }
  return input;
}

function requestClientHost(req) {
  const forwardedFor = parseForwardedList(req.headers['x-forwarded-for'] || '');
  if (forwardedFor.length > 0) {
    return normalizeClientHost(forwardedFor[0]);
  }

  const realIp = normalizeClientHost(req.headers['x-real-ip']);
  if (realIp) {
    return realIp;
  }

  return normalizeClientHost(req.socket?.remoteAddress || '');
}

function inferDriveId(pathname, searchParams = null) {
  const segments = String(pathname || '').split('/').filter(Boolean);
  const diskIndex = segments.findIndex((segment) => segment === 'disks');
  if (diskIndex >= 0 && segments[diskIndex + 1]) {
    return segments[diskIndex + 1];
  }

  const fromQuery = searchParams?.get('drive') || searchParams?.get('diskId') || '';
  return String(fromQuery || '').trim();
}

function buildLogSnapshot() {
  const hosts = [...new Set(liveLogs.map((entry) => entry.host).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const drives = [...new Set(liveLogs.map((entry) => entry.drive).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  return {
    logs: liveLogs,
    hosts,
    drives
  };
}

function sseWrite(res, event, payload) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function publishLog(log) {
  liveLogs.push(log);
  if (liveLogs.length > maxLogEntries) {
    liveLogs.splice(0, liveLogs.length - maxLogEntries);
  }

  for (const subscriber of [...logSubscribers]) {
    try {
      sseWrite(subscriber.res, 'log', log);
    } catch {
      clearInterval(subscriber.heartbeat);
      logSubscribers.delete(subscriber);
    }
  }
}

function appendLog(entry) {
  const log = {
    id: nextLogId++,
    timestamp: new Date().toISOString(),
    level: String(entry.level || 'info'),
    source: String(entry.source || 'server'),
    message: String(entry.message || ''),
    host: String(entry.host || ''),
    drive: String(entry.drive || ''),
    path: String(entry.path || ''),
    method: String(entry.method || ''),
    status: Number.isFinite(Number(entry.status)) ? Number(entry.status) : null,
    durationMs: Number.isFinite(Number(entry.durationMs)) ? Number(entry.durationMs) : null
  };
  publishLog(log);
  return log;
}

function startLiveLogStream(res) {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive'
  });
  res.write('\n');
  sseWrite(res, 'snapshot', buildLogSnapshot());

  const subscriber = {
    res,
    heartbeat: setInterval(() => {
      if (!res.writableEnded && !res.destroyed) {
        res.write(': heartbeat\n\n');
      }
    }, logHeartbeatMs)
  };

  logSubscribers.add(subscriber);

  const cleanup = () => {
    clearInterval(subscriber.heartbeat);
    logSubscribers.delete(subscriber);
  };

  res.on('close', cleanup);
  res.on('error', cleanup);
}

function shouldLogRequest(pathname) {
  if (!pathname) {
    return false;
  }

  if (pathname.startsWith('/admin/api/logs')) {
    return false;
  }

  return pathname.startsWith('/admin/api/') || pathname.startsWith('/api/');
}

function levelFromStatus(statusCode) {
  const status = Number(statusCode || 0);
  if (status >= 500) {
    return 'error';
  }
  if (status >= 400) {
    return 'warning';
  }
  return 'info';
}

function normalizeMountProvider(value) {
  const normalized = String(value || 'rclone').toLowerCase();
  if (normalized === 's3') {
    return 's3';
  }
  if (normalized === 'google-drive' || normalized === 'googledrive' || normalized === 'gdrive') {
    return 'google-drive';
  }
  if (normalized === 'onedrive') {
    return 'onedrive';
  }
  return 'rclone';
}

function defaultRemotePathForProvider(provider) {
  if (provider === 'google-drive') {
    return 'gdrive:';
  }
  if (provider === 'onedrive') {
    return 'onedrive:';
  }
  return '';
}

function normalizeMetadataShape(metadata) {
  let changed = false;
  if (!metadata || typeof metadata !== 'object') {
    return {
      metadata: {
        version: 5,
        settings: {
          hostname: '',
          rootShareName: 'timemachine',
          browseShareName: 'timemachine',
          browseShareEnabled: true,
          smbPublicPort,
          smbEnabled: true,
          sftpEnabled: true,
          mountManagementEnabled: true,
          smbStreamsBackend,
          mountPollSeconds,
          vpsCacheDir: defaultVpsCacheDir,
          vpsCacheEnabled: defaultVpsCacheSettings.enabled,
          vpsWriteBackSeconds: defaultVpsCacheSettings.writeBackSeconds,
          vpsCacheMaxSizeGb: defaultVpsCacheSettings.maxSizeGb,
          vpsCacheMaxAgeHours: defaultVpsCacheSettings.maxAgeHours,
          vpsReadAheadMb: defaultVpsCacheSettings.readAheadMb,
          apiToken: '',
          adminSessionSeconds,
          setupCompleted: false,
          adminUsername: '',
          adminPassword: '',
          ...defaultDualSourceSettings
        },
        cloudMounts: {},
        disks: {},
        users: {},
        groups: {},
        identityProviders: {},
        groupMappings: {}
      },
      changed: true
    };
  }

  if (!metadata.settings || typeof metadata.settings !== 'object') {
    metadata.settings = {
      hostname: '',
      rootShareName: 'timemachine',
      browseShareName: 'timemachine',
      browseShareEnabled: true,
      smbPublicPort,
      smbEnabled: true,
      sftpEnabled: true,
      mountManagementEnabled: true,
      smbStreamsBackend,
      mountPollSeconds,
      vpsCacheDir: defaultVpsCacheDir,
      vpsCacheEnabled: defaultVpsCacheSettings.enabled,
      vpsWriteBackSeconds: defaultVpsCacheSettings.writeBackSeconds,
      vpsCacheMaxSizeGb: defaultVpsCacheSettings.maxSizeGb,
      vpsCacheMaxAgeHours: defaultVpsCacheSettings.maxAgeHours,
      vpsReadAheadMb: defaultVpsCacheSettings.readAheadMb,
      apiToken: '',
      adminSessionSeconds,
      setupCompleted: false,
      adminUsername: '',
      adminPassword: '',
      ...defaultDualSourceSettings
    };
    changed = true;
  } else {
    if (metadata.settings.hostname === undefined) {
      metadata.settings.hostname = '';
      changed = true;
    }
    if (normalizeBrowseShareSettings(metadata.settings)) {
      changed = true;
    }
    if (!Number.isFinite(Number(metadata.settings.smbPublicPort))) {
      metadata.settings.smbPublicPort = smbPublicPort;
      changed = true;
    }
    if (metadata.settings.smbEnabled === undefined) {
      metadata.settings.smbEnabled = true;
      changed = true;
    }
    if (metadata.settings.sftpEnabled === undefined) {
      metadata.settings.sftpEnabled = true;
      changed = true;
    }
    if (metadata.settings.mountManagementEnabled === undefined) {
      metadata.settings.mountManagementEnabled = true;
      changed = true;
    }
    const normalizedStreamsBackend = normalizeSambaStreamsBackend(metadata.settings.smbStreamsBackend);
    if (metadata.settings.smbStreamsBackend !== normalizedStreamsBackend) {
      metadata.settings.smbStreamsBackend = normalizedStreamsBackend;
      changed = true;
    }
    const normalizedMountPollSeconds = resolveMountPollSeconds(metadata.settings);
    if (metadata.settings.mountPollSeconds !== normalizedMountPollSeconds) {
      metadata.settings.mountPollSeconds = normalizedMountPollSeconds;
      changed = true;
    }
    const normalizedCacheSettings = normalizeVpsCacheSettings(metadata.settings);
    if (applyNormalizedVpsCacheSettings(metadata.settings, normalizedCacheSettings)) {
      changed = true;
    }
    const normalizedApiToken = String(metadata.settings.apiToken || '').trim();
    if (metadata.settings.apiToken !== normalizedApiToken) {
      metadata.settings.apiToken = normalizedApiToken;
      changed = true;
    }
    const normalizedAdminSessionSeconds = resolveAdminSessionSeconds(metadata.settings);
    if (metadata.settings.adminSessionSeconds !== normalizedAdminSessionSeconds) {
      metadata.settings.adminSessionSeconds = normalizedAdminSessionSeconds;
      changed = true;
    }
    if (metadata.settings.setupCompleted === undefined) {
      metadata.settings.setupCompleted = false;
      changed = true;
    }
    if (metadata.settings.adminUsername === undefined) {
      metadata.settings.adminUsername = '';
      changed = true;
    }
    if (metadata.settings.adminPassword === undefined) {
      metadata.settings.adminPassword = '';
      changed = true;
    }
    if (ensureDualSourceSettingsShape(metadata.settings)) {
      changed = true;
    }
    if (normalizeBrowseShareSettings(metadata.settings)) {
      changed = true;
    }
  }

  if (!metadata.cloudMounts || typeof metadata.cloudMounts !== 'object') {
    metadata.cloudMounts = {};
    changed = true;
  }

  for (const [mountId, mount] of Object.entries(metadata.cloudMounts)) {
    if (!mount || typeof mount !== 'object') {
      metadata.cloudMounts[mountId] = {
        id: mountId,
        name: mountId,
        provider: 'rclone',
        remotePath: '',
        mountPath: '',
        enabled: true,
        rcloneBinary: 'rclone',
        vfsCacheMode: 'full',
        dirCacheTime: '10m',
        pollInterval: '30s',
        extraArgs: [],
        bucket: '',
        prefix: '',
        region: '',
        endpoint: '',
        accessKeyId: '',
        secretAccessKey: '',
        s3Provider: 'AWS'
      };
      changed = true;
      continue;
    }

    if (!mount.id) {
      mount.id = mountId;
      changed = true;
    }
    if (!mount.name) {
      mount.name = mountId;
      changed = true;
    }
    if (!mount.provider) {
      mount.provider = 'rclone';
      changed = true;
    }
    const normalizedProvider = normalizeMountProvider(mount.provider);
    if (normalizedProvider !== mount.provider) {
      mount.provider = normalizedProvider;
      changed = true;
    }
    if (!mount.remotePath && normalizedProvider !== 's3') {
      const fallbackRemote = defaultRemotePathForProvider(normalizedProvider);
      if (fallbackRemote) {
        mount.remotePath = fallbackRemote;
        changed = true;
      }
    }
    if (mount.remotePath === undefined) {
      mount.remotePath = '';
      changed = true;
    }
    if (mount.rcloneBinary === undefined) {
      mount.rcloneBinary = 'rclone';
      changed = true;
    }
    if (mount.vfsCacheMode === undefined) {
      mount.vfsCacheMode = 'full';
      changed = true;
    }
    if (mount.dirCacheTime === undefined) {
      mount.dirCacheTime = '10m';
      changed = true;
    }
    if (mount.pollInterval === undefined) {
      mount.pollInterval = '30s';
      changed = true;
    }
    if (!Array.isArray(mount.extraArgs)) {
      mount.extraArgs = [];
      changed = true;
    }
    if (mount.bucket === undefined) {
      mount.bucket = '';
      changed = true;
    }
    if (mount.prefix === undefined) {
      mount.prefix = '';
      changed = true;
    }
    if (mount.region === undefined) {
      mount.region = '';
      changed = true;
    }
    if (mount.endpoint === undefined) {
      mount.endpoint = '';
      changed = true;
    }
    if (mount.accessKeyId === undefined) {
      mount.accessKeyId = '';
      changed = true;
    }
    if (mount.secretAccessKey === undefined) {
      mount.secretAccessKey = '';
      changed = true;
    }
    if (mount.s3Provider === undefined) {
      mount.s3Provider = 'AWS';
      changed = true;
    }
    if (mount.enabled === undefined) {
      mount.enabled = true;
      changed = true;
    }
  }

  if (!metadata.disks || typeof metadata.disks !== 'object') {
    metadata.disks = {};
    changed = true;
  }

  for (const [diskId, disk] of Object.entries(metadata.disks)) {
    if (!disk || typeof disk !== 'object') {
      metadata.disks[diskId] = {
        id: diskId,
        name: diskId,
        quotaGb: 0,
        timeMachineEnabled: true,
        timeMachineQuotaGb: 0,
        accessMode: 'legacy-per-share',
        accessPolicy: emptyAccessPolicy(),
        storageMode: 'local',
        storageBasePath: smbShareRoot,
        storagePath: safeJoin(smbShareRoot, diskId),
        smbShareName: sanitizeShareName(`tm-${diskId}`),
        smbUsername: sanitizeUsername(`tm_${diskId.slice(0, 8)}`),
        smbPassword: randomPassword(),
        sftpUsername: sanitizeUsername(`sftp_${diskId.slice(0, 8)}`),
        sftpPassword: randomPassword(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        smbLastAppliedAt: null,
        smbLastAppliedError: null,
        sftpLastAppliedAt: null,
        sftpLastAppliedError: null
      };
      changed = true;
      continue;
    }

    if (!disk.id) {
      disk.id = diskId;
      changed = true;
    }
    if (!disk.name) {
      disk.name = disk.id;
      changed = true;
    }
    if (!Number.isFinite(Number(disk.quotaGb))) {
      disk.quotaGb = 0;
      changed = true;
    }
    if (disk.timeMachineEnabled === undefined) {
      disk.timeMachineEnabled = true;
      changed = true;
    }
    if (!Number.isFinite(Number(disk.timeMachineQuotaGb))) {
      disk.timeMachineQuotaGb = Number(disk.quotaGb || 0);
      changed = true;
    }
    if (disk.accessMode === undefined) {
      disk.accessMode = 'legacy-per-share';
      changed = true;
    }
    const normalizedAccessMode = normalizeAccessMode(disk.accessMode, 'legacy-per-share');
    if (disk.accessMode !== normalizedAccessMode) {
      disk.accessMode = normalizedAccessMode;
      changed = true;
    }
    const normalizedAccessPolicy = normalizeAccessPolicy(disk.accessPolicy, emptyAccessPolicy());
    if (JSON.stringify(disk.accessPolicy || {}) !== JSON.stringify(normalizedAccessPolicy)) {
      disk.accessPolicy = normalizedAccessPolicy;
      changed = true;
    }

    const storageMode = String(disk.storageMode || 'local').toLowerCase();
    if (storageMode === 'cloudmount' || storageMode === 'cloud-mount') {
      if (disk.storageMode !== 'cloud-mount') {
        disk.storageMode = 'cloud-mount';
        changed = true;
      }
    } else if (storageMode === 'cloudmounter' || storageMode === 'filesystem') {
      if (disk.storageMode !== 'cloudmounter') {
        disk.storageMode = 'cloudmounter';
        changed = true;
      }
    } else if (disk.storageMode !== 'local') {
      disk.storageMode = 'local';
      changed = true;
    }

    if (!disk.storagePath && disk.smbPath) {
      disk.storagePath = disk.smbPath;
      changed = true;
    }
    if (!disk.storageBasePath) {
      disk.storageBasePath = disk.storagePath ? dirname(disk.storagePath) : smbShareRoot;
      changed = true;
    }
    if (!disk.storagePath) {
      const diskSubdir = sanitizeShareName(disk.id || diskId) || diskId;
      disk.storagePath = safeJoin(disk.storageBasePath, diskSubdir);
      changed = true;
    }

    if (!disk.smbShareName) {
      disk.smbShareName = sanitizeShareName(`tm-${disk.name}-${disk.id.slice(0, 6)}`);
      changed = true;
    }
    if (!disk.smbUsername) {
      disk.smbUsername = sanitizeUsername(`tm_${disk.id.slice(0, 8)}`);
      changed = true;
    }
    if (!disk.smbPassword) {
      disk.smbPassword = randomPassword();
      changed = true;
    }
    if (!disk.sftpUsername) {
      disk.sftpUsername = sanitizeUsername(`sftp_${disk.id.slice(0, 8)}`);
      changed = true;
    }
    if (!disk.sftpPassword) {
      disk.sftpPassword = randomPassword();
      changed = true;
    }
    if (!disk.createdAt) {
      disk.createdAt = new Date().toISOString();
      changed = true;
    }
    if (!disk.updatedAt) {
      disk.updatedAt = disk.createdAt;
      changed = true;
    }
    if (disk.smbLastAppliedAt === undefined) {
      disk.smbLastAppliedAt = null;
      changed = true;
    }
    if (disk.smbLastAppliedError === undefined) {
      disk.smbLastAppliedError = null;
      changed = true;
    }
    if (disk.sftpLastAppliedAt === undefined) {
      disk.sftpLastAppliedAt = null;
      changed = true;
    }
    if (disk.sftpLastAppliedError === undefined) {
      disk.sftpLastAppliedError = null;
      changed = true;
    }
  }

  if (!metadata.users || typeof metadata.users !== 'object') {
    metadata.users = {};
    changed = true;
  }
  for (const [userId, rawUser] of Object.entries(metadata.users)) {
    if (!rawUser || typeof rawUser !== 'object') {
      const normalized = normalizeCentralUserShape(userId, {});
      metadata.users[userId] = normalized.user;
      changed = true;
      continue;
    }
    const normalized = normalizeCentralUserShape(userId, rawUser);
    metadata.users[userId] = normalized.user;
    if (normalized.changed) {
      changed = true;
    }
  }

  if (!metadata.groups || typeof metadata.groups !== 'object') {
    metadata.groups = {};
    changed = true;
  }
  for (const [groupId, rawGroup] of Object.entries(metadata.groups)) {
    if (!rawGroup || typeof rawGroup !== 'object') {
      const normalized = normalizeGroupShape(groupId, {});
      metadata.groups[groupId] = normalized.group;
      changed = true;
      continue;
    }
    const normalized = normalizeGroupShape(groupId, rawGroup);
    metadata.groups[groupId] = normalized.group;
    if (normalized.changed) {
      changed = true;
    }
  }

  if (!metadata.identityProviders || typeof metadata.identityProviders !== 'object') {
    metadata.identityProviders = {};
    changed = true;
  }
  for (const [providerId, rawProvider] of Object.entries(metadata.identityProviders)) {
    if (!rawProvider || typeof rawProvider !== 'object') {
      const normalized = normalizeIdentityProviderShape(providerId, {});
      metadata.identityProviders[providerId] = normalized.provider;
      changed = true;
      continue;
    }
    const normalized = normalizeIdentityProviderShape(providerId, rawProvider);
    metadata.identityProviders[providerId] = normalized.provider;
    if (normalized.changed) {
      changed = true;
    }
  }

  if (!metadata.groupMappings || typeof metadata.groupMappings !== 'object') {
    metadata.groupMappings = {};
    changed = true;
  }

  if (!metadata.version || metadata.version < 5) {
    // Pre-existing installs with drives already configured skip the setup wizard automatically.
    if (Object.keys(metadata.disks || {}).length > 0 && !metadata.settings.setupCompleted) {
      metadata.settings.setupCompleted = true;
      changed = true;
    }
    metadata.version = 5;
    changed = true;
  }

  return { metadata, changed };
}

async function loadMetadata() {
  const raw = await metadataStore.load();
  const normalized = normalizeMetadataShape(raw);
  let { metadata } = normalized;
  let metadataChanged = normalized.changed;
  let saveSettingsToPostgres = false;

  const settingsFromPostgres = await postgresSettingsStore.loadSettings();
  if (settingsFromPostgres && typeof settingsFromPostgres === 'object') {
    const postgresSettingsSnapshot = JSON.stringify(settingsFromPostgres);
    const previousSettings = JSON.stringify(metadata.settings);
    metadata.settings = {
      ...metadata.settings,
      ...settingsFromPostgres
    };
    const mergedNormalized = normalizeMetadataShape(metadata);
    metadata = mergedNormalized.metadata;
    const settingsChangedFromMerge = previousSettings !== JSON.stringify(metadata.settings);
    metadataChanged = metadataChanged || mergedNormalized.changed || settingsChangedFromMerge;
    saveSettingsToPostgres = postgresSettingsSnapshot !== JSON.stringify(metadata.settings);
  } else {
    saveSettingsToPostgres = true;
  }

  if (metadataChanged) {
    await metadataStore.save(metadata);
  }

  if (saveSettingsToPostgres) {
    await postgresSettingsStore.saveSettings(metadata.settings);
  }
  mountManager.setDefinitions(metadata.cloudMounts);
  mountManager.setPollSeconds(resolveMountPollSeconds(metadata.settings));
  const normalizedCacheSettings = normalizeVpsCacheSettings(metadata.settings);
  mountManager.setCacheDir(normalizedCacheSettings.cacheDir);
  mountManager.setCachePolicy(normalizedCacheSettings);
  sambaManager.setStreamsBackend(metadata.settings.smbStreamsBackend);
  return metadata;
}

async function updateMetadata(updateFn) {
  const updated = await metadataStore.update((draft) => {
    const normalized = normalizeMetadataShape(draft).metadata;
    return updateFn(normalized);
  });
  await postgresSettingsStore.saveSettings(updated.settings);
  mountManager.setDefinitions(updated.cloudMounts);
  mountManager.setPollSeconds(resolveMountPollSeconds(updated.settings));
  const normalizedCacheSettings = normalizeVpsCacheSettings(updated.settings);
  mountManager.setCacheDir(normalizedCacheSettings.cacheDir);
  mountManager.setCachePolicy(normalizedCacheSettings);
  sambaManager.setStreamsBackend(updated.settings.smbStreamsBackend);
  return updated;
}

function timingSafeStringEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

function parseCookies(req) {
  const raw = req.headers.cookie || '';
  const cookies = {};
  const chunks = raw.split(';');
  for (const chunk of chunks) {
    const [k, ...v] = chunk.trim().split('=');
    if (!k) {
      continue;
    }
    cookies[k] = decodeURIComponent(v.join('='));
  }
  return cookies;
}

function newSessionToken() {
  return randomBytes(32).toString('hex');
}

function setSessionCookie(res, token, sessionSeconds = adminSessionSeconds) {
  const maxAge = Math.max(60, Number(sessionSeconds) || adminSessionSeconds);
  res.setHeader('Set-Cookie', `${cookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${cookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
}

function createSession(user = adminUsername, sessionSeconds = adminSessionSeconds) {
  const token = newSessionToken();
  const ttlSeconds = Math.max(60, Number(sessionSeconds) || adminSessionSeconds);
  const expiresAt = Date.now() + ttlSeconds * 1000;
  sessions.set(token, { expiresAt, user });
  return token;
}

function getSession(req) {
  const token = parseCookies(req)[cookieName];
  if (!token) {
    return null;
  }

  const session = sessions.get(token);
  if (!session) {
    return null;
  }

  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return null;
  }

  return { token, ...session };
}

function assertAdmin(req) {
  const session = getSession(req);
  if (!session) {
    throw Object.assign(new Error('Admin authentication required'), { statusCode: 401 });
  }
  return session;
}

async function assertApiAuth(req) {
  let settings = null;
  try {
    settings = (await loadMetadata()).settings;
  } catch {
    settings = null;
  }
  const expected = `Bearer ${resolveApiToken(settings)}`;
  if (req.headers.authorization !== expected) {
    throw Object.assign(new Error('Unauthorized'), { statusCode: 401 });
  }
}

function sanitizeShareName(input) {
  const value = String(input || '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return value || 'timemachine';
}

function sanitizeUsername(input) {
  const value = String(input || '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 28);
  return value || 'tmbackup';
}

function randomPassword(length = 24) {
  // Keep SMB passwords broadly compatible with URL/keychain parsers used by backup clients.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = randomBytes(length);
  let output = '';
  for (let i = 0; i < length; i += 1) {
    output += alphabet[bytes[i] % alphabet.length];
  }
  return output;
}

function centralUserForResponse(user, { includeSecrets = false } = {}) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    authType: user.authType,
    protocolUsername: user.protocolUsername,
    enabled: user.enabled !== false,
    isAdmin: user.isAdmin === true,
    smbEnabled: user.smbEnabled !== false,
    sftpEnabled: user.sftpEnabled !== false,
    groupIds: normalizeMemberUserIds(user.groupIds),
    identityProviderId: user.identityProviderId || '',
    externalSubject: user.externalSubject || '',
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    ...(includeSecrets ? {
      password: user.password || '',
      protocolPassword: user.protocolPassword || ''
    } : {})
  };
}

function groupForResponse(group) {
  return {
    id: group.id,
    name: group.name,
    description: group.description || '',
    memberUserIds: normalizeMemberUserIds(group.memberUserIds),
    createdAt: group.createdAt,
    updatedAt: group.updatedAt
  };
}

function identityProviderForResponse(provider) {
  return {
    id: provider.id,
    name: provider.name,
    type: provider.type,
    enabled: provider.enabled !== false,
    config: { ...(provider.config || {}) },
    createdAt: provider.createdAt,
    updatedAt: provider.updatedAt
  };
}

function browseShareName(settings) {
  return sanitizeShareName(settings?.browseShareName || settings?.rootShareName || 'timemachine');
}

function buildBrowseShareUrl(host, settings) {
  const port = effectiveSmbPublicPort(settings);
  const { serverWithPort } = normalizedServerWithPort(host, port, 445);
  return `smb://${serverWithPort}/${browseShareName(settings)}`;
}

function findCentralAdminUser(metadata, username, password) {
  const normalizedUsername = String(username || '').trim().toLowerCase();
  return Object.values(metadata?.users || {}).find((user) =>
    user?.enabled !== false &&
    user?.isAdmin === true &&
    user?.authType === 'local' &&
    String(user.username || '').toLowerCase() === normalizedUsername &&
    timingSafeStringEqual(password || '', user.password || '')
  ) || null;
}

function withTrailingSlash(input) {
  return input.endsWith('/') ? input : `${input}/`;
}

function effectiveSmbPublicPort(settings) {
  if (smbPublicPortFromEnv && Number.isFinite(smbPublicPort) && smbPublicPort > 0) {
    return smbPublicPort;
  }

  const persisted = Number(settings?.smbPublicPort);
  if (Number.isFinite(persisted) && persisted > 0) {
    return persisted;
  }

  return 445;
}

function isSmbFeatureEnabled(settings) {
  return settings?.smbEnabled !== false;
}

function isSftpFeatureEnabled(settings) {
  return settings?.sftpEnabled !== false;
}

function isMountManagementEnabled(settings) {
  return settings?.mountManagementEnabled !== false;
}

function canApplySamba(settings) {
  return sambaManager.enabled && isSmbFeatureEnabled(settings);
}

function canManageMounts(settings) {
  return mountManager.enabled && isMountManagementEnabled(settings);
}

function assertMountManagementEnabled(settings) {
  if (canManageMounts(settings)) {
    return;
  }

  const reason = !mountManager.enabled
    ? 'Cloud mount management is disabled by VPS_MOUNT_MANAGE_ENABLED'
    : 'Cloud mount management is disabled in settings';
  throw Object.assign(new Error(reason), { statusCode: 400 });
}

function buildSettingsResponse(settings) {
  const configSummary = effectiveConfigSourceSummary(settings);
  return {
    settings: {
      hostname: settings.hostname,
      browseShareName: browseShareName(settings),
      browseShareEnabled: settings.browseShareEnabled !== false,
      rootShareName: settings.rootShareName,
      smbPublicPort: effectiveSmbPublicPort(settings),
      smbEnabled: isSmbFeatureEnabled(settings),
      sftpEnabled: isSftpFeatureEnabled(settings),
      mountManagementEnabled: isMountManagementEnabled(settings),
      smbStreamsBackend: normalizeSambaStreamsBackend(settings.smbStreamsBackend),
      mountPollSeconds: resolveMountPollSeconds(settings),
      vpsCacheDir: normalizeCacheDir(settings.vpsCacheDir, defaultVpsCacheDir),
      vpsCacheEnabled: settings.vpsCacheEnabled !== false,
      vpsWriteBackSeconds: parsePositiveInt(settings.vpsWriteBackSeconds, defaultVpsCacheSettings.writeBackSeconds, {
        min: 5,
        max: 86400
      }),
      vpsCacheMaxSizeGb: parsePositiveInt(settings.vpsCacheMaxSizeGb, defaultVpsCacheSettings.maxSizeGb, {
        min: 1,
        max: 10240
      }),
      vpsCacheMaxAgeHours: parsePositiveInt(settings.vpsCacheMaxAgeHours, defaultVpsCacheSettings.maxAgeHours, {
        min: 1,
        max: 720
      }),
      vpsReadAheadMb: parsePositiveInt(settings.vpsReadAheadMb, defaultVpsCacheSettings.readAheadMb, {
        min: 1,
        max: 2048
      }),
      adminUsername: settings.adminUsername || adminUsername,
      adminSessionSeconds: resolveAdminSessionSeconds(settings),
      apiTokenConfigured: Boolean(resolveApiToken(settings)),
      setupCompleted: settings.setupCompleted === true,
      ...configSummary.values
    },
    settingsConfig: configSummary.config,
    postgres: configSummary.postgres
  };
}

function normalizedServerWithPort(host, port, defaultPort) {
  const server = host || '<server>';
  const needsIpv6Brackets = server.includes(':') && !server.startsWith('[');
  const normalizedServer = needsIpv6Brackets ? `[${server}]` : server;
  const serverWithPort = port === defaultPort ? normalizedServer : `${normalizedServer}:${port}`;
  return { server, serverWithPort };
}

function sftpConnectionInfo(host, settings) {
  const { server, serverWithPort } = normalizedServerWithPort(host, sftpPort, 22);
  return {
    enabled: isSftpFeatureEnabled(settings),
    host: server,
    port: sftpPort,
    username: sftpUsername,
    password: sftpPassword,
    rootPath: sftpRootPath,
    url: `sftp://${serverWithPort}${sftpRootPath}`,
    drivePath: sftpManager.visibleDrivePath(),
    manager: sftpManager.status()
  };
}

function buildSmbUrls(host, settings, disk) {
  const port = effectiveSmbPublicPort(settings);
  const { serverWithPort } = normalizedServerWithPort(host, port, 445);
  return {
    rootShareUrl: `smb://${serverWithPort}/${browseShareName(settings)}`,
    diskShareUrl: `smb://${serverWithPort}/${disk.smbShareName}`,
    rootSubdirUrl: `smb://${serverWithPort}/${browseShareName(settings)}/${disk.id}`
  };
}

function buildSftpUrls(host, settings, disk) {
  const { serverWithPort } = normalizedServerWithPort(host, sftpPort, 22);
  const drivePath = sftpManager.visibleDrivePath();
  return {
    sftpUrl: disk.accessMode === 'legacy-per-share' ? `sftp://${encodeURIComponent(disk.sftpUsername)}@${serverWithPort}${drivePath}` : '',
    sftpPath: disk.accessMode === 'legacy-per-share' ? drivePath : `${drivePath}/${disk.smbShareName}`,
    sftpEnabled: isSftpFeatureEnabled(settings)
  };
}

function requestedAccessMode(payload, fallback = 'legacy-per-share') {
  if (payload?.accessMode !== undefined) {
    return normalizeAccessMode(payload.accessMode, fallback);
  }
  const policy = payload?.accessPolicy;
  const hasCentralAssignments = Boolean(
    policy?.smb?.userIds?.length ||
    policy?.smb?.groupIds?.length ||
    policy?.sftp?.userIds?.length ||
    policy?.sftp?.groupIds?.length ||
    payload?.smbUserIds?.length ||
    payload?.smbGroupIds?.length ||
    payload?.sftpUserIds?.length ||
    payload?.sftpGroupIds?.length
  );
  return hasCentralAssignments ? 'centralized' : fallback;
}

function incomingAccessPolicy(payload, fallback = emptyAccessPolicy()) {
  return normalizeAccessPolicy(payload?.accessPolicy || {
    smbUserIds: payload?.smbUserIds,
    smbGroupIds: payload?.smbGroupIds,
    sftpUserIds: payload?.sftpUserIds,
    sftpGroupIds: payload?.sftpGroupIds
  }, fallback);
}

function assertUniqueCentralProtocolUsername(metadataLike, username, excludeUserId = '') {
  const normalized = sanitizeUsername(username);
  for (const user of Object.values(metadataLike?.users || {})) {
    if (!user || user.id === excludeUserId) {
      continue;
    }
    if (sanitizeUsername(user.protocolUsername) === normalized) {
      throw Object.assign(new Error(`Central protocol username already in use: ${normalized}`), { statusCode: 409 });
    }
  }
  for (const disk of Object.values(metadataLike?.disks || {})) {
    if (!disk) {
      continue;
    }
    if (sanitizeUsername(disk.smbUsername) === normalized || sanitizeUsername(disk.sftpUsername) === normalized) {
      throw Object.assign(new Error(`Protocol username conflicts with an existing legacy share credential: ${normalized}`), { statusCode: 409 });
    }
  }
  return normalized;
}

function resolveStoragePath(payload, diskId, metadata) {
  const storageMode = String(payload.storageMode || 'local').toLowerCase();
  if (storageMode === 'local') {
    return {
      storageMode,
      storageBasePath: smbShareRoot,
      storagePath: safeJoin(smbShareRoot, diskId)
    };
  }

  if (storageMode === 'cloudmounter' || storageMode === 'filesystem') {
    if (!payload.storagePath) {
      throw Object.assign(new Error('storagePath is required when storageMode is cloudmounter/filesystem'), { statusCode: 400 });
    }

    const subdir = payload.storageSubdir || diskId;
    return {
      storageMode: 'cloudmounter',
      storageBasePath: payload.storagePath,
      storagePath: safeJoin(payload.storagePath, subdir)
    };
  }

  if (storageMode === 'cloud-mount' || storageMode === 'cloudmount') {
    const mountId = payload.storageMountId || payload.mountId;
    if (!mountId) {
      throw Object.assign(new Error('storageMountId is required when storageMode is cloud-mount'), { statusCode: 400 });
    }

    const mount = metadata?.cloudMounts?.[mountId];
    if (!mount) {
      throw Object.assign(new Error(`Unknown storage mount id: ${mountId}`), { statusCode: 400 });
    }

    const subdir = payload.storageSubdir || diskId;
    return {
      storageMode: 'cloud-mount',
      storageMountId: mountId,
      storageBasePath: mount.mountPath,
      storagePath: safeJoin(mount.mountPath, subdir)
    };
  }

  throw Object.assign(new Error(`Unsupported storageMode: ${storageMode}`), { statusCode: 400 });
}

function diskForResponse(disk, settings, host, metadata = null) {
  const usersById = new Map(Object.entries(metadata?.users || {}));
  const groupsById = new Map(Object.entries(metadata?.groups || {}));
  const assignedSmbUsers = resolveAssignedUsers({ share: disk, usersById, groupsById, protocol: 'smb' });
  const assignedSftpUsers = resolveAssignedUsers({ share: disk, usersById, groupsById, protocol: 'sftp' });
  const assignedGroupIds = new Set([
    ...(disk.accessPolicy?.smb?.groupIds || []),
    ...(disk.accessPolicy?.sftp?.groupIds || [])
  ]);
  const assignedGroups = [...assignedGroupIds].map((groupId) => groupsById.get(groupId)).filter(Boolean).map(groupForResponse);
  const sftpUrls = buildSftpUrls(host, settings, disk);
  return {
    ...disk,
    ...buildSmbUrls(host, settings, disk),
    ...sftpUrls,
    shareType: 'share',
    smb: {
      shareName: disk.smbShareName,
      url: buildSmbUrls(host, settings, disk).diskShareUrl,
      rootUrl: buildSmbUrls(host, settings, disk).rootShareUrl,
      rootSubdirUrl: buildSmbUrls(host, settings, disk).rootSubdirUrl,
      profile: 'mac-share',
      timeMachineEnabled: disk.timeMachineEnabled === true,
      timeMachineQuotaGb: Number(disk.timeMachineQuotaGb || 0),
      authMode: disk.accessMode === 'centralized' ? 'centralized' : 'legacy-per-share',
      lastAppliedAt: disk.smbLastAppliedAt || null,
      lastAppliedError: disk.smbLastAppliedError || null,
      users: disk.accessMode === 'centralized' ? assignedSmbUsers.map((user) => centralUserForResponse(user)) : [],
      legacyUsername: disk.accessMode === 'legacy-per-share' ? disk.smbUsername : '',
      legacyPassword: disk.accessMode === 'legacy-per-share' ? disk.smbPassword : ''
    },
    sftp: {
      enabled: isSftpFeatureEnabled(settings),
      url: sftpUrls.sftpUrl || '',
      path: sftpUrls.sftpPath,
      authMode: disk.accessMode === 'centralized' ? 'centralized' : 'legacy-per-share',
      lastAppliedAt: disk.sftpLastAppliedAt || null,
      lastAppliedError: disk.sftpLastAppliedError || null,
      users: disk.accessMode === 'centralized' ? assignedSftpUsers.map((user) => centralUserForResponse(user)) : [],
      legacyUsername: disk.accessMode === 'legacy-per-share' ? disk.sftpUsername : '',
      legacyPassword: disk.accessMode === 'legacy-per-share' ? disk.sftpPassword : ''
    },
    access: {
      mode: disk.accessMode,
      users: [...new Map([...assignedSmbUsers, ...assignedSftpUsers].map((user) => [user.id, centralUserForResponse(user)])).values()],
      groups: assignedGroups,
      policy: normalizeAccessPolicy(disk.accessPolicy, emptyAccessPolicy())
    }
  };
}

function hasSambaDiskConfig(disk) {
  return Boolean(
    disk &&
    typeof disk.smbShareName === 'string' &&
    disk.smbShareName &&
    typeof disk.storagePath === 'string' &&
    disk.storagePath
  );
}

function resolveShareUsers(metadata, disk, protocol) {
  const usersById = new Map(resolveCentralUsers(metadata).map((user) => [user.id, user]));
  const groupsById = new Map(Object.entries(metadata?.groups || {}));
  return resolveAssignedUsers({ share: disk, usersById, groupsById, protocol });
}

function resolveCentralUsers(metadata, { protocolReadyOnly = false, enabledOnly = false } = {}) {
  const groupMembershipByUserId = new Map();
  for (const group of Object.values(metadata?.groups || {})) {
    for (const memberUserId of normalizeMemberUserIds(group?.memberUserIds)) {
      const current = groupMembershipByUserId.get(memberUserId) || [];
      current.push(group.id);
      groupMembershipByUserId.set(memberUserId, current);
    }
  }
  return Object.values(metadata?.users || {})
    .filter((user) => !enabledOnly || user?.enabled !== false)
    .filter((user) => !protocolReadyOnly || (user?.protocolUsername && user?.protocolPassword))
    .map((user) => ({
      ...user,
      groupIds: groupMembershipByUserId.get(user.id) || []
    }));
}

function shareUsesCentralizedAccess(disk) {
  return normalizeAccessMode(disk?.accessMode, 'legacy-per-share') === 'centralized';
}

function resolveSambaApplyUsers(metadata, disk) {
  if (!shareUsesCentralizedAccess(disk)) {
    return [{
      id: disk.id,
      username: disk.smbUsername,
      password: disk.smbPassword
    }];
  }

  const users = resolveShareUsers(metadata, disk, 'smb')
    .map((user) => ({
      id: user.id,
      username: user.protocolUsername,
      password: user.protocolPassword
    }))
    .filter((user) => user.username && user.password);
  if (users.length === 0) {
    throw Object.assign(new Error(`Share ${disk.id} uses centralized SMB access but has no assigned users or groups`), { statusCode: 400 });
  }
  return users;
}

async function assertDiskSambaCompatibility(disk, settings) {
  if (normalizeSambaStreamsBackend(settings?.smbStreamsBackend) !== 'xattr') {
    return;
  }

  const probe = await probeXattrSupport(disk.storagePath);
  if (probe.ok) {
    return;
  }

  throw new Error(buildXattrProbeFailureMessage({
    storagePath: disk.storagePath,
    storageMode: disk.storageMode,
    reason: probe.reason
  }));
}

async function ensureDiskShareApplied(disk, settings, metadata = null) {
  if (!hasSambaDiskConfig(disk)) {
    throw new Error(`Disk ${disk?.id || '<unknown>'} is missing SMB configuration fields`);
  }
  await assertDiskSambaCompatibility(disk, settings);
  const smbUsers = resolveSambaApplyUsers(metadata, disk);
  const result = await sambaManager.applyDisk(disk, { users: smbUsers });
  const rootResult = settings?.browseShareEnabled === false
    ? { applied: false, reason: 'Browse share disabled in settings' }
    : await sambaManager.applyRootShare(browseShareName(settings), smbShareRoot);
  return { disk: result, root: rootResult };
}

function hasSftpDiskConfig(disk) {
  return Boolean(
    disk &&
    typeof disk.sftpUsername === 'string' &&
    disk.sftpUsername &&
    typeof disk.sftpPassword === 'string' &&
    disk.sftpPassword &&
    typeof disk.storagePath === 'string' &&
    disk.storagePath
  );
}

async function ensureDiskSftpApplied(disk, metadata) {
  if (shareUsesCentralizedAccess(disk)) {
    return sftpManager.applyCentralUsers(resolveCentralUsers(metadata, { protocolReadyOnly: true, enabledOnly: true }), Object.values(metadata?.disks || {}));
  }
  if (!hasSftpDiskConfig(disk)) {
    throw new Error(`Disk ${disk?.id || '<unknown>'} is missing SFTP configuration fields`);
  }
  const allDisks = Object.values(metadata?.disks || {});
  return sftpManager.applyDisk(disk, allDisks);
}

async function applyAllDiskSharesOnStartup(metadata) {
  if (!sambaManager.enabled) {
    return;
  }

  const applyResults = {};
  const now = new Date().toISOString();
  for (const [diskId, disk] of Object.entries(metadata.disks || {})) {
    if (!hasSambaDiskConfig(disk)) {
      applyResults[diskId] = { applied: false, error: 'Disk is missing SMB configuration fields' };
      continue;
    }

    try {
      await ensureDiskStoragePathReady(disk, metadata.settings);
      await assertDiskSambaCompatibility(disk, metadata.settings);
      const result = await sambaManager.applyDisk(disk, { users: resolveSambaApplyUsers(metadata, disk) });
      applyResults[diskId] = {
        applied: result.applied === true,
        error: result.applied ? null : result.reason || 'Not applied'
      };
    } catch (error) {
      applyResults[diskId] = { applied: false, error: error.message };
      console.error(`Failed to apply samba share for disk ${diskId}:`, error.message);
    }
  }

  if (Object.keys(applyResults).length === 0) {
    if (metadata.settings?.browseShareEnabled !== false) {
      await sambaManager.applyRootShare(browseShareName(metadata.settings), smbShareRoot).catch(() => { });
    }
    return;
  }

  await updateMetadata((draft) => {
    for (const [diskId, result] of Object.entries(applyResults)) {
      const disk = draft.disks[diskId];
      if (!disk) {
        continue;
      }
      disk.smbLastAppliedAt = now;
      disk.smbLastAppliedError = result.applied ? null : result.error || 'Not applied';
    }
    return draft;
  });
}

async function applyAllDiskSftpOnStartup(metadata) {
  if (!sftpManager.enabled) {
    return;
  }

  const applyResults = {};
  const now = new Date().toISOString();
  let shouldApplyCentralUsers = false;
  for (const [diskId, disk] of Object.entries(metadata.disks || {})) {
    if (shareUsesCentralizedAccess(disk)) {
      shouldApplyCentralUsers = true;
      applyResults[diskId] = { applied: true, error: null };
      continue;
    }
    if (!hasSftpDiskConfig(disk)) {
      applyResults[diskId] = { applied: false, error: 'Disk is missing SFTP configuration fields' };
      continue;
    }

    try {
      await ensureDiskStoragePathReady(disk, metadata.settings);
      applyResults[diskId] = await sftpManager.applyDisk(disk, Object.values(metadata.disks || {}));
    } catch (error) {
      applyResults[diskId] = { applied: false, error: error.message };
      console.error(`Failed to apply sftp config for disk ${diskId}:`, error.message);
    }
  }

  if (shouldApplyCentralUsers) {
    try {
      await sftpManager.applyCentralUsers(resolveCentralUsers(metadata, { protocolReadyOnly: true, enabledOnly: true }), Object.values(metadata.disks || {}));
    } catch (error) {
      for (const [diskId, disk] of Object.entries(metadata.disks || {})) {
        if (shareUsesCentralizedAccess(disk)) {
          applyResults[diskId] = { applied: false, error: error.message };
        }
      }
    }
  }

  if (Object.keys(applyResults).length === 0) {
    return;
  }

  await updateMetadata((draft) => {
    for (const [diskId, result] of Object.entries(applyResults)) {
      const disk = draft.disks[diskId];
      if (!disk) {
        continue;
      }
      disk.sftpLastAppliedAt = now;
      disk.sftpLastAppliedError = result.applied ? null : result.error || 'Not applied';
    }
    return draft;
  });
}

async function applyCentralizedShareAccess(metadata) {
  if (canApplySamba(metadata.settings)) {
    for (const disk of Object.values(metadata.disks || {})) {
      if (!shareUsesCentralizedAccess(disk)) {
        continue;
      }
      try {
        await ensureDiskStoragePathReady(disk, metadata.settings);
        await ensureDiskShareApplied(disk, metadata.settings, metadata);
      } catch (error) {
        console.error(`Failed to re-apply centralized samba access for share ${disk.id}:`, error.message);
      }
    }
  }
  if (isSftpFeatureEnabled(metadata.settings) && sftpManager.enabled) {
    await sftpManager.applyCentralUsers(resolveCentralUsers(metadata, { protocolReadyOnly: true, enabledOnly: true }), Object.values(metadata.disks || {})).catch((error) => {
      console.error('Failed to re-apply centralized sftp access:', error.message);
    });
  }
}

async function getDiskFilesPath(disk) {
  return disk.storagePath;
}

async function ensureDiskStorageReady(disk, settings = null) {
  if (disk.storageMode === 'cloud-mount' && disk.storageMountId && canManageMounts(settings)) {
    await mountManager.ensureMount(disk.storageMountId);
  }
}

function isIoError(error) {
  return error?.code === 'EIO' || /\bi\/o error\b/i.test(String(error?.message || ''));
}

async function ensureDiskStoragePathReady(disk, settings = null) {
  const cloudMountId = disk.storageMode === 'cloud-mount' ? disk.storageMountId : null;
  if (cloudMountId && canManageMounts(settings)) {
    await mountManager.ensureMount(cloudMountId);
  }

  try {
    await ensureDir(disk.storagePath);
    return;
  } catch (error) {
    if (!cloudMountId || !isIoError(error) || !canManageMounts(settings)) {
      throw error;
    }

    // Recover from stale/broken FUSE mount state by forcing a remount once.
    await mountManager.unmount(cloudMountId).catch(() => { });
    await mountManager.ensureMount(cloudMountId);

    try {
      await ensureDir(disk.storagePath);
      return;
    } catch (retryError) {
      const runtime = mountManager.status().mounts.find((mount) => mount.id === cloudMountId);
      const suffix = runtime?.lastError ? ` Mount manager error: ${runtime.lastError}` : '';
      throw Object.assign(
        new Error(
          `Cloud mount storage path is unavailable (${disk.storagePath}). The mount returned an I/O error.${suffix}`
        ),
        { statusCode: 502, cause: retryError }
      );
    }
  }
}

async function listDiskFiles(disk, prefix = '') {
  const filesDir = await getDiskFilesPath(disk);
  const normalizedPrefix = prefix.trim().replace(/^\/+/, '');
  const results = [];

  await ensureDir(filesDir);
  await walkFiles(filesDir, async ({ relPath, stats }) => {
    if (normalizedPrefix && !relPath.startsWith(normalizedPrefix)) {
      return;
    }

    results.push({
      path: relPath,
      size: stats.size,
      mtimeMs: stats.mtimeMs
    });
  });

  return results;
}

async function assertDiskExists(diskId) {
  const metadata = await loadMetadata();
  const disk = metadata.disks[diskId];
  if (!disk) {
    throw Object.assign(new Error(`Unknown disk id: ${diskId}`), { statusCode: 404 });
  }
  return { metadata, disk };
}

async function writeBinaryToFile(req, filePath, mtimeMs) {
  await ensureDir(join(filePath, '..'));
  const writeStream = createWriteStream(filePath);
  await pipeline(req, writeStream);
  if (mtimeMs !== undefined && Number.isFinite(Number(mtimeMs))) {
    const timestamp = new Date(Number(mtimeMs));
    await utimes(filePath, timestamp, timestamp);
  }
}

async function deleteDiskFilesDir(disk) {
  const { rm } = await import('node:fs/promises');
  await rm(disk.storagePath, { recursive: true, force: true });
  // Backward compatibility for old storage layout.
  await rm(safeJoin(join(dataDir, 'disks'), disk.id), { recursive: true, force: true });
}

function normalizePathFromQuery(url) {
  const path = url.searchParams.get('path') || '';
  if (!path) {
    throw Object.assign(new Error('Missing required query parameter: path'), { statusCode: 400 });
  }
  return path.replace(/^\/+/, '');
}

async function serveAdminStatic(res, pathname) {
  const relRaw = pathname === '/admin' || pathname === '/admin/' ? '/index.html' : pathname.replace(/^\/admin/, '') || '/';
  const rel = relRaw.startsWith('/') ? relRaw : `/${relRaw}`;
  const extension = extname(rel);
  const candidates = [];

  if (rel === '/') {
    candidates.push('/index.html');
  } else if (rel.endsWith('/')) {
    candidates.push(`${rel}index.html`);
  } else if (extension) {
    candidates.push(rel);
  } else {
    candidates.push(rel, `${rel}.html`, `${rel}/index.html`);
  }

  if (!candidates.includes('/index.html')) {
    candidates.push('/index.html');
  }

  let body = null;
  let filePath = '';
  let readError = null;
  for (const candidate of candidates) {
    filePath = safeJoin(adminWebRoot, candidate);
    try {
      body = await readFile(filePath);
      break;
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
      readError = error;
    }
  }

  if (!body) {
    if (readError?.code === 'ENOENT') {
      throw Object.assign(new Error('Not found'), { statusCode: 404 });
    }
    throw readError || Object.assign(new Error('Not found'), { statusCode: 404 });
  }

  res.writeHead(200, {
    'content-type': contentTypeByExt[extname(filePath)] || 'application/octet-stream',
    'content-length': body.length
  });
  res.end(body);
}

function stripHostPort(hostValue) {
  const value = String(hostValue || '').trim();
  if (!value) {
    return '';
  }
  if (value.startsWith('[')) {
    const end = value.indexOf(']');
    if (end > 0) {
      return value.slice(0, end + 1);
    }
    return value;
  }
  const firstColon = value.indexOf(':');
  const lastColon = value.lastIndexOf(':');
  if (firstColon > -1 && firstColon === lastColon) {
    return value.slice(0, firstColon);
  }
  return value;
}

function requestHost(req, metadata) {
  const configured = stripHostPort(metadata.settings.hostname || '');
  if (configured) {
    return configured;
  }
  return stripHostPort(req.headers['x-forwarded-host'] || req.headers.host || '');
}

async function getEffectiveAdminCreds() {
  try {
    const metadata = await loadMetadata();
    return {
      username: metadata.settings.adminUsername || adminUsername,
      password: metadata.settings.adminPassword || adminPassword,
      sessionSeconds: resolveAdminSessionSeconds(metadata.settings)
    };
  } catch {
    return { username: adminUsername, password: adminPassword, sessionSeconds: adminSessionSeconds };
  }
}

async function handleAdminApi(req, res, url) {
  if (req.method === 'POST' && url.pathname === '/admin/api/login') {
    const metadata = await loadMetadata();
    const configSummary = effectiveConfigSourceSummary(metadata.settings);
    const adminAuthMode = configSummary.values.adminAuthMode;
    if (!['local', 'centralized'].includes(adminAuthMode) && configSummary.values.securityBreakGlassEnabled === false) {
      throw Object.assign(
        new Error('Local username/password login is disabled. Use configured SSO provider or re-enable break-glass access.'),
        { statusCode: 403 }
      );
    }

    const payload = await readJsonBody(req);
    const centralAdminUser = findCentralAdminUser(metadata, payload.username, payload.password);
    if (adminAuthMode === 'centralized' && centralAdminUser) {
      const token = createSession(centralAdminUser.username, resolveAdminSessionSeconds(metadata.settings));
      setSessionCookie(res, token, resolveAdminSessionSeconds(metadata.settings));
      sendJson(res, 200, { ok: true, username: centralAdminUser.username });
      return;
    }

    const creds = await getEffectiveAdminCreds();
    const isValid = timingSafeStringEqual(payload.username || '', creds.username) && timingSafeStringEqual(payload.password || '', creds.password);

    if (!isValid) {
      throw Object.assign(new Error('Invalid credentials'), { statusCode: 401 });
    }

    const token = createSession(creds.username, creds.sessionSeconds);
    setSessionCookie(res, token, creds.sessionSeconds);
    sendJson(res, 200, { ok: true, username: creds.username });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/admin/api/logout') {
    const session = getSession(req);
    if (session) {
      sessions.delete(session.token);
    }
    clearSessionCookie(res);
    sendNoContent(res);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/admin/api/session') {
    const session = getSession(req);
    sendJson(res, 200, { authenticated: Boolean(session), username: session?.user || null });
    return;
  }

  assertAdmin(req);

  if (req.method === 'GET' && url.pathname === '/admin/api/logs') {
    sendJson(res, 200, buildLogSnapshot());
    return;
  }

  if (req.method === 'GET' && url.pathname === '/admin/api/logs/stream') {
    startLiveLogStream(res);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/admin/api/log-tail/sources') {
    const sources = await listTailSources();
    sendJson(res, 200, { sources });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/admin/api/log-tail/stream') {
    const streamConfig = await resolveTailCommand(url.searchParams.get('source'), url.searchParams.get('lines'));
    startCommandTailStream(res, streamConfig);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/admin/api/terminal/sessions') {
    const session = createTerminalSession();
    appendLog({
      source: 'admin',
      level: 'info',
      host: requestClientHost(req),
      message: `Created terminal session ${session.id}`,
      path: url.pathname,
      method: req.method
    });
    sendJson(res, 201, {
      ...terminalSummary(session),
      activeSessions: activeTerminalSessionCount()
    });
    return;
  }

  const terminalSegments = url.pathname.split('/').filter(Boolean);
  if (
    terminalSegments[0] === 'admin' &&
    terminalSegments[1] === 'api' &&
    terminalSegments[2] === 'terminal' &&
    terminalSegments[3] === 'sessions' &&
    terminalSegments[4]
  ) {
    const sessionId = terminalSegments[4];
    const session = terminalSessions.get(sessionId);
    if (!session) {
      throw Object.assign(new Error(`Unknown terminal session id: ${sessionId}`), { statusCode: 404 });
    }

    if (req.method === 'GET' && terminalSegments.length === 5) {
      sendJson(res, 200, terminalSummary(session));
      return;
    }

    if (req.method === 'DELETE' && terminalSegments.length === 5) {
      closeTerminalSession(sessionId);
      sendNoContent(res);
      return;
    }

    if (req.method === 'GET' && terminalSegments.length === 6 && terminalSegments[5] === 'stream') {
      startTerminalStream(res, session);
      return;
    }

    if (req.method === 'POST' && terminalSegments.length === 6 && terminalSegments[5] === 'input') {
      if (session.closed || session.process.stdin.destroyed) {
        throw Object.assign(new Error('Terminal session is closed'), { statusCode: 409 });
      }

      const payload = await readJsonBody(req);
      const input = String(payload.input ?? '');
      if (!input) {
        sendJson(res, 200, { ok: true, received: 0 });
        return;
      }

      const written = session.process.stdin.write(input);
      session.lastActiveAt = Date.now();
      sendJson(res, 200, { ok: true, received: input.length, buffered: !written });
      return;
    }
  }

  if (req.method === 'GET' && url.pathname === '/admin/api/samba/status') {
    sendJson(res, 200, sambaManager.status());
    return;
  }

  if (req.method === 'GET' && url.pathname === '/admin/api/state') {
    const metadata = await loadMetadata();
    const host = requestHost(req, metadata);
    const mountStatusById = new Map(mountManager.status().mounts.map((mount) => [mount.id, mount]));
    const { settings } = metadata;
    const sambaStatus = sambaManager.status();
    const mountsStatus = mountManager.status();
    const smbEnabled = isSmbFeatureEnabled(settings);
    const mountManagementEnabled = isMountManagementEnabled(settings);

    const resolvedSettings = buildSettingsResponse(settings);
    sendJson(res, 200, {
      ...resolvedSettings,
      samba: {
        ...sambaStatus,
        settingEnabled: smbEnabled,
        effectiveEnabled: sambaStatus.enabled && smbEnabled
      },
      sftp: sftpConnectionInfo(host, settings),
      mounts: Object.values(metadata.cloudMounts).map((mount) => ({
        ...mount,
        runtime: mountStatusById.get(mount.id) || null
      })),
      mountManager: {
        ...mountsStatus,
        settingEnabled: mountManagementEnabled,
        effectiveEnabled: mountsStatus.enabled && mountManagementEnabled
      },
      shares: Object.values(metadata.disks).map((disk) => diskForResponse(disk, metadata.settings, host, metadata)),
      disks: Object.values(metadata.disks).map((disk) => diskForResponse(disk, metadata.settings, host, metadata)),
      users: resolveCentralUsers(metadata).map((user) => centralUserForResponse(user)),
      groups: Object.values(metadata.groups || {}).map((group) => groupForResponse(group)),
      identityProviders: Object.values(metadata.identityProviders || {}).map((provider) => identityProviderForResponse(provider)),
      groupMappings: Object.values(metadata.groupMappings || {})
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/admin/api/setup') {
    const payload = await readJsonBody(req);
    const metadataBefore = await loadMetadata();
    assertMutableDualSourcePayload(payload, metadataBefore.settings);

    if (payload.adminPassword && String(payload.adminPassword).length < 8) {
      throw Object.assign(new Error('Admin password must be at least 8 characters'), { statusCode: 400 });
    }
    if (payload.apiToken !== undefined) {
      const token = String(payload.apiToken).trim();
      if (token && token.length < 16) {
        throw Object.assign(new Error('API token must be at least 16 characters'), { statusCode: 400 });
      }
    }
    if (payload.workgroupMappingsJson !== undefined && !isValidWorkgroupMappingsJson(payload.workgroupMappingsJson)) {
      throw Object.assign(new Error('workgroupMappingsJson must be a JSON array'), { statusCode: 400 });
    }

    const metadata = await updateMetadata((draft) => {
      if (payload.adminUsername && String(payload.adminUsername).trim()) {
        draft.settings.adminUsername = String(payload.adminUsername).trim();
      }
      if (payload.adminPassword) {
        draft.settings.adminPassword = String(payload.adminPassword);
      }
      if (payload.hostname !== undefined) {
        draft.settings.hostname = String(payload.hostname).trim();
      }
      if (payload.browseShareName || payload.rootShareName) {
        draft.settings.browseShareName = sanitizeShareName(payload.browseShareName || payload.rootShareName);
        draft.settings.rootShareName = draft.settings.browseShareName;
      }
      if (payload.browseShareEnabled !== undefined) {
        draft.settings.browseShareEnabled = Boolean(payload.browseShareEnabled);
      }
      if (payload.smbPublicPort !== undefined) {
        draft.settings.smbPublicPort = Number(payload.smbPublicPort || 445);
      }
      if (payload.smbEnabled !== undefined) {
        draft.settings.smbEnabled = Boolean(payload.smbEnabled);
      }
      if (payload.sftpEnabled !== undefined) {
        draft.settings.sftpEnabled = Boolean(payload.sftpEnabled);
      }
      if (payload.mountManagementEnabled !== undefined) {
        draft.settings.mountManagementEnabled = Boolean(payload.mountManagementEnabled);
      }
      if (payload.smbStreamsBackend !== undefined) {
        draft.settings.smbStreamsBackend = normalizeSambaStreamsBackend(payload.smbStreamsBackend);
      }
      if (payload.mountPollSeconds !== undefined) {
        draft.settings.mountPollSeconds = resolveMountPollSeconds({ mountPollSeconds: payload.mountPollSeconds });
      }
      if (payload.vpsCacheDir !== undefined) {
        draft.settings.vpsCacheDir = normalizeCacheDir(payload.vpsCacheDir, defaultVpsCacheDir);
      }
      if (payload.vpsCacheEnabled !== undefined) {
        draft.settings.vpsCacheEnabled = Boolean(payload.vpsCacheEnabled);
      }
      if (payload.vpsWriteBackSeconds !== undefined) {
        draft.settings.vpsWriteBackSeconds = parsePositiveInt(
          payload.vpsWriteBackSeconds,
          defaultVpsCacheSettings.writeBackSeconds,
          { min: 5, max: 86400 }
        );
      }
      if (payload.vpsCacheMaxSizeGb !== undefined) {
        draft.settings.vpsCacheMaxSizeGb = parsePositiveInt(payload.vpsCacheMaxSizeGb, defaultVpsCacheSettings.maxSizeGb, {
          min: 1,
          max: 10240
        });
      }
      if (payload.vpsCacheMaxAgeHours !== undefined) {
        draft.settings.vpsCacheMaxAgeHours = parsePositiveInt(payload.vpsCacheMaxAgeHours, defaultVpsCacheSettings.maxAgeHours, {
          min: 1,
          max: 720
        });
      }
      if (payload.vpsReadAheadMb !== undefined) {
        draft.settings.vpsReadAheadMb = parsePositiveInt(payload.vpsReadAheadMb, defaultVpsCacheSettings.readAheadMb, {
          min: 1,
          max: 2048
        });
      }
      if (payload.adminSessionSeconds !== undefined) {
        draft.settings.adminSessionSeconds = resolveAdminSessionSeconds({ adminSessionSeconds: payload.adminSessionSeconds });
      }
      if (payload.apiToken !== undefined) {
        const token = String(payload.apiToken).trim();
        if (token) {
          draft.settings.apiToken = token;
        }
      }
      applyDualSourcePayload(draft.settings, payload);
      if (payload.markSetupComplete !== false) {
        draft.settings.setupCompleted = true;
      }
      return draft;
    });
    assertPostgresConfigured(metadata.settings);

    if (payload.applySamba !== false && canApplySamba(metadata.settings) && metadata.settings.browseShareEnabled !== false) {
      await sambaManager.applyRootShare(browseShareName(metadata.settings), smbShareRoot);
      await applyAllDiskSharesOnStartup(metadata);
    }

    sendJson(res, 200, { ok: true, ...buildSettingsResponse(metadata.settings) });
    return;
  }

  if (req.method === 'PUT' && url.pathname === '/admin/api/settings') {
    const payload = await readJsonBody(req);
    const metadataBefore = await loadMetadata();
    assertMutableDualSourcePayload(payload, metadataBefore.settings);
    if (payload.adminPassword && String(payload.adminPassword).length < 8) {
      throw Object.assign(new Error('Admin password must be at least 8 characters'), { statusCode: 400 });
    }
    if (payload.apiToken !== undefined) {
      const token = String(payload.apiToken).trim();
      if (token && token.length < 16) {
        throw Object.assign(new Error('API token must be at least 16 characters'), { statusCode: 400 });
      }
    }
    if (payload.workgroupMappingsJson !== undefined && !isValidWorkgroupMappingsJson(payload.workgroupMappingsJson)) {
      throw Object.assign(new Error('workgroupMappingsJson must be a JSON array'), { statusCode: 400 });
    }
    const metadata = await updateMetadata((draft) => {
      draft.settings.hostname = payload.hostname ?? draft.settings.hostname;
      if (payload.adminUsername && String(payload.adminUsername).trim()) {
        draft.settings.adminUsername = String(payload.adminUsername).trim();
      }
      if (payload.adminPassword) {
        draft.settings.adminPassword = String(payload.adminPassword);
      }
      if (payload.browseShareName || payload.rootShareName) {
        draft.settings.browseShareName = sanitizeShareName(payload.browseShareName || payload.rootShareName);
        draft.settings.rootShareName = draft.settings.browseShareName;
      }
      if (payload.browseShareEnabled !== undefined) {
        draft.settings.browseShareEnabled = Boolean(payload.browseShareEnabled);
      }
      if (payload.smbPublicPort !== undefined) {
        draft.settings.smbPublicPort = Number(payload.smbPublicPort || 445);
      }
      if (payload.smbEnabled !== undefined) {
        draft.settings.smbEnabled = Boolean(payload.smbEnabled);
      }
      if (payload.sftpEnabled !== undefined) {
        draft.settings.sftpEnabled = Boolean(payload.sftpEnabled);
      }
      if (payload.mountManagementEnabled !== undefined) {
        draft.settings.mountManagementEnabled = Boolean(payload.mountManagementEnabled);
      }
      if (payload.smbStreamsBackend !== undefined) {
        draft.settings.smbStreamsBackend = normalizeSambaStreamsBackend(payload.smbStreamsBackend);
      }
      if (payload.mountPollSeconds !== undefined) {
        draft.settings.mountPollSeconds = resolveMountPollSeconds({ mountPollSeconds: payload.mountPollSeconds });
      }
      if (payload.vpsCacheDir !== undefined) {
        draft.settings.vpsCacheDir = normalizeCacheDir(payload.vpsCacheDir, defaultVpsCacheDir);
      }
      if (payload.vpsCacheEnabled !== undefined) {
        draft.settings.vpsCacheEnabled = Boolean(payload.vpsCacheEnabled);
      }
      if (payload.vpsWriteBackSeconds !== undefined) {
        draft.settings.vpsWriteBackSeconds = parsePositiveInt(
          payload.vpsWriteBackSeconds,
          defaultVpsCacheSettings.writeBackSeconds,
          { min: 5, max: 86400 }
        );
      }
      if (payload.vpsCacheMaxSizeGb !== undefined) {
        draft.settings.vpsCacheMaxSizeGb = parsePositiveInt(payload.vpsCacheMaxSizeGb, defaultVpsCacheSettings.maxSizeGb, {
          min: 1,
          max: 10240
        });
      }
      if (payload.vpsCacheMaxAgeHours !== undefined) {
        draft.settings.vpsCacheMaxAgeHours = parsePositiveInt(payload.vpsCacheMaxAgeHours, defaultVpsCacheSettings.maxAgeHours, {
          min: 1,
          max: 720
        });
      }
      if (payload.vpsReadAheadMb !== undefined) {
        draft.settings.vpsReadAheadMb = parsePositiveInt(payload.vpsReadAheadMb, defaultVpsCacheSettings.readAheadMb, {
          min: 1,
          max: 2048
        });
      }
      if (payload.adminSessionSeconds !== undefined) {
        draft.settings.adminSessionSeconds = resolveAdminSessionSeconds({ adminSessionSeconds: payload.adminSessionSeconds });
      }
      if (payload.apiToken !== undefined) {
        const token = String(payload.apiToken).trim();
        if (token) {
          draft.settings.apiToken = token;
        }
      }
      applyDualSourcePayload(draft.settings, payload);
      return draft;
    });
    assertPostgresConfigured(metadata.settings);

    if (payload.applySamba !== false && canApplySamba(metadata.settings) && metadata.settings.browseShareEnabled !== false) {
      await sambaManager.applyRootShare(browseShareName(metadata.settings), smbShareRoot);
      await applyAllDiskSharesOnStartup(metadata);
    }

    sendJson(res, 200, buildSettingsResponse(metadata.settings));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/admin/api/users') {
    const metadata = await loadMetadata();
    sendJson(res, 200, { users: resolveCentralUsers(metadata).map((user) => centralUserForResponse(user)) });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/admin/api/users') {
    const payload = await readJsonBody(req);
    if (!payload.username || typeof payload.username !== 'string') {
      throw Object.assign(new Error('Field `username` is required'), { statusCode: 400 });
    }
    const now = new Date().toISOString();
    const userId = payload.id || randomUUID();
    const metadata = await updateMetadata((draft) => {
      if (draft.users[userId]) {
        throw Object.assign(new Error(`User id already exists: ${userId}`), { statusCode: 409 });
      }
      const username = sanitizeUsername(payload.username);
      if (Object.values(draft.users).some((user) => user.username === username)) {
        throw Object.assign(new Error(`Username already in use: ${username}`), { statusCode: 409 });
      }
      const protocolUsername = assertUniqueCentralProtocolUsername(draft, payload.protocolUsername || username);
      draft.users[userId] = {
        id: userId,
        username,
        displayName: payload.displayName || payload.username,
        authType: normalizeIdentityProviderType(payload.authType || 'local', 'local'),
        password: payload.password || '',
        protocolUsername,
        protocolPassword: payload.protocolPassword || randomPassword(),
        enabled: payload.enabled !== false,
        isAdmin: payload.isAdmin === true,
        smbEnabled: payload.smbEnabled !== false,
        sftpEnabled: payload.sftpEnabled !== false,
        identityProviderId: payload.identityProviderId || '',
        externalSubject: payload.externalSubject || '',
        createdAt: now,
        updatedAt: now
      };
      syncUserGroupMembership(draft, userId, payload.groupIds || []);
      return draft;
    });
    await applyCentralizedShareAccess(metadata);
    sendJson(res, 201, { user: centralUserForResponse(resolveCentralUsers(metadata).find((user) => user.id === userId) || metadata.users[userId], { includeSecrets: true }) });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/admin/api/groups') {
    const metadata = await loadMetadata();
    sendJson(res, 200, { groups: Object.values(metadata.groups || {}).map((group) => groupForResponse(group)) });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/admin/api/groups') {
    const payload = await readJsonBody(req);
    if (!payload.name || typeof payload.name !== 'string') {
      throw Object.assign(new Error('Field `name` is required'), { statusCode: 400 });
    }
    const now = new Date().toISOString();
    const groupId = payload.id || randomUUID();
    const metadata = await updateMetadata((draft) => {
      if (draft.groups[groupId]) {
        throw Object.assign(new Error(`Group id already exists: ${groupId}`), { statusCode: 409 });
      }
      draft.groups[groupId] = {
        id: groupId,
        name: payload.name,
        description: payload.description || '',
        memberUserIds: normalizeMemberUserIds(payload.memberUserIds || []),
        createdAt: now,
        updatedAt: now
      };
      return draft;
    });
    await applyCentralizedShareAccess(metadata);
    sendJson(res, 201, { group: groupForResponse(metadata.groups[groupId]) });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/admin/api/identity-providers') {
    const metadata = await loadMetadata();
    sendJson(res, 200, { identityProviders: Object.values(metadata.identityProviders || {}).map((provider) => identityProviderForResponse(provider)) });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/admin/api/identity-providers') {
    const payload = await readJsonBody(req);
    if (!payload.name || typeof payload.name !== 'string') {
      throw Object.assign(new Error('Field `name` is required'), { statusCode: 400 });
    }
    const providerId = payload.id || randomUUID();
    const now = new Date().toISOString();
    const metadata = await updateMetadata((draft) => {
      if (draft.identityProviders[providerId]) {
        throw Object.assign(new Error(`Identity provider id already exists: ${providerId}`), { statusCode: 409 });
      }
      draft.identityProviders[providerId] = {
        id: providerId,
        name: payload.name,
        type: normalizeIdentityProviderType(payload.type || 'local', 'local'),
        enabled: payload.enabled !== false,
        config: payload.config && typeof payload.config === 'object' ? payload.config : {},
        createdAt: now,
        updatedAt: now
      };
      return draft;
    });
    sendJson(res, 201, { identityProvider: identityProviderForResponse(metadata.identityProviders[providerId]) });
    return;
  }

  const identitySegments = url.pathname.split('/').filter(Boolean);
  if (identitySegments[0] === 'admin' && identitySegments[1] === 'api' && identitySegments[2] === 'users' && identitySegments[3]) {
    const userId = identitySegments[3];
    if (req.method === 'PUT' && identitySegments.length === 4) {
      const payload = await readJsonBody(req);
      const metadata = await updateMetadata((draft) => {
        const user = draft.users[userId];
        if (!user) {
          throw Object.assign(new Error(`Unknown user id: ${userId}`), { statusCode: 404 });
        }
        if (payload.username !== undefined) {
          const username = sanitizeUsername(payload.username);
          if (Object.values(draft.users).some((other) => other.id !== userId && other.username === username)) {
            throw Object.assign(new Error(`Username already in use: ${username}`), { statusCode: 409 });
          }
          user.username = username;
        }
        if (payload.displayName !== undefined) {
          user.displayName = payload.displayName || user.username;
        }
        if (payload.authType !== undefined) {
          user.authType = normalizeIdentityProviderType(payload.authType, user.authType || 'local');
        }
        if (payload.password !== undefined) {
          user.password = String(payload.password || '');
        }
        if (payload.protocolUsername !== undefined) {
          user.protocolUsername = assertUniqueCentralProtocolUsername(draft, payload.protocolUsername, userId);
        }
        if (payload.protocolPassword !== undefined) {
          user.protocolPassword = String(payload.protocolPassword || '');
        }
        if (payload.enabled !== undefined) {
          user.enabled = Boolean(payload.enabled);
        }
        if (payload.isAdmin !== undefined) {
          user.isAdmin = Boolean(payload.isAdmin);
        }
        if (payload.smbEnabled !== undefined) {
          user.smbEnabled = Boolean(payload.smbEnabled);
        }
        if (payload.sftpEnabled !== undefined) {
          user.sftpEnabled = Boolean(payload.sftpEnabled);
        }
        if (payload.identityProviderId !== undefined) {
          user.identityProviderId = payload.identityProviderId || '';
        }
        if (payload.externalSubject !== undefined) {
          user.externalSubject = payload.externalSubject || '';
        }
        if (payload.groupIds !== undefined) {
          syncUserGroupMembership(draft, userId, payload.groupIds);
        }
        user.updatedAt = new Date().toISOString();
        return draft;
      });
      await applyCentralizedShareAccess(metadata);
      sendJson(res, 200, { user: centralUserForResponse(resolveCentralUsers(metadata).find((user) => user.id === userId) || metadata.users[userId]) });
      return;
    }

    if (req.method === 'DELETE' && identitySegments.length === 4) {
      const metadata = await loadMetadata();
      const user = metadata.users[userId];
      if (!user) {
        throw Object.assign(new Error(`Unknown user id: ${userId}`), { statusCode: 404 });
      }
      const updatedMetadata = await updateMetadata((draft) => {
        delete draft.users[userId];
        syncUserGroupMembership(draft, userId, []);
        return draft;
      });
      await sftpManager.deleteUser(user.protocolUsername).catch(() => { });
      await applyCentralizedShareAccess(updatedMetadata);
      sendNoContent(res);
      return;
    }
  }

  if (identitySegments[0] === 'admin' && identitySegments[1] === 'api' && identitySegments[2] === 'groups' && identitySegments[3]) {
    const groupId = identitySegments[3];
    if (req.method === 'PUT' && identitySegments.length === 4) {
      const payload = await readJsonBody(req);
      const metadata = await updateMetadata((draft) => {
        const group = draft.groups[groupId];
        if (!group) {
          throw Object.assign(new Error(`Unknown group id: ${groupId}`), { statusCode: 404 });
        }
        if (payload.name !== undefined) {
          group.name = payload.name;
        }
        if (payload.description !== undefined) {
          group.description = payload.description || '';
        }
        if (payload.memberUserIds !== undefined) {
          group.memberUserIds = normalizeMemberUserIds(payload.memberUserIds);
        }
        group.updatedAt = new Date().toISOString();
        return draft;
      });
      await applyCentralizedShareAccess(metadata);
      sendJson(res, 200, { group: groupForResponse(metadata.groups[groupId]) });
      return;
    }

    if (req.method === 'DELETE' && identitySegments.length === 4) {
      const metadata = await updateMetadata((draft) => {
        if (!draft.groups[groupId]) {
          throw Object.assign(new Error(`Unknown group id: ${groupId}`), { statusCode: 404 });
        }
        delete draft.groups[groupId];
        return draft;
      });
      await applyCentralizedShareAccess(metadata);
      sendNoContent(res);
      return;
    }
  }

  if (identitySegments[0] === 'admin' && identitySegments[1] === 'api' && identitySegments[2] === 'identity-providers' && identitySegments[3]) {
    const providerId = identitySegments[3];
    if (req.method === 'PUT' && identitySegments.length === 4) {
      const payload = await readJsonBody(req);
      const metadata = await updateMetadata((draft) => {
        const provider = draft.identityProviders[providerId];
        if (!provider) {
          throw Object.assign(new Error(`Unknown identity provider id: ${providerId}`), { statusCode: 404 });
        }
        if (payload.name !== undefined) {
          provider.name = payload.name;
        }
        if (payload.type !== undefined) {
          provider.type = normalizeIdentityProviderType(payload.type, provider.type || 'local');
        }
        if (payload.enabled !== undefined) {
          provider.enabled = Boolean(payload.enabled);
        }
        if (payload.config !== undefined) {
          provider.config = payload.config && typeof payload.config === 'object' ? payload.config : {};
        }
        provider.updatedAt = new Date().toISOString();
        return draft;
      });
      sendJson(res, 200, { identityProvider: identityProviderForResponse(metadata.identityProviders[providerId]) });
      return;
    }

    if (req.method === 'DELETE' && identitySegments.length === 4) {
      await updateMetadata((draft) => {
        if (!draft.identityProviders[providerId]) {
          throw Object.assign(new Error(`Unknown identity provider id: ${providerId}`), { statusCode: 404 });
        }
        delete draft.identityProviders[providerId];
        return draft;
      });
      sendNoContent(res);
      return;
    }
  }

  if (req.method === 'GET' && url.pathname === '/admin/api/mounts') {
    const metadata = await loadMetadata();
    const runtimeById = new Map(mountManager.status().mounts.map((mount) => [mount.id, mount]));
    const mounts = Object.values(metadata.cloudMounts).map((mount) => ({
      ...mount,
      runtime: runtimeById.get(mount.id) || null
    }));
    sendJson(res, 200, {
      mounts,
      manager: {
        ...mountManager.status(),
        settingEnabled: isMountManagementEnabled(metadata.settings),
        effectiveEnabled: canManageMounts(metadata.settings)
      }
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/admin/api/mounts') {
    const payload = await readJsonBody(req);
    if (!payload.name || !payload.mountPath) {
      throw Object.assign(new Error('Fields `name` and `mountPath` are required'), { statusCode: 400 });
    }

    const mountId = payload.id || randomUUID();
    const provider = normalizeMountProvider(payload.provider || 'rclone');
    const remotePath = payload.remotePath || defaultRemotePathForProvider(provider);
    const now = new Date().toISOString();
    const metadata = await updateMetadata((draft) => {
      if (draft.cloudMounts[mountId]) {
        throw Object.assign(new Error(`Mount id already exists: ${mountId}`), { statusCode: 409 });
      }

      draft.cloudMounts[mountId] = {
        id: mountId,
        name: payload.name,
        provider,
        remotePath,
        mountPath: payload.mountPath,
        enabled: payload.enabled !== false,
        rcloneBinary: payload.rcloneBinary || 'rclone',
        vfsCacheMode: payload.vfsCacheMode || 'full',
        dirCacheTime: payload.dirCacheTime || '10m',
        pollInterval: payload.pollInterval || '30s',
        extraArgs: Array.isArray(payload.extraArgs) ? payload.extraArgs : [],
        bucket: payload.bucket || '',
        prefix: payload.prefix || '',
        region: payload.region || '',
        endpoint: payload.endpoint || '',
        accessKeyId: payload.accessKeyId || '',
        secretAccessKey: payload.secretAccessKey || '',
        s3Provider: payload.s3Provider || 'AWS',
        createdAt: now,
        updatedAt: now
      };
      return draft;
    });

    let ensure = null;
    if (payload.ensureMounted !== false && canManageMounts(metadata.settings)) {
      try {
        const result = await mountManager.ensureMount(mountId);
        ensure = { ok: true, result };
      } catch (error) {
        ensure = { ok: false, error: error.message };
      }
    } else if (payload.ensureMounted !== false) {
      ensure = { ok: false, skipped: true, reason: 'Cloud mount management is disabled' };
    }

    sendJson(res, 201, { mount: metadata.cloudMounts[mountId], runtime: mountManager.status(), ensure });
    return;
  }

  const mountSegments = url.pathname.split('/').filter(Boolean);
  if (mountSegments[0] === 'admin' && mountSegments[1] === 'api' && mountSegments[2] === 'mounts' && mountSegments[3]) {
    const mountId = mountSegments[3];

    if (req.method === 'PUT' && mountSegments.length === 4) {
      const payload = await readJsonBody(req);
      const metadata = await updateMetadata((draft) => {
        const mount = draft.cloudMounts[mountId];
        if (!mount) {
          throw Object.assign(new Error(`Unknown mount id: ${mountId}`), { statusCode: 404 });
        }

        if (payload.name !== undefined) {
          mount.name = payload.name;
        }
        if (payload.provider !== undefined) {
          mount.provider = normalizeMountProvider(payload.provider);
          if (!mount.remotePath && mount.provider !== 's3') {
            mount.remotePath = defaultRemotePathForProvider(mount.provider);
          }
        }
        if (payload.remotePath !== undefined) {
          mount.remotePath = payload.remotePath;
        }
        if (payload.mountPath !== undefined) {
          mount.mountPath = payload.mountPath;
        }
        if (payload.enabled !== undefined) {
          mount.enabled = Boolean(payload.enabled);
        }
        if (payload.rcloneBinary !== undefined) {
          mount.rcloneBinary = payload.rcloneBinary;
        }
        if (payload.vfsCacheMode !== undefined) {
          mount.vfsCacheMode = payload.vfsCacheMode;
        }
        if (payload.dirCacheTime !== undefined) {
          mount.dirCacheTime = payload.dirCacheTime;
        }
        if (payload.pollInterval !== undefined) {
          mount.pollInterval = payload.pollInterval;
        }
        if (payload.extraArgs !== undefined) {
          mount.extraArgs = Array.isArray(payload.extraArgs) ? payload.extraArgs : [];
        }
        if (payload.bucket !== undefined) {
          mount.bucket = payload.bucket;
        }
        if (payload.prefix !== undefined) {
          mount.prefix = payload.prefix;
        }
        if (payload.region !== undefined) {
          mount.region = payload.region;
        }
        if (payload.endpoint !== undefined) {
          mount.endpoint = payload.endpoint;
        }
        if (payload.accessKeyId !== undefined) {
          mount.accessKeyId = payload.accessKeyId;
        }
        if (payload.secretAccessKey !== undefined) {
          mount.secretAccessKey = payload.secretAccessKey;
        }
        if (payload.s3Provider !== undefined) {
          mount.s3Provider = payload.s3Provider;
        }
        mount.updatedAt = new Date().toISOString();
        return draft;
      });

      if (payload.ensureMounted === true) {
        assertMountManagementEnabled(metadata.settings);
        await mountManager.ensureMount(mountId);
      }

      sendJson(res, 200, { mount: metadata.cloudMounts[mountId], runtime: mountManager.status() });
      return;
    }

    if (req.method === 'POST' && mountSegments.length === 5 && mountSegments[4] === 'ensure') {
      const metadata = await loadMetadata();
      assertMountManagementEnabled(metadata.settings);
      const result = await mountManager.ensureMount(mountId);
      sendJson(res, 200, { result, runtime: mountManager.status() });
      return;
    }

    if (req.method === 'POST' && mountSegments.length === 5 && mountSegments[4] === 'unmount') {
      const metadata = await loadMetadata();
      assertMountManagementEnabled(metadata.settings);
      const result = await mountManager.unmount(mountId);
      sendJson(res, 200, { result, runtime: mountManager.status() });
      return;
    }

    if (req.method === 'DELETE' && mountSegments.length === 4) {
      const inUse = Object.values((await loadMetadata()).disks).some((disk) => disk.storageMountId === mountId);
      if (inUse) {
        throw Object.assign(new Error('Cannot delete mount while disks reference it'), { statusCode: 400 });
      }

      await updateMetadata((draft) => {
        if (!draft.cloudMounts[mountId]) {
          throw Object.assign(new Error(`Unknown mount id: ${mountId}`), { statusCode: 404 });
        }
        delete draft.cloudMounts[mountId];
        return draft;
      });
      sendNoContent(res);
      return;
    }
  }

  if (req.method === 'POST' && (url.pathname === '/admin/api/disks' || url.pathname === '/admin/api/shares')) {
    const payload = await readJsonBody(req);
    if (!payload.name || typeof payload.name !== 'string') {
      throw Object.assign(new Error('Field `name` is required'), { statusCode: 400 });
    }

    const metadataBefore = await loadMetadata();
    const now = new Date().toISOString();
    const diskId = payload.id || randomUUID();
    const storage = resolveStoragePath(payload, diskId, metadataBefore);
    if (storage.storageMode === 'cloud-mount' && storage.storageMountId && canManageMounts(metadataBefore.settings)) {
      await mountManager.ensureMount(storage.storageMountId);
    }

    const metadata = await updateMetadata((draft) => {
      if (draft.disks[diskId]) {
        throw Object.assign(new Error(`Disk id already exists: ${diskId}`), { statusCode: 409 });
      }

      const shareName = sanitizeShareName(payload.shareName || payload.smbShareName || `share-${payload.name}-${diskId.slice(0, 6)}`);
      const shareExists = Object.values(draft.disks).some((disk) => disk.smbShareName === shareName);
      if (shareExists) {
        throw Object.assign(new Error(`Share name already in use: ${shareName}`), { statusCode: 409 });
      }

      const accessMode = requestedAccessMode(payload, 'legacy-per-share');
      draft.disks[diskId] = {
        id: diskId,
        name: payload.name,
        quotaGb: Number((payload.timeMachineQuotaGb ?? payload.quotaGb) || 0),
        timeMachineEnabled: payload.timeMachineEnabled === true,
        timeMachineQuotaGb: Number((payload.timeMachineQuotaGb ?? payload.quotaGb) || 0),
        accessMode,
        accessPolicy: incomingAccessPolicy(payload, emptyAccessPolicy()),
        storageMode: storage.storageMode,
        storageMountId: storage.storageMountId || null,
        storageBasePath: storage.storageBasePath,
        storagePath: storage.storagePath,
        smbShareName: shareName,
        smbUsername: sanitizeUsername(payload.smbUsername || `tm_${diskId.slice(0, 8)}`),
        smbPassword: payload.smbPassword || randomPassword(),
        sftpUsername: sanitizeUsername(payload.sftpUsername || `sftp_${diskId.slice(0, 8)}`),
        sftpPassword: payload.sftpPassword || randomPassword(),
        createdAt: now,
        updatedAt: now,
        smbLastAppliedAt: null,
        smbLastAppliedError: null,
        sftpLastAppliedAt: null,
        sftpLastAppliedError: null
      };
      assertUniqueCentralProtocolUsername(draft, payload.protocolUsername || payload.smbUsername || draft.disks[diskId].smbUsername);
      const sftpUserExists = Object.values(draft.disks).some((disk) => disk.id !== diskId && disk.sftpUsername === draft.disks[diskId].sftpUsername);
      if (sftpUserExists) {
        throw Object.assign(new Error(`SFTP username already in use: ${draft.disks[diskId].sftpUsername}`), { statusCode: 409 });
      }

      return draft;
    });

    const disk = metadata.disks[diskId];
    try {
      await ensureDiskStoragePathReady(disk, metadata.settings);
    } catch (error) {
      await updateMetadata((draft) => {
        delete draft.disks[diskId];
        return draft;
      }).catch(() => { });
      throw error;
    }

    if (payload.applySamba !== false && canApplySamba(metadata.settings)) {
      const applyResult = await ensureDiskShareApplied(disk, metadata.settings, metadata);
      await updateMetadata((draft) => {
        const current = draft.disks[diskId];
        if (!current) {
          return draft;
        }
        current.smbLastAppliedAt = new Date().toISOString();
        current.smbLastAppliedError = applyResult.disk.applied ? null : applyResult.disk.reason || 'Not applied';
        return draft;
      });
    }
    if (payload.applySftp !== false && isSftpFeatureEnabled(metadata.settings) && sftpManager.enabled) {
      const applyResult = await ensureDiskSftpApplied(disk, metadata);
      await updateMetadata((draft) => {
        const current = draft.disks[diskId];
        if (!current) {
          return draft;
        }
        current.sftpLastAppliedAt = new Date().toISOString();
        current.sftpLastAppliedError = applyResult.applied ? null : applyResult.reason || 'Not applied';
        return draft;
      });
    }

    appendLog({
      source: 'admin',
      level: 'info',
      host: requestClientHost(req),
      drive: disk.id,
      message: `Created drive "${disk.name}"`,
      path: url.pathname,
      method: req.method
    });

    const share = diskForResponse(disk, metadata.settings, requestHost(req, metadata), metadata);
    sendJson(res, 201, { share, disk: share });
    return;
  }

  const segments = url.pathname.split('/').filter(Boolean);
  if (segments[0] === 'admin' && segments[1] === 'api' && ['disks', 'shares'].includes(segments[2]) && segments[3]) {
    const diskId = segments[3];

    if (req.method === 'PUT' && segments.length === 4) {
      const payload = await readJsonBody(req);
      const previousMetadata = await loadMetadata();
      const previousDisk = previousMetadata.disks[diskId];
      if (!previousDisk) {
        throw Object.assign(new Error(`Unknown disk id: ${diskId}`), { statusCode: 404 });
      }
      const metadata = await updateMetadata((draft) => {
        const disk = draft.disks[diskId];
        if (!disk) {
          throw Object.assign(new Error(`Unknown disk id: ${diskId}`), { statusCode: 404 });
        }

        if (payload.name !== undefined) {
          disk.name = payload.name;
        }
        if (payload.timeMachineEnabled !== undefined) {
          disk.timeMachineEnabled = Boolean(payload.timeMachineEnabled);
        }
        if (payload.timeMachineQuotaGb !== undefined || payload.quotaGb !== undefined) {
          const nextQuota = Number((payload.timeMachineQuotaGb ?? payload.quotaGb) || 0);
          disk.timeMachineQuotaGb = nextQuota;
          disk.quotaGb = nextQuota;
        }
        if (payload.smbShareName !== undefined || payload.shareName !== undefined) {
          const nextShare = sanitizeShareName(payload.smbShareName || payload.shareName);
          const shareExists = Object.values(draft.disks).some((other) => other.id !== diskId && other.smbShareName === nextShare);
          if (shareExists) {
            throw Object.assign(new Error(`Share name already in use: ${nextShare}`), { statusCode: 409 });
          }
          disk.smbShareName = nextShare;
        }
        if (payload.smbUsername !== undefined) {
          disk.smbUsername = sanitizeUsername(payload.smbUsername);
        }
        if (payload.sftpUsername !== undefined) {
          const nextSftpUsername = sanitizeUsername(payload.sftpUsername);
          const sftpExists = Object.values(draft.disks).some((other) => other.id !== diskId && other.sftpUsername === nextSftpUsername);
          if (sftpExists) {
            throw Object.assign(new Error(`SFTP username already in use: ${nextSftpUsername}`), { statusCode: 409 });
          }
          disk.sftpUsername = nextSftpUsername;
        }
        if (payload.accessMode !== undefined || payload.accessPolicy !== undefined || payload.smbUserIds !== undefined || payload.smbGroupIds !== undefined || payload.sftpUserIds !== undefined || payload.sftpGroupIds !== undefined) {
          disk.accessMode = requestedAccessMode(payload, disk.accessMode || 'legacy-per-share');
          disk.accessPolicy = incomingAccessPolicy(payload, disk.accessPolicy || emptyAccessPolicy());
        }
        if (payload.storageMode || payload.storagePath || payload.storageSubdir) {
          const storage = resolveStoragePath(
            {
              storageMode: payload.storageMode || disk.storageMode,
              storageMountId: payload.storageMountId || disk.storageMountId,
              storagePath: payload.storagePath || disk.storageBasePath,
              storageSubdir: payload.storageSubdir || disk.id
            },
            disk.id,
            draft
          );
          disk.storageMode = storage.storageMode;
          disk.storageMountId = storage.storageMountId || null;
          disk.storageBasePath = storage.storageBasePath;
          disk.storagePath = storage.storagePath;
        }

        disk.updatedAt = new Date().toISOString();
        return draft;
      });

      const disk = metadata.disks[diskId];
      if (disk.storageMode === 'cloud-mount' && disk.storageMountId && canManageMounts(metadata.settings)) {
        await mountManager.ensureMount(disk.storageMountId);
      }
      await ensureDiskStoragePathReady(disk, metadata.settings);
      if (payload.applySamba !== false && canApplySamba(metadata.settings)) {
        await ensureDiskShareApplied(disk, metadata.settings, metadata);
      }
      if (payload.applySftp !== false && isSftpFeatureEnabled(metadata.settings) && sftpManager.enabled) {
        const result = await ensureDiskSftpApplied(disk, metadata);
        if (!shareUsesCentralizedAccess(disk) && previousDisk.sftpUsername !== disk.sftpUsername) {
          await sftpManager.deleteUser(previousDisk.sftpUsername).catch(() => { });
        }
        await updateMetadata((draft) => {
          const current = draft.disks[diskId];
          if (!current) {
            return draft;
          }
          current.sftpLastAppliedAt = new Date().toISOString();
          current.sftpLastAppliedError = result.applied ? null : result.reason || 'Not applied';
          return draft;
        });
      }

      const share = diskForResponse(disk, metadata.settings, requestHost(req, metadata), metadata);
      sendJson(res, 200, { share, disk: share });
      return;
    }

    if (req.method === 'POST' && segments.length === 5 && segments[4] === 'password') {
      const payload = await readJsonBody(req);
      const nextPassword = payload.password || randomPassword();

      const metadata = await updateMetadata((draft) => {
        const disk = draft.disks[diskId];
        if (!disk) {
          throw Object.assign(new Error(`Unknown disk id: ${diskId}`), { statusCode: 404 });
        }

        disk.smbPassword = nextPassword;
        disk.updatedAt = new Date().toISOString();
        return draft;
      });

      const disk = metadata.disks[diskId];
      if (shareUsesCentralizedAccess(disk)) {
        throw Object.assign(new Error('Legacy SMB password rotation is unavailable for centralized shares'), { statusCode: 400 });
      }
      const result = canApplySamba(metadata.settings)
        ? await ensureDiskShareApplied(disk, metadata.settings, metadata)
        : {
          disk: { applied: false, reason: 'SMB management is disabled in settings' },
          root: { applied: false, reason: 'SMB management is disabled in settings' }
        };
      await updateMetadata((draft) => {
        const current = draft.disks[diskId];
        if (!current) {
          return draft;
        }
        current.smbLastAppliedAt = canApplySamba(metadata.settings) ? new Date().toISOString() : current.smbLastAppliedAt;
        current.smbLastAppliedError = result.disk.applied ? null : result.disk.reason || 'Not applied';
        return draft;
      });

      sendJson(res, 200, {
        ok: true,
        smbUsername: disk.smbUsername,
        smbPassword: nextPassword,
        applied: result
      });
      appendLog({
        source: 'admin',
        level: 'info',
        host: requestClientHost(req),
        drive: diskId,
        message: `Rotated SMB password for drive "${diskId}"`,
        path: url.pathname,
        method: req.method
      });
      return;
    }

    if (req.method === 'POST' && segments.length === 5 && segments[4] === 'sftp-password') {
      const payload = await readJsonBody(req);
      const nextPassword = payload.password || randomPassword();

      const metadata = await updateMetadata((draft) => {
        const disk = draft.disks[diskId];
        if (!disk) {
          throw Object.assign(new Error(`Unknown disk id: ${diskId}`), { statusCode: 404 });
        }

        disk.sftpPassword = nextPassword;
        disk.updatedAt = new Date().toISOString();
        return draft;
      });

      const disk = metadata.disks[diskId];
      if (shareUsesCentralizedAccess(disk)) {
        throw Object.assign(new Error('Legacy SFTP password rotation is unavailable for centralized shares'), { statusCode: 400 });
      }
      const result = isSftpFeatureEnabled(metadata.settings) && sftpManager.enabled
        ? await ensureDiskSftpApplied(disk, metadata)
        : { applied: false, reason: 'SFTP management is disabled in settings' };
      await updateMetadata((draft) => {
        const current = draft.disks[diskId];
        if (!current) {
          return draft;
        }
        current.sftpLastAppliedAt = isSftpFeatureEnabled(metadata.settings) && sftpManager.enabled ? new Date().toISOString() : current.sftpLastAppliedAt;
        current.sftpLastAppliedError = result.applied ? null : result.reason || 'Not applied';
        return draft;
      });

      sendJson(res, 200, {
        ok: true,
        sftpUsername: disk.sftpUsername,
        sftpPassword: nextPassword,
        applied: result
      });
      appendLog({
        source: 'admin',
        level: 'info',
        host: requestClientHost(req),
        drive: diskId,
        message: `Rotated SFTP password for drive "${diskId}"`,
        path: url.pathname,
        method: req.method
      });
      return;
    }

    if (req.method === 'POST' && segments.length === 5 && segments[4] === 'apply-samba') {
      const { metadata, disk } = await assertDiskExists(diskId);
      if (!canApplySamba(metadata.settings)) {
        throw Object.assign(new Error('SMB management is disabled in settings'), { statusCode: 400 });
      }
      const result = await ensureDiskShareApplied(disk, metadata.settings, metadata);
      await updateMetadata((draft) => {
        const current = draft.disks[diskId];
        if (!current) {
          return draft;
        }
        current.smbLastAppliedAt = new Date().toISOString();
        current.smbLastAppliedError = result.disk.applied ? null : result.disk.reason || 'Not applied';
        return draft;
      });
      appendLog({
        source: 'admin',
        level: result?.disk?.applied ? 'info' : 'warning',
        host: requestClientHost(req),
        drive: diskId,
        message: result?.disk?.applied
          ? `Applied Samba settings for drive "${diskId}"`
          : `Failed to fully apply Samba settings for drive "${diskId}"`,
        path: url.pathname,
        method: req.method
      });
      sendJson(res, 200, { result });
      return;
    }

    if (req.method === 'POST' && segments.length === 5 && segments[4] === 'apply-sftp') {
      const { metadata, disk } = await assertDiskExists(diskId);
      if (!isSftpFeatureEnabled(metadata.settings) || !sftpManager.enabled) {
        throw Object.assign(new Error('SFTP management is disabled in settings'), { statusCode: 400 });
      }
      const result = await ensureDiskSftpApplied(disk, metadata);
      await updateMetadata((draft) => {
        const current = draft.disks[diskId];
        if (!current) {
          return draft;
        }
        current.sftpLastAppliedAt = new Date().toISOString();
        current.sftpLastAppliedError = result.applied ? null : result.reason || 'Not applied';
        return draft;
      });
      appendLog({
        source: 'admin',
        level: result?.applied ? 'info' : 'warning',
        host: requestClientHost(req),
        drive: diskId,
        message: result?.applied
          ? `Applied SFTP settings for drive "${diskId}"`
          : `Failed to fully apply SFTP settings for drive "${diskId}"`,
        path: url.pathname,
        method: req.method
      });
      sendJson(res, 200, { result });
      return;
    }

    if (req.method === 'DELETE' && segments.length === 4) {
      const payload = await readJsonBody(req).catch(() => ({}));
      const deleteData = Boolean(payload.deleteData);

      const { metadata, disk } = await assertDiskExists(diskId);

      const updatedMetadata = await updateMetadata((draft) => {
        delete draft.disks[diskId];
        return draft;
      });

      if (deleteData) {
        await deleteDiskFilesDir(disk);
      }

      if (canApplySamba(metadata.settings)) {
        await sambaManager.removeDisk(disk).catch((error) => {
          console.error('Failed to remove samba share:', error.message);
        });
      }
      if (updatedMetadata.settings.browseShareEnabled !== false && canApplySamba(metadata.settings)) {
        await sambaManager.applyRootShare(browseShareName(updatedMetadata.settings), smbShareRoot).catch((error) => {
          console.error('Failed to apply root share:', error.message);
        });
      }
      if (sftpManager.enabled) {
        if (shareUsesCentralizedAccess(disk)) {
          await sftpManager.applyCentralUsers(resolveCentralUsers(updatedMetadata, { protocolReadyOnly: true, enabledOnly: true }), Object.values(updatedMetadata.disks)).catch((error) => {
            console.error('Failed to re-apply centralized sftp config:', error.message);
          });
        } else {
          await sftpManager.removeDisk(disk, Object.values(updatedMetadata.disks)).catch((error) => {
            console.error('Failed to remove sftp drive config:', error.message);
          });
        }
      }

      appendLog({
        source: 'admin',
        level: 'info',
        host: requestClientHost(req),
        drive: diskId,
        message: `Deleted drive "${diskId}"`,
        path: url.pathname,
        method: req.method
      });

      sendNoContent(res);
      return;
    }
  }

  sendJson(res, 404, { error: 'Not found' });
}

async function handleApi(req, res, url) {
  await assertApiAuth(req);

  if (req.method === 'GET' && (url.pathname === '/api/disks' || url.pathname === '/api/shares')) {
    const metadata = await loadMetadata();
    const host = requestHost(req, metadata);
    sendJson(res, 200, {
      shares: Object.values(metadata.disks).map((disk) => diskForResponse(disk, metadata.settings, host, metadata)),
      disks: Object.values(metadata.disks).map((disk) => diskForResponse(disk, metadata.settings, host, metadata))
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/smb') {
    const metadata = await loadMetadata();
    const host = requestHost(req, metadata);
    const { serverWithPort } = normalizedServerWithPort(host, effectiveSmbPublicPort(metadata.settings), 445);
    sendJson(res, 200, {
      smbShareRoot,
      smbEnabled: isSmbFeatureEnabled(metadata.settings),
      browseShareEnabled: metadata.settings.browseShareEnabled !== false,
      browseShareName: browseShareName(metadata.settings),
      browseShareUrl: buildBrowseShareUrl(host, metadata.settings),
      rootShareName: metadata.settings.rootShareName,
      rootShareUrl: `smb://${serverWithPort}/${browseShareName(metadata.settings)}`,
      shares: Object.values(metadata.disks).map((disk) => diskForResponse(disk, metadata.settings, host, metadata)),
      disks: Object.values(metadata.disks).map((disk) => diskForResponse(disk, metadata.settings, host, metadata))
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/sftp') {
    const metadata = await loadMetadata();
    const host = requestHost(req, metadata);
    sendJson(res, 200, {
      ...sftpConnectionInfo(host, metadata.settings),
      shares: Object.values(metadata.disks).map((disk) => diskForResponse(disk, metadata.settings, host, metadata)),
      disks: Object.values(metadata.disks).map((disk) => diskForResponse(disk, metadata.settings, host, metadata))
    });
    return;
  }

  if (req.method === 'POST' && (url.pathname === '/api/disks' || url.pathname === '/api/shares')) {
    const payload = await readJsonBody(req);
    if (!payload.name || typeof payload.name !== 'string') {
      throw Object.assign(new Error('Field `name` is required'), { statusCode: 400 });
    }

    const metadataBefore = await loadMetadata();
    const now = new Date().toISOString();
    const diskId = payload.id || randomUUID();
    const storage = resolveStoragePath(payload, diskId, metadataBefore);
    if (storage.storageMode === 'cloud-mount' && storage.storageMountId && canManageMounts(metadataBefore.settings)) {
      await mountManager.ensureMount(storage.storageMountId);
    }

    const metadata = await updateMetadata((draft) => {
      if (draft.disks[diskId]) {
        throw Object.assign(new Error(`Disk id already exists: ${diskId}`), { statusCode: 409 });
      }

      draft.disks[diskId] = {
        id: diskId,
        name: payload.name,
        quotaGb: Number((payload.timeMachineQuotaGb ?? payload.quotaGb) || 0),
        timeMachineEnabled: payload.timeMachineEnabled === true,
        timeMachineQuotaGb: Number((payload.timeMachineQuotaGb ?? payload.quotaGb) || 0),
        accessMode: requestedAccessMode(payload, 'legacy-per-share'),
        accessPolicy: incomingAccessPolicy(payload, emptyAccessPolicy()),
        storageMode: storage.storageMode,
        storageMountId: storage.storageMountId || null,
        storageBasePath: storage.storageBasePath,
        storagePath: storage.storagePath,
        smbShareName: sanitizeShareName(payload.shareName || payload.smbShareName || `share-${diskId.slice(0, 6)}`),
        smbUsername: sanitizeUsername(payload.smbUsername || `tm_${diskId.slice(0, 8)}`),
        smbPassword: payload.smbPassword || randomPassword(),
        sftpUsername: sanitizeUsername(payload.sftpUsername || `sftp_${diskId.slice(0, 8)}`),
        sftpPassword: payload.sftpPassword || randomPassword(),
        createdAt: now,
        updatedAt: now,
        smbLastAppliedAt: null,
        smbLastAppliedError: null,
        sftpLastAppliedAt: null,
        sftpLastAppliedError: null
      };
      const sftpUserExists = Object.values(draft.disks).some((disk) => disk.id !== diskId && disk.sftpUsername === draft.disks[diskId].sftpUsername);
      if (sftpUserExists) {
        throw Object.assign(new Error(`SFTP username already in use: ${draft.disks[diskId].sftpUsername}`), { statusCode: 409 });
      }
      return draft;
    });

    const disk = metadata.disks[diskId];
    try {
      await ensureDiskStoragePathReady(disk, metadata.settings);
    } catch (error) {
      await updateMetadata((draft) => {
        delete draft.disks[diskId];
        return draft;
      }).catch(() => { });
      throw error;
    }

    if (payload.applySamba === true && canApplySamba(metadata.settings)) {
      await ensureDiskShareApplied(disk, metadata.settings, metadata);
    }
    if (payload.applySftp === true && isSftpFeatureEnabled(metadata.settings) && sftpManager.enabled) {
      await ensureDiskSftpApplied(disk, metadata);
    }

    appendLog({
      source: 'api',
      level: 'info',
      host: requestClientHost(req),
      drive: disk.id,
      message: `Created drive "${disk.id}" via API`,
      path: url.pathname,
      method: req.method
    });

    const share = diskForResponse(disk, metadata.settings, requestHost(req, metadata), metadata);
    sendJson(res, 201, { share, disk: share });
    return;
  }

  const segments = url.pathname.split('/').filter(Boolean);
  if (segments[0] === 'api' && ['disks', 'shares'].includes(segments[1]) && segments[2]) {
    const diskId = segments[2];

    if (req.method === 'DELETE' && segments.length === 3) {
      const payload = await readJsonBody(req).catch(() => ({}));
      const deleteData = payload.deleteData !== false;

      const { metadata, disk } = await assertDiskExists(diskId);
      const updatedMetadata = await updateMetadata((draft) => {
        delete draft.disks[diskId];
        return draft;
      });
      if (deleteData) {
        await deleteDiskFilesDir(disk);
      }
      if (canApplySamba(metadata.settings)) {
        await sambaManager.removeDisk(disk).catch(() => { });
        if (updatedMetadata.settings.browseShareEnabled !== false) {
          await sambaManager.applyRootShare(browseShareName(updatedMetadata.settings), smbShareRoot).catch(() => { });
        }
      }
      if (sftpManager.enabled) {
        if (shareUsesCentralizedAccess(disk)) {
          await sftpManager.applyCentralUsers(resolveCentralUsers(updatedMetadata, { protocolReadyOnly: true, enabledOnly: true }), Object.values(updatedMetadata.disks)).catch(() => { });
        } else {
          await sftpManager.removeDisk(disk, Object.values(updatedMetadata.disks)).catch(() => { });
        }
      }
      appendLog({
        source: 'api',
        level: 'info',
        host: requestClientHost(req),
        drive: diskId,
        message: `Deleted drive "${diskId}" via API`,
        path: url.pathname,
        method: req.method
      });
      sendNoContent(res);
      return;
    }

    if (req.method === 'GET' && segments.length === 4 && segments[3] === 'files') {
      const { metadata, disk } = await assertDiskExists(diskId);
      await ensureDiskStorageReady(disk, metadata.settings);
      const prefix = (url.searchParams.get('prefix') || '').replace(/^\/+/, '');
      const files = await listDiskFiles(disk, prefix);
      sendJson(res, 200, { files });
      return;
    }

    if (segments.length === 4 && segments[3] === 'file') {
      const { metadata, disk } = await assertDiskExists(diskId);
      await ensureDiskStorageReady(disk, metadata.settings);
      const relPath = normalizePathFromQuery(url);
      const diskFilesDir = await getDiskFilesPath(disk);
      const filePath = safeJoin(diskFilesDir, relPath);
      const mtimeMs = url.searchParams.get('mtimeMs');

      if (req.method === 'PUT') {
        await writeBinaryToFile(req, filePath, mtimeMs);
        await updateMetadata((draft) => {
          const current = draft.disks[diskId];
          if (current) {
            current.updatedAt = new Date().toISOString();
          }
          return draft;
        });
        appendLog({
          source: 'backup',
          level: 'info',
          host: requestClientHost(req),
          drive: diskId,
          message: `Wrote file "${relPath}"`,
          path: url.pathname,
          method: req.method
        });
        sendJson(res, 200, { ok: true });
        return;
      }

      if (req.method === 'GET') {
        const stream = createReadStream(filePath);
        stream.once('error', (error) => {
          handleError(res, error.code === 'ENOENT' ? Object.assign(new Error('File not found'), { statusCode: 404 }) : error);
        });
        res.writeHead(200, { 'content-type': 'application/octet-stream' });
        stream.pipe(res);
        return;
      }

      if (req.method === 'DELETE') {
        try {
          await unlink(filePath);
          appendLog({
            source: 'backup',
            level: 'info',
            host: requestClientHost(req),
            drive: diskId,
            message: `Deleted file "${relPath}"`,
            path: url.pathname,
            method: req.method
          });
          sendNoContent(res);
          return;
        } catch (error) {
          if (error.code === 'ENOENT') {
            sendNoContent(res);
            return;
          }
          throw error;
        }
      }
    }
  }

  sendJson(res, 404, { error: 'Not found' });
}

async function route(req, res, mode) {
  const url = parseUrl(req);

  if (req.method === 'GET' && url.pathname === '/health') {
    sendJson(res, 200, {
      ok: true,
      service: 'tm-adapter-vps',
      mode,
      date: new Date().toISOString(),
      samba: sambaManager.status(),
      mounts: mountManager.status()
    });
    return;
  }

  if (mode.adminApi && url.pathname.startsWith('/admin/api/')) {
    await handleAdminApi(req, res, url);
    return;
  }

  if (
    mode.dashboard &&
    (req.method === 'GET' || req.method === 'HEAD') &&
    url.pathname.startsWith('/admin')
  ) {
    await serveAdminStatic(res, url.pathname);
    return;
  }

  if (mode.publicApi && url.pathname.startsWith('/api/')) {
    await handleApi(req, res, url);
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
}

async function main() {
  await ensureDir(dataDir);
  await ensureDir(smbShareRoot);
  await ensureDir(adminWebRoot);
  await ensureRuntimeLogFiles();
  startTerminalGc();
  const metadata = await loadMetadata();
  assertPostgresConfigured(metadata.settings);
  const effectiveApiToken = resolveApiToken(metadata.settings);
  const effectiveAdminPassword = metadata.settings.adminPassword || adminPassword;

  if (effectiveApiToken === 'change-me') {
    console.warn('WARNING: VPS_API_TOKEN is using default value `change-me`. Set a secure token in production.');
  }

  if (effectiveAdminPassword === 'change-admin-password') {
    console.warn('WARNING: VPS_ADMIN_PASSWORD is using default value `change-admin-password`. Set a secure admin password.');
  }

  mountManager.setDefinitions(metadata.cloudMounts);
  await mountManager.start();

  if (canApplySamba(metadata.settings)) {
    if (metadata.settings.browseShareEnabled !== false) {
      await sambaManager.applyRootShare(browseShareName(metadata.settings), smbShareRoot).catch((error) => {
        console.error('Failed to apply root samba share:', error.message);
      });
    }
    await applyAllDiskSharesOnStartup(metadata).catch((error) => {
      console.error('Failed to apply samba shares on startup:', error.message);
    });
  }
  if (isSftpFeatureEnabled(metadata.settings) && sftpManager.enabled) {
    await applyAllDiskSftpOnStartup(metadata).catch((error) => {
      console.error('Failed to apply sftp drive config on startup:', error.message);
    });
  }

  const dashboardMode = {
    name: 'dashboard',
    dashboard: true,
    adminApi: true,
    publicApi: false
  };
  const adminApiMode = {
    name: 'admin-api',
    dashboard: false,
    adminApi: true,
    publicApi: true
  };

  const createHttpServer = (mode) =>
    createServer(async (req, res) => {
      let requestUrl = { pathname: '', searchParams: new URLSearchParams() };
      try {
        requestUrl = parseUrl(req);
      } catch {
        // Continue without request-level logging if URL parsing fails.
      }
      const startedAt = Date.now();
      const shouldLog = shouldLogRequest(requestUrl.pathname);

      if (shouldLog) {
        res.on('finish', () => {
          appendLog({
            source: 'http',
            level: levelFromStatus(res.statusCode),
            host: requestClientHost(req),
            drive: inferDriveId(requestUrl.pathname, requestUrl.searchParams),
            message: `${req.method} ${requestUrl.pathname} -> ${res.statusCode}`,
            path: requestUrl.pathname,
            method: req.method,
            status: res.statusCode,
            durationMs: Date.now() - startedAt
          });
        });
      }

      try {
        await route(req, res, mode);
      } catch (error) {
        handleError(res, error);
      }
    });

  const dashboardServer = createHttpServer(dashboardMode);

  dashboardServer.listen(dashboardPort, () => {
    console.log(`dashboard listening on http://0.0.0.0:${dashboardPort}/admin`);
    console.log(`data dir: ${dataDir}`);
    console.log(`smb share root: ${smbShareRoot}`);
  });

  const servers = [dashboardServer];
  if (adminApiPort !== dashboardPort) {
    const apiServer = createHttpServer(adminApiMode);
    apiServer.listen(adminApiPort, () => {
      console.log(`admin api listening on http://0.0.0.0:${adminApiPort}/admin/api`);
      console.log(`public api listening on http://0.0.0.0:${adminApiPort}/api`);
    });
    servers.push(apiServer);
  } else {
    console.log(`admin api listening on http://0.0.0.0:${dashboardPort}/admin/api`);
    console.log(`public api listening on http://0.0.0.0:${dashboardPort}/api`);
  }

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    if (terminalGcTimer) {
      clearInterval(terminalGcTimer);
      terminalGcTimer = null;
    }
    for (const sessionId of [...terminalSessions.keys()]) {
      closeTerminalSession(sessionId);
    }
    for (const subscriber of [...logSubscribers]) {
      clearInterval(subscriber.heartbeat);
      subscriber.res.end();
      logSubscribers.delete(subscriber);
    }
    await postgresSettingsStore.close().catch(() => { });
    await mountManager.stop().catch(() => { });
    await Promise.all(
      servers.map(
        (server) =>
          new Promise((resolve) => {
            server.close(() => resolve());
          })
      )
    );
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
