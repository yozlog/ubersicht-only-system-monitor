import config from './config.json';
import { run } from 'uebersicht';

const allPages = ['cpu', 'gpu', 'memory', 'disk', 'network'];
const monitors = Array.isArray(config.monitors) ? [...new Set(config.monitors.filter(key => allPages.includes(key)))] : allPages;
const pages = config.overview !== false && monitors.length ? ['overview', ...monitors] : monitors;
const pageSignature = pages.join(',');
const titles = { overview: 'Overview', cpu: 'CPU', gpu: 'GPU', memory: 'Memory', disk: 'Disk', network: 'Network' };
const defaultAccents = { cpu: '#329ee8', gpu: '#329ee8', memory: '#23b7b8', disk: '#dca212', network: '#329ee8', upload: '#f24b7d' };
const accents = Object.fromEntries(Object.entries(defaultAccents).map(([key, fallback]) => {
  const value = config.colors && config.colors.accents && config.colors.accents[key];
  return [key, typeof value === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value) ? value : fallback];
}));
const storageKey = 'system-status.page.v1';
const finite = value => Number.isFinite(value);
const defaultFonts = ['Input Mono', 'Fira Code', 'Menlo', 'monospace'];
const requestedFonts = Array.isArray(config.fontFamily) ? config.fontFamily : [config.fontFamily];
const fonts = requestedFonts.filter(value => typeof value === 'string' && /^[a-zA-Z0-9 _\-\u0080-\uFFFF]+$/.test(value) && value.trim());
const fontFamily = (fonts.length ? fonts : defaultFonts).map(value => ['serif', 'sans-serif', 'monospace', 'system-ui'].includes(value) ? value : JSON.stringify(value)).join(', ');
const fontSize = finite(config.fontSize) && config.fontSize >= 8 && config.fontSize <= 24 ? config.fontSize : 12;
const textSize = size => `${size * fontSize / 12}px`;
const percent = value => finite(value) ? `${Math.round(value)}%` : '—';
const top = finite(config.top) ? config.top : 44;
const left = finite(config.left) ? config.left : 20;
const width = finite(config.width) ? Math.max(240, config.width) : 290;
const maxHeight = finite(config.maxHeight) && config.maxHeight > 0 ? config.maxHeight : 177;
const minHeight = finite(config.minHeight) && config.minHeight > 0 ? Math.min(config.minHeight, maxHeight) : maxHeight;
export const refreshFrequency = finite(config.refreshInterval) ? Math.max(3000, config.refreshInterval) : 5000;

function channels(value, fallback) {
  if (typeof value !== 'string' || !/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)) return fallback;
  const hex = value.length === 4 ? value.slice(1).split('').map(char => char + char).join('') : value.slice(1);
  return [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16)).join(', ');
}
function theme(mode, fg, bg, opacity) {
  const colors = (config.colors && config.colors[mode]) || {};
  return `--fg: ${channels(colors.foreground, fg)}; --bg: ${channels(colors.background, bg)}; --opacity: ${finite(colors.backgroundOpacity) && colors.backgroundOpacity >= 0 && colors.backgroundOpacity <= 1 ? colors.backgroundOpacity : opacity};`;
}

