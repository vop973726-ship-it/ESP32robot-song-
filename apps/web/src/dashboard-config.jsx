export const defaultGaitConfig = {
  defaults: {
    target: 'stability',
    maxTrials: 18,
    trialDurationMs: 3200,
    settleTimeMs: 1200
  },
  parameterSchema: []
};

export const defaultOptimizerForm = {
  target: 'stability',
  maxTrials: 18,
  trialDurationMs: 3200,
  settleTimeMs: 1200
};

export const defaultCameraForm = {
  ip: '',
  label: 'ESP32-CAM',
  streamPath: '/stream',
  snapshotPath: '/capture',
  statusPath: '/status',
  otaPath: '/update'
};

export const defaultState = {
  service: {
    startedAt: null,
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

export const servoControls = [
  { id: 1, label: '左膝', channel: 15 },
  { id: 2, label: '右膝', channel: 0 },
  { id: 3, label: '左胯zy', channel: 12 },
  { id: 4, label: '右胯zy', channel: 3 },
  { id: 5, label: '左胯qh', channel: 9 },
  { id: 6, label: '右胯qh', channel: 6 },
  { id: 7, label: '脖子', channel: 14 }
];

export const defaultServoTrimDrafts = Object.fromEntries(
  servoControls.map(({ id }) => [id, 0])
);

export const defaultScriptPrompt = `启动
  初始化舵机
  把舵机打到 90 度
循环
  转到 70 度
  延时
  转到 110 度
  延时
  回到 90 度`;

export const actionButtons = [
  {
    label: '企鹅步测试',
    payload: {
      type: 'gait_trial_start',
      gaitName: 'penguin_walk',
      durationMs: 0,
      params: {
        leanAngleDeg: 10,
        hipSwingDeg: 16,
        kneeLiftDeg: 18,
        stanceKneeDeg: 106,
        doubleSupportMs: 180,
        swingPhaseMs: 360,
        torsoLeadDeg: 1,
        neckTrimDeg: 2
      }
    }
  },
  {
    label: '停止步态',
    payload: { type: 'gait_trial_stop', gaitName: 'penguin_walk' }
  },
  { label: '站立', payload: { type: 'action', name: 'stand' } },
  { label: '下蹲', payload: { type: 'action', name: 'squat' } },
  { label: '回中', payload: { type: 'action', name: 'center' } },
  { label: '急停', payload: { type: 'emergency_stop' }, danger: true }
];

export const moveButtons = [
  { label: '前进', payload: { type: 'move', direction: 'forward', speed: 40 } },
  { label: '停止', payload: { type: 'move', direction: 'stop', speed: 0 } }
];

export const pageTabs = [
  {
    id: 'overview',
    label: '连接与烧录',
    description: '管理机器人连接、固件上传和 OTA / USB 烧录。'
  },
  {
    id: 'camera',
    label: '独立相机',
    description: '查看 ESP32-CAM 连接状态、实时画面和抓拍。'
  },
  {
    id: 'control',
    label: '实时控制',
    description: '发送动作命令，调节舵机角度并执行零位校准。'
  },
  {
    id: 'optimize',
    label: '步态优化',
    description: '结合 IMU 反馈观察状态并执行自动步态调参。'
  },
  {
    id: 'system',
    label: '系统状态',
    description: '查看固件能力、网络信息和统一日志输出。'
  }
];

export function normalizePageId(pageId) {
  return pageTabs.some((item) => item.id === pageId) ? pageId : pageTabs[0].id;
}

export function getPageFromHash() {
  if (typeof window === 'undefined') {
    return pageTabs[0].id;
  }

  return normalizePageId(window.location.hash.replace('#', ''));
}

export function formatValue(value, suffix = '') {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '--';
  }

  return `${value}${suffix}`;
}

export function formatSignedValue(value, suffix = '') {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '--';
  }

  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value}${suffix}`;
}

export function formatTime(isoString) {
  if (!isoString) {
    return '--';
  }

  return new Date(isoString).toLocaleString('zh-CN', {
    hour12: false
  });
}

export function formatParameterValue(key, value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '--';
  }

  return key.endsWith('Ms') ? `${value} ms` : `${value}°`;
}

export function appendCacheBuster(url, token) {
  if (!url) {
    return '';
  }

  return `${url}${url.includes('?') ? '&' : '?'}t=${token}`;
}

export function StatusCard({ label, value, accent }) {
  return (
    <div className="status-card">
      <span className="status-label">{label}</span>
      <strong className={`status-value ${accent || ''}`}>{value}</strong>
    </div>
  );
}

export function Chip({ children }) {
  return <span className="capability-chip">{children}</span>;
}
