# Hybrid Access Deployment

This deployment pattern keeps the admin surfaces private while publishing share protocols directly.

Use this pattern when:

- operators access the dashboard through SSH tunnel, VPN, or reverse proxy
- SMB and SFTP need to be reachable by clients directly

## Target pattern

Private:

- SSH
- dashboard
- admin API
- Postgres

Direct:

- SMB
- SFTP

## Example firewall intent

Allow publicly:

- `445/tcp`
- `2222/tcp`

Keep private:

- `22/tcp`
- `8787/tcp`
- `8788/tcp`
- `5432/tcp`

## App settings

Recommended:

- `hostname = <smb-hostname>`
- `browseShareEnabled = true` or `false` depending on preference
- `browseShareName = <name>`
- `smbPublicPort = 445`
- `VPS_SMB_PORT=445`
- `VPS_SMB_PUBLIC_PORT=445`
- `VPS_SFTP_PORT=2222`

Current hostname limitation:

- generated SMB URLs follow the configured hostname well
- if SFTP uses a different public hostname, document that separately for operators and clients

## Validation

Check:

```bash
curl -I http://127.0.0.1:8787/health
nc -vz <smb-hostname> 445
nc -vz <sftp-hostname> 2222
```

Then validate:

- one SMB share
- one SFTP login
- one Time Machine-enabled share if you rely on Time Machine
