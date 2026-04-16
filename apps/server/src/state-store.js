import { EventEmitter } from 'node:events';

function createInitialState() {
  return {
    service: {
      startedAt: new Date().toISOString(),
      connectedClients: 0
    },
    robot: {
      ip: '',
      connected: false,
      mode: 'disconnected',
      battery: null,
      latencyMs: null,
      signalStrength: null,
      firmwareVersion: 'unknown',
      lastSeenAt: null,
      otaInProgress: false
    },
    firmware: {
      fileName: '',
      filePath: '',
      fileSize: 0,
      uploadedAt: null,
      progress: 0,
      lastResult: null,
      lastTarget: 'robot',
      lastMode: null
    },
    serial: {
      ports: [],
      recommendedPort: '',
      lastScanAt: null
    },
    runtime: {
      build: null,
      capabilities: {
        modules: [],
        actions: [],
        moves: [],
        servoIds: []
      },
      network: null
    },
    camera: {
      label: 'ESP32-CAM',
      ip: '',
      baseUrl: '',
      connected: false,
      status: 'disconnected',
      latencyMs: null,
      streamPath: '/stream',
      snapshotPath: '/capture',
      statusPath: '/status',
      otaPath: '/update',
      streamUrl: '',
      snapshotUrl: '',
      statusUrl: '',
      otaUrl: '',
      framesize: null,
      quality: null,
      brightness: null,
      contrast: null,
      saturation: null,
      specialEffect: null,
      wbMode: null,
      lastCheckedAt: null,
      lastError: null,
      otaInProgress: false
    },
    imu: {
      available: false,
      roll: null,
      pitch: null,
      yaw: null,
      accel: {
        x: null,
        y: null,
        z: null
      },
      gyro: {
        x: null,
        y: null,
        z: null
      },
      temperature: null,
      calibrated: false,
      fallen: false,
      lastUpdatedAt: null
    },
    gait: {
      telemetry: {
        available: false,
        phase: 'idle',
        stepCount: 0,
        forwardProgress: null,
        lateralDrift: null,
        yawDrift: null,
        stabilityScore: null,
        fallen: false,
        lastUpdatedAt: null
      },
      optimizer: {
        running: false,
        status: 'idle',
        statusMessage: '等待开始',
        target: 'stability',
        maxTrials: 0,
        trialDurationMs: 0,
        settleTimeMs: 0,
        currentTrial: 0,
        currentParams: null,
        currentScore: null,
        bestScore: null,
        bestParams: null,
        startedAt: null,
        finishedAt: null,
        history: []
      }
    },
    scriptRunner: {
      running: false,
      status: 'idle',
      statusMessage: '等待脚本',
      prompt: '',
      targetServoId: 7,
      targetIp: '',
      currentStep: '',
      loopIteration: 0,
      loopCount: 0,
      summary: [],
      startedAt: null,
      finishedAt: null,
      lastError: null
    },
    servoAngles: {
      1: 90,
      2: 90,
      3: 90,
      4: 90,
      5: 90,
      6: 90,
      7: 90
    },
    logs: []
  };
}

function createDisconnectedRuntimeState() {
  const initial = createInitialState();

  return {
    imu: initial.imu,
    gaitTelemetry: initial.gait.telemetry,
    scriptRunner: initial.scriptRunner
  };
}

export class StateStore extends EventEmitter {
  constructor() {
    super();
    this.state = createInitialState();
  }

  snapshot() {
    return structuredClone(this.state);
  }

  setConnectedClients(count) {
    this.state.service.connectedClients = count;
    this.emit('status', this.snapshot());
  }

  updateRobot(partial) {
    this.state.robot = {
      ...this.state.robot,
      ...partial
    };
    this.emit('status', this.snapshot());
  }

  updateFirmware(partial) {
    this.state.firmware = {
      ...this.state.firmware,
      ...partial
    };
    this.emit('status', this.snapshot());
  }

  updateSerial(partial) {
    this.state.serial = {
      ...this.state.serial,
      ...partial
    };
    this.emit('status', this.snapshot());
  }

  updateCamera(partial) {
    this.state.camera = {
      ...this.state.camera,
      ...partial
    };
    this.emit('status', this.snapshot());
  }

