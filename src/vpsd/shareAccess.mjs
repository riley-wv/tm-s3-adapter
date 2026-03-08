function toArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (value === undefined || value === null || value === '') {
    return [];
  }
  return [value];
}

export function normalizeIdList(value) {
  const seen = new Set();
  const output = [];
  for (const entry of toArray(value)) {
    const normalized = String(entry || '').trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    output.push(normalized);
  }
  return output;
}

export function emptyAccessPolicy() {
  return {
    smb: { userIds: [], groupIds: [] },
    sftp: { userIds: [], groupIds: [] }
  };
}

export function normalizeAccessMode(value, fallback = 'legacy-per-share') {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'centralized' || normalized === 'centralised') {
    return 'centralized';
  }
  if (normalized === 'legacy' || normalized === 'legacy-per-share') {
    return 'legacy-per-share';
  }
  return fallback;
}

export function normalizeIdentityProviderType(value, fallback = 'local') {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'oidc' || normalized === 'sso') {
    return 'oidc';
  }
  if (normalized === 'ldap' || normalized === 'ad' || normalized === 'active-directory' || normalized === 'activedirectory') {
    return 'ldap';
  }
  if (normalized === 'local') {
    return 'local';
  }
  return fallback;
}

export function normalizeAccessPolicy(value, fallback = emptyAccessPolicy()) {
  const source = value && typeof value === 'object' ? value : {};
  const normalized = emptyAccessPolicy();
  for (const protocol of ['smb', 'sftp']) {
    const protocolValue = source[protocol] && typeof source[protocol] === 'object' ? source[protocol] : {};
    normalized[protocol] = {
      userIds: normalizeIdList(protocolValue.userIds || source[`${protocol}UserIds`] || fallback?.[protocol]?.userIds || []),
      groupIds: normalizeIdList(protocolValue.groupIds || source[`${protocol}GroupIds`] || fallback?.[protocol]?.groupIds || [])
    };
  }
  return normalized;
}

export function normalizeMemberUserIds(value) {
  return normalizeIdList(value);
}

export function resolveAssignedUsers({ share, usersById, groupsById, protocol }) {
  const policy = share?.accessPolicy?.[protocol];
  if (!policy) {
    return [];
  }

  const userIds = new Set(normalizeIdList(policy.userIds));
  for (const groupId of normalizeIdList(policy.groupIds)) {
    const group = groupsById.get(groupId);
    if (!group) {
      continue;
    }
    for (const memberUserId of normalizeMemberUserIds(group.memberUserIds)) {
      userIds.add(memberUserId);
    }
  }

  const enabledFlag = protocol === 'smb' ? 'smbEnabled' : 'sftpEnabled';
  return [...userIds]
    .map((userId) => usersById.get(userId))
    .filter(Boolean)
    .filter((user) => user.enabled !== false)
    .filter((user) => user[enabledFlag] !== false);
}
