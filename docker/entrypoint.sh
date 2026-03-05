#!/usr/bin/env bash
set -euo pipefail

export VPS_DATA_DIR="${VPS_DATA_DIR:-/data/vps}"
export VPS_SMB_SHARE_ROOT="${VPS_SMB_SHARE_ROOT:-${VPS_DATA_DIR}/smb-share}"
export VPS_SFTP_PORT="${VPS_SFTP_PORT:-2222}"
export VPS_SFTP_USERNAME="${VPS_SFTP_USERNAME:-tmbackup}"
export VPS_SFTP_PASSWORD="${VPS_SFTP_PASSWORD:-change-sftp-password}"
export VPS_SFTP_UID="${VPS_SFTP_UID:-10000}"
export VPS_SFTP_GID="${VPS_SFTP_GID:-10000}"
export VPS_RUNTIME_LOG_DIR="${VPS_RUNTIME_LOG_DIR:-${VPS_DATA_DIR}/runtime-logs}"

mkdir -p "${VPS_DATA_DIR}" "${VPS_SMB_SHARE_ROOT}" "${VPS_RUNTIME_LOG_DIR}" /etc/samba/smb.conf.d/tm-adapter /var/run/sshd /run/samba /mnt/tm-cloud /root/.config/rclone
chmod 755 "${VPS_DATA_DIR}"
touch "${VPS_RUNTIME_LOG_DIR}/admin-api.log" "${VPS_RUNTIME_LOG_DIR}/samba.log" "${VPS_RUNTIME_LOG_DIR}/sftp.log"

if getent group "${VPS_SFTP_GID}" >/dev/null 2>&1; then
  sftp_group="$(getent group "${VPS_SFTP_GID}" | cut -d: -f1)"
else
  sftp_group="sftpusers"
  groupadd --gid "${VPS_SFTP_GID}" "${sftp_group}"
fi

if id "${VPS_SFTP_USERNAME}" >/dev/null 2>&1; then
  usermod --home "${VPS_DATA_DIR}" --uid "${VPS_SFTP_UID}" --gid "${sftp_group}" "${VPS_SFTP_USERNAME}"
else
  useradd --home "${VPS_DATA_DIR}" --uid "${VPS_SFTP_UID}" --gid "${sftp_group}" --shell /usr/sbin/nologin --no-create-home "${VPS_SFTP_USERNAME}"
fi

echo "${VPS_SFTP_USERNAME}:${VPS_SFTP_PASSWORD}" | chpasswd

chown root:root "${VPS_DATA_DIR}"
chmod 755 "${VPS_DATA_DIR}"
chown "${VPS_SFTP_USERNAME}:${sftp_group}" "${VPS_SMB_SHARE_ROOT}"
chmod 775 "${VPS_SMB_SHARE_ROOT}"

cat >/etc/ssh/sshd_config.d/tm-adapter.conf <<SSHCONF
Port ${VPS_SFTP_PORT}
PasswordAuthentication yes
PermitRootLogin no
PermitEmptyPasswords no
ChallengeResponseAuthentication no
UsePAM yes
X11Forwarding no
AllowTcpForwarding no
Match User ${VPS_SFTP_USERNAME}
  ChrootDirectory ${VPS_DATA_DIR}
  ForceCommand internal-sftp -d /smb-share
SSHCONF

ssh-keygen -A >/dev/null 2>&1

pids=()

start_process() {
  local process_name="$1"
  shift
  local log_file="${VPS_RUNTIME_LOG_DIR}/${process_name}.log"
  (
    "$@" 2>&1 | tee -a "${log_file}"
  ) &
  pids+=("$!")
}

start_process samba smbd --foreground --no-process-group
start_process sftp /usr/sbin/sshd -D -e
start_process admin-api node src/vpsd/index.mjs

shutdown() {
  for pid in "${pids[@]}"; do
    kill "${pid}" 2>/dev/null || true
  done
  wait || true
}

trap shutdown SIGINT SIGTERM

set +e
wait -n "${pids[@]}"
status=$?
set -e
shutdown
exit "${status}"
