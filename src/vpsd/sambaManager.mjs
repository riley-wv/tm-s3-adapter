import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

import { runCommand } from '../shared/commands.mjs';

function boolFromEnv(value, defaultValue = false) {
  if (value === undefined) {
    return defaultValue;
  }
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function shellQuote(value) {
  const safe = String(value).replace(/'/g, "'\\''");
  return `'${safe}'`;
}

function normalizeStreamsBackend(value) {
  const normalized = String(value || 'xattr').trim().toLowerCase();
  if (normalized === 'depot' || normalized === 'streams_depot') {
    return 'streams_depot';
  }
  if (normalized === 'xattr' || normalized === 'streams_xattr') {
    return 'streams_xattr';
  }
  return 'streams_xattr';
}

function vfsObjects(streamsBackend) {
  return `catia fruit ${normalizeStreamsBackend(streamsBackend)}`;
}

function fruitProfile(streamsBackend) {
  const normalized = normalizeStreamsBackend(streamsBackend);
  if (normalized === 'streams_xattr') {
    return {
      resource: 'file',
      metadata: 'netatalk',
      locking: 'netatalk',
      encoding: 'native'
    };
  }

  return {
    resource: 'stream',
    metadata: 'stream',
    locking: 'none',
    encoding: 'native'
  };
}

export function buildXattrProbeFailureMessage({ storagePath, storageMode, reason }) {
  const location = storagePath || '<unknown>';
  const mode = String(storageMode || 'unknown');
  const tail = reason ? ` Probe failed: ${reason}` : '';
  const modeHint = mode === 'cloud-mount'
    ? ' Cloud-mounted paths managed through rclone/FUSE typically do not expose the POSIX xattrs required by Samba.'
    : '';
  return `SMB streams backend "xattr" requires filesystem extended attributes on ${location}.${tail}${modeHint} Use depot mode or move the disk to a local filesystem with xattr support.`;
}

export async function probeXattrSupport(storagePath) {
  const probeFile = join(storagePath, `.tm-xattr-probe-${randomUUID()}`);
  const attrName = 'user.tm_adapter_probe';
  const attrValue = 'ok';

  try {
    await writeFile(probeFile, '', 'utf8');
    await runCommand('setfattr', ['-n', attrName, '-v', attrValue, probeFile]);
    const { stdout } = await runCommand('getfattr', ['--only-values', '-n', attrName, probeFile]);
    if (stdout.trim() !== attrValue) {
      return { ok: false, reason: `xattr round-trip returned ${JSON.stringify(stdout.trim())}` };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason: String(error?.stderr || error?.message || error).trim()
    };
  } finally {
    await rm(probeFile, { force: true }).catch(() => { });
  }
}

export function buildDiskShareConfig(disk, streamsBackend, options = {}) {
  const validUsers = Array.isArray(options.users) && options.users.length > 0 ? options.users.join(' ') : disk.smbUsername;
  const timeMachineEnabled = disk.timeMachineEnabled === true;
  const quotaSource = disk.timeMachineQuotaGb !== undefined ? disk.timeMachineQuotaGb : disk.quotaGb;
  const quotaLine = timeMachineEnabled && Number(quotaSource) > 0 ? `fruit:time machine max size = ${Math.floor(Number(quotaSource))}G\n` : '';
  const shareVfsObjects = vfsObjects(streamsBackend);
  const profile = fruitProfile(streamsBackend);
  const timeMachineLine = timeMachineEnabled ? 'fruit:time machine = yes\n' : '';
  const durableHandlesLine = timeMachineEnabled ? 'durable handles = yes\n' : '';
  return `[${disk.smbShareName}]
path = ${disk.storagePath}
valid users = ${validUsers}
guest ok = no
force user = root
force group = root
read only = no
browseable = yes
create mask = 0660
directory mask = 0770
ea support = yes
vfs objects = ${shareVfsObjects}
${timeMachineLine}fruit:resource = ${profile.resource}
fruit:metadata = ${profile.metadata}
fruit:posix_rename = yes
fruit:encoding = ${profile.encoding}
fruit:veto_appledouble = no
fruit:wipe_intentionally_left_blank_rfork = yes
fruit:delete_empty_adfiles = yes
${quotaLine}${durableHandlesLine}
kernel oplocks = no
kernel share modes = no
posix locking = no
fruit:locking = ${profile.locking}
spotlight = no
`;
}

export function buildRootShareConfig(shareName, path, streamsBackend) {
  const shareVfsObjects = vfsObjects(streamsBackend);
  const profile = fruitProfile(streamsBackend);
  return `[${shareName}]
path = ${path}
read only = no
browseable = yes
guest ok = no
force user = root
force group = root
create mask = 0660
directory mask = 0770
ea support = yes
vfs objects = ${shareVfsObjects}
fruit:resource = ${profile.resource}
fruit:metadata = ${profile.metadata}
fruit:posix_rename = yes
fruit:encoding = ${profile.encoding}
fruit:veto_appledouble = no
fruit:wipe_intentionally_left_blank_rfork = yes
fruit:delete_empty_adfiles = yes
fruit:locking = ${profile.locking}
spotlight = no
`;
}

export class SambaManager {
  constructor() {
    this.enabled = boolFromEnv(process.env.VPS_SAMBA_MANAGE_ENABLED, false);
    this.streamsBackend = normalizeStreamsBackend(process.env.VPS_SAMBA_STREAMS_BACKEND);
    this.confDir = process.env.VPS_SAMBA_CONF_DIR || '/etc/samba/smb.conf.d/tm-adapter';
    this.mainConf = process.env.VPS_SAMBA_MAIN_CONF || '/etc/samba/smb.conf';
    this.generatedConfPath = process.env.VPS_SAMBA_GENERATED_CONF || join(this.confDir, '_generated.conf');
    this.includeLine = process.env.VPS_SAMBA_INCLUDE_LINE || `include = ${this.generatedConfPath}`;
    this.restartCommand = process.env.VPS_SAMBA_RESTART_CMD || 'smbcontrol all reload-config || pkill -HUP smbd || true';
  }

  status() {
    return {
      enabled: this.enabled,
      confDir: this.confDir,
      mainConf: this.mainConf,
      streamsBackend: this.streamsBackend
    };
  }

  setStreamsBackend(value) {
    this.streamsBackend = normalizeStreamsBackend(value);
    return this.streamsBackend;
  }

  async applyDisk(disk, options = {}) {
    if (!this.enabled) {
      return { applied: false, reason: 'Samba management disabled by VPS_SAMBA_MANAGE_ENABLED' };
    }

    await mkdir(this.confDir, { recursive: true });
    await this.ensureIncludeLine();
    const users = Array.isArray(options.users) && options.users.length > 0 ? options.users : [{ username: disk.smbUsername, password: disk.smbPassword }];
    for (const user of users) {
      await this.ensureSmbUser(user.username, user.password);
    }
    await this.writeShareConfig(disk, users.map((user) => user.username));
    await this.syncGeneratedConfig();
    await this.restartSamba();

    return { applied: true, share: disk.smbShareName, users: users.map((user) => user.username) };
  }

  async removeDisk(disk) {
    if (!this.enabled) {
      return { applied: false, reason: 'Samba management disabled by VPS_SAMBA_MANAGE_ENABLED' };
    }

    const confFile = this.shareFilePath(disk);
    await rm(confFile, { force: true });
    await this.syncGeneratedConfig();
    await this.restartSamba();
    return { applied: true };
  }

  async applyRootShare(shareName, path) {
    if (!this.enabled) {
      return { applied: false, reason: 'Samba management disabled by VPS_SAMBA_MANAGE_ENABLED' };
    }

    await mkdir(this.confDir, { recursive: true });
    await this.ensureIncludeLine();
    await mkdir(path, { recursive: true });
    await writeFile(join(this.confDir, '_root.conf'), buildRootShareConfig(shareName, path, this.streamsBackend), 'utf8');
    await this.syncGeneratedConfig();
    await this.restartSamba();
    return { applied: true, share: shareName, path };
  }

  shareFilePath(disk) {
    return join(this.confDir, `${disk.id}.conf`);
  }

  async ensureIncludeLine() {
    let current = '';
    try {
      current = await readFile(this.mainConf, 'utf8');
    } catch {
      current = '';
    }

    if (current.includes(this.includeLine)) {
      return;
    }

    const line = current.endsWith('\n') || current.length === 0 ? `${this.includeLine}\n` : `\n${this.includeLine}\n`;
    await writeFile(this.mainConf, `${current}${line}`, 'utf8');
  }

  async ensureSmbUser(username, password) {
    const cmd = [
      `id ${shellQuote(username)} >/dev/null 2>&1 || useradd --no-create-home --shell /usr/sbin/nologin ${shellQuote(username)}`,
      `printf '%s\\n%s\\n' ${shellQuote(password)} ${shellQuote(password)} | smbpasswd -a -s ${shellQuote(username)}`
    ].join(' && ');

    await runCommand('sh', ['-lc', cmd]);
  }

  async writeShareConfig(disk, users = []) {
    await mkdir(disk.storagePath, { recursive: true });
    await runCommand('sh', ['-lc', `chown -R root:root ${shellQuote(disk.storagePath)} && chmod 0770 ${shellQuote(disk.storagePath)}`]).catch(() => {
      // Best-effort in case storagePath is a managed cloud mount with restricted ownership semantics.
    });
    await writeFile(this.shareFilePath(disk), buildDiskShareConfig(disk, this.streamsBackend, { users }), 'utf8');
  }

  async syncGeneratedConfig() {
    await mkdir(dirname(this.generatedConfPath), { recursive: true });

    let entries = [];
    try {
      entries = await readdir(this.confDir, { withFileTypes: true });
    } catch {
      entries = [];
    }

    const generatedBasename = basename(this.generatedConfPath);
    const confFiles = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.conf') && entry.name !== generatedBasename)
      .map((entry) => entry.name)
      .sort();

    const sections = [];
    for (const fileName of confFiles) {
      const filePath = join(this.confDir, fileName);
      const content = await readFile(filePath, 'utf8').catch(() => '');
      const trimmed = content.trim();
      if (trimmed) {
        sections.push(trimmed);
      }
    }

    const merged = sections.length > 0 ? `${sections.join('\n\n')}\n` : '';
    await writeFile(this.generatedConfPath, merged, 'utf8');
  }

  async restartSamba() {
    await runCommand('sh', ['-lc', this.restartCommand]);
  }
}
