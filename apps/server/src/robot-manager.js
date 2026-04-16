import { EventEmitter } from 'node:events';
import WebSocket from 'ws';

function joinUrl(ip, path) {
  if (!path.startsWith('/')) {
    return `http://${ip}/${path}`;
  }

  return `http://${ip}${path}`;
}

function toWebSocketUrl(ip, path) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `ws://${ip}${normalizedPath}`;
}

export class RobotManager extends EventEmitter {
  constructor(store, options = {}) {
    super();
    this.store = store;
    this.options = {
      wsPath: '/ws',
      statusPath: '/status',
      controlPath: '/control',
      pingIntervalMs: 5000,
      maxHeartbeatFailures: 2,
      ...options
    };
    this.robotSocket = null;
    this.robotIp = '';
    this.heartbeat = null;
    this.heartbeatFailures = 0;
  }

  async connect(ip) {
    if (!ip) {
      throw new Error('缺少机器人 IP');
    }

    if (this.robotIp === ip && this.isConnected()) {
      return this.store.snapshot().robot;
    }

    await this.disconnect({ silent: true });
    this.robotIp = ip;

    const wsUrl = toWebSocketUrl(ip, this.options.wsPath);
    this.store.addLog('info', `正在连接机器人 ${ip}`);

    await new Promise((resolve, reject) => {
      const socket = new WebSocket(wsUrl);
      let settled = false;

      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          socket.terminate();
          reject(new Error('连接机器人超时'));
        }
      }, 5000);

      socket.on('open', () => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeout);
        this.robotSocket = socket;
        this.bindSocketEvents(socket);
        this.store.updateRobot({
          ip,
          connected: true,
          mode: 'idle',
          lastSeenAt: new Date().toISOString()
        });
        this.startHeartbeat();
        this.store.addLog('success', `机器人 ${ip} 已连接`);
        this.sendCommand({ type: 'status_request' }).catch(() => {});
        this.emit('connected', { ip });
        resolve();
      });

      socket.on('error', (error) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          reject(error);
        }
      });
    });

    return this.store.snapshot().robot;
  }

  bindSocketEvents(socket) {
    socket.on('message', (buffer) => {
      const rawText = buffer.toString();

      try {
        const payload = JSON.parse(rawText);

        if (payload.type === 'status') {
          this.heartbeatFailures = 0;
          this.store.applyRobotStatus({
            ...payload,
            ip: this.robotIp
          });
          return;
        }

        this.store.addLog('info', `收到机器人消息：${rawText}`);
      } catch {
        this.store.addLog('warn', `收到非 JSON 机器人消息：${rawText}`);
      }
    });

    socket.on('close', () => {
      this.stopHeartbeat();
      this.robotSocket = null;
      this.store.updateRobot({
        connected: false,
        mode: 'disconnected',
        latencyMs: null,
        signalStrength: null,
        battery: null,
        lastSeenAt: null,
        otaInProgress: false
      });
      this.store.resetRobotRuntimeState();
      this.store.addLog('warn', '机器人连接已断开');
      this.emit('disconnected', { ip: this.robotIp });
    });

    socket.on('error', (error) => {
      this.store.addLog('error', `机器人连接错误：${error.message}`);
    });
  }

  isConnected() {
    return this.robotSocket?.readyState === WebSocket.OPEN;
  }

  async disconnect({ silent = false } = {}) {
    this.stopHeartbeat();
    this.heartbeatFailures = 0;

    if (this.robotSocket) {
      const socket = this.robotSocket;
      this.robotSocket = null;
      socket.removeAllListeners();
      socket.close();
    }

    if (!silent) {
      this.store.addLog('info', '已主动断开机器人连接');
    }

    this.store.updateRobot({
      connected: false,
      mode: 'disconnected',
      latencyMs: null,
      signalStrength: null,
      battery: null,
      lastSeenAt: null,
      otaInProgress: false
    });
    this.store.resetRobotRuntimeState();
    this.emit('disconnected', { ip: this.robotIp });
  }

  async sendCommand(command) {
    if (!this.isConnected()) {
      throw new Error('机器人尚未连接');
    }

    const encoded = JSON.stringify(command);
    this.robotSocket.send(encoded);

    if (command.type === 'servo' && typeof command.id !== 'undefined') {
      this.store.updateServo(command.id, command.angle);
    }

    if (command.type === 'action' && command.name) {
      this.store.updateRobot({ mode: command.name });
    }

    if (command.type === 'move' && command.direction) {
      this.store.updateRobot({ mode: command.direction });
    }

    if (command.type === 'emergency_stop') {
      this.store.updateRobot({ mode: 'emergency_stop' });
    }

    if (command.type === 'gait_trial_start') {
      this.store.updateRobot({ mode: 'gait_trial' });
    }

    if (command.type === 'gait_trial_stop') {
      this.store.updateRobot({ mode: 'idle' });
    }

    this.store.addLog('info', `已发送控制指令：${encoded}`);
  }

  async fetchStatus() {
    if (!this.robotIp) {
      return null;
    }

    const startedAt = Date.now();
    const response = await fetch(joinUrl(this.robotIp, this.options.statusPath), {
      signal: AbortSignal.timeout(3000)
    });

    if (!response.ok) {
      throw new Error(`状态请求失败：${response.status}`);
    }

    const payload = await response.json();
    const latencyMs = Date.now() - startedAt;
    this.heartbeatFailures = 0;
    this.store.applyRobotStatus({
      ...payload,
      latencyMs,
      ip: this.robotIp
    });
    return payload;
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeat = setInterval(() => {
      this.fetchStatus().catch((error) => {
        this.heartbeatFailures += 1;
        this.store.addLog('warn', `状态轮询失败：${error.message}`);
        if (this.heartbeatFailures >= this.options.maxHeartbeatFailures) {
          this.store.addLog('warn', '状态轮询连续失败，已将机器人标记为离线');
          void this.disconnect({ silent: true });
        }
      });
    }, this.options.pingIntervalMs);
  }

  stopHeartbeat() {
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
  }
}
