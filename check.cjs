const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { collectionOptions, cpuUsage, parseMemory, parseDisk, parseGPU, parseProcesses, parseNetwork } = require('./collect.cjs');
const deps = '/Applications/Übersicht.app/Contents/Resources/node_modules/';
const babel = require(deps + '@babel/core');
const React = require(deps + 'react');
const { renderToStaticMarkup } = require(deps + 'react-dom/server');

assert.equal(cpuUsage([{ times: { user: 10, idle: 20 } }], [{ times: { user: 30, idle: 40 } }]), 50);
assert.equal(cpuUsage([], []), null);
assert.equal(cpuUsage([{ times: { user: 10, idle: 20 } }], [{ times: { user: 1, idle: 40 } }]), null);
const memory = parseMemory('Mach Virtual Memory Statistics: (page size of 16384 bytes)\nAnonymous pages: 100.\nPages wired down: 20.\nPages occupied by compressor: 30.\nPages purgeable: 10.', 16384 * 200);
assert.equal(memory.percent, 70);
assert.throws(() => parseMemory('missing', 100));
const disk = parseDisk({ APFSContainerSize: 1000, APFSContainerFree: 100, VolumeSize: 0, FreeSpace: 0 });
assert.equal(disk.percent, 90);
assert.equal(disk.used, 900);
assert.throws(() => parseDisk({ APFSContainerSize: 1000 }));
assert.deepEqual(parseGPU('"PerformanceStatistics" = {"Device Utilization %"=47,"Renderer Utilization %"=46,"Tiler Utilization %"=0}'), { percent: 47, renderer: 46, tiler: 0 });
assert.equal(parseGPU('"PerformanceStatistics" = {"Device Utilization %"=0}').percent, 0);
assert.throws(() => parseGPU('"PerformanceStatistics" = {"Renderer Utilization %"=0}'));
const processes = parseProcesses(' 12 123.5 4096 /Applications/My App/Contents/MacOS/My App\ninvalid');
assert.equal(processes[0].name, 'My App');
assert.equal(processes[0].cpu, 123.5);
assert.equal(processes[0].memory, 4194304);
const header = 'Name Mtu Network Address Ipkts Ierrs Ibytes Opkts Oerrs Obytes Coll';
const counters = parseNetwork(header + '\nen0 1500 <Link#17> aa:bb 1 0 2000 2 0 4000 0\nen0 1500 192.168 192.168.1.1 1 - 2000 2 - 4000 -', 'en0');
assert.equal(counters.downloadBytes, 2000);
assert.equal(counters.uploadBytes, 4000);
const vpn = parseNetwork(header + '\nutun4 1380 <Link#25> 1 0 3000 2 0 5000 0', 'utun4');
assert.equal(vpn.downloadBytes, 3000);
assert.equal(vpn.uploadBytes, 5000);
assert.throws(() => parseNetwork(header, 'en0'));

const source = fs.readFileSync(__dirname + '/index.jsx', 'utf8');
const { code } = babel.transformSync(source, { babelrc: false, configFile: false,
  presets: [require(deps + '@babel/preset-react'), [require(deps + '@babel/preset-env'), { targets: { node: 'current' } }]],
});
const stored = new Map();
function load(run = async () => '{}', overrides = {}) {
  const context = { exports: {}, React, localStorage: { getItem: key => stored.get(key), setItem: (key, value) => stored.set(key, value) },
    require: name => name === 'uebersicht' ? { run } : { ...require('./config.json'), overview: false, ...overrides } };
  vm.runInNewContext(code, context);
  return context.exports;
}
const widget = load();
assert.ok(widget.className.includes('width: 290px'));
assert.ok(widget.className.includes('max-height: 177px'));
assert.equal(widget.bytes(0), '0 B');
assert.equal(widget.bytes(null), '—');
assert.equal(widget.bytes(1024), '1.0 KB');
const previous = { interface: 'en0', timestamp: 1000, downloadBytes: 1000, uploadBytes: 2000 };
const current = { ...previous, timestamp: 6000, downloadBytes: 6000, uploadBytes: 12000 };
assert.equal(widget.networkRates(previous, current).download, 1000);
assert.equal(widget.networkRates(previous, current).upload, 2000);
assert.equal(widget.networkRates(null, current), null);
assert.equal(widget.networkRates(previous, { ...current, interface: 'utun0' }), null);
assert.equal(widget.networkRates(previous, { ...current, downloadBytes: 0 }), null);
assert.equal(widget.networkRates(previous, { ...current, timestamp: 1000 }), null);
assert.equal(widget.networkRates(previous, { ...current, timestamp: 60000 }), null);
const sample = { timestamp: 6000, errors: {}, cpu: { percent: 50, model: 'Apple M1 Pro', physicalCores: 10, logicalCores: 10 },
  gpu: { percent: 47, renderer: 46, tiler: 48 }, memory, disk, network: current, processes: { cpu: processes, memory: processes } };
