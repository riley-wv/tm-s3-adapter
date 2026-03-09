export type TabId = 'shares' | 'mounts' | 'logs' | 'settings';
export type ThemeMode = 'light' | 'dark' | 'system';
export type StatusTone = 'success' | 'warning' | 'error' | 'muted';

export interface MountRuntime {
  lastStatus?: string;
  lastCheckedAt?: string;
  lastMountedAt?: string;
  lastError?: string;
}

export interface Mount {
  id: string;
  name: string;
  provider: string;
  remotePath?: string;
  mountPath: string;
  bucket?: string;
  prefix?: string;
  region?: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  s3Provider?: string;
  extraArgs?: string[];
  rcloneBinary?: string;
  enabled: boolean;
  runtime?: MountRuntime;
}

export interface DiskAccess {
  mode?: string;
  users?: Array<{ id: string; username: string }>;
  groups?: Array<{ id: string; name: string }>;
  policy?: {
    smb?: { userIds?: string[]; groupIds?: string[] };
    sftp?: { userIds?: string[]; groupIds?: string[] };
  };
}

export interface DiskSmb {
  shareName?: string;
  url?: string;
  rootUrl?: string;
  timeMachineEnabled?: boolean;
  legacyUsername?: string;
  legacyPassword?: string;
  authMode?: string;
}

export interface DiskSftp {
  url?: string;
  path?: string;
  legacyUsername?: string;
  legacyPassword?: string;
  authMode?: string;
}

export interface Disk {
  id: string;
  name: string;
  timeMachineEnabled?: boolean;
  timeMachineQuotaGb?: number;
  quotaGb?: number;
  accessMode?: string;
  access?: DiskAccess;
  storageMode?: string;
  storageMountId?: string;
  storageBasePath?: string;
  storagePath?: string;
  smbShareName?: string;
  smbUsername?: string;
  smbPassword?: string;
  sftpUsername?: string;
  sftpPassword?: string;
  sftpUrl?: string;
  sftpPath?: string;
  diskShareUrl?: string;
  rootShareUrl?: string;
  smb?: DiskSmb;
  sftp?: DiskSftp;
}

export interface CentralUser {
  id: string;
  username: string;
  displayName?: string;
  authType: string;
  enabled: boolean;
  isAdmin: boolean;
  smbEnabled: boolean;
  sftpEnabled: boolean;
  groupIds?: string[];
  identityProviderId?: string;
  externalSubject?: string;
}

export interface Group {
  id: string;
  name: string;
  description?: string;
  memberUserIds?: string[];
}

export interface IdentityProvider {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  config?: Record<string, string>;
}

export interface SettingDescriptor {
  source?: string;
  locked?: boolean;
}

export interface Settings {
  setupCompleted?: boolean;
  adminUsername?: string;
  adminSessionSeconds?: number;
  hostname?: string;
  rootShareName?: string;
  browseShareName?: string;
  browseShareEnabled?: boolean;
  smbPublicPort?: number;
  smbEnabled?: boolean;
  sftpEnabled?: boolean;
  mountManagementEnabled?: boolean;
  smbStreamsBackend?: string;
  mountPollSeconds?: number;
  vpsCacheDir?: string;
  vpsCacheEnabled?: boolean;
  vpsWriteBackSeconds?: number;
  vpsCacheMaxSizeGb?: number;
  vpsCacheMaxAgeHours?: number;
  vpsReadAheadMb?: number;
  enterpriseFeaturesEnabled?: boolean;
  adminAuthMode?: string;
  smbAuthMode?: string;
  sftpAuthMode?: string;
  securityIpAllowlist?: string;
  securityBreakGlassEnabled?: boolean;
  securityAuditRetentionDays?: number;
  oidcIssuer?: string;
  oidcClientId?: string;
  oidcClientSecret?: string;
  oidcScopes?: string;
  oidcAdminGroup?: string;
  oidcReadOnlyGroup?: string;
  directoryDomain?: string;
  directoryRealm?: string;
  directoryUrl?: string;
  directoryBindDn?: string;
  directoryBindPassword?: string;
  workgroupMappingsJson?: string;
  mountPolicyMode?: string;
  postgresEnabled?: boolean;
  postgresHost?: string;
  postgresPort?: number;
  postgresDatabase?: string;
  postgresUser?: string;
  postgresPassword?: string;
  postgresSslMode?: string;
  apiTokenConfigured?: boolean;
}