  updateImu(partial) {
    this.state.imu = {
      ...this.state.imu,
      ...partial,
      accel: {
        ...this.state.imu.accel,
        ...partial?.accel
      },
      gyro: {
        ...this.state.imu.gyro,
        ...partial?.gyro
      }
    };
    this.emit('status', this.snapshot());
  }

  updateGaitTelemetry(partial) {
    this.state.gait.telemetry = {
      ...this.state.gait.telemetry,
      ...partial
    };
    this.emit('status', this.snapshot());
  }

  updateOptimizer(partial) {
    this.state.gait.optimizer = {
      ...this.state.gait.optimizer,
      ...partial
    };
    this.emit('status', this.snapshot());
  }

  updateScriptRunner(partial) {
    this.state.scriptRunner = {
      ...this.state.scriptRunner,
      ...partial
    };
    this.emit('status', this.snapshot());
  }

  updateServo(id, angle) {
    this.state.servoAngles = {
      ...this.state.servoAngles,
      [id]: angle
    };
    this.emit('status', this.snapshot());
  }

  resetRobotRuntimeState() {
    const disconnected = createDisconnectedRuntimeState();
    this.state.imu = disconnected.imu;
    this.state.gait.telemetry = disconnected.gaitTelemetry;
    this.state.scriptRunner = disconnected.scriptRunner;
    this.emit('status', this.snapshot());
  }

  applyRobotStatus(payload) {
    const nextRobot = {
      ...this.state.robot,
      connected: true,
      lastSeenAt: new Date().toISOString()
    };

    if (typeof payload.mode === 'string') {
      nextRobot.mode = payload.mode;
    }

    if (typeof payload.battery === 'number') {
      nextRobot.battery = payload.battery;
    }

    if (typeof payload.signalStrength === 'number') {
      nextRobot.signalStrength = payload.signalStrength;
    }

    if (typeof payload.latencyMs === 'number') {
      nextRobot.latencyMs = payload.latencyMs;
    }

    if (typeof payload.firmwareVersion === 'string') {
      nextRobot.firmwareVersion = payload.firmwareVersion;
    }

    if (typeof payload.otaInProgress === 'boolean') {
      nextRobot.otaInProgress = payload.otaInProgress;
    }

    if (payload.servoAngles && typeof payload.servoAngles === 'object') {
      this.state.servoAngles = {
        ...this.state.servoAngles,
        ...payload.servoAngles
      };
    }

    if (payload.build && typeof payload.build === 'object') {
      this.state.runtime.build = payload.build;
    }

    if (payload.capabilities && typeof payload.capabilities === 'object') {
      this.state.runtime.capabilities = {
        ...this.state.runtime.capabilities,
        ...payload.capabilities
      };
    }

    if (payload.network && typeof payload.network === 'object') {
      this.state.runtime.network = payload.network;
    }

    if (payload.imu && typeof payload.imu === 'object') {
      this.state.imu = {
        ...this.state.imu,
        ...payload.imu,
        available:
          Boolean(payload.imu.available) ||
          typeof payload.imu.roll === 'number' ||
          typeof payload.imu.pitch === 'number' ||
          typeof payload.imu.yaw === 'number',
        accel: {
          ...this.state.imu.accel,
          ...(payload.imu.accel && typeof payload.imu.accel === 'object' ? payload.imu.accel : {})
        },
        gyro: {
          ...this.state.imu.gyro,
          ...(payload.imu.gyro && typeof payload.imu.gyro === 'object' ? payload.imu.gyro : {})
        },
        lastUpdatedAt: payload.imu.lastUpdatedAt || new Date().toISOString()
      };
    }

    if (payload.gaitTelemetry && typeof payload.gaitTelemetry === 'object') {
      this.state.gait.telemetry = {
        ...this.state.gait.telemetry,
        ...payload.gaitTelemetry,
        available: true,
        lastUpdatedAt: payload.gaitTelemetry.lastUpdatedAt || new Date().toISOString()
      };
    }

    this.state.robot = nextRobot;
    this.emit('status', this.snapshot());
  }

  addLog(level, message, meta = {}) {
    const entry = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      level,
      message,
      meta
    };

    this.state.logs = [...this.state.logs.slice(-199), entry];
    this.emit('log', entry);
  }
}
