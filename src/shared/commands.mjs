import { spawn } from 'node:child_process';

export async function runCommand(command, args, options = {}) {
  const { cwd, env = process.env } = options;

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });

    child.on('error', (error) => reject(error));

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ code, stdout, stderr });
        return;
      }

      const error = new Error(`Command failed: ${command} ${args.join(' ')}\n${stderr.trim()}`.trim());
      error.code = code;
      error.stdout = stdout;
      error.stderr = stderr;
      reject(error);
    });
  });
}
