import { createReadStream, createWriteStream } from 'node:fs';
import { readFile, unlink, utimes } from 'node:fs/promises';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { dirname, extname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';

import { ensureDir, safeJoin, walkFiles } from '../shared/fsUtils.mjs';
import { handleError, parseUrl, readJsonBody, sendJson, sendNoContent } from '../shared/http.mjs';
import { JsonStore } from '../shared/jsonStore.mjs';
import { SambaManager } from './sambaManager.mjs';
import { CloudMountManager } from './cloudMountManager.mjs';

const legacyPort = process.env.VPS_PORT ? Number(process.env.VPS_PORT) : null;
const dashboardPort = Number(process.env.VPS_ADMIN_DASHBOARD_PORT || legacyPort || 8787);
const adminApiPort = Number(process.env.VPS_ADMIN_API_PORT || legacyPort || 8788);
const dataDir = process.env.VPS_DATA_DIR || join(process.cwd(), 'data', 'vps');
const adminWebRoot = process.env.VPS_ADMIN_WEB_ROOT || join(process.cwd(), 'web', 'vps-public');
const smbShareRoot = process.env.VPS_SMB_SHARE_ROOT || join(dataDir, 'smb-share');
const smbPublicPort = Number(process.env.VPS_SMB_PUBLIC_PORT || 445);
const smbPublicPortFromEnv = process.env.VPS_SMB_PUBLIC_PORT !== undefined && process.env.VPS_SMB_PUBLIC_PORT !== '';
const apiToken = process.env.VPS_API_TOKEN || 'change-me';
const adminUsername = process.env.VPS_ADMIN_USERNAME || 'admin';
const adminPassword = process.env.VPS_ADMIN_PASSWORD || 'change-admin-password';
const adminSessionSeconds = Number(process.env.VPS_ADMIN_SESSION_SECONDS || 43200);
const cookieName = 'tm_admin_session';

const metadataStore = new JsonStore(join(dataDir, 'metadata.json'), {
  version: 3,
  settings: {
    hostname: '',
    rootShareName: 'timemachine',
    smbPublicPort,
    setupCompleted: false,
    adminUsername: '',
    adminPassword: ''
  },
  cloudMounts: {},
  disks: {}
});

const sambaManager = new SambaManager();
const mountManager = new CloudMountManager();
const sessions = new Map();

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
        version: 3,
        settings: { hostname: '', rootShareName: 'timemachine', smbPublicPort, setupCompleted: false, adminUsername: '', adminPassword: '' },
        cloudMounts: {},
        disks: {}
      },
      changed: true
    };
  }

  if (!metadata.settings || typeof metadata.settings !== 'object') {
    metadata.settings = { hostname: '', rootShareName: 'timemachine', setupCompleted: false, adminUsername: '', adminPassword: '' };
    changed = true;
  } else {
    if (metadata.settings.hostname === undefined) {
      metadata.settings.hostname = '';
      changed = true;
    }
    if (!metadata.settings.rootShareName) {
      metadata.settings.rootShareName = 'timemachine';
      changed = true;
    }
    if (!Number.isFinite(Number(metadata.settings.smbPublicPort))) {
      metadata.settings.smbPublicPort = smbPublicPort;
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
        storageMode: 'local',
        storageBasePath: smbShareRoot,
        storagePath: safeJoin(smbShareRoot, diskId),
        smbShareName: sanitizeShareName(`tm-${diskId}`),
        smbUsername: sanitizeUsername(`tm_${diskId.slice(0, 8)}`),
        smbPassword: randomPassword(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        smbLastAppliedAt: null,
        smbLastAppliedError: null
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
  }

  if (!metadata.version || metadata.version < 3) {
    // Pre-existing installs with drives already configured skip the setup wizard automatically.
    if (Object.keys(metadata.disks || {}).length > 0 && !metadata.settings.setupCompleted) {
      metadata.settings.setupCompleted = true;
      changed = true;
    }
    metadata.version = 3;
    changed = true;
  }

  return { metadata, changed };
}

async function loadMetadata() {
  const raw = await metadataStore.load();
  const { metadata, changed } = normalizeMetadataShape(raw);
  if (changed) {
    await metadataStore.save(metadata);
  }
  mountManager.setDefinitions(metadata.cloudMounts);
  return metadata;
}

async function updateMetadata(updateFn) {
  const updated = await metadataStore.update((draft) => {
    const normalized = normalizeMetadataShape(draft).metadata;
    return updateFn(normalized);
  });
  mountManager.setDefinitions(updated.cloudMounts);
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

function setSessionCookie(res, token) {
  const maxAge = Math.max(60, adminSessionSeconds);
  res.setHeader('Set-Cookie', `${cookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${cookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
}

function createSession(user = adminUsername) {
  const token = newSessionToken();
  const expiresAt = Date.now() + adminSessionSeconds * 1000;
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

function assertApiAuth(req) {
  const expected = `Bearer ${apiToken}`;
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

function buildSmbUrls(host, settings, disk) {
  const server = host || '<server>';
  const port = effectiveSmbPublicPort(settings);
  const needsIpv6Brackets = server.includes(':') && !server.startsWith('[');
  const normalizedServer = needsIpv6Brackets ? `[${server}]` : server;
  const serverWithPort = port === 445 ? normalizedServer : `${normalizedServer}:${port}`;
  return {
    rootShareUrl: `smb://${serverWithPort}/${settings.rootShareName}`,
    diskShareUrl: `smb://${serverWithPort}/${disk.smbShareName}`,
    rootSubdirUrl: `smb://${serverWithPort}/${settings.rootShareName}/${disk.id}`
  };
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

function diskForResponse(disk, settings, host) {
  return {
    ...disk,
    ...buildSmbUrls(host, settings, disk)
  };
}

function hasSambaDiskConfig(disk) {
  return Boolean(
    disk &&
    typeof disk.smbShareName === 'string' &&
    disk.smbShareName &&
    typeof disk.smbUsername === 'string' &&
    disk.smbUsername &&
    typeof disk.smbPassword === 'string' &&
    disk.smbPassword &&
    typeof disk.storagePath === 'string' &&
    disk.storagePath
  );
}

async function ensureDiskShareApplied(disk, settings) {
  if (!hasSambaDiskConfig(disk)) {
    throw new Error(`Disk ${disk?.id || '<unknown>'} is missing SMB configuration fields`);
  }
  const result = await sambaManager.applyDisk(disk);
  const rootResult = await sambaManager.applyRootShare(settings.rootShareName, smbShareRoot);
  return { disk: result, root: rootResult };
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
      await ensureDiskStoragePathReady(disk);
      const result = await sambaManager.applyDisk(disk);
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

async function getDiskFilesPath(disk) {
  return disk.storagePath;
}

async function ensureDiskStorageReady(disk) {
  if (disk.storageMode === 'cloud-mount' && disk.storageMountId) {
    await mountManager.ensureMount(disk.storageMountId);
  }
}

function isIoError(error) {
  return error?.code === 'EIO' || /\bi\/o error\b/i.test(String(error?.message || ''));
}

async function ensureDiskStoragePathReady(disk) {
  const cloudMountId = disk.storageMode === 'cloud-mount' ? disk.storageMountId : null;
  if (cloudMountId) {
    await mountManager.ensureMount(cloudMountId);
  }

  try {
    await ensureDir(disk.storagePath);
    return;
  } catch (error) {
    if (!cloudMountId || !isIoError(error)) {
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
    const raw = await metadataStore.load();
    const { metadata } = normalizeMetadataShape(raw);
    return {
      username: metadata.settings.adminUsername || adminUsername,
      password: metadata.settings.adminPassword || adminPassword
    };
  } catch {
    return { username: adminUsername, password: adminPassword };
  }
}

async function handleAdminApi(req, res, url) {
  if (req.method === 'POST' && url.pathname === '/admin/api/login') {
    const payload = await readJsonBody(req);
    const creds = await getEffectiveAdminCreds();
    const isValid = timingSafeStringEqual(payload.username || '', creds.username) && timingSafeStringEqual(payload.password || '', creds.password);

    if (!isValid) {
      throw Object.assign(new Error('Invalid credentials'), { statusCode: 401 });
    }

    const token = createSession(creds.username);
    setSessionCookie(res, token);
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

  if (req.method === 'GET' && url.pathname === '/admin/api/samba/status') {
    sendJson(res, 200, sambaManager.status());
    return;
  }

  if (req.method === 'GET' && url.pathname === '/admin/api/state') {
    const metadata = await loadMetadata();
    const host = requestHost(req, metadata);
    const mountStatusById = new Map(mountManager.status().mounts.map((mount) => [mount.id, mount]));
    const { settings } = metadata;

    sendJson(res, 200, {
      settings: {
        hostname: settings.hostname,
        rootShareName: settings.rootShareName,
        smbPublicPort: effectiveSmbPublicPort(settings),
        setupCompleted: settings.setupCompleted === true
      },
      samba: sambaManager.status(),
      mounts: Object.values(metadata.cloudMounts).map((mount) => ({
        ...mount,
        runtime: mountStatusById.get(mount.id) || null
      })),
      mountManager: mountManager.status(),
      disks: Object.values(metadata.disks).map((disk) => diskForResponse(disk, metadata.settings, host))
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/admin/api/setup') {
    const payload = await readJsonBody(req);

    if (payload.adminPassword && String(payload.adminPassword).length < 8) {
      throw Object.assign(new Error('Admin password must be at least 8 characters'), { statusCode: 400 });
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
      if (payload.rootShareName) {
        draft.settings.rootShareName = sanitizeShareName(payload.rootShareName);
      }
      if (payload.smbPublicPort !== undefined) {
        draft.settings.smbPublicPort = Number(payload.smbPublicPort || 445);
      }
      if (payload.markSetupComplete !== false) {
        draft.settings.setupCompleted = true;
      }
      return draft;
    });

    if (payload.applySamba !== false) {
      await sambaManager.applyRootShare(metadata.settings.rootShareName, smbShareRoot);
    }

    sendJson(res, 200, {
      ok: true,
      settings: {
        hostname: metadata.settings.hostname,
        rootShareName: metadata.settings.rootShareName,
        smbPublicPort: effectiveSmbPublicPort(metadata.settings),
        setupCompleted: true
      }
    });
    return;
  }

  if (req.method === 'PUT' && url.pathname === '/admin/api/settings') {
    const payload = await readJsonBody(req);
    const metadata = await updateMetadata((draft) => {
      draft.settings.hostname = payload.hostname ?? draft.settings.hostname;
      if (payload.rootShareName) {
        draft.settings.rootShareName = sanitizeShareName(payload.rootShareName);
      }
      if (payload.smbPublicPort !== undefined) {
        draft.settings.smbPublicPort = Number(payload.smbPublicPort || 445);
      }
      return draft;
    });

    if (payload.applySamba !== false) {
      await sambaManager.applyRootShare(metadata.settings.rootShareName, smbShareRoot);
    }

    sendJson(res, 200, { settings: metadata.settings });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/admin/api/mounts') {
    const metadata = await loadMetadata();
    const runtimeById = new Map(mountManager.status().mounts.map((mount) => [mount.id, mount]));
    const mounts = Object.values(metadata.cloudMounts).map((mount) => ({
      ...mount,
      runtime: runtimeById.get(mount.id) || null
    }));
    sendJson(res, 200, { mounts, manager: mountManager.status() });
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
    if (payload.ensureMounted !== false) {
      try {
        const result = await mountManager.ensureMount(mountId);
        ensure = { ok: true, result };
      } catch (error) {
        ensure = { ok: false, error: error.message };
      }
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
        await mountManager.ensureMount(mountId);
      }

      sendJson(res, 200, { mount: metadata.cloudMounts[mountId], runtime: mountManager.status() });
      return;
    }

    if (req.method === 'POST' && mountSegments.length === 5 && mountSegments[4] === 'ensure') {
      const result = await mountManager.ensureMount(mountId);
      sendJson(res, 200, { result, runtime: mountManager.status() });
      return;
    }

    if (req.method === 'POST' && mountSegments.length === 5 && mountSegments[4] === 'unmount') {
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

  if (req.method === 'POST' && url.pathname === '/admin/api/disks') {
    const payload = await readJsonBody(req);
    if (!payload.name || typeof payload.name !== 'string') {
      throw Object.assign(new Error('Field `name` is required'), { statusCode: 400 });
    }

    const metadataBefore = await loadMetadata();
    const now = new Date().toISOString();
    const diskId = payload.id || randomUUID();
    const storage = resolveStoragePath(payload, diskId, metadataBefore);
    if (storage.storageMode === 'cloud-mount' && storage.storageMountId) {
      await mountManager.ensureMount(storage.storageMountId);
    }

    const metadata = await updateMetadata((draft) => {
      if (draft.disks[diskId]) {
        throw Object.assign(new Error(`Disk id already exists: ${diskId}`), { statusCode: 409 });
      }

      const shareName = sanitizeShareName(payload.shareName || `tm-${payload.name}-${diskId.slice(0, 6)}`);
      const shareExists = Object.values(draft.disks).some((disk) => disk.smbShareName === shareName);
      if (shareExists) {
        throw Object.assign(new Error(`Share name already in use: ${shareName}`), { statusCode: 409 });
      }

      draft.disks[diskId] = {
        id: diskId,
        name: payload.name,
        quotaGb: Number(payload.quotaGb || 0),
        storageMode: storage.storageMode,
        storageMountId: storage.storageMountId || null,
        storageBasePath: storage.storageBasePath,
        storagePath: storage.storagePath,
        smbShareName: shareName,
        smbUsername: sanitizeUsername(payload.smbUsername || `tm_${diskId.slice(0, 8)}`),
        smbPassword: payload.smbPassword || randomPassword(),
        createdAt: now,
        updatedAt: now,
        smbLastAppliedAt: null,
        smbLastAppliedError: null
      };

      return draft;
    });

    const disk = metadata.disks[diskId];
    try {
      await ensureDiskStoragePathReady(disk);
    } catch (error) {
      await updateMetadata((draft) => {
        delete draft.disks[diskId];
        return draft;
      }).catch(() => { });
      throw error;
    }

    if (payload.applySamba !== false) {
      const applyResult = await ensureDiskShareApplied(disk, metadata.settings);
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

    sendJson(res, 201, { disk: diskForResponse(disk, metadata.settings, requestHost(req, metadata)) });
    return;
  }

  const segments = url.pathname.split('/').filter(Boolean);
  if (segments[0] === 'admin' && segments[1] === 'api' && segments[2] === 'disks' && segments[3]) {
    const diskId = segments[3];

    if (req.method === 'PUT' && segments.length === 4) {
      const payload = await readJsonBody(req);
      const metadata = await updateMetadata((draft) => {
        const disk = draft.disks[diskId];
        if (!disk) {
          throw Object.assign(new Error(`Unknown disk id: ${diskId}`), { statusCode: 404 });
        }

        if (payload.name !== undefined) {
          disk.name = payload.name;
        }
        if (payload.quotaGb !== undefined) {
          disk.quotaGb = Number(payload.quotaGb || 0);
        }
        if (payload.smbShareName !== undefined) {
          const nextShare = sanitizeShareName(payload.smbShareName);
          const shareExists = Object.values(draft.disks).some((other) => other.id !== diskId && other.smbShareName === nextShare);
          if (shareExists) {
            throw Object.assign(new Error(`Share name already in use: ${nextShare}`), { statusCode: 409 });
          }
          disk.smbShareName = nextShare;
        }
        if (payload.smbUsername !== undefined) {
          disk.smbUsername = sanitizeUsername(payload.smbUsername);
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
      if (disk.storageMode === 'cloud-mount' && disk.storageMountId) {
        await mountManager.ensureMount(disk.storageMountId);
      }
      await ensureDiskStoragePathReady(disk);
      if (payload.applySamba !== false) {
        await ensureDiskShareApplied(disk, metadata.settings);
      }

      sendJson(res, 200, { disk: diskForResponse(disk, metadata.settings, requestHost(req, metadata)) });
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
      const result = await ensureDiskShareApplied(disk, metadata.settings);
      await updateMetadata((draft) => {
        const current = draft.disks[diskId];
        if (!current) {
          return draft;
        }
        current.smbLastAppliedAt = new Date().toISOString();
        current.smbLastAppliedError = result.disk.applied ? null : result.disk.reason || 'Not applied';
        return draft;
      });

      sendJson(res, 200, {
        ok: true,
        smbUsername: disk.smbUsername,
        smbPassword: nextPassword,
        applied: result
      });
      return;
    }

    if (req.method === 'POST' && segments.length === 5 && segments[4] === 'apply-samba') {
      const { metadata, disk } = await assertDiskExists(diskId);
      const result = await ensureDiskShareApplied(disk, metadata.settings);
      await updateMetadata((draft) => {
        const current = draft.disks[diskId];
        if (!current) {
          return draft;
        }
        current.smbLastAppliedAt = new Date().toISOString();
        current.smbLastAppliedError = result.disk.applied ? null : result.disk.reason || 'Not applied';
        return draft;
      });
      sendJson(res, 200, { result });
      return;
    }

    if (req.method === 'DELETE' && segments.length === 4) {
      const payload = await readJsonBody(req).catch(() => ({}));
      const deleteData = Boolean(payload.deleteData);

      const { metadata, disk } = await assertDiskExists(diskId);

      await updateMetadata((draft) => {
        delete draft.disks[diskId];
        return draft;
      });

      if (deleteData) {
        await deleteDiskFilesDir(disk);
      }

      await sambaManager.removeDisk(disk).catch((error) => {
        console.error('Failed to remove samba share:', error.message);
      });
      await sambaManager.applyRootShare(metadata.settings.rootShareName, smbShareRoot).catch((error) => {
        console.error('Failed to apply root share:', error.message);
      });

      sendNoContent(res);
      return;
    }
  }

  sendJson(res, 404, { error: 'Not found' });
}

async function handleApi(req, res, url) {
  assertApiAuth(req);

  if (req.method === 'GET' && url.pathname === '/api/disks') {
    const metadata = await loadMetadata();
    sendJson(res, 200, {
      disks: Object.values(metadata.disks)
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/smb') {
    const metadata = await loadMetadata();
    const host = requestHost(req, metadata);
    const port = effectiveSmbPublicPort(metadata.settings);
    const hostWithPort = port === 445 ? (host || '<server>') : `${host || '<server>'}:${port}`;
    sendJson(res, 200, {
      smbShareRoot,
      rootShareName: metadata.settings.rootShareName,
      rootShareUrl: `smb://${hostWithPort}/${metadata.settings.rootShareName}`,
      disks: Object.values(metadata.disks).map((disk) => diskForResponse(disk, metadata.settings, host))
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/disks') {
    const payload = await readJsonBody(req);
    if (!payload.name || typeof payload.name !== 'string') {
      throw Object.assign(new Error('Field `name` is required'), { statusCode: 400 });
    }

    const metadataBefore = await loadMetadata();
    const now = new Date().toISOString();
    const diskId = payload.id || randomUUID();
    const storage = resolveStoragePath(payload, diskId, metadataBefore);
    if (storage.storageMode === 'cloud-mount' && storage.storageMountId) {
      await mountManager.ensureMount(storage.storageMountId);
    }

    const metadata = await updateMetadata((draft) => {
      if (draft.disks[diskId]) {
        throw Object.assign(new Error(`Disk id already exists: ${diskId}`), { statusCode: 409 });
      }

      draft.disks[diskId] = {
        id: diskId,
        name: payload.name,
        quotaGb: Number(payload.quotaGb || 0),
        storageMode: storage.storageMode,
        storageMountId: storage.storageMountId || null,
        storageBasePath: storage.storageBasePath,
        storagePath: storage.storagePath,
        smbShareName: sanitizeShareName(payload.shareName || `tm-${diskId.slice(0, 6)}`),
        smbUsername: sanitizeUsername(payload.smbUsername || `tm_${diskId.slice(0, 8)}`),
        smbPassword: payload.smbPassword || randomPassword(),
        createdAt: now,
        updatedAt: now,
        smbLastAppliedAt: null,
        smbLastAppliedError: null
      };
      return draft;
    });

    const disk = metadata.disks[diskId];
    try {
      await ensureDiskStoragePathReady(disk);
    } catch (error) {
      await updateMetadata((draft) => {
        delete draft.disks[diskId];
        return draft;
      }).catch(() => { });
      throw error;
    }

    if (payload.applySamba === true) {
      await ensureDiskShareApplied(disk, metadata.settings);
    }

    sendJson(res, 201, { disk });
    return;
  }

  const segments = url.pathname.split('/').filter(Boolean);
  if (segments[0] === 'api' && segments[1] === 'disks' && segments[2]) {
    const diskId = segments[2];

    if (req.method === 'DELETE' && segments.length === 3) {
      const payload = await readJsonBody(req).catch(() => ({}));
      const deleteData = payload.deleteData !== false;

      const { disk } = await assertDiskExists(diskId);
      await updateMetadata((draft) => {
        delete draft.disks[diskId];
        return draft;
      });
      if (deleteData) {
        await deleteDiskFilesDir(disk);
      }
      sendNoContent(res);
      return;
    }

    if (req.method === 'GET' && segments.length === 4 && segments[3] === 'files') {
      const { disk } = await assertDiskExists(diskId);
      await ensureDiskStorageReady(disk);
      const prefix = (url.searchParams.get('prefix') || '').replace(/^\/+/, '');
      const files = await listDiskFiles(disk, prefix);
      sendJson(res, 200, { files });
      return;
    }

    if (segments.length === 4 && segments[3] === 'file') {
      const { disk } = await assertDiskExists(diskId);
      await ensureDiskStorageReady(disk);
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
  const metadata = await loadMetadata();

  if (apiToken === 'change-me') {
    console.warn('WARNING: VPS_API_TOKEN is using default value `change-me`. Set a secure token in production.');
  }

  if (adminPassword === 'change-admin-password') {
    console.warn('WARNING: VPS_ADMIN_PASSWORD is using default value `change-admin-password`. Set a secure admin password.');
  }

  mountManager.setDefinitions(metadata.cloudMounts);
  await mountManager.start();

  if (sambaManager.enabled) {
    await sambaManager.applyRootShare(metadata.settings.rootShareName, smbShareRoot).catch((error) => {
      console.error('Failed to apply root samba share:', error.message);
    });
    await applyAllDiskSharesOnStartup(metadata).catch((error) => {
      console.error('Failed to apply samba shares on startup:', error.message);
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
