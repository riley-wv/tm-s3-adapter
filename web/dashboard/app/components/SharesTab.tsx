'use client';

import {
  Button,
  Card,
  Input,
  Select,
  FormGroup,
  Checkbox,
  EmptyState,
  PageHeader,
  InfoItem,
} from './ui';
import type { Disk, DiskForm, Mount, SelectOption } from '../lib/types';
import { copyToClipboard, smbConfigTextForDisk, sftpConfigTextForDisk } from '../lib/utils';
import { Plus, HardDrive, Pencil, Trash2, Key, Copy, Settings2 } from 'lucide-react';

export interface SharesTabProps {
  shares: Disk[];
  mounts: Mount[];
  mountOptions: SelectOption[];
  userOptions: SelectOption[];
  groupOptions: SelectOption[];
  showAddDrive: boolean;
  onToggleAdd: () => void;
  diskForm: DiskForm;
  onDiskFormChange: (patch: Partial<DiskForm>) => void;
  onCreateDisk: (e: React.FormEvent) => void;
  editingDiskId: string;
  editingDiskForm: DiskForm;
  onEditingDiskFormChange: (patch: Partial<DiskForm>) => void;
  onStartEdit: (disk: Disk) => void;
  onCancelEdit: () => void;
  onUpdateDisk: (e: React.FormEvent) => void;
  onDiskAction: (diskId: string, action: string) => void;
  submitting: boolean;
  smbEnabled: boolean;
  sftpEnabled: boolean;
  onNotice: (msg: string) => void;
  onError: (msg: string) => void;
}

