'use client';

import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { ScrollText, RefreshCw, Terminal } from 'lucide-react';
import { Button, Select, Label, FormGroup, Input, Card, CardHeader, CardBody, PageHeader, Badge, Checkbox, Spinner, EmptyState } from './ui';
import type { DashboardState, LogEntry, TailSource } from '../lib/types';
import { MAX_DASHBOARD_LOGS, MAX_TAIL_LINES, DEFAULT_TAIL_LINE_COUNT, MAX_TERMINAL_CHARS } from '../lib/constants';
import { api } from '../lib/api';
import { formatTimestamp, normalizeLogLevel, parseEventData, formatTailSourceLabel, cn } from '../lib/utils';

interface LogsTabProps {
  dashboard: DashboardState;
  authenticated: boolean;
}

export function LogsTab({ authenticated }: LogsTabProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logHosts, setLogHosts] = useState<string[]>([]);
  const [logDrives, setLogDrives] = useState<string[]>([]);
  const [hostFilter, setHostFilter] = useState('all');
  const [driveFilter, setDriveFilter] = useState('all');
  const [logsConnected, setLogsConnected] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState('');
  const logsListRef = useRef<HTMLDivElement>(null);

  const [tailSources, setTailSources] = useState<TailSource[]>([]);
  const [selectedTail, setSelectedTail] = useState('');
  const [tailLines, setTailLines] = useState<string[]>([]);
  const [tailConnected, setTailConnected] = useState(false);
  const [tailLoading, setTailLoading] = useState(false);
  const [tailError, setTailError] = useState('');
  const [tailMeta, setTailMeta] = useState<{ label?: string; type?: string } | null>(null);
  const [tailAutoScroll, setTailAutoScroll] = useState(true);
  const tailListRef = useRef<HTMLDivElement>(null);

  const [termSessionId, setTermSessionId] = useState('');
  const [termConnected, setTermConnected] = useState(false);
  const [termLoading, setTermLoading] = useState(false);
  const [termError, setTermError] = useState('');
  const [termInput, setTermInput] = useState('');
  const [termOutput, setTermOutput] = useState('');
  const termRef = useRef<HTMLDivElement>(null);

  const filteredLogs = useMemo(() => logs.filter((e) => (hostFilter === 'all' || e.host === hostFilter) && (driveFilter === 'all' || e.drive === driveFilter)), [logs, hostFilter, driveFilter]);

  const refreshTailSources = useCallback(async (bg = false) => {
    if (!bg) { setTailLoading(true); setTailError(''); }
    try {
      const p = await api<{ sources: TailSource[] }>('/admin/api/log-tail/sources');
      const next = Array.isArray(p?.sources) ? p.sources : [];
      setTailSources(next);
      setSelectedTail((prev) => (prev && next.some((s) => s.source === prev)) ? prev : next[0]?.source || '');
      if (!next.length) setTailError('No log sources available');
    } catch (e) { setTailError((e as Error).message || 'Unable to load log sources'); }
    finally { if (!bg) setTailLoading(false); }
  }, []);

  const appendTailLine = useCallback((line: string, stream = 'stdout') => {
    if (line === undefined || line === null) return;
    const formatted = `${stream === 'stderr' ? '[stderr] ' : ''}${String(line)}`;
    setTailLines((prev) => { const n = [...prev, formatted]; return n.length > MAX_TAIL_LINES ? n.slice(n.length - MAX_TAIL_LINES) : n; });
  }, []);

  const appendTermChunk = useCallback((chunk: string) => {
    if (!chunk) return;
    setTermOutput((prev) => { const n = `${prev}${String(chunk)}`; return n.length > MAX_TERMINAL_CHARS ? n.slice(n.length - MAX_TERMINAL_CHARS) : n; });
  }, []);

  const sendTermInput = useCallback(async (input: string) => {
    if (!termSessionId || !input) return;
    try { await api(`/admin/api/terminal/sessions/${termSessionId}/input`, { method: 'POST', body: JSON.stringify({ input }) }); setTermError(''); }
    catch (e) { setTermError((e as Error).message || 'Failed to send command'); }
  }, [termSessionId]);

  // Initial log fetch
  useEffect(() => {
    if (!authenticated) { setLogs([]); setLogHosts([]); setLogDrives([]); return; }
    let c = false; setLogsLoading(true);
    (async () => {
      try { const p = await api<{ logs: LogEntry[]; hosts: string[]; drives: string[] }>('/admin/api/logs'); if (c) return; setLogs(Array.isArray(p?.logs) ? p.logs.slice(-MAX_DASHBOARD_LOGS) : []); setLogHosts(Array.isArray(p?.hosts) ? p.hosts : []); setLogDrives(Array.isArray(p?.drives) ? p.drives : []); }
      catch (e) { if (!c) setLogsError((e as Error).message || 'Unable to load logs'); }
      finally { if (!c) setLogsLoading(false); }
    })();
    return () => { c = true; };
  }, [authenticated]);

  // Log SSE stream
  useEffect(() => {
    if (!authenticated) return;
    let closed = false; let rt: ReturnType<typeof setTimeout>; let stream: EventSource;
    const connect = () => {
      if (closed) return; stream = new EventSource('/admin/api/logs/stream');
      stream.onopen = () => { setLogsConnected(true); setLogsError(''); };
      stream.addEventListener('snapshot', (e) => { const p = parseEventData<{ logs: LogEntry[]; hosts: string[]; drives: string[] }>(e); if (!p || closed) return; setLogs(Array.isArray(p.logs) ? p.logs.slice(-MAX_DASHBOARD_LOGS) : []); setLogHosts(Array.isArray(p.hosts) ? p.hosts : []); setLogDrives(Array.isArray(p.drives) ? p.drives : []); });
      stream.addEventListener('log', (e) => { const entry = parseEventData<LogEntry>(e); if (!entry || closed) return; setLogs((prev) => { const n = [...prev, entry]; return n.length > MAX_DASHBOARD_LOGS ? n.slice(n.length - MAX_DASHBOARD_LOGS) : n; }); if (entry.host) setLogHosts((prev) => prev.includes(entry.host!) ? prev : [...prev, entry.host!].sort()); if (entry.drive) setLogDrives((prev) => prev.includes(entry.drive!) ? prev : [...prev, entry.drive!].sort()); });
      stream.onerror = () => { setLogsConnected(false); setLogsError('Live stream disconnected, retrying...'); stream?.close(); if (!closed) rt = setTimeout(connect, 2000); };
    };
    connect();
    return () => { closed = true; clearTimeout(rt); stream?.close(); };
  }, [authenticated]);

  // Tail sources refresh
  useEffect(() => {
    if (!authenticated) return;
    let c = false; let iv: ReturnType<typeof setInterval>;
    (async () => { await refreshTailSources(); if (c) return; iv = setInterval(() => refreshTailSources(true).catch(() => { }), 15000); })();
    return () => { c = true; clearInterval(iv); };
  }, [authenticated, refreshTailSources]);

  // Tail SSE
  useEffect(() => {
    if (!authenticated || !selectedTail) { setTailConnected(false); return; }
    let closed = false; let rt: ReturnType<typeof setTimeout>; let stream: EventSource;
    setTailLines([]); setTailMeta(null); setTailError('');
    const connect = () => {
      if (closed) return; stream = new EventSource(`/admin/api/log-tail/stream?source=${encodeURIComponent(selectedTail)}&lines=${DEFAULT_TAIL_LINE_COUNT}`);
      stream.onopen = () => { setTailConnected(true); setTailError(''); };
      stream.addEventListener('source', (e) => { const p = parseEventData<{ label: string; type: string }>(e); if (p && !closed) setTailMeta(p); });
      stream.addEventListener('line', (e) => { const p = parseEventData<{ line: string; stream?: string }>(e); if (p && !closed) appendTailLine(p.line, p.stream); });
      stream.addEventListener('status', (e) => { const p = parseEventData<{ state: string; message?: string }>(e); if (p?.state === 'error' && !closed) setTailError(p.message || 'Tail error'); });
      stream.onerror = () => { setTailConnected(false); setTailError('Tail disconnected, retrying...'); stream?.close(); if (!closed) rt = setTimeout(connect, 2000); };
    };
    connect();
    return () => { closed = true; clearTimeout(rt); stream?.close(); };
  }, [authenticated, selectedTail, appendTailLine]);

  // Terminal session
  useEffect(() => {
    if (!authenticated || termSessionId) return;
    let c = false; setTermLoading(true);
    (async () => { try { const p = await api<{ sessionId: string }>('/admin/api/terminal/sessions', { method: 'POST', body: '{}' }); if (!c) setTermSessionId(p?.sessionId || ''); } catch (e) { if (!c) setTermError((e as Error).message); } finally { if (!c) setTermLoading(false); } })();
    return () => { c = true; };
  }, [authenticated, termSessionId]);

  // Terminal SSE
  useEffect(() => {
    if (!authenticated || !termSessionId) { setTermConnected(false); return; }
    let closed = false; let rt: ReturnType<typeof setTimeout>; let stream: EventSource;
    const connect = () => {
      if (closed) return; stream = new EventSource(`/admin/api/terminal/sessions/${termSessionId}/stream`);
      stream.onopen = () => { setTermConnected(true); setTermError(''); };
      stream.addEventListener('snapshot', (e) => { const p = parseEventData<{ output: string }>(e); if (p && !closed && typeof p.output === 'string') setTermOutput(p.output); });
      stream.addEventListener('output', (e) => { const p = parseEventData<{ chunk: string }>(e); if (p && !closed) appendTermChunk(p.chunk); });
      stream.addEventListener('status', (e) => { const p = parseEventData<{ state: string; message?: string }>(e); if (!p || closed) return; if (p.state === 'closed') setTermConnected(false); if (p.state === 'error') setTermError(p.message || 'Terminal error'); });
      stream.onerror = () => { setTermConnected(false); stream?.close(); if (!closed) rt = setTimeout(connect, 2000); };
    };
    connect();
    return () => { closed = true; clearTimeout(rt); stream?.close(); };
  }, [authenticated, termSessionId, appendTermChunk]);

  // Auto-scroll effects
  useEffect(() => { logsListRef.current && (logsListRef.current.scrollTop = logsListRef.current.scrollHeight); }, [filteredLogs]);
  useEffect(() => { if (tailAutoScroll && tailListRef.current) tailListRef.current.scrollTop = tailListRef.current.scrollHeight; }, [tailAutoScroll, tailLines]);
  useEffect(() => { termRef.current && (termRef.current.scrollTop = termRef.current.scrollHeight); }, [termOutput]);

  // Cleanup terminal on logout
  useEffect(() => { if (!authenticated && termSessionId) { fetch(`/admin/api/terminal/sessions/${termSessionId}`, { method: 'DELETE' }).catch(() => { }); setTermSessionId(''); setTermOutput(''); setTermInput(''); setTermConnected(false); } }, [authenticated, termSessionId]);

  const handleTermSubmit = async (e: React.FormEvent) => { e.preventDefault(); if (!termInput.trim()) return; await sendTermInput(`${termInput}\n`); setTermInput(''); };
  const handleRestartTerm = async () => { if (termSessionId) await api(`/admin/api/terminal/sessions/${termSessionId}`, { method: 'DELETE' }).catch(() => { }); setTermSessionId(''); setTermOutput(''); setTermInput(''); setTermConnected(false); setTermError(''); };

  return (
    <div className="animate-[fade-in_0.2s_ease]">
      <PageHeader title="Live Logs" description="Full tail output with source switching and built-in shell access." />

      {tailError && <div className="mb-3 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 rounded-lg px-3 py-2">{tailError}</div>}
      {termError && <div className="mb-3 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 rounded-lg px-3 py-2">{termError}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Tail Output */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2"><ScrollText className="h-4 w-4 text-slate-400" /><span className="text-sm font-semibold text-slate-900 dark:text-slate-100">Tail Output</span></div>
            <div className="flex items-center gap-2">
              <Badge tone={tailConnected ? 'success' : 'warning'} dot>{tailConnected ? 'Live' : 'Reconnecting'}</Badge>
              <Button size="sm" onClick={() => refreshTailSources()}><RefreshCw className="h-3 w-3" /></Button>
            </div>
          </CardHeader>
          <CardBody>
            <div className="flex flex-wrap items-end gap-3 mb-3">
              <div className="min-w-[200px] flex-1">
                <Label>Source</Label>
                <Select value={selectedTail} onChange={(e) => setSelectedTail(e.target.value)} disabled={tailLoading || !tailSources.length}>
                  {!tailSources.length ? <option value="">No sources</option> : tailSources.map((s) => <option key={s.source} value={s.source}>{formatTailSourceLabel(s)}</option>)}
                </Select>
              </div>
              <Checkbox label="Auto-scroll" checked={tailAutoScroll} onChange={setTailAutoScroll} />
            </div>
            {tailMeta?.label && <div className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 rounded px-2.5 py-1.5 mb-2 border border-slate-100 dark:border-slate-800">Streaming {tailMeta.type === 'container' ? 'container' : 'service'}: <strong>{tailMeta.label}</strong></div>}
            <div className="terminal-screen" ref={tailListRef}>
              {!tailLines.length ? <div className="text-slate-500">{tailLoading ? 'Loading...' : 'Waiting for log output...'}</div> :
                tailLines.map((line, i) => <div key={`${selectedTail}-${i}`} className="whitespace-pre-wrap break-words">{line || ' '}</div>)}
            </div>
          </CardBody>
        </Card>

        {/* Terminal */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2"><Terminal className="h-4 w-4 text-slate-400" /><span className="text-sm font-semibold text-slate-900 dark:text-slate-100">Terminal</span></div>
            <div className="flex items-center gap-2">
              <Badge tone={termConnected ? 'success' : 'warning'} dot>{termConnected ? 'Connected' : 'Reconnecting'}</Badge>
              <Button size="sm" onClick={handleRestartTerm} disabled={termLoading}><RefreshCw className="h-3 w-3" /></Button>
            </div>
          </CardHeader>
          <CardBody>
            <div className="terminal-screen min-h-[300px]" ref={termRef}>
              {termOutput ? <pre className="whitespace-pre-wrap break-words m-0 text-inherit font-inherit">{termOutput}</pre> :
                <div className="text-slate-500">{termLoading ? 'Starting terminal...' : 'Terminal output appears here.'}</div>}
            </div>
            <form onSubmit={handleTermSubmit} className="flex items-center gap-2 mt-2.5">
              <span className="font-mono font-bold text-blue-500 text-sm">$</span>
              <Input value={termInput} onChange={(e) => setTermInput(e.target.value)} placeholder="Type a command and press Enter" disabled={!termSessionId || termLoading} className="flex-1 font-mono text-xs" />
              <Button size="sm" type="submit" disabled={!termSessionId || termLoading}>Run</Button>
            </form>
            <div className="flex gap-2 mt-2">
              <Button size="sm" variant="ghost" type="button" onClick={() => sendTermInput('\u0003')}>Ctrl+C</Button>
              <Button size="sm" variant="ghost" type="button" onClick={() => setTermOutput('')}>Clear</Button>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Adapter Events */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{filteredLogs.length} Adapter Event{filteredLogs.length !== 1 ? 's' : ''}</span>
            <Badge tone={logsConnected ? 'success' : 'warning'} dot>{logsConnected ? 'Live' : 'Reconnecting'}</Badge>
          </div>
          <Button size="sm" onClick={() => { setHostFilter('all'); setDriveFilter('all'); }}>Reset Filters</Button>
        </CardHeader>
        <CardBody>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <FormGroup>
              <Label>Host</Label>
              <Select value={hostFilter} onChange={(e) => setHostFilter(e.target.value)}>
                <option value="all">All hosts</option>
                {logHosts.map((h) => <option key={h} value={h}>{h}</option>)}
              </Select>
            </FormGroup>
            <FormGroup>
              <Label>Drive</Label>
              <Select value={driveFilter} onChange={(e) => setDriveFilter(e.target.value)}>
                <option value="all">All drives</option>
                {logDrives.map((d) => <option key={d} value={d}>{d}</option>)}
              </Select>
            </FormGroup>
          </div>

          {logsError && <div className="mb-3 text-xs text-red-600 dark:text-red-400">{logsError}</div>}
          {logsLoading ? (
            <div className="text-center py-8"><Spinner className="mx-auto mb-2" /><p className="text-xs text-slate-500">Loading logs...</p></div>
          ) : !filteredLogs.length ? (
            <EmptyState icon={<ScrollText className="h-8 w-8 mx-auto" />} title="No logs available" description="Activity will appear as requests and backup events happen." />
          ) : (
            <div ref={logsListRef} className="border border-slate-200 dark:border-slate-800 rounded-lg bg-slate-50 dark:bg-slate-800/30 max-h-[400px] overflow-auto divide-y divide-slate-100 dark:divide-slate-800">
              {filteredLogs.map((entry) => (
                <div key={entry.id} className="px-3 py-2.5 hover:bg-white dark:hover:bg-slate-800/50 transition-colors">
                  <div className="flex flex-wrap items-center gap-1.5 mb-1">
                    <span className="font-mono text-[11px] text-slate-400">{formatTimestamp(entry.timestamp)}</span>
                    <Badge tone={normalizeLogLevel(entry.level)}>{String(entry.level || 'info').toUpperCase()}</Badge>
                    {entry.host && <span className="font-mono text-[11px] text-slate-500 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full px-2 py-0.5">{entry.host}</span>}
                    {entry.drive && <span className="font-mono text-[11px] text-slate-500 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full px-2 py-0.5">{entry.drive}</span>}
                  </div>
                  <div className="font-mono text-xs text-slate-800 dark:text-slate-200 break-words leading-relaxed">{entry.message}</div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