export const className = `
  top: ${top}px; left: ${left}px; width: ${width}px;
  min-height: ${minHeight}px; max-height: ${maxHeight}px;
  box-sizing: border-box; padding: 16px 20px; border-radius: 16px;
  overflow-y: auto; overflow-x: hidden; overscroll-behavior-y: contain;
  ${theme('light', '0, 0, 0', '255, 255, 255', .25)}
  @media (prefers-color-scheme: dark) { ${theme('dark', '255, 255, 255', '0, 0, 0', .2)} }
  background: rgba(var(--bg), var(--opacity)); color: rgb(var(--fg));
  font: ${fontSize}px/1.6 ${fontFamily};
  * { box-sizing: border-box; }
  header, nav, .reading, .meta, .process { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
  header { height: 24px; }
  h1 { font-size: ${textSize(14)}; font-weight: 500; margin: 0; display: flex; align-items: center; gap: 8px; }
  .indicator { width: 7px; height: 7px; border-radius: 50%; background: var(--accent); }
  nav { font-size: ${textSize(9)}; gap: 5px; }
  .muted, .meta, summary { color: rgba(var(--fg), .7); }
  button { color: inherit; font: inherit; font-size: ${textSize(13)}; width: 25px; height: 24px; padding: 0; border: 1px solid rgba(var(--fg), .3); border-radius: 6px; background: rgba(var(--fg), .05); cursor: pointer; }
  button:disabled { opacity: .4; cursor: default; }
  button:hover { border-color: rgb(var(--fg)); }
  section:focus { outline: none; }
  button:focus-visible, summary:focus-visible { outline: 2px solid rgb(var(--fg)); outline-offset: 2px; }
  .reading { height: 42px; align-items: baseline; padding-top: 4px; }
  .value { font-size: ${textSize(30)}; line-height: 1.2; letter-spacing: -1px; font-weight: 400; white-space: nowrap; }
  .reading .muted { text-align: right; font-size: ${textSize(10)}; }
  .meter { height: 4px; border-radius: 3px; background: rgba(var(--fg), .18); overflow: hidden; }
  .meter > span { display: block; height: 100%; background: var(--accent); border-radius: inherit; transition: width .3s; }
  .chart { width: 100%; height: 29px; display: block; margin: 5px 0 3px; overflow: visible; }
  .meta { font-size: ${textSize(9)}; min-height: 17px; }
  .meta > span { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .meta > span:last-child { flex-shrink: 0; }
  details { font-size: ${textSize(10)}; margin-top: 1px; }
  summary { cursor: pointer; font-size: ${textSize(9)}; }
  .process, .detail-row { border-top: 1px solid rgba(var(--fg), .15); padding: 3px 0; }
  .process span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .process span:last-child { flex-shrink: 0; }
  .detail-row { display: flex; justify-content: space-between; gap: 8px; overflow-wrap: anywhere; }
  .network-reading { display: grid; grid-template-columns: 1fr 1fr; height: 46px; padding-top: 6px; gap: 8px; }
  .network-value { color: rgb(var(--fg)); font-size: ${textSize(16)}; line-height: 1.2; white-space: nowrap; }
  .network-label { color: rgba(var(--fg), .7); font-size: ${textSize(9)}; }
  .network-charts { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .network-charts .chart { height: 30px; margin: 3px 0; }
  .notice { font-size: ${textSize(9)}; line-height: 1.4; margin-top: 3px; }
  .empty { margin-top: 20px; font-size: ${textSize(11)}; }
  .overview-list { display: grid; grid-auto-rows: 22px; margin-top: 5px; }
  .overview-row { display: flex; align-items: center; justify-content: space-between; gap: 6px; border-bottom: 1px solid rgba(var(--fg), .12); font-size: ${textSize(11)}; line-height: 20px; }
  .overview-row:last-child { border-bottom: 0; }
  .overview-label { display: flex; align-items: center; gap: 6px; white-space: nowrap; }
  .overview-reading { white-space: nowrap; font-variant-numeric: tabular-nums; }
  .overview-percent { display: flex; align-items: center; gap: 7px; }
  .overview-ring { width: 14px; height: 14px; flex-shrink: 0; }
  .overview-network { display: flex; gap: 8px; font-size: ${textSize(10)}; }
  .overview-warning { font-size: ${textSize(9)}; }
  /* Changing an inherited variable forces WebKit to repaint scrollbar hover states. */
  --monitor-scrollbar-thumb: transparent;
  scrollbar-width: auto;
  scrollbar-color: auto;
  &:hover { --monitor-scrollbar-thumb: rgba(var(--fg), .4); }
  &::-webkit-scrollbar { width: 6px; background: transparent; }
  &::-webkit-scrollbar-track { background: transparent; }
  &::-webkit-scrollbar-thumb { background: var(--monitor-scrollbar-thumb); border-radius: 3px; }
  @media (prefers-reduced-motion: reduce) { .meter > span { transition: none; } }
`;

function savedPage() {
  try { const page = localStorage.getItem(storageKey); return pages.includes(page) ? pages.indexOf(page) : 0; }
  catch (_) { return 0; }
}
export const initialState = { page: savedPage(), selectedMonitor: pages[savedPage()] || null, pageSignature, data: {}, history: [], previousNetwork: null, errors: {}, sampled: false, failed: false, processesOpen: null, processesLoading: false };

