import { readFile } from 'node:fs/promises';

import { ensureDir } from '../shared/fsUtils.mjs';
import { runCommand } from '../shared/commands.mjs';

function toBool(value, fallback = false) {
  if (value === undefined || value === null) {
    return fallback;
  }
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function toPositiveInt(value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
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

function normalizeCachePolicy(policy = {}) {
  return {
    enabled: policy?.enabled !== false,
    writeBackSeconds: toPositiveInt(policy?.writeBackSeconds, 120, { min: 5, max: 86400 }),
    maxSizeGb: toPositiveInt(policy?.maxSizeGb, 1, { min: 1, max: 10240 }),
    maxAgeHours: toPositiveInt(policy?.maxAgeHours, 24, { min: 1, max: 720 }),
    readAheadMb: toPositiveInt(policy?.readAheadMb, 16, { min: 1, max: 2048 })
  };
}

function normalizeCacheDir(value, fallback = '/data/vps/rclone-vfs-cache') {
  const next = String(value || '').trim();
  if (!next) {
    return fallback;
  }
  return next.replace(/[\\\r\n\t\0]/g, '');
}

function isCommandNotFound(error) {
  return error?.code === 'ENOENT' || /spawn .* ENOENT/i.test(String(error?.message || ''));
}

function withMissingCommandHint(error, command) {
  if (!isCommandNotFound(error)) {
    return error;
  }
  const hinted = new Error(
    `Command not found: ${command}. Install rclone and ensure it is on PATH, or set rcloneBinary to an absolute path.`
  );
  hinted.code = error.code;
  hinted.cause = error;
  return hinted;
}

function trimSlash(input) {
  return String(input || '').replace(/^\/+|\/+$/g, '');
}

function encodeRcloneOption(value) {
  return String(value).replace(/,/g, '\\,').replace(/:/g, '\\:');
}

function normalizeS3Endpoint(endpoint) {
  return String(endpoint || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/g, '');
}

function buildS3RemoteSpec(mount) {
  const bucket = trimSlash(mount.bucket);
  if (!bucket) {
    throw new Error('S3 mount requires `bucket`');
  }

  if (!mount.accessKeyId || !mount.secretAccessKey) {
    throw new Error('S3 mount requires `accessKeyId` and `secretAccessKey`');
  }

  const provider = encodeRcloneOption(mount.s3Provider || 'AWS');
  const region = encodeRcloneOption(mount.region || 'us-east-1');
  const normalizedEndpoint = normalizeS3Endpoint(mount.endpoint);
  const endpoint = normalizedEndpoint ? `,endpoint=${encodeRcloneOption(normalizedEndpoint)}` : '';
  const accessKeyId = encodeRcloneOption(mount.accessKeyId);
  const secretAccessKey = encodeRcloneOption(mount.secretAccessKey);
  const prefix = trimSlash(mount.prefix || '');

  const remoteConfig = `:s3,provider=${provider},env_auth=false,access_key_id=${accessKeyId},secret_access_key=${secretAccessKey},region=${region}${endpoint}:`;
  return `${remoteConfig}${bucket}${prefix ? `/${prefix}` : ''}`;
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

function normalizeProvider(value) {
  const provider = String(value || 'rclone').toLowerCase();
  if (provider === 's3') {
    return 's3';
  }
  if (provider === 'gdrive' || provider === 'googledrive' || provider === 'google-drive') {
    return 'google-drive';
  }
  if (provider === 'onedrive') {
    return 'onedrive';
  }
  return 'rclone';
}

function redactSensitive(input, mount) {
  let output = String(input || '');
  if (mount?.secretAccessKey) {
    output = output.split(String(mount.secretAccessKey)).join('********');
  }
  if (mount?.accessKeyId) {
    output = output.split(String(mount.accessKeyId)).join('********');
  }
  output = output
    .replace(/secret_access_key=[^,\s:]+/gi, 'secret_access_key=********')
    .replace(/access_key_id=[^,\s:]+/gi, 'access_key_id=********');
  return output;
}

function withMountTroubleshooting(error, mount, command) {
  const baseMessage = redactSensitive(error?.message, mount);
  const hints = [];

  if (/daemon timed out|daemon exited with error code/i.test(baseMessage)) {
    hints.push('Run mount without --daemon and with -vv to inspect the real FUSE/mount error.');
  }

  if (/InvalidAccessKeyId|SignatureDoesNotMatch|AccessDenied|NoCredentialProviders|403\b/i.test(baseMessage)) {
    hints.push('S3 auth hint: verify access key, secret key, bucket, endpoint, and region.');
  }

  if (String(mount?.provider || '').toLowerCase() === 's3' && String(mount?.s3Provider || '').toLowerCase() === 'cloudflare') {
    const endpoint = mount?.endpoint || '<empty>';
    const region = mount?.region || '<empty>';
    hints.push(
      `Cloudflare R2 hint: endpoint should be https://<account-id>.r2.cloudflarestorage.com (current: ${endpoint}), region is usually auto (current: ${region}).`
    );
  }

  if (hints.length === 0) {
    const sanitized = new Error(baseMessage);
    sanitized.code = error?.code;
    sanitized.stdout = redactSensitive(error?.stdout, mount);
    sanitized.stderr = redactSensitive(error?.stderr, mount);
    sanitized.cause = error;
    return sanitized;
  }

  const finalError = new Error(
    `${baseMessage}\nHints:\n${hints.map((entry) => `- ${entry}`).join('\n')}\nMount: ${mount?.id || '<unknown>'} -> ${mount?.mountPath || '<unknown>'}\nCommand: ${command}`
  );
  finalError.code = error?.code;
  finalError.stdout = redactSensitive(error?.stdout, mount);
  finalError.stderr = redactSensitive(error?.stderr, mount);
  finalError.cause = error;
  return finalError;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class CloudMountManager {
  constructor() {
    this.enabled = toBool(process.env.VPS_MOUNT_MANAGE_ENABLED, true);
    this.pollSeconds = Math.max(10, Number(process.env.VPS_MOUNT_POLL_SECONDS || 30));
    this.cacheDir = normalizeCacheDir(process.env.VPS_RCLONE_CACHE_DIR, '/data/vps/rclone-vfs-cache');
    this.cachePolicy = normalizeCachePolicy();
    this.cacheGeneration = 1;
    this.mounts = new Map();
    this.timer = null;
  }

  status() {
    return {
      enabled: this.enabled,
      pollSeconds: this.pollSeconds,
      cacheDir: this.cacheDir,
      cachePolicy: this.cachePolicy,
      mounts: Array.from(this.mounts.values()).map((entry) => ({
        id: entry.id,
        name: entry.name,
        provider: entry.provider,
        remotePath: entry.remotePath,
        mountPath: entry.mountPath,
        enabled: entry.enabled !== false,
        lastCheckedAt: entry.lastCheckedAt || null,
        lastMountedAt: entry.lastMountedAt || null,
        lastError: entry.lastError || null,
        lastStatus: entry.lastStatus || 'unknown'
      }))
    };
  }

  setDefinitions(definitions = {}) {
    const next = new Map();
    for (const [id, definition] of Object.entries(definitions)) {
      const previous = this.mounts.get(id);
      next.set(id, {
        id,
        ...definition,
        lastCheckedAt: previous?.lastCheckedAt || null,
        lastMountedAt: previous?.lastMountedAt || null,
        lastError: previous?.lastError || null,
        lastStatus: previous?.lastStatus || 'unknown',
        lastCacheGeneration: previous?.lastCacheGeneration || 0
      });
    }
    this.mounts = next;
  }

  setCachePolicy(policy = {}) {
    const normalized = normalizeCachePolicy(policy);
    const changed = JSON.stringify(normalized) !== JSON.stringify(this.cachePolicy);
    this.cachePolicy = normalized;
    if (changed) {
      this.cacheGeneration += 1;
    }
  }

  setCacheDir(dirPath) {
    const normalized = normalizeCacheDir(dirPath, this.cacheDir);
    if (normalized === this.cacheDir) {
      return false;
    }
    this.cacheDir = normalized;
    this.cacheGeneration += 1;
    return true;
  }

  setPollSeconds(value) {
    const next = toPositiveInt(value, this.pollSeconds, { min: 10, max: 86400 });
    if (next === this.pollSeconds) {
      return false;
    }
    this.pollSeconds = next;
    if (this.timer) {
      this.startPollLoop();
    }
    return true;
  }

  startPollLoop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.timer = setInterval(() => {
      this.ensureAll().catch((error) => {
        console.error('[mount-manager] ensureAll failed:', error.message);
      });
    }, this.pollSeconds * 1000);
  }

  async start() {
    if (!this.enabled) {
      return;
    }

    await this.ensureAll();
    this.startPollLoop();
  }

  async stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async ensureAll() {
    if (!this.enabled) {
      return;
    }

    for (const mountId of this.mounts.keys()) {
      await this.ensureMount(mountId);
    }
  }

  async ensureMount(mountId, options = {}) {
    const { allowRepair = true } = options;
    const mount = this.mounts.get(mountId);
    if (!mount) {
      throw new Error(`Unknown cloud mount id: ${mountId}`);
    }

    mount.lastCheckedAt = new Date().toISOString();

    if (mount.enabled === false) {
      mount.lastStatus = 'disabled';
      return { ok: true, mounted: false, reason: 'disabled' };
    }

    if (!mount.mountPath) {
      throw new Error(`Mount ${mountId} must define mountPath`);
    }

    await ensureDir(mount.mountPath);

    const alreadyMounted = await this.isMounted(mount.mountPath);
    if (alreadyMounted) {
      const cachePolicyChanged = (mount.lastCacheGeneration || 0) !== this.cacheGeneration;
      if (cachePolicyChanged && allowRepair) {
        await this.unmount(mountId).catch(() => { });
        return this.ensureMount(mountId, { allowRepair: false });
      }

      const health = await this.checkMountHealth(mount.mountPath);
      if (!health.ok) {
        const healthError = withMountTroubleshooting(
          health.error,
          mount,
          `ls -la ${shellQuote(mount.mountPath)}`
        );

        mount.lastStatus = 'error';
        mount.lastError = `Mounted but unhealthy: ${healthError.message}`;

        if (!allowRepair) {
          throw healthError;
        }

        await this.unmount(mountId).catch(() => { });
        return this.ensureMount(mountId, { allowRepair: false });
      }

      mount.lastStatus = 'mounted';
      mount.lastError = null;
      mount.lastCacheGeneration = this.cacheGeneration;
      return { ok: true, mounted: true, alreadyMounted: true };
    }

    const { command, args, cacheDir } = this.buildMountCommand(mount);
    if (cacheDir) {
      await ensureDir(cacheDir);
    }

    try {
      await runCommand(command, args);
      await wait(1000);

      const mountedNow = await this.isMounted(mount.mountPath);
      if (!mountedNow) {
        throw new Error('Mount command completed but mount path is not active');
      }

      const health = await this.checkMountHealth(mount.mountPath);
      if (!health.ok) {
        throw health.error;
      }

      mount.lastStatus = 'mounted';
      mount.lastError = null;
      mount.lastMountedAt = new Date().toISOString();
      mount.lastCacheGeneration = this.cacheGeneration;
      return { ok: true, mounted: true, alreadyMounted: false };
    } catch (error) {
      const finalError = withMountTroubleshooting(withMissingCommandHint(error, command), mount, command);
      mount.lastStatus = 'error';
      mount.lastError = finalError.message;
      throw finalError;
    }
  }

  async unmount(mountId) {
    const mount = this.mounts.get(mountId);
    if (!mount) {
      throw new Error(`Unknown cloud mount id: ${mountId}`);
    }

    const mounted = await this.isMounted(mount.mountPath);
    if (!mounted) {
      mount.lastStatus = 'unmounted';
      return { ok: true, unmounted: true, alreadyUnmounted: true };
    }

    const script = mount.unmountCommand
      ? mount.unmountCommand
      : `fusermount -u ${shellQuote(mount.mountPath)} || umount ${shellQuote(mount.mountPath)}`;

    await runCommand('sh', ['-lc', script]);

    mount.lastStatus = 'unmounted';
    mount.lastError = null;
    return { ok: true, unmounted: true };
  }

  buildMountCommand(mount) {
    if (Array.isArray(mount.command) && mount.command.length >= 2) {
      return {
        command: mount.command[0],
        args: mount.command.slice(1)
      };
    }

    const provider = normalizeProvider(mount.provider || 'rclone');
    const rcloneBinary = mount.rcloneBinary || process.env.VPSD_RCLONE_BINARY || 'rclone';
    const extraArgs = Array.isArray(mount.extraArgs) ? mount.extraArgs : [];
    const cachePolicy = this.cachePolicy || normalizeCachePolicy();
    const effectiveCacheMode = cachePolicy.enabled ? 'full' : 'off';
    let remotePath = mount.remotePath || defaultRemotePathForProvider(provider);
    if (provider === 's3') {
      remotePath = buildS3RemoteSpec(mount);
    }
    if (!remotePath) {
      throw new Error(`Mount ${mount.id} requires remotePath (or S3 fields)`);
    }

    const cacheArgs = cachePolicy.enabled
      ? [
        '--cache-dir',
        `${this.cacheDir}/${mount.id}`,
        '--vfs-write-back',
        `${cachePolicy.writeBackSeconds}s`,
        '--vfs-cache-max-size',
        `${cachePolicy.maxSizeGb}G`,
        '--vfs-cache-max-age',
        `${cachePolicy.maxAgeHours}h`,
        '--buffer-size',
        `${cachePolicy.readAheadMb}M`
      ]
      : [];

    return {
      command: rcloneBinary,
      args: [
        'mount',
        remotePath,
        mount.mountPath,
        '--daemon',
        '--vfs-cache-mode',
        effectiveCacheMode,
        '--dir-cache-time',
        mount.dirCacheTime || '10m',
        '--poll-interval',
        mount.pollInterval || '30s',
        ...extraArgs
      ].concat(cacheArgs),
      cacheDir: cachePolicy.enabled ? `${this.cacheDir}/${mount.id}` : ''
    };
  }

  async isMounted(path) {
    // Linux-first check for VPS deployments.
    try {
      const mounts = await readFile('/proc/mounts', 'utf8');
      const encoded = path.replace(/ /g, '\\040');
      if (mounts.includes(` ${encoded} `)) {
        return true;
      }
    } catch {
      // Ignore and fallback to `mount` output below.
    }

    try {
      const { stdout } = await runCommand('mount', []);
      return stdout.includes(` on ${path} `);
    } catch {
      return false;
    }
  }

  async checkMountHealth(path) {
    try {
      await runCommand('sh', ['-lc', `ls -la ${shellQuote(path)} >/dev/null`]);
      return { ok: true };
    } catch (error) {
      return { ok: false, error };
    }
  }
}

function shellQuote(value) {
  const safe = String(value).replace(/'/g, "'\\''");
  return `'${safe}'`;
}