export interface SambaStatus {
  effectiveEnabled?: boolean;
  settingEnabled?: boolean;
  confDir?: string;
}

export interface MountManagerStatus {
  effectiveEnabled?: boolean;
  settingEnabled?: boolean;
  pollSeconds?: number;
}

export interface SftpInfo {
  enabled?: boolean;
  url?: string;
  username?: string;
  password?: string;
  rootPath?: string;
}

export interface PostgresInfo {
  configured?: boolean;
  required?: boolean;
}

export interface DashboardState {
  settings?: Settings;
  settingsConfig?: Record<string, SettingDescriptor>;
  mounts?: Mount[];
  shares?: Disk[];
  disks?: Disk[];
  users?: CentralUser[];
  groups?: Group[];
  identityProviders?: IdentityProvider[];
  samba?: SambaStatus;
  mountManager?: MountManagerStatus;
  sftp?: SftpInfo;
  postgres?: PostgresInfo;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: string;
  message: string;
  host?: string;
  drive?: string;
}

export interface TailSource {
  source: string;
  type: string;
  label: string;
}

export interface DiskForm {
  name: string;
  timeMachineEnabled: boolean;
  timeMachineQuotaGb: string;
  accessMode: string;
  smbUserIds: string;
  smbGroupIds: string;
  sftpUserIds: string;
  sftpGroupIds: string;
  storageMode: string;
  storageMountId: string;
  storageSubdir: string;
  storagePath: string;
  shareName: string;
  smbUsername: string;
  smbPassword: string;
  sftpUsername: string;
  sftpPassword: string;
  applySamba: boolean;
  applySftp: boolean;
}

export interface MountForm {
  name: string;
  provider: string;
  remotePath: string;
  mountPath: string;
  bucket: string;
  prefix: string;
  region: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  s3Provider: string;
  extraArgs: string;
  rcloneBinary: string;
  enabled: boolean;
  ensureMounted: boolean;
}

export interface SettingsForm {
  adminUsername: string;
  adminPassword: string;
  apiToken: string;
  adminSessionSeconds: string;
  hostname: string;
  rootShareName: string;
  browseShareName: string;
  browseShareEnabled: boolean;
  smbPublicPort: string;
  smbEnabled: boolean;
  sftpEnabled: boolean;
  mountManagementEnabled: boolean;
  smbStreamsBackend: string;
  mountPollSeconds: string;
  vpsCacheDir: string;
  vpsCacheEnabled: boolean;
  vpsWriteBackSeconds: string;
  vpsCacheMaxSizeGb: string;
  vpsCacheMaxAgeHours: string;
  vpsReadAheadMb: string;
  enterpriseFeaturesEnabled: boolean;
  adminAuthMode: string;
  smbAuthMode: string;
  sftpAuthMode: string;
  securityIpAllowlist: string;
  securityBreakGlassEnabled: boolean;
  securityAuditRetentionDays: string;
  oidcIssuer: string;
  oidcClientId: string;
  oidcClientSecret: string;
  oidcScopes: string;
  oidcAdminGroup: string;
  oidcReadOnlyGroup: string;
  directoryDomain: string;
  directoryRealm: string;
  directoryUrl: string;
  directoryBindDn: string;
  directoryBindPassword: string;
  workgroupMappingsJson: string;
  mountPolicyMode: string;
  postgresEnabled: boolean;
  postgresHost: string;
  postgresPort: string;
  postgresDatabase: string;
  postgresUser: string;
  postgresPassword: string;
  postgresSslMode: string;
}

export interface UserForm {
  username: string;
  displayName: string;
  authType: string;
  password: string;
  protocolUsername: string;
  protocolPassword: string;
  groupIds: string;
  enabled: boolean;
  isAdmin: boolean;
  smbEnabled: boolean;
  sftpEnabled: boolean;
  identityProviderId: string;
  externalSubject: string;
}

export interface GroupForm {
  name: string;
  description: string;
  memberUserIds: string;
}

export interface ProviderForm {
  name: string;
  type: string;
  enabled: boolean;
  issuer: string;
  clientId: string;
  clientSecret: string;
  scopes: string;
  directoryUrl: string;
  directoryDomain: string;
  directoryRealm: string;
  directoryBindDn: string;
  directoryBindPassword: string;
}

export interface SelectOption {
  id: string;
  label: string;
}
