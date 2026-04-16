import { EventEmitter } from 'node:events';

function normalizePath(pathname, fallback) {
  const value = String(pathname || fallback || '').trim();
  if (!value) {
    return fallback;
  }

  return value.startsWith('/') ? value : `/${value}`;
}

function normalizeBaseUrl(input) {
  const raw = String(input || '').trim();
  if (!raw) {
    throw new Error('缺少相机 IP');
  }

  const withProtocol = raw.startsWith('http://') || raw.startsWith('https://') ? raw : `http://${raw}`;
  return withProtocol.replace(/\/+$/, '');
}

function joinUrl(baseUrl, pathname) {
  return `${baseUrl}${normalizePath(pathname, '/')}`;
}

function readField(payload, key) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  return typeof payload[key] === 'number' ? payload[key] : null;
}

export class CameraManager extends EventEmitter {
  constructor(store, options = {}) {
    super();
    this.store = store;
    this.options = {
      pollIntervalMs: 5000,
      connectTimeoutMs: 4000,
      ...options
    };
    this.camera = null;
    this.poller = null;
  }

  isConnected() {
    return Boolean(this.camera?.connected);
  }

  getConfig() {
    return this.camera ? { ...this.camera } : null;
  }

  resolveUrl(kind) {
    if (!this.camera?.baseUrl) {
      return '';
    }

    if (kind === 'stream') {
      return joinUrl(this.camera.baseUrl, this.camera.streamPath);
    }

    if (kind === 'snapshot') {
      return joinUrl(this.camera.baseUrl, this.camera.snapshotPath);
    }

    if (kind === 'status') {
      return joinUrl(this.camera.baseUrl, this.camera.statusPath);
    }

    if (kind === 'ota') {
      return joinUrl(this.camera.baseUrl, this.camera.otaPath);
    }

    throw new Error(`未知相机资源类型：${kind}`);
  }

  async connect(input = {}) {
    const {
      ip,
      label = 'ESP32-CAM',
      streamPath = '/stream',
      snapshotPath = '/capture',
      statusPath = '/status',
      otaPath = '/update'
    } = input;

    const baseUrl = normalizeBaseUrl(ip);
    const normalized = {
      label,
      ip: String(ip).trim(),
      baseUrl,
      streamPath: normalizePath(streamPath, '/stream'),
      snapshotPath: normalizePath(snapshotPath, '/capture'),
      statusPath: normalizePath(statusPath, '/status'),
      otaPath: normalizePath(otaPath, '/update')
    };

    if (
      this.camera?.baseUrl === normalized.baseUrl &&
      this.camera.streamPath === normalized.streamPath &&
      this.camera.snapshotPath === normalized.snapshotPath &&
      this.camera.statusPath === normalized.statusPath &&
      this.camera.otaPath === normalized.otaPath &&
      this.isConnected()
    ) {
      return this.store.snapshot().camera;
    }

    await this.disconnect({ silent: true, preserveConfig: false });
    this.camera = normalized;
    this.store.addLog('info', `正在连接独立相机模块 ${normalized.baseUrl}`);

    this.store.updateCamera({
      label: normalized.label,
      ip: normalized.ip,
      baseUrl: normalized.baseUrl,
      connected: true,
      status: 'connected',
      latencyMs: null,
      streamPath: normalized.streamPath,
      snapshotPath: normalized.snapshotPath,
      statusPath: normalized.statusPath,
      otaPath: normalized.otaPath,
      streamUrl: joinUrl(normalized.baseUrl, normalized.streamPath),
      snapshotUrl: joinUrl(normalized.baseUrl, normalized.snapshotPath),
      statusUrl: joinUrl(normalized.baseUrl, normalized.statusPath),
      otaUrl: joinUrl(normalized.baseUrl, normalized.otaPath),
      lastCheckedAt: new Date().toISOString(),
      lastError: null
    });
    this.emit('connected', { baseUrl: normalized.baseUrl });
    this.store.addLog('success', `独立相机模块已连接：${normalized.baseUrl}`);

    return this.store.snapshot().camera;
  }

