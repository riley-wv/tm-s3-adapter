import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { buildDiskShareConfig, buildRootShareConfig } from '../src/vpsd/sambaManager.mjs';

const disk = {
  smbShareName: 'tm-disk',
  storagePath: '/data/vps/smb-share/disk-1',
  smbUsername: 'tm_disk',
  quotaGb: 512
};

test('disk share config uses macOS-friendly VFS ordering and only real shares advertise Time Machine', () => {
  const config = buildDiskShareConfig(disk, 'xattr');

  assert.match(config, /\[tm-disk\]/);
  assert.match(config, /vfs objects = catia fruit streams_xattr/);
  assert.match(config, /fruit:time machine = yes/);
  assert.match(config, /fruit:time machine max size = 512G/);
  assert.match(config, /fruit:resource = file/);
  assert.match(config, /fruit:metadata = netatalk/);
  assert.match(config, /fruit:locking = netatalk/);
  assert.match(config, /fruit:encoding = native/);
  assert.doesNotMatch(config, /spotlight backend =/);
  assert.doesNotMatch(config, /fruit:aapl = yes/);
});

test('disk share config normalizes depot stream backend names', () => {
  const config = buildDiskShareConfig(disk, 'depot');
  assert.match(config, /vfs objects = catia fruit streams_depot/);
  assert.match(config, /fruit:resource = stream/);
  assert.match(config, /fruit:metadata = stream/);
  assert.match(config, /fruit:locking = none/);
});

test('root share stays macOS-compatible without being a Time Machine destination', () => {
  const config = buildRootShareConfig('TimeMachineRoot', '/data/vps/smb-share', 'xattr');

  assert.match(config, /\[TimeMachineRoot\]/);
  assert.match(config, /vfs objects = catia fruit streams_xattr/);
  assert.match(config, /fruit:resource = file/);
  assert.match(config, /fruit:metadata = netatalk/);
  assert.doesNotMatch(config, /fruit:time machine = yes/);
  assert.doesNotMatch(config, /durable handles = yes/);
});

test('container smb.conf does not ship a placeholder Time Machine share', async () => {
  const config = await readFile(new URL('../deploy/smb.conf.container', import.meta.url), 'utf8');

  assert.match(config, /vfs objects = fruit streams_xattr/);
  assert.doesNotMatch(config, /\[TimeMachineBackup\]/);
});