function currentState(state) {
  if (state.pageSignature === pageSignature) return state;
  // Übersicht retains state across configuration edits; keep selection by monitor name.
  const index = pages.indexOf(state.selectedMonitor || pages[savedPage()]);
  const page = index < 0 ? 0 : index;
  return { ...state, page, selectedMonitor: pages[page] || null, pageSignature, processesOpen: null, processesLoading: false,
    previousNetwork: monitors.includes('network') ? state.previousNetwork : null };
}

export function networkRates(previous, current) {
  if (!previous || !current || previous.interface !== current.interface) return null;
  const elapsed = (current.timestamp - previous.timestamp) / 1000;
  if (!(elapsed > 0 && elapsed <= Math.max(30, refreshFrequency / 1000 * 3))) return null;
  const down = current.downloadBytes - previous.downloadBytes;
  const up = current.uploadBytes - previous.uploadBytes;
  if (![down, up].every(value => finite(value) && value >= 0)) return null;
  return { download: down / elapsed, upload: up / elapsed };
}

let collecting = false;
let activeProcesses = null;
export const command = async dispatch => {
  if (collecting || !monitors.length) return;
  collecting = true;
  try {
    const processMonitor = monitors.includes(activeProcesses) ? activeProcesses : 'none';
    const output = await run(`PATH="/opt/homebrew/bin:/usr/local/bin:$PATH" node ubersicht-only-system-monitor/collect.cjs --monitors=${monitors.join(',')} --processes=${processMonitor}`);
    const data = JSON.parse(output);
    if (!finite(data.timestamp) || !data.errors) throw new Error('Invalid collection');
    dispatch({ type: 'sample', data });
  } catch (_) { dispatch({ type: 'failed' }); }
  finally { collecting = false; }
};

export const updateState = (event, state = initialState) => {
  state = currentState(state);
  if (event.type === 'processes') {
    if (!['cpu', 'memory'].includes(event.kind) || pages[state.page] !== event.kind) return state;
    return { ...state, processesOpen: event.open ? event.kind : null, processesLoading: event.open,
      data: event.open ? { ...state.data, processes: null } : state.data };
  }
  if (event.type === 'page') {
    const page = pages.length ? ((event.page % pages.length) + pages.length) % pages.length : 0;
    return { ...state, page, selectedMonitor: pages[page] || null, processesOpen: null, processesLoading: false };
  }
  if (event.type === 'failed') return { ...state, failed: true, sampled: true, previousNetwork: null, processesLoading: false,
    history: [...state.history, {}].slice(-60) };
  if (event.type !== 'sample') return state;
  const sample = event.data;
  const rate = networkRates(state.previousNetwork, sample.network);
  const data = { ...state.data };
  for (const key of allPages) {
    if (sample[key]) data[key] = key === 'network' ? { ...sample[key], rate } : sample[key];
  }
  const processesUpdated = state.processesOpen && sample.processMonitor === state.processesOpen;
  if (processesUpdated && sample.processes) data.processes = sample.processes;
  const point = {};
  for (const key of allPages.slice(0, 4)) point[key] = sample[key] ? sample[key].percent : null;
  point.download = rate ? rate.download : null;
  point.upload = rate ? rate.upload : null;
  // A default-interface change must not join unrelated network histories.
  const history = state.previousNetwork && sample.network && state.previousNetwork.interface !== sample.network.interface
    ? state.history.map(item => ({ ...item, download: null, upload: null })) : state.history;
  return { ...state, data, errors: sample.errors, failed: false, sampled: true,
    previousNetwork: sample.network, history: [...history, point].slice(-60),
    processesLoading: processesUpdated ? false : state.processesLoading };
};

function changePage(state, dispatch, offset) {
  if (pages.length < 2) return;
  const page = (state.page + offset + pages.length) % pages.length;
  try { localStorage.setItem(storageKey, pages[page]); } catch (_) { /* Selection still works when storage is disabled. */ }
  dispatch({ type: 'page', page });
}

