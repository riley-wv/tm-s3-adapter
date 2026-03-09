import { type RefObject, type FormEvent } from 'react';
import { Button, Card, Select, FormGroup, Badge, EmptyState, PageHeader, Spinner } from './ui';
import type { LogEntry, TailSource } from '../lib/types';
import { cn, formatTimestamp, normalizeLogLevel, formatTailSourceLabel } from '../lib/utils';
import { RefreshCw, Terminal as TerminalIcon, ScrollText, Filter } from 'lucide-react';

const terminalScreenClass =
  'bg-[#0a0f1a] dark:bg-[#060a12] border border-gray-800 dark:border-gray-700 rounded-lg p-3 font-mono text-xs text-[#c4dff6] leading-relaxed';

export interface LogsTabProps {
  // Tail
  tailSources: TailSource[];
  selectedTailSource: string;
  onTailSourceChange: (source: string) => void;
  tailLines: string[];
  tailConnected: boolean;
  tailLoading: boolean;
  tailError: string;
  tailMeta: { type: string; label: string } | null;
  tailAutoScroll: boolean;
  onTailAutoScrollChange: (v: boolean) => void;
  tailListRef: RefObject<HTMLDivElement | null>;
  onRefreshTailSources: () => void;
  // Terminal
  terminalSessionId: string;
  terminalConnected: boolean;
  terminalLoading: boolean;
  terminalError: string;
  terminalInput: string;
  onTerminalInputChange: (v: string) => void;
  terminalOutput: string;
  terminalOutputRef: RefObject<HTMLDivElement | null>;
  onTerminalSubmit: (e: FormEvent) => void;
  onTerminalRestart: () => void;
  onSendCtrlC: () => void;
  onClearOutput: () => void;
  // Adapter logs
  filteredLogs: LogEntry[];
  logsConnected: boolean;
  logsLoading: boolean;
  logsError: string;
  logHosts: string[];
  logDrives: string[];
  logsHostFilter: string;
  logsDriveFilter: string;
  onHostFilterChange: (v: string) => void;
  onDriveFilterChange: (v: string) => void;
  onResetFilters: () => void;
  logsListRef: RefObject<HTMLDivElement | null>;
}