function DiskFormFields({
  form,
  onChange,
  mountOptions,
  userOptions,
  groupOptions,
  idPrefix,
  smbEnabled,
  sftpEnabled,
}: {
  form: DiskForm;
  onChange: (patch: Partial<DiskForm>) => void;
  mountOptions: SelectOption[];
  userOptions: SelectOption[];
  groupOptions: SelectOption[];
  idPrefix: string;
  smbEnabled: boolean;
  sftpEnabled: boolean;
}) {
  const tmEnabled = form.timeMachineEnabled;
  const isCloudMount = form.storageMode === 'cloud-mount';
  const isCloudmounter = form.storageMode === 'cloudmounter';
  const isCentralized = form.accessMode === 'centralized';
  const isLegacy = form.accessMode === 'legacy-per-share';

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <FormGroup label="Name" htmlFor={`${idPrefix}-name`}>
        <Input
          id={`${idPrefix}-name`}
          type="text"
          value={form.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Design Share"
          required
        />
      </FormGroup>

      <FormGroup label="Time Machine" htmlFor={`${idPrefix}-tm`}>
        <Select
          id={`${idPrefix}-tm`}
          value={form.timeMachineEnabled ? 'enabled' : 'disabled'}
          onChange={(e) => onChange({ timeMachineEnabled: e.target.value === 'enabled' })}
        >
          <option value="disabled">Disabled</option>
          <option value="enabled">Enabled</option>
        </Select>
      </FormGroup>

      <FormGroup label="Time Machine Quota (GB)" htmlFor={`${idPrefix}-quota`} hint="0 for unlimited">
        <Input
          id={`${idPrefix}-quota`}
          type="number"
          min={0}
          value={form.timeMachineQuotaGb}
          onChange={(e) => onChange({ timeMachineQuotaGb: e.target.value })}
          placeholder="0"
          disabled={!tmEnabled}
        />
      </FormGroup>

      <FormGroup label="Storage Mode" htmlFor={`${idPrefix}-storage-mode`}>
        <Select
          id={`${idPrefix}-storage-mode`}
          value={form.storageMode}
          onChange={(e) => onChange({ storageMode: e.target.value })}
        >
          <option value="local">Local</option>
          <option value="cloud-mount">Cloud Mount</option>
          <option value="cloudmounter">Custom Path</option>
        </Select>
      </FormGroup>

      {isCloudMount && (
        <>
          <FormGroup label="Cloud Mount" htmlFor={`${idPrefix}-mount`}>
            <Select
              id={`${idPrefix}-mount`}
              value={form.storageMountId}
              onChange={(e) => onChange({ storageMountId: e.target.value })}
              required
            >
              <option value="">Select a mount...</option>
              {mountOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </FormGroup>
          <FormGroup label="Subdirectory" htmlFor={`${idPrefix}-subdir`} hint="optional">
            <Input
              id={`${idPrefix}-subdir`}
              type="text"
              value={form.storageSubdir}
              onChange={(e) => onChange({ storageSubdir: e.target.value })}
              placeholder="Optional subfolder"
            />
          </FormGroup>
        </>
      )}

      {isCloudmounter && (
        <FormGroup label="Filesystem Path" htmlFor={`${idPrefix}-path`}>
          <Input
            id={`${idPrefix}-path`}
            type="text"
            value={form.storagePath}
            onChange={(e) => onChange({ storagePath: e.target.value })}
            placeholder="/mnt/my-storage"
            required
          />
        </FormGroup>
      )}

      <FormGroup label="SMB Share Name" htmlFor={`${idPrefix}-share`} hint="auto-generated if empty">
        <Input
          id={`${idPrefix}-share`}
          type="text"
          value={form.shareName}
          onChange={(e) => onChange({ shareName: e.target.value })}
          placeholder="Auto-generated if empty"
        />
      </FormGroup>

      <FormGroup label="Access Mode" htmlFor={`${idPrefix}-access`}>
        <Select
          id={`${idPrefix}-access`}
          value={form.accessMode}
          onChange={(e) => onChange({ accessMode: e.target.value })}
        >
          <option value="legacy-per-share">Legacy per-share credentials</option>
          <option value="centralized">Centralized users and groups</option>
        </Select>
      </FormGroup>

      {isCentralized && (
        <>
          <FormGroup label="SMB User IDs" htmlFor={`${idPrefix}-smb-users`}>
            <Input
              id={`${idPrefix}-smb-users`}
              type="text"
              value={form.smbUserIds}
              onChange={(e) => onChange({ smbUserIds: e.target.value })}
              placeholder={userOptions.map((u) => u.id).join(', ') || 'user-id-1, user-id-2'}
            />
          </FormGroup>
          <FormGroup label="SMB Group IDs" htmlFor={`${idPrefix}-smb-groups`}>
            <Input
              id={`${idPrefix}-smb-groups`}
              type="text"
              value={form.smbGroupIds}
              onChange={(e) => onChange({ smbGroupIds: e.target.value })}
              placeholder={groupOptions.map((g) => g.id).join(', ') || 'group-id-1, group-id-2'}
            />
          </FormGroup>
          <FormGroup label="SFTP User IDs" htmlFor={`${idPrefix}-sftp-users`}>
            <Input
              id={`${idPrefix}-sftp-users`}
              type="text"
              value={form.sftpUserIds}
              onChange={(e) => onChange({ sftpUserIds: e.target.value })}
              placeholder={userOptions.map((u) => u.id).join(', ') || 'user-id-1, user-id-2'}
            />
          </FormGroup>
          <FormGroup label="SFTP Group IDs" htmlFor={`${idPrefix}-sftp-groups`}>
            <Input
              id={`${idPrefix}-sftp-groups`}
              type="text"
              value={form.sftpGroupIds}
              onChange={(e) => onChange({ sftpGroupIds: e.target.value })}
              placeholder={groupOptions.map((g) => g.id).join(', ') || 'group-id-1, group-id-2'}
            />
          </FormGroup>
        </>
      )}

      {isLegacy && (
        <>
          <FormGroup label="SMB Username" htmlFor={`${idPrefix}-smb-user`}>
            <Input
              id={`${idPrefix}-smb-user`}
              type="text"
              value={form.smbUsername}
              onChange={(e) => onChange({ smbUsername: e.target.value })}
              placeholder="Auto-generated if empty"
            />
          </FormGroup>
          <FormGroup label="SMB Password" htmlFor={`${idPrefix}-smb-pass`}>
            <Input
              id={`${idPrefix}-smb-pass`}
              type="text"
              value={form.smbPassword}
              onChange={(e) => onChange({ smbPassword: e.target.value })}
              placeholder="Auto-generated if empty"
            />
          </FormGroup>
          <FormGroup label="SFTP Username" htmlFor={`${idPrefix}-sftp-user`}>
            <Input
              id={`${idPrefix}-sftp-user`}
              type="text"
              value={form.sftpUsername}
              onChange={(e) => onChange({ sftpUsername: e.target.value })}
              placeholder="Auto-generated if empty"
            />
          </FormGroup>
          <FormGroup label="SFTP Password" htmlFor={`${idPrefix}-sftp-pass`}>
            <Input
              id={`${idPrefix}-sftp-pass`}
              type="text"
              value={form.sftpPassword}
              onChange={(e) => onChange({ sftpPassword: e.target.value })}
              placeholder="Auto-generated if empty"
            />
          </FormGroup>
        </>
      )}

      {smbEnabled && (
        <div className="sm:col-span-2">
          <Checkbox
            id={`${idPrefix}-apply-samba`}
            checked={form.applySamba}
            onChange={(v) => onChange({ applySamba: v })}
            label="Apply Samba share configuration immediately"
          />
        </div>
      )}
      {sftpEnabled && (
        <div className="sm:col-span-2">
          <Checkbox
            id={`${idPrefix}-apply-sftp`}
            checked={form.applySftp}
            onChange={(v) => onChange({ applySftp: v })}
            label="Apply SFTP access configuration immediately"
          />
        </div>
      )}
    </div>
  );
}

export function SharesTab({
  shares,
  mounts,
  mountOptions,
  userOptions,
  groupOptions,
  showAddDrive,
  onToggleAdd,
  diskForm,
  onDiskFormChange,
  onCreateDisk,
  editingDiskId,
  editingDiskForm,
  onEditingDiskFormChange,
  onStartEdit,
  onCancelEdit,
  onUpdateDisk,
  onDiskAction,
  submitting,
  smbEnabled,
  sftpEnabled,
  onNotice,
  onError,
}: SharesTabProps) {
  const handleCopy = (value: string, label: string) => {
    copyToClipboard(value)
      .then(() => onNotice('Copied!'))
      .catch(() => onError('Copy failed'));
  };

  return (
    <div className="animate-in">
      <PageHeader
        title="Shares"
        description="Manage SMB shares and Time Machine destinations"
        actions={
          <Button variant="primary" onClick={onToggleAdd}>
            <Plus className="h-4 w-4" />
            Add Share
          </Button>
        }
      />

      {showAddDrive && (
        <Card className="mb-6">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Create New Share
          </h3>
          <form onSubmit={onCreateDisk}>
            <DiskFormFields
              form={diskForm}
              onChange={onDiskFormChange}
              mountOptions={mountOptions}
              userOptions={userOptions}
              groupOptions={groupOptions}
              idPrefix="create-disk"
              smbEnabled={smbEnabled}
              sftpEnabled={sftpEnabled}
            />
            <div className="flex flex-wrap gap-2 pt-4 mt-4 border-t border-gray-100 dark:border-gray-800">
              <Button type="submit" variant="primary" disabled={submitting}>
                Create Share
              </Button>
              <Button type="button" variant="ghost" onClick={onToggleAdd}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      {shares.length === 0 ? (
        <Card>
          <EmptyState
            icon={<HardDrive className="h-12 w-12" />}
            title="No shares configured"
            description="Create your first SMB share, then enable Time Machine only where you need it."
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {shares.map((disk) => {
            const isEditing = editingDiskId === disk.id;
            const smbShareName = disk.smbShareName || disk?.smb?.shareName || '';
            const smbUrl = disk.diskShareUrl || disk?.smb?.url || '';
            const browseUrl = disk.rootShareUrl || disk?.smb?.rootUrl || '';
            const tmStatus =
              disk.timeMachineEnabled === true || disk?.smb?.timeMachineEnabled
                ? 'Enabled'
                : 'Disabled';
            const accessMode = disk.accessMode || disk?.access?.mode || 'legacy-per-share';
            const sftpUrl = disk.sftpUrl || disk?.sftp?.url || '';
            const sftpPath = disk.sftpPath || disk?.sftp?.path || '';
            const users = disk?.access?.users?.map((u) => u.username).join(', ') || 'N/A';
            const groups = disk?.access?.groups?.map((g) => g.name).join(', ') || 'N/A';
            const storagePath = disk.storagePath || disk.storageBasePath || '';

            return (
              <Card key={disk.id}>
                <div className="mb-4">
                  <div className="flex items-center gap-2">
                    <HardDrive className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                    <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                      {disk.name}
                    </h3>
                  </div>
                  {smbShareName && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                      {smbShareName}
                    </p>
                  )}
                </div>

                {isEditing ? (
                  <form onSubmit={onUpdateDisk}>
                    <DiskFormFields
                      form={editingDiskForm}
                      onChange={onEditingDiskFormChange}
                      mountOptions={mountOptions}
                      userOptions={userOptions}
                      groupOptions={groupOptions}
                      idPrefix={`edit-disk-${disk.id}`}
                      smbEnabled={smbEnabled}
                      sftpEnabled={sftpEnabled}
                    />
                    <div className="flex flex-wrap gap-2 pt-4 mt-4 border-t border-gray-100 dark:border-gray-800">
                      <Button type="submit" variant="primary" disabled={submitting}>
                        Save Share
                      </Button>
                      <Button type="button" variant="ghost" onClick={onCancelEdit}>
                        Cancel
                      </Button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      <InfoItem label="SMB URL" value={smbUrl} mono />
                      <InfoItem label="Browse URL" value={browseUrl} mono />
                      <InfoItem label="Time Machine" value={tmStatus} />
                      <InfoItem label="Access Mode" value={accessMode} />
                      <InfoItem label="SFTP URL" value={sftpUrl} mono />
                      <InfoItem label="SFTP Path" value={sftpPath} mono />
                      <InfoItem label="Users" value={users} />
                      <InfoItem label="Groups" value={groups} />
                      <InfoItem label="Storage Path" value={storagePath} mono />
                    </div>

                    <div className="flex flex-wrap gap-2 pt-4 mt-4 border-t border-gray-100 dark:border-gray-800">
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        onClick={() =>
                          handleCopy(smbConfigTextForDisk(disk), 'SMB config')
                        }
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Copy SMB Config
                      </Button>
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        onClick={() =>
                          handleCopy(sftpConfigTextForDisk(disk), 'SFTP config')
                        }
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Copy SFTP Config
                      </Button>
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        onClick={() => handleCopy(smbUrl, 'SMB URL')}
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Copy URL
                      </Button>
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        onClick={() =>
                          handleCopy(
                            disk.smbUsername || disk?.smb?.legacyUsername || '',
                            'Username'
                          )
                        }
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Copy Username
                      </Button>
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        onClick={() =>
                          handleCopy(
                            disk.smbPassword || disk?.smb?.legacyPassword || '',
                            'Password'
                          )
                        }
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Copy Password
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => onStartEdit(disk)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </Button>
                      {smbEnabled && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => onDiskAction(disk.id, 'rotate')}
                        >
                          <Key className="h-3.5 w-3.5" />
                          Rotate Password
                        </Button>
                      )}
                      {smbEnabled && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => onDiskAction(disk.id, 'apply')}
                        >
                          <Settings2 className="h-3.5 w-3.5" />
                          Apply Samba
                        </Button>
                      )}
                      {sftpEnabled && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => onDiskAction(disk.id, 'apply-sftp')}
                        >
                          <Settings2 className="h-3.5 w-3.5" />
                          Apply SFTP
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        onClick={() => onDiskAction(disk.id, 'delete')}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </Button>
                    </div>
                  </>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