let state = widget.updateState({ type: 'sample', data: sample }, widget.initialState);
assert.equal(state.data.network.rate, null);
state = widget.updateState({ type: 'sample', data: { ...sample, network: { ...current, timestamp: 11000, downloadBytes: 11000 } } }, state);
assert.equal(state.data.network.rate.download, 1000);
const failed = widget.updateState({ type: 'failed' }, state);
assert.equal(failed.data.cpu.percent, 50);
assert.equal(failed.previousNetwork, null);
assert.ok(renderToStaticMarkup(widget.render(failed, () => {})).includes('Stale reading'));
const partial = widget.updateState({ type: 'sample', data: { ...sample, cpu: null, errors: { cpu: 'unavailable' } } }, state);
assert.equal(partial.data.cpu.percent, 50);
assert.equal(partial.history[partial.history.length - 1].cpu, null);
assert.equal(partial.data.gpu.percent, 47);
const switched = widget.updateState({ type: 'sample', data: { ...sample, network: { ...current, interface: 'utun4' } } }, state);
assert.ok(switched.history.every(point => point.download === null));
for (let i = 0; i < 70; i++) state = widget.updateState({ type: 'sample', data: sample }, state);
assert.equal(state.history.length, 60);
assert.equal(widget.updateState({ type: 'page', page: -1 }, state).page, 4);
assert.equal(widget.updateState({ type: 'page', page: 5 }, state).page, 0);
for (let page = 0; page < 5; page++) {
  const html = renderToStaticMarkup(widget.render({ ...state, page }, () => {}));
  assert.ok(html.includes('Previous monitor'));
  assert.ok(html.includes('Next monitor'));
  assert.ok(!html.includes('NaN'));
}
let action;
const section = widget.render(state, event => { action = event; });
section.props.onKeyDown({ key: 'ArrowLeft', preventDefault() {} });
assert.equal(action.page, 4);
assert.equal(load().initialState.page, 4);
let blurred = 0;
const focusedContent = { matches: selector => selector === ':focus', blur: () => { blurred++; } };
section.props.onMouseLeave({ currentTarget: focusedContent });
assert.equal(blurred, 1);
section.props.onKeyDown({ key: 'ArrowDown', currentTarget: focusedContent, target: focusedContent, preventDefault() { throw new Error('Vertical scrolling must remain native'); } });
assert.equal(blurred, 1);
section.props.onKeyDown({ key: 'Escape', currentTarget: focusedContent, target: focusedContent });
assert.equal(blurred, 2);
section.props.onKeyDown({ key: 'Escape', currentTarget: focusedContent, target: {} });
assert.equal(blurred, 2);
section.props.onMouseLeave({ currentTarget: { matches: () => false, blur() { throw new Error('Preserve child control focus'); } } });

