import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

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

function driveMatchConfig(disk, chrootDirectory, driveDirectory) {
  return `Match User ${disk.sftpUsername}
  ChrootDirectory ${chrootDirectory}
  PasswordAuthentication yes
  PubkeyAuthentication no
  PermitTTY no
  X11Forwarding no
  AllowTcpForwarding no
  ForceCommand internal-sftp -d ${driveDirectory}
`;
}

export class SftpManager {
  constructor() {
    this.enabled = boolFromEnv(process.env.VPS_SFTP_MANAGE_ENABLED, true);
    this.generatedConfPath = process.env.VPS_SFTP_GENERATED_CONF || '/etc/ssh/sshd_config.d/tm-adapter-drive-users.conf';
    this.chrootBaseDir = process.env.VPS_SFTP_CHROOT_BASE_DIR || '/data/vps/sftp-chroots';
    this.driveDirName = process.env.VPS_SFTP_DRIVE_DIR_NAME || 'drive';
    this.uid = Number(process.env.VPS_SFTP_UID || 10000);
    this.gid = Number(process.env.VPS_SFTP_GID || 10000);
    this.restartCommand = process.env.VPS_SFTP_RESTART_CMD || 'sshd -t && pkill -HUP sshd';
  }

  status() {
    return {
      enabled: this.enabled,
      generatedConfPath: this.generatedConfPath,
      chrootBaseDir: this.chrootBaseDir,
      driveDirName: this.driveDirName,
      uid: this.uid,
      gid: this.gid
    };
  }

  visibleDrivePath() {
    return `/${this.driveDirName}`;
  }

  chrootPathForDisk(disk) {
    return join(this.chrootBaseDir, disk.id);
  }

  driveMountPathForDisk(disk) {
    return join(this.chrootPathForDisk(disk), this.driveDirName);
  }

  async applyDisk(disk, allDisks = [disk]) {
    if (!this.enabled) {
      return { applied: false, reason: 'SFTP management disabled by VPS_SFTP_MANAGE_ENABLED' };
    }

    await mkdir(this.chrootBaseDir, { recursive: true });
    await this.ensureUser(disk.sftpUsername, disk.sftpPassword);
    await this.ensureDriveMount(disk);
    await this.writeConfig(allDisks);
    await this.restartSftp();
    return {
      applied: true,
      user: disk.sftpUsername,
      chroot: this.chrootPathForDisk(disk),
      path: this.visibleDrivePath()
    };
  }

  async removeDisk(disk, remainingDisks = []) {
    if (!this.enabled) {
      return { applied: false, reason: 'SFTP management disabled by VPS_SFTP_MANAGE_ENABLED' };
    }

    await this.unmountDrive(disk).catch(() => { });
    await rm(this.chrootPathForDisk(disk), { recursive: true, force: true }).catch(() => { });
    await this.deleteUser(disk.sftpUsername).catch(() => { });
    await this.writeConfig(remainingDisks);
    await this.restartSftp();
    return { applied: true };
  }

  async ensureUser(username, password) {
    const quotedUsername = shellQuote(username);
    const cmd = [
      `if id ${quotedUsername} >/dev/null 2>&1; then`,
      `  usermod --home /data/vps --uid ${this.uid} --gid ${this.gid} --shell /usr/sbin/nologin -G 0 ${quotedUsername};`,
      'else',
      `  useradd --home /data/vps --non-unique --uid ${this.uid} --gid ${this.gid} --groups 0 --shell /usr/sbin/nologin --no-create-home ${quotedUsername};`,
      'fi',
      `echo ${shellQuote(`${username}:${password}`)} | chpasswd`
    ].join(' ');
    await runCommand('sh', ['-lc', cmd]);
  }

  async deleteUser(username) {
    await runCommand('sh', ['-lc', `id ${shellQuote(username)} >/dev/null 2>&1 && userdel ${shellQuote(username)} || true`]);
  }

  async ensureDriveMount(disk) {
    const chrootPath = this.chrootPathForDisk(disk);
    const drivePath = this.driveMountPathForDisk(disk);
    const quotedChroot = shellQuote(chrootPath);
    const quotedDrive = shellQuote(drivePath);
    const quotedStorage = shellQuote(disk.storagePath);
    const cmd = [
      `mkdir -p ${quotedChroot} ${quotedDrive}`,
      `chown root:root ${quotedChroot} ${quotedDrive}`,
      `chmod 755 ${quotedChroot} ${quotedDrive}`,
      `(mountpoint -q ${quotedDrive} && umount ${quotedDrive} || true)`,
      `mount --bind ${quotedStorage} ${quotedDrive}`
    ].join(' && ');
    await runCommand('sh', ['-lc', cmd]);
  }

  async unmountDrive(disk) {
    const drivePath = this.driveMountPathForDisk(disk);
    await runCommand('sh', ['-lc', `mountpoint -q ${shellQuote(drivePath)} && umount ${shellQuote(drivePath)} || true`]);
  }

  async writeConfig(disks) {
    const orderedDisks = [...disks]
      .filter((disk) => disk?.id && disk?.sftpUsername)
      .sort((left, right) => left.id.localeCompare(right.id));
    const content = orderedDisks
      .map((disk) => driveMatchConfig(disk, this.chrootPathForDisk(disk), this.visibleDrivePath()))
      .join('\n');
    await mkdir(dirname(this.generatedConfPath), { recursive: true });
    await writeFile(this.generatedConfPath, content ? `${content}\n` : '', 'utf8');
  }

  async restartSftp() {
    await runCommand('sh', ['-lc', this.restartCommand]);
  }
}
