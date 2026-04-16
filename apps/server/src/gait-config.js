export const gaitParameterSchema = [
  {
    key: 'leanAngleDeg',
    label: '左右摆角',
    min: 2,
    max: 14,
    step: 0.5,
    defaultValue: 11
  },
  {
    key: 'hipSwingDeg',
    label: '胯前摆幅',
    min: 4,
    max: 24,
    step: 0.5,
    defaultValue: 18
  },
  {
    key: 'kneeLiftDeg',
    label: '抬膝幅度',
    min: 4,
    max: 28,
    step: 0.5,
    defaultValue: 22
  },
  {
    key: 'stanceKneeDeg',
    label: '支撑膝角',
    min: 82,
    max: 118,
    step: 1,
    defaultValue: 108
  },
  {
    key: 'doubleSupportMs',
    label: '双支撑停顿',
    min: 80,
    max: 420,
    step: 10,
    defaultValue: 160
  },
  {
    key: 'swingPhaseMs',
    label: '摆腿时长',
    min: 180,
    max: 820,
    step: 10,
    defaultValue: 320
  },
  {
    key: 'torsoLeadDeg',
    label: '躯干前倾',
    min: -8,
    max: 12,
    step: 0.5,
    defaultValue: 1.5
  },
  {
    key: 'neckTrimDeg',
    label: '脖子配重',
    min: -16,
    max: 16,
    step: 0.5,
    defaultValue: 2
  }
];

export const gaitOptimizerDefaults = {
  gaitName: 'penguin_walk',
  target: 'stability',
  maxTrials: 18,
  trialDurationMs: 3200,
  settleTimeMs: 1200,
  historyLimit: 24
};