const selected = load(undefined, { monitors: ['memory', 'cpu', 'memory', 'invalid'] });
let selectedState = selected.updateState({ type: 'sample', data: sample }, selected.initialState);
let html = renderToStaticMarkup(selected.render(selectedState, () => {}));
assert.ok(html.includes('Memory</h1>') && html.includes('1/2'));
assert.ok(html.includes('--accent:#23b7b8'));
selectedState = selected.updateState({ type: 'page', page: 1 }, selectedState);
assert.ok(renderToStaticMarkup(selected.render(selectedState, () => {})).includes('CPU</h1>'));
assert.equal(selected.updateState({ type: 'page', page: 2 }, selectedState).page, 0);
assert.equal(selected.updateState({ type: 'page', page: -1 }, selectedState).page, 1);
assert.equal(selectedState.history[0].gpu, 47);
const reordered = load(undefined, { monitors: ['cpu', 'memory'] });
assert.ok(renderToStaticMarkup(reordered.render(selectedState, () => {})).includes('CPU</h1>'));
assert.ok(renderToStaticMarkup(reordered.render(selectedState, () => {})).includes('1/2'));
const removed = load(undefined, { monitors: ['gpu'] });
html = renderToStaticMarkup(removed.render(selectedState, () => {}));
assert.ok(html.includes('GPU</h1>') && html.includes('1/1'));
assert.equal((html.match(/disabled=""/g) || []).length, 2);
for (const monitors of [[], ['unknown']]) {
  const empty = load(undefined, { monitors });
  html = renderToStaticMarkup(empty.render(state, () => {}));
  assert.ok(html.includes('No monitors enabled'));
  assert.ok(!html.includes('NaN'));
  assert.equal(empty.updateState({ type: 'page', page: 1 }, empty.initialState).page, 0);
}
const invalidMonitors = load(undefined, { monitors: null });
assert.ok(renderToStaticMarkup(invalidMonitors.render(invalidMonitors.initialState, () => {})).includes('/5'));
const styled = load(undefined, { fontFamily: ['SF Mono', 'monospace'], fontSize: 15, colors: {
  light: { background: '#123', foreground: '#abc', backgroundOpacity: .5 },
  dark: { background: '#456', foreground: '#def', backgroundOpacity: .8 },
  accents: { cpu: '#f80', upload: '#abc' },
} });
assert.ok(styled.className.includes('font: 15px/1.6 "SF Mono", monospace;'));
assert.ok(styled.className.includes('font-size: 37.5px'));
assert.ok(styled.className.includes('--fg: 170, 187, 204; --bg: 17, 34, 51; --opacity: 0.5;'));
assert.ok(styled.className.includes('--fg: 221, 238, 255; --bg: 68, 85, 102; --opacity: 0.8;'));
assert.ok(renderToStaticMarkup(styled.render({ ...state, page: 0 }, () => {})).includes('--accent:#f80'));
assert.ok(renderToStaticMarkup(styled.render({ ...state, page: 4 }, () => {})).includes('stroke="#abc"'));
const unsafe = load(undefined, { fontFamily: ['bad; color:red', 'bad"font'], fontSize: -1, colors: { accents: { cpu: 'red; color:red' } } });
assert.ok(unsafe.className.includes('font: 12px/1.6 "Input Mono"'));
assert.ok(!unsafe.className.includes('color:red'));
assert.ok(renderToStaticMarkup(unsafe.render({ ...state, page: 0 }, () => {})).includes('--accent:#329ee8'));

stored.clear();
const overview = load(undefined, { overview: true });
const overviewState = overview.updateState({ type: 'sample', data: sample }, overview.initialState);
html = renderToStaticMarkup(overview.render(overviewState, () => {}));
assert.ok(html.includes('Overview</h1>') && html.includes('1/6'));
assert.equal((html.match(/role="listitem"/g) || []).length, 5);
assert.equal((html.match(/class="overview-ring"/g) || []).length, 4);
assert.equal((html.match(/stroke-dashoffset=/g) || []).length, 4);
assert.ok(html.includes('50%') && html.includes('47%'));
assert.ok(html.includes('↓ —') && html.includes('↑ —'));
assert.ok(!html.includes('<details') && !html.includes('class="chart"'));
assert.equal(overview.updateState({ type: 'page', page: -1 }, overviewState).selectedMonitor, 'network');
assert.equal(overview.updateState({ type: 'page', page: 6 }, overviewState).selectedMonitor, 'overview');
const overviewNext = overview.render(overviewState, event => { action = event; });
overviewNext.props.onKeyDown({ key: 'ArrowRight', preventDefault() {} });
assert.equal(action.page, 1);
assert.equal(load(undefined, { overview: true }).initialState.selectedMonitor, 'cpu');
const withRate = overview.updateState({ type: 'sample', data: { ...sample, network: { ...current, timestamp: 11000, downloadBytes: 11000, uploadBytes: 17000 } } }, overviewState);
html = renderToStaticMarkup(overview.render(withRate, () => {}));
assert.ok(html.includes('↓ 1000 B/s') && html.includes('↑ 1000 B/s'));
const overviewSubset = load(undefined, { overview: true, monitors: ['network', 'cpu'] });
const subsetState = overviewSubset.updateState({ type: 'sample', data: sample }, { ...overviewSubset.initialState, page: 0 });
html = renderToStaticMarkup(overviewSubset.render(subsetState, () => {}));
assert.equal((html.match(/role="listitem"/g) || []).length, 2);
assert.ok(html.indexOf('Network ·') < html.indexOf('CPU ·'));
assert.ok(!html.includes('GPU ·'));
const overviewFailed = overview.updateState({ type: 'failed' }, overviewState);
html = renderToStaticMarkup(overview.render(overviewFailed, () => {}));
assert.equal((html.match(/aria-label="Stale reading"/g) || []).length, 5);
assert.equal((html.match(/role="listitem"/g) || []).length, 5);
const overviewPartial = overview.updateState({ type: 'sample', data: { ...sample, gpu: null, errors: { gpu: 'unavailable' } } }, overviewState);
html = renderToStaticMarkup(overview.render(overviewPartial, () => {}));
assert.equal((html.match(/aria-label="Stale reading"/g) || []).length, 1);
assert.ok(html.includes('47%'));
const overviewLoading = load(undefined, { overview: true });
html = renderToStaticMarkup(overviewLoading.render({ ...overviewLoading.initialState, page: 0 }, () => {}));
assert.equal((html.match(/role="listitem"/g) || []).length, 5);
assert.ok(html.includes('CPU · Loading'));
assert.equal((html.match(/class="overview-ring"/g) || []).length, 4);
assert.ok(!html.includes('stroke-dashoffset='));
for (const [value, expectedOffset] of [[0, 2 * Math.PI * 7], [100, 0], [150, 0], [-10, 2 * Math.PI * 7]]) {
  const ringState = { ...overviewState, data: { ...overviewState.data, cpu: { percent: value } } };
  const ringHTML = renderToStaticMarkup(overview.render(ringState, () => {}));
  assert.ok(ringHTML.includes(`stroke-dashoffset="${expectedOffset}"`));
}
const disabledOverview = load(undefined, { overview: false });
html = renderToStaticMarkup(disabledOverview.render(overviewState, () => {}));
assert.ok(html.includes('CPU</h1>') && html.includes('1/5'));
const emptyOverview = load(undefined, { overview: true, monitors: [] });
assert.ok(renderToStaticMarkup(emptyOverview.render(emptyOverview.initialState, () => {})).includes('No monitors enabled'));
assert.ok(renderToStaticMarkup(load(undefined, { overview: undefined }).render(overviewState, () => {})).includes('Overview</h1>'));

