import { type FormEvent, useState } from 'react';
import { HardDrive, AlertCircle } from 'lucide-react';
import { Button, Input, Label } from './ui';

interface LoginPageProps {
  onLogin: (username: string, password: string) => Promise<void>;
  error: string;
  submitting: boolean;
}

export function LoginPage({ onLogin, error, submitting }: LoginPageProps) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await onLogin(username, password);
    setPassword('');
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-4 bg-gray-50 dark:bg-gray-950">
      <div className="w-full max-w-sm animate-in">
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-8 shadow-lg text-center">
          <div className="mx-auto mb-5 h-14 w-14 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-md">
            <HardDrive className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-lg font-bold tracking-tight text-gray-900 dark:text-gray-100 mb-1">
            TM Adapter
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-6">
            Sign in to manage your Time Machine backups
          </p>

          {error && (
            <div className="flex items-center gap-2 text-sm text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2.5 mb-4 text-left">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="text-left space-y-4">
            <div>
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                required
                autoComplete="username"
              />
            </div>

            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                autoComplete="current-password"
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              loading={submitting}
            >
              {submitting ? 'Signing in...' : 'Sign in'}
            </Button>
          </form>
        </div>
      </div>
    </main>
  );
}
