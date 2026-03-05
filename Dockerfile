FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production \
    VPS_ADMIN_DASHBOARD_PORT=8787 \
    VPS_ADMIN_API_PORT=8788 \
    VPS_DATA_DIR=/data/vps \
    VPS_SMB_SHARE_ROOT=/data/vps/smb-share \
    VPS_ADMIN_WEB_ROOT=/app/web/vps-public \
    VPS_API_TOKEN=admin123 \
    VPS_ADMIN_USERNAME=admin \
    VPS_ADMIN_PASSWORD="9gwO~A9:Sb693js.Evb$" \
    VPS_ADMIN_SESSION_SECONDS=43200 \
    VPS_SAMBA_MANAGE_ENABLED=true \
    VPS_SMB_PUBLIC_PORT=445 \
    VPS_SAMBA_CONF_DIR=/etc/samba/smb.conf.d/tm-adapter \
    VPS_SAMBA_MAIN_CONF=/etc/samba/smb.conf \
    VPS_SAMBA_GENERATED_CONF=/etc/samba/smb.conf.d/tm-adapter/_generated.conf \
    VPS_SAMBA_INCLUDE_LINE="include = /etc/samba/smb.conf.d/tm-adapter/_generated.conf" \
    VPS_SAMBA_RESTART_CMD="smbcontrol all reload-config || pkill -HUP smbd || true" \
    VPS_MOUNT_MANAGE_ENABLED=true \
    VPS_MOUNT_POLL_SECONDS=30 \
    VPSD_RCLONE_BINARY=rclone \
    VPS_SFTP_PORT=2222 \
    VPS_SFTP_USERNAME=tmbackup \
    VPS_SFTP_PASSWORD=tmbackup123 \
    VPS_SFTP_UID=10000 \
    VPS_SFTP_GID=10000

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
    samba \
    samba-common-bin \
    samba-vfs-modules \
    openssh-server \
    rclone \
    fuse3 \
    ca-certificates \
    procps \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY src ./src
COPY web ./web
COPY deploy/smb.conf.container /etc/samba/smb.conf
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh

RUN npm run admin:build

RUN chmod +x /usr/local/bin/entrypoint.sh \
    && mkdir -p /var/run/sshd /etc/samba/smb.conf.d/tm-adapter /data/vps/smb-share /mnt/tm-cloud /root/.config/rclone

EXPOSE 8787 8788 445 2222
VOLUME ["/data/vps", "/mnt/tm-cloud"]

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