async function checkCommand() {
  const requested = [];
  const demand = load(async invocation => {
    requested.push(invocation);
    const kind = invocation.match(/--processes=(\w+)/)[1];
    return JSON.stringify({ ...sample, processMonitor: kind === 'none' ? null : kind, processes: kind === 'none' ? null : { [kind]: processes } });
  }, { monitors: ['cpu', 'memory'] });
  let demandState = { ...demand.initialState, page: 0 };
  const dispatch = event => { demandState = demand.updateState(event, demandState); };
  demand.render(demandState, dispatch);
  await demand.command(dispatch);
  assert.ok(requested[0].includes('--monitors=cpu,memory --processes=none'));
  demandState = demand.updateState({ type: 'processes', kind: 'cpu', open: true }, demandState);
  assert.equal(demandState.processesLoading, true);
  demand.render(demandState, dispatch);
  await demand.command(dispatch);
  assert.ok(requested[1].endsWith('--processes=cpu'));
  assert.equal(demandState.processesLoading, false);
  assert.equal(demandState.data.processes.cpu[0].name, 'My App');
  demandState = demand.updateState({ type: 'processes', kind: 'cpu', open: false }, demandState);
  demand.render(demandState, dispatch);
  await demand.command(dispatch);
  assert.ok(requested[2].endsWith('--processes=none'));
  demandState = demand.updateState({ type: 'page', page: 1 }, demandState);
  assert.equal(demandState.processesOpen, null);
  demandState = demand.updateState({ type: 'processes', kind: 'memory', open: true }, demandState);
  demand.render(demandState, dispatch);
  await demand.command(dispatch);
  assert.ok(requested[3].endsWith('--processes=memory'));
  demandState = demand.updateState({ type: 'page', page: 0 }, demandState);
  demandState = demand.updateState({ type: 'sample', data: { ...sample, processMonitor: 'memory', processes: { memory: processes } } }, demandState);
  assert.equal(demandState.processesOpen, null);
  const off = load(async () => { throw new Error('Empty monitor list must not launch a collector'); }, { monitors: [] });
  await off.command(() => { throw new Error('Empty monitor list must not dispatch collection failure'); });
  let calls = 0;
  const pending = load(async () => { calls++; return JSON.stringify(sample); });
  const events = [];
  await Promise.all([pending.command(event => events.push(event)), pending.command(event => events.push(event))]);
  assert.equal(calls, 1);
  assert.equal(events[0].type, 'sample');
  const invalid = load(async () => 'bad json');
  await invalid.command(event => events.push(event));
  assert.equal(events[1].type, 'failed');
  const rejected = load(async () => { throw new Error('command failed'); });
  await rejected.command(event => events.push(event));
  assert.equal(events[2].type, 'failed');
  console.log('PASS: telemetry, history, failures, navigation, configuration, overview/rings, on-demand process requests, skipped disabled collectors, collection guard and JSX rendering.');
}

