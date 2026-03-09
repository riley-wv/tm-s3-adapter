'use client';

import { HardDrive } from 'lucide-react';
import { Button, Input, Label, FormGroup, Banner, Spinner } from './ui';

interface LoginPageProps {
  loginForm: { username: string; password: string };
  setLoginForm: React.Dispatch<React.SetStateAction<{ username: string; password: string }>>;
  onSubmit: (e: React.FormEvent) => void;
  submitting: boolean;
  error: string;
  sessionLoading?: boolean;
}

export function LoginPage({ loginForm, setLoginForm, onSubmit, submitting, error, sessionLoading }: LoginPageProps) {
  if (sessionLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="text-center">
          <Spinner className="mx-auto mb-3" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Loading session...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
      <div className="w-full max-w-sm animate-[fade-in_0.3s_ease]">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-lg p-8">
          <div className="text-center mb-6">
            <div className="mx-auto mb-4 h-12 w-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-md">
              <HardDrive className="h-6 w-6 text-white" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">TM Adapter</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Sign in to manage your Time Machine backups</p>
          </div>

          {error && <div className="mb-4"><Banner variant="error">{error}</Banner></div>}

          <form onSubmit={onSubmit} className="space-y-4">
            <FormGroup>
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                type="text"
                value={loginForm.username}
                onChange={(e) => setLoginForm((p) => ({ ...p, username: e.target.value }))}
                placeholder="admin"
                required
              />
            </FormGroup>

            <FormGroup>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={loginForm.password}
                onChange={(e) => setLoginForm((p) => ({ ...p, password: e.target.value }))}
                placeholder="Enter your password"
                required
              />
            </FormGroup>

            <Button variant="primary" size="lg" type="submit" disabled={submitting} className="w-full">
              {submitting ? 'Signing in...' : 'Sign in'}
            </Button>
          </form>
        </div>
      </div>
    </main>
  );
}
