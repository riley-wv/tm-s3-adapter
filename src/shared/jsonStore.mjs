import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export class JsonStore {
  constructor(filePath, defaultData) {
    this.filePath = filePath;
    this.defaultData = defaultData;
  }

  async load() {
    await mkdir(dirname(this.filePath), { recursive: true });
    try {
      const raw = await readFile(this.filePath, 'utf8');
      return JSON.parse(raw);
    } catch (error) {
      if (error.code === 'ENOENT') {
        await this.save(structuredClone(this.defaultData));
        return structuredClone(this.defaultData);
      }
      throw error;
    }
  }

  async save(data) {
    await mkdir(dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    await rename(tempPath, this.filePath);
  }

  async update(updateFn) {
    const current = await this.load();
    const next = await updateFn(current);
    await this.save(next);
    return next;
  }
}
