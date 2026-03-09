'use client';

import { HardDrive, Cloud, ScrollText, Settings, LogOut, Sun, Moon, Monitor } from 'lucide-react';
import type { TabId, ThemeMode } from '../lib/types';
import { cn } from '../lib/utils';

interface NavItem {
  id: TabId;
  label: string;
  icon: typeof HardDrive;
  count?: number;
}

interface SidebarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  navItems: NavItem[];
  currentUser: string;
  theme: ThemeMode;
  onThemeChange: (t: ThemeMode) => void;
  onLogout: () => void;
  submitting: boolean;
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ activeTab, onTabChange, navItems, currentUser, theme, onThemeChange, onLogout, submitting, isOpen, onClose }: SidebarProps) {
  return (
    <>
      {isOpen && <div className="fixed inset-0 bg-black/20 dark:bg-black/40 z-40 lg:hidden" onClick={onClose} />}
      <aside className={cn(
        'fixed lg:sticky top-0 left-0 z-50 lg:z-auto h-screen w-60 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col transition-transform duration-200 lg:translate-x-0',
        isOpen ? 'translate-x-0 shadow-xl' : '-translate-x-full'
      )}>
        <div className="px-4 pt-5 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5 mb-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-sm">
              <HardDrive className="h-4 w-4 text-white" />
            </div>
            <span className="font-bold text-slate-900 dark:text-slate-100 tracking-tight">TM Adapter</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500 pl-0.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            {currentUser || 'admin'}
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-2.5 py-3">
          <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest px-2.5 mb-2">Management</div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => { onTabChange(item.id); onClose(); }}
                className={cn(
                  'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors mb-0.5',
                  active
                    ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-200'
                )}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                <span className="flex-1 text-left">{item.label}</span>
                {item.count !== undefined && (
                  <span className={cn(
                    'text-[11px] font-bold min-w-[22px] text-center rounded-full px-1.5 py-0.5',
                    active ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                  )}>{item.count}</span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="px-3 pb-4 border-t border-slate-100 dark:border-slate-800 pt-3 space-y-2">
          <div className="flex items-center gap-1 p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg">
            {([
              { id: 'light' as const, icon: Sun, label: 'Light' },
              { id: 'system' as const, icon: Monitor, label: 'System' },
              { id: 'dark' as const, icon: Moon, label: 'Dark' },
            ]).map(({ id, icon: TIcon }) => (
              <button
                key={id}
                onClick={() => onThemeChange(id)}
                className={cn(
                  'flex-1 flex items-center justify-center py-1.5 rounded-md text-xs font-medium transition-all',
                  theme === id
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                )}
                title={id}
              >
                <TIcon className="h-3.5 w-3.5" />
              </button>
            ))}
          </div>
          <button
            onClick={onLogout}
            disabled={submitting}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-200 transition-colors disabled:opacity-50"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>
    </>
  );
}

export const NAV_ICONS = { drives: HardDrive, mounts: Cloud, logs: ScrollText, settings: Settings } as const;
