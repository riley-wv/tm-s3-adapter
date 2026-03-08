import test from 'node:test';
import assert from 'node:assert/strict';

import { emptyAccessPolicy, normalizeAccessPolicy, resolveAssignedUsers } from '../src/vpsd/shareAccess.mjs';

test('normalizeAccessPolicy keeps smb and sftp scopes stable', () => {
  const policy = normalizeAccessPolicy({
    smb: { userIds: ['u1'], groupIds: ['g1'] },
    sftpGroupIds: ['g2']
  });

  assert.deepEqual(policy, {
    smb: { userIds: ['u1'], groupIds: ['g1'] },
    sftp: { userIds: [], groupIds: ['g2'] }
  });
});

test('resolveAssignedUsers expands direct users and group members for a protocol', () => {
  const share = {
    accessPolicy: {
      ...emptyAccessPolicy(),
      smb: {
        userIds: ['u1'],
        groupIds: ['g1']
      }
    }
  };
  const usersById = new Map([
    ['u1', { id: 'u1', username: 'alice', enabled: true, smbEnabled: true }],
    ['u2', { id: 'u2', username: 'bob', enabled: true, smbEnabled: true }],
    ['u3', { id: 'u3', username: 'carol', enabled: false, smbEnabled: true }]
  ]);
  const groupsById = new Map([
    ['g1', { id: 'g1', memberUserIds: ['u2', 'u3'] }]
  ]);

  const users = resolveAssignedUsers({ share, usersById, groupsById, protocol: 'smb' });

  assert.deepEqual(users.map((user) => user.id), ['u1', 'u2']);
});
