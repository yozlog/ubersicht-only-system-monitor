const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');

function command(file, args, input) {
  return new Promise((resolve, reject) => {
    const child = execFile(file, args, {
      encoding: 'utf8', timeout: 2000, maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, LC_ALL: 'C', LANG: 'C' },
    }, (error, stdout) => error ? reject(error) : resolve(stdout));
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

async function plist(file, args) {
  const xml = await command(file, args);
  return JSON.parse(await command('/usr/bin/plutil', ['-convert', 'json', '-o', '-', '--', '-'], xml));
}

const clamp = value => Math.max(0, Math.min(100, value));
function cpuUsage(before, after) {
  if (!before.length || before.length !== after.length) return null;
  let idle = 0, total = 0;
  for (let i = 0; i < before.length; i++) {
    for (const key of Object.keys(before[i].times)) {
      const delta = after[i].times[key] - before[i].times[key];
      if (delta < 0) return null;
      total += delta;
      if (key === 'idle') idle += delta;
    }
  }
  return total > 0 ? clamp((total - idle) / total * 100) : null;
}

function parseMemory(text, total) {
  const pageSize = Number((text.match(/page size of (\d+) bytes/) || [])[1]);
  const pages = key => {
    const line = text.split('\n').find(line => line.startsWith(key + ':'));
    return line ? Number(line.slice(line.indexOf(':') + 1).trim().replace(/\.$/, '')) : NaN;
  };
  // Anonymous app memory + wired + compressed, excluding purgeable memory/cache.
  const usedPages = pages('Anonymous pages') + pages('Pages wired down') +
    pages('Pages occupied by compressor') - pages('Pages purgeable');
  if (!(pageSize > 0 && total > 0 && Number.isFinite(usedPages))) throw new Error('Memory fields unavailable');
  const used = Math.max(0, Math.min(total, usedPages * pageSize));
  return { used, total, percent: used / total * 100 };
}

function parseDisk(info) {
  const total = info.APFSContainerSize;
  const free = info.APFSContainerFree;
  if (!(Number.isFinite(total) && total > 0 && Number.isFinite(free) && free >= 0 && free <= total)) {
    throw new Error('APFS container capacity unavailable');
  }
  return { name: 'Startup APFS container', total, free, used: total - free, percent: (total - free) / total * 100 };
}

function parseGPU(text) {
  // ioreg archives contain data values that plutil cannot convert to JSON.
  const dictionaries = text.match(/"PerformanceStatistics"\s*=\s*\{[^\n]+\}/g) || [];
  for (const dictionary of dictionaries) {
    const read = name => {
      const match = dictionary.match(new RegExp(`"${name} Utilization %"\\s*=\\s*(\\d+(?:\\.\\d+)?)`));
      return match ? clamp(Number(match[1])) : null;
    };
    const percent = read('Device');
    if (percent !== null) return { percent, renderer: read('Renderer'), tiler: read('Tiler') };
  }
  throw new Error('GPU utilization unavailable');
}

function parseProcesses(text) {
  return text.split('\n').flatMap(line => {
    const match = line.match(/^\s*(\d+)\s+([\d.]+)\s+(\d+)\s+(.+)$/);
    if (!match) return [];
    return [{ pid: Number(match[1]), cpu: Number(match[2]), memory: Number(match[3]) * 1024, name: path.basename(match[4]) }];
  });
}

function parseNetwork(text, iface) {
  const lines = text.trim().split('\n');
  if (!lines[0].includes('Ibytes') || !lines[0].includes('Obytes')) throw new Error('Unexpected network header');
  const row = lines.slice(1).map(line => line.trim().split(/\s+/))
    .find(row => row[0].replace(/\*$/, '') === iface && row[2].startsWith('<Link#'));
  if (!row) throw new Error('Interface counters unavailable');
  // Point-to-point interfaces omit the Address column; byte columns stay fixed from the right.
  const downloadBytes = Number(row[row.length - 5]);
  const uploadBytes = Number(row[row.length - 2]);
  if (![downloadBytes, uploadBytes].every(value => Number.isFinite(value) && value >= 0)) throw new Error('Invalid network counters');
  return { interface: iface, downloadBytes, uploadBytes };
}

const monitorNames = ['cpu', 'gpu', 'memory', 'disk', 'network'];
function collectionOptions(args, config = {}) {
  let monitors = Array.isArray(config.monitors) ? config.monitors : monitorNames;
  let processMonitor = null;
  for (const arg of args) {
    if (arg.startsWith('--monitors=')) monitors = arg.slice('--monitors='.length).split(',');
    else if (arg.startsWith('--processes=')) processMonitor = arg.slice('--processes='.length);
    else throw new Error('Unknown collector argument');
  }
  monitors = [...new Set(monitors.filter(key => monitorNames.includes(key)))];
  if (!['cpu', 'memory'].includes(processMonitor) || !monitors.includes(processMonitor)) processMonitor = null;
  return { monitors, processMonitor };
}

async function collect({ monitors = monitorNames, processMonitor = null } = {}) {
  const enabled = monitors.filter(key => monitorNames.includes(key));
  if (!['cpu', 'memory'].includes(processMonitor) || !enabled.includes(processMonitor)) processMonitor = null;
  const errors = {};
  const safe = async (key, fn) => {
    if (key === 'processes' ? !processMonitor : !enabled.includes(key)) return null;
    try { return await fn(); }
    catch (_) { errors[key] = `${key} unavailable`; return null; }
  };
  const [cpu, gpu, memory, disk, network, processes] = await Promise.all([
    safe('cpu', async () => {
      const hardware = await command('/usr/sbin/sysctl', ['-n', 'hw.physicalcpu', 'hw.logicalcpu']);
      const before = os.cpus();
      await new Promise(resolve => setTimeout(resolve, 250));
      const percent = cpuUsage(before, os.cpus());
      if (percent === null) throw new Error('CPU counters unavailable');
      const cores = hardware.trim().split(/\s+/).map(Number);
      return { percent, model: before[0].model, physicalCores: cores[0], logicalCores: cores[1] };
    }),
    safe('gpu', async () => ({ ...parseGPU(await command('/usr/sbin/ioreg', ['-r', '-c', 'IOAccelerator', '-d', '1', '-l', '-w', '0'])), model: os.cpus()[0]?.model || 'GPU' })),
    safe('memory', async () => parseMemory(await command('/usr/bin/vm_stat', []), os.totalmem())),
    safe('disk', async () => parseDisk(await plist('/usr/sbin/diskutil', ['info', '-plist', '/System/Volumes/Data']))),
    safe('network', async () => {
      const route = await command('/sbin/route', ['-n', 'get', 'default']);
      const iface = (route.match(/interface:\s*(\S+)/) || [])[1];
      if (!iface || !/^[a-zA-Z0-9]+$/.test(iface)) throw new Error('No default interface');
      const counters = parseNetwork(await command('/usr/sbin/netstat', ['-ibn']), iface);
      const ipv4 = (os.networkInterfaces()[iface] || []).find(address => address.family === 'IPv4');
      return { ...counters, timestamp: Date.now(), ipv4: ipv4 ? ipv4.address : null };
    }),
    safe('processes', async () => {
      const all = parseProcesses(await command('/bin/ps', ['-A', '-o', 'pid=,pcpu=,rss=,comm=']));
      if (!all.length) throw new Error('No processes');
      const field = processMonitor === 'cpu' ? 'cpu' : 'memory';
      return { [processMonitor]: all.sort((a, b) => b[field] - a[field]).slice(0, 5) };
    }),
  ]);
  return { timestamp: Date.now(), cpu, gpu, memory, disk, network, processes, processMonitor, errors };
}

module.exports = { collect, collectionOptions, cpuUsage, parseMemory, parseDisk, parseGPU, parseProcesses, parseNetwork };
if (require.main === module) {
  try {
    collect(collectionOptions(process.argv.slice(2), require('./config.json')))
      .then(data => process.stdout.write(JSON.stringify(data)), () => { process.exitCode = 1; });
  } catch (_) { process.stderr.write('Invalid collector arguments\n'); process.exitCode = 1; }
}
