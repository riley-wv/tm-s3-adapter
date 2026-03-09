'use client';

import {
  Button,
  Card,
  Input,
  Select,
  FormGroup,
  Checkbox,
  Badge,
  EmptyState,
  PageHeader,
  InfoItem,
} from './ui';
import type { Mount, MountForm } from '../lib/types';
import {
  mountStatus,
  mountRemoteDisplay,
  formatTimestamp,
  formatExtraArgs,
} from '../lib/utils';
import { Plus, Cloud, Pencil, Trash2, Play, Square } from 'lucide-react';

export interface MountsTabProps {
  mounts: Mount[];
  showAddMount: boolean;
  onToggleAdd: () => void;
  mountForm: MountForm;
  onMountFormChange: (patch: Partial<MountForm>) => void;
  onCreateMount: (e: React.FormEvent) => void;
  editingMountId: string;
  editingMountForm: MountForm;
  onEditingMountFormChange: (patch: Partial<MountForm>) => void;
  onStartEdit: (mount: Mount) => void;
  onCancelEdit: () => void;
  onUpdateMount: (e: React.FormEvent) => void;
  onMountAction: (mountId: string, action: string) => void;
  submitting: boolean;
  mountManagementEnabled: boolean;
}

function handleProviderChange(
  provider: string,
  currentRemotePath: string,
  onChange: (patch: Partial<MountForm>) => void,
) {
  let remotePath = currentRemotePath;
  if (provider === 'google-drive' && !remotePath) remotePath = 'gdrive:';
  if (provider === 'onedrive' && !remotePath) remotePath = 'onedrive:';
  if (provider === 's3') remotePath = '';
  onChange({ provider, remotePath });
}

interface MountFormFieldsProps {
  form: MountForm;
  onChange: (patch: Partial<MountForm>) => void;
  idPrefix: string;
  disabled?: boolean;
}

