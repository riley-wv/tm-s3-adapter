import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readdir, stat } from 'node:fs/promises';
import { join, normalize, resolve, sep } from 'node:path';

export async function ensureDir(path) {
  await mkdir(path, { recursive: true });
}

export function safeJoin(baseDir, relativePath = '') {
  const normalized = normalize(relativePath).replace(/^([/\\])+/, '');
  const full = resolve(baseDir, normalized);
  const resolvedBase = resolve(baseDir);

  if (full !== resolvedBase && !full.startsWith(`${resolvedBase}${sep}`)) {
    const error = new Error('Invalid path');
    error.statusCode = 400;
    throw error;
  }

  return full;
}

export async function walkFiles(rootDir, onFile, currentPrefix = '') {
  const dirPath = join(rootDir, currentPrefix);
  const entries = await readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const relPath = currentPrefix ? join(currentPrefix, entry.name) : entry.name;
    if (entry.isDirectory()) {
      await walkFiles(rootDir, onFile, relPath);
      continue;
    }

    if (entry.isFile()) {
      const fullPath = join(rootDir, relPath);
      const stats = await stat(fullPath);
      await onFile({ relPath: relPath.split('\\').join('/'), fullPath, stats });
    }
  }
}

export async function sha256File(filePath) {
  const hash = createHash('sha256');

  await new Promise((resolvePromise, rejectPromise) => {
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', rejectPromise);
    stream.on('end', resolvePromise);
  });

  return hash.digest('hex');
}