  async disconnect({ silent = false, preserveConfig = true } = {}) {
    this.stopPolling();

    const current = this.camera;
    this.camera = preserveConfig && current ? { ...current, connected: false } : null;

    this.store.updateCamera({
      connected: false,
      status: 'disconnected',
      latencyMs: null,
      lastError: null,
      otaInProgress: false,
      lastCheckedAt: current ? new Date().toISOString() : this.store.snapshot().camera.lastCheckedAt,
      ...(preserveConfig && current
        ? {
            label: current.label,
            ip: current.ip,
            baseUrl: current.baseUrl,
            streamPath: current.streamPath,
            snapshotPath: current.snapshotPath,
            statusPath: current.statusPath,
            otaPath: current.otaPath,
            streamUrl: joinUrl(current.baseUrl, current.streamPath),
            snapshotUrl: joinUrl(current.baseUrl, current.snapshotPath),
            statusUrl: joinUrl(current.baseUrl, current.statusPath),
            otaUrl: joinUrl(current.baseUrl, current.otaPath)
          }
        : {})
    });

    if (!silent) {
      this.store.addLog('info', '独立相机模块已断开');
    }

    this.emit('disconnected', { baseUrl: current?.baseUrl || '' });
    return this.store.snapshot().camera;
  }

  async fetchStatus({ throwOnError = false } = {}) {
    if (!this.camera?.baseUrl) {
      return null;
    }

    const statusUrl = joinUrl(this.camera.baseUrl, this.camera.statusPath);
    const startedAt = Date.now();

    try {
      const response = await fetch(statusUrl, {
        signal: AbortSignal.timeout(this.options.connectTimeoutMs)
      });

      if (!response.ok) {
        throw new Error(`状态请求失败：${response.status}`);
      }

      const payload = await response.json();
      const latencyMs = Date.now() - startedAt;
      const resolvedOtaPath = normalizePath(payload?.otaPath, this.camera.otaPath);

      this.camera = {
        ...this.camera,
        otaPath: resolvedOtaPath
      };

      this.store.updateCamera({
        label: this.camera.label,
        ip: this.camera.ip,
        baseUrl: this.camera.baseUrl,
        connected: true,
        status: 'online',
        latencyMs,
        streamPath: this.camera.streamPath,
        snapshotPath: this.camera.snapshotPath,
        statusPath: this.camera.statusPath,
        otaPath: this.camera.otaPath,
        streamUrl: joinUrl(this.camera.baseUrl, this.camera.streamPath),
        snapshotUrl: joinUrl(this.camera.baseUrl, this.camera.snapshotPath),
        statusUrl,
        otaUrl: joinUrl(this.camera.baseUrl, this.camera.otaPath),
        framesize: readField(payload, 'framesize'),
        quality: readField(payload, 'quality'),
        brightness: readField(payload, 'brightness'),
        contrast: readField(payload, 'contrast'),
        saturation: readField(payload, 'saturation'),
        specialEffect: readField(payload, 'special_effect'),
        wbMode: readField(payload, 'wb_mode'),
        lastCheckedAt: new Date().toISOString(),
        lastError: null
      });

      return payload;
    } catch (error) {
      this.store.updateCamera({
        label: this.camera.label,
        ip: this.camera.ip,
        baseUrl: this.camera.baseUrl,
        connected: false,
        status: 'offline',
        latencyMs: null,
        streamPath: this.camera.streamPath,
        snapshotPath: this.camera.snapshotPath,
        statusPath: this.camera.statusPath,
        otaPath: this.camera.otaPath,
        streamUrl: joinUrl(this.camera.baseUrl, this.camera.streamPath),
        snapshotUrl: joinUrl(this.camera.baseUrl, this.camera.snapshotPath),
        statusUrl,
        otaUrl: joinUrl(this.camera.baseUrl, this.camera.otaPath),
        lastCheckedAt: new Date().toISOString(),
        lastError: error.message
      });

      if (throwOnError) {
        throw error;
      }

      this.store.addLog('warn', `相机状态轮询失败：${error.message}`);
      return null;
    }
  }

  startPolling() {
    this.stopPolling();
    this.poller = setInterval(() => {
      this.fetchStatus().catch(() => {});
    }, this.options.pollIntervalMs);
  }

  stopPolling() {
    if (this.poller) {
      clearInterval(this.poller);
      this.poller = null;
    }
  }
}
