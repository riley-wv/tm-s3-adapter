import {
  HardDrive,
  Cloud,
  ScrollText,
  Settings,
  LogOut,
  Sun,
  Moon,
  Monitor,
  Menu,
  X,
} from 'lucide-react';
import type { TabId, ThemeMode } from '../lib/types';
import { cn } from '../lib/utils';

interface NavItem {
  id: TabId;
  label: string;
  icon: typeof HardDrive;
  count?: number;
}

const navItems: NavItem[] = [
  { id: 'shares', label: 'Shares', icon: HardDrive },
  { id: 'mounts', label: 'Cloud Mounts', icon: Cloud },
  { id: 'logs', label: 'Live Logs', icon: ScrollText },
  { id: 'settings', label: 'Settings', icon: Settings },
];

interface SidebarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  currentUser: string;
  theme: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
  onLogout: () => void;
  submitting: boolean;
  sidebarOpen: boolean;
  onSidebarToggle: () => void;
  counts: Partial<Record<TabId, number>>;
}

export function Sidebar({
  activeTab,
  onTabChange,
  currentUser,
  theme,
  onThemeChange,
  onLogout,
  submitting,
  sidebarOpen,
  onSidebarToggle,
  counts,
}: SidebarProps) {
  return (
    <>
      {/* Mobile header */}
      <div className="lg:hidden sticky top-0 z-50 flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <button onClick={onSidebarToggle} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer">
          {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
        <span className="font-semibold text-sm tracking-tight">TM Adapter</span>
      </div>

      {/* Backdrop */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/30 z-40"
          onClick={onSidebarToggle}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed lg:sticky top-0 left-0 z-50 lg:z-auto h-screen w-60 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col transition-transform duration-200 lg:translate-x-0',
          sidebarOpen ? 'translate-x-0 shadow-xl lg:shadow-none' : '-translate-x-full',
        )}
      >
        {/* Brand */}
        <div className="px-4 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2.5 mb-1.5">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-sm">
              <HardDrive className="h-4 w-4 text-white" />
            </div>
            <span className="font-bold text-sm tracking-tight text-gray-900 dark:text-gray-100">
              TM Adapter
            </span>
          </div>
          <div className="flex items-center gap-1.5 pl-0.5">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
            <span className="text-[11px] text-gray-400 dark:text-gray-500">
              {currentUser || 'admin'}
            </span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          <p className="px-3 mb-1 text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-600">
            Management
          </p>
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            const count = counts[item.id];
            return (
              <button
                key={item.id}
                onClick={() => {
                  onTabChange(item.id);
                  onSidebarToggle();
                }}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-100 cursor-pointer',
                  active
                    ? 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-400'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-200',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
                {count !== undefined && (
                  <span
                    className={cn(
                      'ml-auto text-[11px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center',
                      active
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400',
                    )}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-3 py-3 border-t border-gray-100 dark:border-gray-800 space-y-2">
          {/* Theme */}
          <div className="flex items-center gap-1 p-0.5 bg-gray-100 dark:bg-gray-800 rounded-lg">
            {([
              { mode: 'light' as ThemeMode, Icon: Sun, tip: 'Light' },
              { mode: 'system' as ThemeMode, Icon: Monitor, tip: 'System' },
              { mode: 'dark' as ThemeMode, Icon: Moon, tip: 'Dark' },
            ]).map(({ mode, Icon, tip }) => (
              <button
                key={mode}
                onClick={() => onThemeChange(mode)}
                title={tip}
                className={cn(
                  'flex-1 flex items-center justify-center py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer',
                  theme === mode
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-xs'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            ))}
          </div>

          {/* Logout */}
          <button
            onClick={onLogout}
            disabled={submitting}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200 transition-colors disabled:opacity-40 cursor-pointer"
          >
            <LogOut className="h-4 w-4" />
            <span>Sign out</span>
          </button>
        </div>
      </aside>
    </>
  );
}