function collectorHarness() {
  const calls = [];
  let cpuReads = 0;
  const fixtures = {
    '/usr/sbin/sysctl': '10\n10\n',
    '/usr/sbin/ioreg': '"PerformanceStatistics" = {"Device Utilization %"=47}',
    '/usr/bin/vm_stat': 'Mach Virtual Memory Statistics: (page size of 16384 bytes)\nAnonymous pages: 100.\nPages wired down: 20.\nPages occupied by compressor: 30.\nPages purgeable: 10.',
    '/usr/sbin/diskutil': '<plist/>',
    '/usr/bin/plutil': '{"APFSContainerSize":1000,"APFSContainerFree":100}',
    '/sbin/route': 'interface: en0\n',
    '/usr/sbin/netstat': header + '\nen0 1500 <Link#17> aa:bb 1 0 2000 2 0 4000 0',
    '/bin/ps': ' 12 123.5 4096 /Applications/My App/Contents/MacOS/My App',
  };
  const mockOS = {
    cpus() { cpuReads++; return [{ model: 'Test GPU chip', times: { user: cpuReads * 10, idle: cpuReads * 10 } }]; },
    totalmem: () => 16384 * 200,
    networkInterfaces: () => ({ en0: [{ family: 'IPv4', address: '192.0.2.1' }] }),
  };
  const mockedRequire = name => name === 'node:os' ? mockOS : name === 'node:child_process' ? {
    execFile(file, args, options, callback) {
      calls.push(file);
      queueMicrotask(() => callback(null, fixtures[file]));
      return { stdin: { on() {}, end() {} } };
    },
  } : require(name);
  const context = { module: { exports: {} }, require: mockedRequire, setTimeout: fn => fn(), process: { env: {} } };
  vm.runInNewContext(fs.readFileSync(__dirname + '/collect.cjs', 'utf8'), context);
  return { collect: context.module.exports.collect, calls, cpuReads: () => cpuReads };
}

async function checkCollectors() {
  assert.deepEqual(collectionOptions(['--monitors=cpu,memory,cpu,bad', '--processes=cpu']), { monitors: ['cpu', 'memory'], processMonitor: 'cpu' });
  assert.deepEqual(collectionOptions(['--monitors=', '--processes=cpu']), { monitors: [], processMonitor: null });
  assert.deepEqual(collectionOptions([], { monitors: ['gpu'] }), { monitors: ['gpu'], processMonitor: null });
  assert.throws(() => collectionOptions(['--invalid']));
  for (const [key, expected] of [
    ['cpu', ['/usr/sbin/sysctl']], ['gpu', ['/usr/sbin/ioreg']], ['memory', ['/usr/bin/vm_stat']],
    ['disk', ['/usr/sbin/diskutil', '/usr/bin/plutil']], ['network', ['/sbin/route', '/usr/sbin/netstat']],
  ]) {
    const h = collectorHarness();
    const result = await h.collect({ monitors: [key] });
    assert.deepEqual(h.calls.slice().sort(), expected.slice().sort(), key);
    assert.ok(result[key], key);
    for (const disabled of ['cpu', 'gpu', 'memory', 'disk', 'network'].filter(name => name !== key)) assert.equal(result[disabled], null, disabled);
    assert.equal(result.processes, null);
    if (key === 'gpu') assert.equal(result.gpu.model, 'Test GPU chip');
  }
  const empty = collectorHarness();
  await empty.collect({ monitors: [] });
  assert.equal(empty.calls.length, 0);
  assert.equal(empty.cpuReads(), 0);
  for (const processMonitor of ['cpu', 'memory']) {
    const h = collectorHarness();
    const result = await h.collect({ monitors: [processMonitor], processMonitor });
    assert.equal(h.calls.filter(file => file === '/bin/ps').length, 1);
    assert.equal(result.processes[processMonitor].length, 1);
    assert.equal(Object.keys(result.processes).length, 1);
  }
  const hiddenProcesses = collectorHarness();
  await hiddenProcesses.collect({ monitors: ['gpu'], processMonitor: 'cpu' });
  assert.ok(!hiddenProcesses.calls.includes('/bin/ps'));
  console.log('PASS: collector command tracing proves disabled metrics and collapsed process lists launch no corresponding system commands.');
}
Promise.all([checkCommand(), checkCollectors()]).catch(error => { console.error(error); process.exitCode = 1; });
