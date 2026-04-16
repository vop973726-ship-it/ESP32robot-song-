import { readdir } from 'node:fs/promises';
import os from 'node:os';

function sortPorts(ports) {
  return [...ports].sort((left, right) => {
    if (left.likelyEsp32 !== right.likelyEsp32) {
      return left.likelyEsp32 ? -1 : 1;
    }

    return left.path.localeCompare(right.path);
  });
}

function likelyEsp32(pathname) {
  return /(usbserial|usbmodem|wch|slab|cp210|ch340|uart|esp)/i.test(pathname);
}

async function listPosixPorts() {
  const platform = os.platform();
  const entries = await readdir('/dev');

  let matched = [];
  if (platform === 'darwin') {
    matched = entries.filter(
      (entry) =>
        (entry.startsWith('cu.') || entry.startsWith('tty.')) &&
        /(usb|serial|uart|wch|slab|cp210|ch340|esp)/i.test(entry)
    );
  } else if (platform === 'linux') {
    matched = entries.filter((entry) =>
      /^(ttyUSB|ttyACM|ttyAMA|ttyS|rfcomm|serial)/i.test(entry)
    );
  }

  return matched.map((entry) => {
    const fullPath = `/dev/${entry}`;
    return {
      path: fullPath,
      label: entry,
      likelyEsp32: likelyEsp32(fullPath)
    };
  });
}

async function listSerialPorts() {
  try {
    return sortPorts(await listPosixPorts());
  } catch {
    return [];
  }
}

function pickRecommendedPort(ports) {
  return ports.find((port) => port.likelyEsp32)?.path || ports[0]?.path || '';
}

export class SerialScanner {
  constructor(store, options = {}) {
    this.store = store;
    this.options = {
      intervalMs: 2000,
      ...options
    };
    this.timer = null;
    this.lastPaths = [];
  }

  async scan() {
    const ports = await listSerialPorts();
    const nextPaths = ports.map((port) => port.path);
    const previousPaths = new Set(this.lastPaths);
    const nextPathSet = new Set(nextPaths);

    for (const port of ports) {
      if (!previousPaths.has(port.path)) {
        this.store.addLog(
          port.likelyEsp32 ? 'success' : 'info',
          `检测到串口设备：${port.path}`
        );
      }
    }

    for (const path of this.lastPaths) {
      if (!nextPathSet.has(path)) {
        this.store.addLog('warn', `串口设备已移除：${path}`);
      }
    }

    this.lastPaths = nextPaths;
    this.store.updateSerial({
      ports,
      recommendedPort: pickRecommendedPort(ports),
      lastScanAt: new Date().toISOString()
    });

    return ports;
  }

  start() {
    this.stop();
    this.scan().catch((error) => {
      this.store.addLog('warn', `串口扫描失败：${error.message}`);
    });

    this.timer = setInterval(() => {
      this.scan().catch((error) => {
        this.store.addLog('warn', `串口扫描失败：${error.message}`);
      });
    }, this.options.intervalMs);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
