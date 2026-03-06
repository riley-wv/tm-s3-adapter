import { Pool } from 'pg';

function sslConfigFromMode(mode) {
  const normalized = String(mode || 'disable').trim().toLowerCase();
  if (normalized === 'disable') {
    return false;
  }
  if (normalized === 'require') {
    return { rejectUnauthorized: false };
  }
  return { rejectUnauthorized: true };
}

export class PostgresSettingsStore {
  constructor(config = {}) {
    this.pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      ssl: sslConfigFromMode(config.sslMode)
    });
    this.ready = false;
  }

  async ensureReady() {
    if (this.ready) {
      return;
    }
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS tm_adapter_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        settings JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    this.ready = true;
  }

  async loadSettings() {
    await this.ensureReady();
    const { rows } = await this.pool.query('SELECT settings FROM tm_adapter_settings WHERE id = 1');
    if (!rows.length) {
      return null;
    }
    return rows[0].settings && typeof rows[0].settings === 'object' ? rows[0].settings : null;
  }

  async saveSettings(settings = {}) {
    await this.ensureReady();
    await this.pool.query(
      `
        INSERT INTO tm_adapter_settings (id, settings, updated_at)
        VALUES (1, $1::jsonb, NOW())
        ON CONFLICT (id)
        DO UPDATE SET settings = EXCLUDED.settings, updated_at = NOW()
      `,
      [JSON.stringify(settings)]
    );
  }

  async close() {
    await this.pool.end();
  }
}