function MountFormFields({
  form,
  onChange,
  idPrefix,
  disabled,
}: MountFormFieldsProps) {
  const isS3 = form.provider === 's3';

  return (
    <>
      <FormGroup label="Mount Name" htmlFor={`${idPrefix}-name`}>
        <Input
          id={`${idPrefix}-name`}
          value={form.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="My Cloud Backup"
          required
          disabled={disabled}
        />
      </FormGroup>

      <FormGroup label="Provider" htmlFor={`${idPrefix}-provider`}>
        <Select
          id={`${idPrefix}-provider`}
          value={form.provider}
          onChange={(e) =>
            handleProviderChange(e.target.value, form.remotePath, onChange)
          }
          disabled={disabled}
        >
          <option value="s3">Amazon S3 / S3 Compatible</option>
          <option value="google-drive">Google Drive</option>
          <option value="onedrive">OneDrive</option>
          <option value="rclone">Custom rclone</option>
        </Select>
      </FormGroup>

      {isS3 ? (
        <>
          <FormGroup label="Bucket Name" htmlFor={`${idPrefix}-bucket`}>
            <Input
              id={`${idPrefix}-bucket`}
              value={form.bucket}
              onChange={(e) => onChange({ bucket: e.target.value })}
              placeholder="my-backup-bucket"
              required
              disabled={disabled}
            />
          </FormGroup>
          <FormGroup label="Prefix / Path" htmlFor={`${idPrefix}-prefix`}>
            <Input
              id={`${idPrefix}-prefix`}
              value={form.prefix}
              onChange={(e) => onChange({ prefix: e.target.value })}
              placeholder="backups/timemachine"
              disabled={disabled}
            />
          </FormGroup>
          <FormGroup label="Region" htmlFor={`${idPrefix}-region`}>
            <Input
              id={`${idPrefix}-region`}
              value={form.region}
              onChange={(e) => onChange({ region: e.target.value })}
              placeholder="us-east-1"
              disabled={disabled}
            />
          </FormGroup>
          <FormGroup label="Custom Endpoint" htmlFor={`${idPrefix}-endpoint`}>
            <Input
              id={`${idPrefix}-endpoint`}
              value={form.endpoint}
              onChange={(e) => onChange({ endpoint: e.target.value })}
              placeholder="For S3-compatible services"
              disabled={disabled}
            />
          </FormGroup>
          <FormGroup label="Access Key ID" htmlFor={`${idPrefix}-accessKeyId`}>
            <Input
              id={`${idPrefix}-accessKeyId`}
              value={form.accessKeyId}
              onChange={(e) => onChange({ accessKeyId: e.target.value })}
              placeholder="AKIAIOSFODNN7EXAMPLE"
              required
              disabled={disabled}
            />
          </FormGroup>
          <FormGroup
            label="Secret Access Key"
            htmlFor={`${idPrefix}-secretAccessKey`}
          >
            <Input
              id={`${idPrefix}-secretAccessKey`}
              type="password"
              value={form.secretAccessKey}
              onChange={(e) => onChange({ secretAccessKey: e.target.value })}
              placeholder="••••••••••••••••"
              required
              disabled={disabled}
            />
          </FormGroup>
          <FormGroup label="S3 Provider" htmlFor={`${idPrefix}-s3Provider`}>
            <Input
              id={`${idPrefix}-s3Provider`}
              value={form.s3Provider}
              onChange={(e) => onChange({ s3Provider: e.target.value })}
              placeholder="AWS, Wasabi, Backblaze, etc."
              disabled={disabled}
            />
          </FormGroup>
        </>
      ) : (
        <FormGroup label="Remote Path" htmlFor={`${idPrefix}-remotePath`}>
          <Input
            id={`${idPrefix}-remotePath`}
            value={form.remotePath}
            onChange={(e) => onChange({ remotePath: e.target.value })}
            placeholder="gdrive:, onedrive:, or remote:path"
            required
            disabled={disabled}
          />
        </FormGroup>
      )}

      <FormGroup label="Local Mount Path" htmlFor={`${idPrefix}-mountPath`}>
        <Input
          id={`${idPrefix}-mountPath`}
          value={form.mountPath}
          onChange={(e) => onChange({ mountPath: e.target.value })}
          placeholder="/mnt/tm-cloud/main"
          required
          disabled={disabled}
        />
      </FormGroup>
      <FormGroup label="Extra Arguments" htmlFor={`${idPrefix}-extraArgs`}>
        <Input
          id={`${idPrefix}-extraArgs`}
          value={form.extraArgs}
          onChange={(e) => onChange({ extraArgs: e.target.value })}
          placeholder="--buffer-size=16M,--vfs-read-chunk-size=16M"
          disabled={disabled}
        />
      </FormGroup>
      <FormGroup label="rclone Binary" htmlFor={`${idPrefix}-rcloneBinary`}>
        <Input
          id={`${idPrefix}-rcloneBinary`}
          value={form.rcloneBinary}
          onChange={(e) => onChange({ rcloneBinary: e.target.value })}
          placeholder="rclone"
          disabled={disabled}
        />
      </FormGroup>
      <div className="flex flex-wrap gap-6">
        <Checkbox
          id={`${idPrefix}-enabled`}
          checked={form.enabled}
          onChange={(checked) => onChange({ enabled: checked })}
          label="Enable this mount"
          disabled={disabled}
        />
        <Checkbox
          id={`${idPrefix}-ensureMounted`}
          checked={form.ensureMounted}
          onChange={(checked) => onChange({ ensureMounted: checked })}
          label="Mount immediately"
          disabled={disabled}
        />
      </div>
    </>
  );
}

export function MountsTab({
  mounts,
  showAddMount,
  onToggleAdd,
  mountForm,
  onMountFormChange,
  onCreateMount,
  editingMountId,
  editingMountForm,
  onEditingMountFormChange,
  onStartEdit,
  onCancelEdit,
  onUpdateMount,
  onMountAction,
  submitting,
  mountManagementEnabled,
}: MountsTabProps) {
  return (
    <div className="animate-in">
      <PageHeader
        title="Cloud Mounts"
        description="Connect cloud storage providers for remote backups"
        actions={
          <Button variant="primary" onClick={onToggleAdd} disabled={submitting}>
            <Plus className="h-4 w-4" />
            Add Mount
          </Button>
        }
      />

      {showAddMount && (
        <Card className="mb-6">
          <form onSubmit={onCreateMount} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <MountFormFields
                form={mountForm}
                onChange={onMountFormChange}
                idPrefix="mount-create"
              />
            </div>
            <div className="flex items-center gap-2 pt-2">
              <Button
                type="submit"
                variant="primary"
                disabled={submitting}
                loading={submitting}
              >
                <Cloud className="h-4 w-4" />
                Create Mount
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={onToggleAdd}
                disabled={submitting}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      {mounts.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Cloud className="h-12 w-12" />}
            title="No cloud mounts configured"
            description="Connect a cloud storage provider to enable remote backups."
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {mounts.map((mount) => {
            const status = mountStatus(mount);
            const isEditing = editingMountId === mount.id;

            return (
              <Card key={mount.id}>
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="flex items-center gap-2">
                    <Cloud className="h-5 w-5 text-gray-500 dark:text-gray-400 shrink-0" />
                    <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                      {mount.name}
                    </h3>
                  </div>
                  <Badge tone={status.tone}>{status.label}</Badge>
                </div>

                {isEditing ? (
                  <form onSubmit={onUpdateMount} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <MountFormFields
                        form={editingMountForm}
                        onChange={onEditingMountFormChange}
                        idPrefix={`edit-mount-${mount.id}`}
                        disabled={submitting}
                      />
                    </div>
                    <div className="flex items-center gap-2 pt-2">
                      <Button
                        type="submit"
                        variant="primary"
                        disabled={submitting}
                        loading={submitting}
                      >
                        Save Mount
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={onCancelEdit}
                        disabled={submitting}
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                      <InfoItem
                        label="Remote"
                        value={mountRemoteDisplay(mount)}
                        mono
                      />
                      <InfoItem label="Mount Path" value={mount.mountPath} mono />
                      <InfoItem
                        label="Last Checked"
                        value={formatTimestamp(mount.runtime?.lastCheckedAt)}
                      />
                      <InfoItem
                        label="Last Mounted"
                        value={formatTimestamp(mount.runtime?.lastMountedAt)}
                      />
                    </div>

                    {mount.runtime?.lastError && (
                      <div className="mb-4 px-3 py-2.5 rounded-lg bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400 text-sm border border-red-200 dark:border-red-800">
                        {mount.runtime.lastError}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-200 dark:border-gray-800">
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        onClick={() => onStartEdit(mount)}
                        disabled={submitting}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        onClick={() => onMountAction(mount.id, 'ensure')}
                        disabled={submitting || !mountManagementEnabled}
                      >
                        <Play className="h-3.5 w-3.5" />
                        Mount
                      </Button>
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        onClick={() => onMountAction(mount.id, 'unmount')}
                        disabled={submitting || !mountManagementEnabled}
                      >
                        <Square className="h-3.5 w-3.5" />
                        Unmount
                      </Button>
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        onClick={() => onMountAction(mount.id, 'delete')}
                        disabled={submitting}
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