export function LogsTab(props: LogsTabProps) {
  const {
    tailSources,
    selectedTailSource,
    onTailSourceChange,
    tailLines,
    tailConnected,
    tailLoading,
    tailError,
    tailMeta,
    tailAutoScroll,
    onTailAutoScrollChange,
    tailListRef,
    onRefreshTailSources,
    terminalConnected,
    terminalLoading,
    terminalError,
    terminalInput,
    onTerminalInputChange,
    terminalOutput,
    terminalOutputRef,
    onTerminalSubmit,
    onTerminalRestart,
    onSendCtrlC,
    onClearOutput,
    filteredLogs,
    logsConnected,
    logsLoading,
    logsError,
    logHosts,
    logDrives,
    logsHostFilter,
    logsDriveFilter,
    onHostFilterChange,
    onDriveFilterChange,
    onResetFilters,
    logsListRef,
  } = props;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
        {/* Tail Output Card */}
        <Card>
          <div className="flex items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Tail Output</h3>
              <Badge tone={tailConnected ? 'success' : 'warning'}>
                {tailConnected ? 'Live' : 'Reconnecting'}
              </Badge>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onRefreshTailSources}
              disabled={tailLoading}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh Sources
            </Button>
          </div>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <FormGroup label="Source" className="min-w-[180px]">
                <Select
                  value={selectedTailSource}
                  onChange={(e) => onTailSourceChange(e.target.value)}
                  disabled={tailLoading}
                >
                  {tailSources.map((s) => (
                    <option key={s.source} value={s.source}>
                      {formatTailSourceLabel(s)}
                    </option>
                  ))}
                </Select>
              </FormGroup>
              <label className="flex items-center gap-2 cursor-pointer select-none mt-6">
                <input
                  type="checkbox"
                  checked={tailAutoScroll}
                  onChange={(e) => onTailAutoScrollChange(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 accent-blue-600"
                />
                <span className="text-xs text-gray-600 dark:text-gray-400">Auto-scroll</span>
              </label>
            </div>
            {tailMeta && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {tailMeta.type}: {tailMeta.label}
              </p>
            )}
            <div
              ref={tailListRef}
              className={cn(
                terminalScreenClass,
                'min-h-[300px] max-h-[480px] overflow-y-auto overflow-x-auto',
              )}
            >
              {tailError && (
                <div className="text-red-400 text-xs mb-2">{tailError}</div>
              )}
              {tailLoading && !tailLines.length ? (
                <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 py-4">
                  <Spinner label="Connecting..." />
                </div>
              ) : tailLines.length === 0 ? (
                <div className="text-gray-500 dark:text-gray-400 py-4 text-xs">
                  Waiting for output...
                </div>
              ) : (
                tailLines.map((line, i) => (
                  <div key={i} className="whitespace-pre-wrap break-all">
                    {line}
                  </div>
                ))
              )}
            </div>
          </div>
        </Card>

        {/* Terminal Card */}
        <Card>
          <div className="flex items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Terminal</h3>
              <Badge tone={terminalConnected ? 'success' : 'warning'}>
                {terminalConnected ? 'Connected' : 'Reconnecting'}
              </Badge>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onTerminalRestart}
              disabled={terminalLoading}
            >
              Restart Session
            </Button>
          </div>
          <div className="space-y-3">
            <div
              ref={terminalOutputRef}
              className={cn(
                terminalScreenClass,
                'min-h-[300px] max-h-[480px] overflow-y-auto overflow-x-auto',
              )}
            >
              {terminalError && (
                <div className="text-red-400 text-xs mb-2">{terminalError}</div>
              )}
              {terminalLoading && !terminalOutput ? (
                <div className="text-gray-500 dark:text-gray-400 py-4 text-xs">
                  Starting session...
                </div>
              ) : (
                <pre className="whitespace-pre-wrap break-all m-0">{terminalOutput || ''}</pre>
              )}
            </div>
            <form onSubmit={onTerminalSubmit} className="flex items-center gap-2">
              <span className="text-[#c4dff6] font-mono text-xs">$</span>
              <input
                type="text"
                value={terminalInput}
                onChange={(e) => onTerminalInputChange(e.target.value)}
                placeholder="Enter command..."
                className="flex-1 rounded border border-gray-700 dark:border-gray-600 bg-gray-900 dark:bg-gray-950 text-[#c4dff6] text-xs font-mono px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                disabled={!terminalConnected || terminalLoading}
              />
              <Button type="submit" size="sm" disabled={!terminalConnected || terminalLoading}>
                Run
              </Button>
            </form>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onSendCtrlC}
                disabled={!terminalConnected || terminalLoading}
              >
                Send Ctrl+C
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onClearOutput}
              >
                Clear Output
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* Adapter Events Card */}
      <Card>
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Adapter Events
            </h3>
            <Badge tone={logsConnected ? 'success' : 'warning'}>
              {logsConnected ? 'Live' : 'Reconnecting'}
            </Badge>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {filteredLogs.length} entries
            </span>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onResetFilters}>
            Reset Filters
          </Button>
        </div>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <FormGroup label="Host" className="min-w-[140px]">
              <Select
                value={logsHostFilter}
                onChange={(e) => onHostFilterChange(e.target.value)}
              >
                <option value="">All hosts</option>
                {logHosts.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </Select>
            </FormGroup>
            <FormGroup label="Drive" className="min-w-[140px]">
              <Select
                value={logsDriveFilter}
                onChange={(e) => onDriveFilterChange(e.target.value)}
              >
                <option value="">All drives</option>
                {logDrives.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </Select>
            </FormGroup>
          </div>
          <div
            ref={logsListRef}
            className="max-h-[480px] overflow-y-auto overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800"
          >
            {logsError && (
              <div className="px-3 py-2 text-red-600 dark:text-red-400 text-xs">{logsError}</div>
            )}
            {logsLoading && !filteredLogs.length ? (
              <div className="py-12">
                <Spinner label="Loading logs..." />
              </div>
            ) : filteredLogs.length === 0 ? (
              <EmptyState
                icon={<ScrollText className="h-8 w-8" />}
                title="No log entries"
                description="Logs will appear here when adapter events occur."
              />
            ) : (
              filteredLogs.map((entry) => (
                <div
                  key={entry.id}
                  className={cn(
                    'border-b border-gray-100 dark:border-gray-800 last:border-b-0',
                    'hover:bg-gray-50 dark:hover:bg-gray-800/50',
                    'px-3 py-2.5 flex flex-wrap items-start gap-2',
                  )}
                >
                  <span className="font-mono text-[10px] text-gray-500 dark:text-gray-400 shrink-0">
                    {formatTimestamp(entry.timestamp)}
                  </span>
                  <Badge tone={normalizeLogLevel(entry.level)} dot>
                    {entry.level}
                  </Badge>
                  {entry.host && (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                      {entry.host}
                    </span>
                  )}
                  {entry.drive && (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                      {entry.drive}
                    </span>
                  )}
                  <span className="font-mono text-xs text-gray-800 dark:text-gray-200 break-all flex-1 min-w-0">
                    {entry.message}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