export function bytes(value) {
  if (!finite(value)) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = value > 0 ? Math.min(4, Math.floor(Math.log(value) / Math.log(1024))) : 0;
  return `${(value / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function Chart({ history, field, color, autoScale = false }) {
  const values = history.map(point => point[field]);
  const scale = autoScale ? Math.max(1, ...values.filter(finite)) : 100;
  const points = values.map((value, i) => finite(value) ? [(60 - values.length + i) * 248 / 59, 27 - Math.max(0, Math.min(scale, value)) / scale * 24] : null);
  let path = '', connected = false;
  for (const point of points) {
    if (!point) { connected = false; continue; }
    path += `${connected ? 'L' : 'M'}${point[0]},${point[1]} `;
    connected = true;
  }
  const last = points[points.length - 1];
  return <svg className="chart" viewBox="0 0 250 30" preserveAspectRatio="none" role="img" aria-label={`${field} history; up to 60 readings`}>
    <path d="M0 3H250 M0 15H250 M0 27H250" stroke="currentColor" strokeOpacity=".12" fill="none" />
    <path d={path} stroke={color} strokeWidth="1.8" vectorEffect="non-scaling-stroke" fill="none" />
    {last && <circle cx={last[0]} cy={last[1]} r="2" fill={color} />}
  </svg>;
}

function Processes({ items, kind, stale, open, loading, dispatch }) {
  return <details open={open} onToggle={event => {
    if (event.currentTarget.open !== open) dispatch({ type: 'processes', kind, open: event.currentTarget.open });
  }}><summary>Top processes{stale ? ' · unavailable / stale' : ''}</summary>
    {(items || []).map(item => <div className="process" key={item.pid}><span title={item.name}>{item.name}</span><span>{kind === 'cpu' ? `${item.cpu.toFixed(1)}%` : bytes(item.memory)}</span></div>)}
    {!items && <span className="muted">{loading ? 'Loading on next refresh…' : 'Unavailable'}</span>}
  </details>;
}

function UsageRing({ value, color }) {
  const usage = finite(value) ? Math.max(0, Math.min(100, value)) : null;
  const circumference = 2 * Math.PI * 7;
  return <svg className="overview-ring" viewBox="0 0 20 20" aria-hidden="true">
    <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeOpacity=".18" strokeWidth="3" />
    {usage !== null && <circle cx="10" cy="10" r="7" fill="none" stroke={color} strokeWidth="3"
      strokeDasharray={`${circumference} ${circumference}`} strokeDashoffset={circumference * (1 - usage / 100)} transform="rotate(-90 10 10)" />}
  </svg>;
}

function Overview({ state }) {
  return <div className="overview-list" role="list" aria-label="Enabled monitors">
    {monitors.map(key => {
      const metric = state.data[key];
      const stale = Boolean(state.failed || state.errors[key]);
      const status = stale ? (metric ? 'Stale reading' : 'Unavailable') : !metric ? (state.sampled ? 'Unavailable' : 'Loading') : key === 'network' && !metric.rate ? 'Sampling' : 'Current reading';
      return <div className="overview-row" role="listitem" key={key} title={`${titles[key]} · ${status}`}>
        <span className="overview-label"><span className="indicator" style={{ background: accents[key] }} />{titles[key]}
          {stale && <span className="overview-warning" role="img" aria-label={status}>!</span>}
        </span>
        {key === 'network' ? <span className="overview-reading overview-network" aria-label={`Network · ${status}`}>
          <span>↓ {metric && metric.rate ? `${bytes(metric.rate.download)}/s` : '—'}</span>
          <span>↑ {metric && metric.rate ? `${bytes(metric.rate.upload)}/s` : '—'}</span>
        </span> : <span className="overview-reading overview-percent" aria-label={`${titles[key]} · ${status}`}>
          {percent(metric && metric.percent)}<UsageRing value={metric && metric.percent} color={accents[key]} />
        </span>}
      </div>;
    })}
  </div>;
}

export const render = (state, dispatch) => {
  state = currentState(state);
  activeProcesses = state.processesOpen && pages[state.page] === state.processesOpen && monitors.includes(state.processesOpen) ? state.processesOpen : null;
  if (!pages.length) return <section aria-label="System Monitor"><header><h1>System Monitor</h1></header><div className="empty" role="status">No monitors enabled. Edit config.json.</div></section>;
  const key = pages[state.page];
  const metric = state.data[key];
  const accent = accents[key] || accents.cpu;
  const stale = state.failed || state.errors[key];
  const value = metric && metric.percent;
  const model = (metric && metric.model) || (state.data.cpu && state.data.cpu.model);
  return <section aria-label="System Monitor" style={{ '--accent': accent }} tabIndex={0}
    onMouseLeave={event => { if (event.currentTarget.matches(':focus')) event.currentTarget.blur(); }}
    onKeyDown={event => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); changePage(state, dispatch, event.key === 'ArrowLeft' ? -1 : 1); }
      if (event.key === 'Escape' && event.target === event.currentTarget) event.currentTarget.blur();
    }}>
    <header><h1><span className="indicator" />{titles[key]}</h1><nav aria-label="Monitor pages">
      <button aria-label="Previous monitor" disabled={pages.length === 1} onClick={() => changePage(state, dispatch, -1)}>←</button>
      <span className="muted">{state.page + 1}/{pages.length}</span>
      <button aria-label="Next monitor" disabled={pages.length === 1} onClick={() => changePage(state, dispatch, 1)}>→</button>
    </nav></header>
    {key === 'overview' ? <Overview state={state} /> : !metric ? <div className="empty" role="status">{state.sampled ? 'Monitor unavailable' : 'Loading System Monitor…'}</div> : key === 'network' ? <div>
      <div className="network-reading">
        {['download', 'upload'].map((field, i) => <div key={field} style={{ color: i ? accents.upload : accent }}>
          <div className="network-value">{metric.rate ? `${bytes(metric.rate[field])}/s` : '—'}</div>
          <div className="network-label">{i ? '↑ Upload' : '↓ Download'}</div>
        </div>)}
      </div>
      <div className="network-charts"><Chart history={state.history} field="download" color={accent} autoScale /><Chart history={state.history} field="upload" color={accents.upload} autoScale /></div>
      <div className="meta"><span>{metric.interface} · {metric.ipv4 || 'No IPv4'}</span><span>{!metric.rate ? 'Sampling…' : `${refreshFrequency / 1000}s`}</span></div>
      <details key={key}><summary>Network details</summary><div className="detail-row"><span>Received</span><span>{bytes(metric.downloadBytes)}</span></div><div className="detail-row"><span>Sent</span><span>{bytes(metric.uploadBytes)}</span></div><div className="muted">Active default interface · independent chart scales</div></details>
    </div> : <div>
      <div className="reading"><strong className="value">{percent(value)}</strong><span className="muted">{key === 'memory' || key === 'disk' ? `${bytes(metric.used)} / ${bytes(metric.total)}` : 'Current usage'}</span></div>
      <div className="meter" role="progressbar" aria-label={`${titles[key]} usage`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={finite(value) ? Math.round(value) : undefined}><span style={{ width: `${finite(value) ? Math.max(0, Math.min(100, value)) : 0}%` }} /></div>
      <Chart history={state.history} field={key} color={accent} />
      <div className="meta"><span title={key === 'disk' ? metric.name : model}>{key === 'cpu' || key === 'gpu' ? model || 'Processor' : key === 'memory' ? 'App + wired + compressed' : metric.name}</span><span>{key === 'cpu' ? `${metric.physicalCores}P / ${metric.logicalCores}L` : key === 'disk' ? `${bytes(metric.free)} free` : `${refreshFrequency / 1000}s`}</span></div>
      {key === 'cpu' || key === 'memory' ? <Processes key={key} kind={key} items={state.data.processes && state.data.processes[key]} stale={state.failed || state.errors.processes} open={state.processesOpen === key} loading={state.processesLoading} dispatch={dispatch} /> : key === 'gpu' ? <details key={key}><summary>GPU details</summary><div className="detail-row"><span>Renderer</span><span>{percent(metric.renderer)}</span></div><div className="detail-row"><span>Tiler</span><span>{percent(metric.tiler)}</span></div><div className="muted">Temperature unavailable</div></details> : null}
    </div>}
    {stale && key !== 'overview' && <div className="notice" role="status">{metric ? 'Stale reading · ' : ''}{state.failed ? 'Collection failed; retrying…' : 'Monitor unavailable; retrying…'}</div>}
  </section>;
};
