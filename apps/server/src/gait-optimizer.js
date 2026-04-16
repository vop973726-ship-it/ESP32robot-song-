import { gaitOptimizerDefaults, gaitParameterSchema } from './gait-config.js';

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function roundToStep(value, step) {
  const precision = step >= 1 ? 0 : Math.max(0, String(step).split('.')[1]?.length || 0);
  return Number((Math.round(value / step) * step).toFixed(precision));
}

function buildDefaultParams() {
  return Object.fromEntries(
    gaitParameterSchema.map((definition) => [definition.key, definition.defaultValue])
  );
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function sampleParamsAround(baseParams = buildDefaultParams(), explorationScale = 1) {
  const candidate = {};

  for (const definition of gaitParameterSchema) {
    const span = definition.max - definition.min;
    const radius = Math.max(definition.step, span * 0.18 * explorationScale);
    const center = typeof baseParams[definition.key] === 'number' ? baseParams[definition.key] : definition.defaultValue;
    const sampled = clamp(
      randomBetween(center - radius, center + radius),
      definition.min,
      definition.max
    );
    candidate[definition.key] = roundToStep(sampled, definition.step);
  }

  return candidate;
}

function sampleInitialParams() {
  const candidate = {};

  for (const definition of gaitParameterSchema) {
    candidate[definition.key] = roundToStep(
      randomBetween(definition.min, definition.max),
      definition.step
    );
  }

  return candidate;
}

function scoreTelemetry(snapshot, target) {
  const imu = snapshot.imu || {};
  const gaitTelemetry = snapshot.gait?.telemetry || {};
  const diagnostics = [];
  let score = 100;

  if (imu.available) {
    const roll = Math.abs(imu.roll || 0);
    const pitch = Math.abs(imu.pitch || 0);
    score -= roll * 2.2;
    score -= pitch * 2.8;
  } else {
    diagnostics.push('尚未收到 IMU 姿态数据');
    score -= 45;
  }

  if (imu.fallen || gaitTelemetry.fallen) {
    diagnostics.push('检测到跌倒');
    score -= 260;
  }

  if (typeof gaitTelemetry.stabilityScore === 'number') {
    score += gaitTelemetry.stabilityScore * 12;
  }

  if (typeof gaitTelemetry.yawDrift === 'number') {
    score -= Math.abs(gaitTelemetry.yawDrift) * 1.4;
  }

  if (typeof gaitTelemetry.lateralDrift === 'number') {
    score -= Math.abs(gaitTelemetry.lateralDrift) * 1.8;
  }

  const hasForwardProgress = typeof gaitTelemetry.forwardProgress === 'number';
  if (target !== 'stability') {
    if (hasForwardProgress) {
      score += gaitTelemetry.forwardProgress * 42;
    } else {
      diagnostics.push('缺少前进距离反馈，当前只按稳定性打分');
      score -= 18;
    }
  } else if (hasForwardProgress) {
    score += gaitTelemetry.forwardProgress * 8;
  }

  if (typeof gaitTelemetry.stepCount === 'number' && gaitTelemetry.stepCount > 0) {
    score += gaitTelemetry.stepCount * 2.5;
  }

  return {
    score: Number(score.toFixed(2)),
    diagnostics
  };
}

export class GaitOptimizer {
  constructor(store, robotManager) {
    this.store = store;
    this.robotManager = robotManager;
    this.abortToken = null;
  }

  getConfig() {
    return {
      defaults: gaitOptimizerDefaults,
      parameterSchema: gaitParameterSchema
    };
  }

  isRunning() {
    return this.store.snapshot().gait.optimizer.running;
  }

  async start(options = {}) {
    if (this.isRunning()) {
      throw new Error('自动优化已经在运行中');
    }

    if (!this.robotManager.isConnected()) {
      throw new Error('请先连接机器人，再启动自动优化');
    }

    const config = {
      gaitName: gaitOptimizerDefaults.gaitName,
      target: options.target === 'balanced' ? 'balanced' : 'stability',
      maxTrials: clamp(Number(options.maxTrials) || gaitOptimizerDefaults.maxTrials, 1, 100),
      trialDurationMs: clamp(
        Number(options.trialDurationMs) || gaitOptimizerDefaults.trialDurationMs,
        800,
        15000
      ),
      settleTimeMs: clamp(
        Number(options.settleTimeMs) || gaitOptimizerDefaults.settleTimeMs,
        0,
        5000
      ),
      historyLimit: gaitOptimizerDefaults.historyLimit
    };

    this.abortToken = {
      cancelled: false
    };

    this.store.updateOptimizer({
      running: true,
      status: 'running',
      statusMessage: '正在生成初始步态参数',
      target: config.target,
      maxTrials: config.maxTrials,
      trialDurationMs: config.trialDurationMs,
      settleTimeMs: config.settleTimeMs,
      currentTrial: 0,
      currentParams: null,
      currentScore: null,
      bestScore: null,
      bestParams: null,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      history: []
    });

    void this.runLoop(config, this.abortToken);
    return this.store.snapshot().gait.optimizer;
  }

  async stop(reason = '已停止自动优化') {
    if (this.abortToken) {
      this.abortToken.cancelled = true;
    }

    await this.robotManager.sendCommand({
      type: 'gait_trial_stop',
      gaitName: gaitOptimizerDefaults.gaitName
    }).catch(() => null);

    const previous = this.store.snapshot().gait.optimizer;
    this.store.updateOptimizer({
      running: false,
      status: previous.status === 'completed' ? previous.status : 'stopped',
      statusMessage: reason,
      finishedAt: new Date().toISOString()
    });

    return this.store.snapshot().gait.optimizer;
  }

  async runLoop(config, abortToken) {
    let bestParams = null;
    let bestScore = -Infinity;
    let history = [];

    try {
      for (let trial = 1; trial <= config.maxTrials; trial++) {
        if (abortToken.cancelled) {
          break;
        }

        const explorationScale = Math.max(0.22, 1 - trial / (config.maxTrials + 2));
        const candidate = trial <= 3 || !bestParams
          ? sampleInitialParams()
          : sampleParamsAround(bestParams, explorationScale);

        this.store.updateOptimizer({
          currentTrial: trial,
          currentParams: candidate,
          currentScore: null,
          statusMessage: `第 ${trial} 轮试验中`
        });

        await this.robotManager.sendCommand({
          type: 'gait_trial_start',
          gaitName: config.gaitName,
          trialId: trial,
          target: config.target,
          durationMs: config.trialDurationMs,
          params: candidate
        });

        await sleep(config.trialDurationMs);

        const snapshot = this.store.snapshot();
        const evaluation = scoreTelemetry(snapshot, config.target);

        if (evaluation.score > bestScore) {
          bestScore = evaluation.score;
          bestParams = candidate;
        }

        history = [
          ...history,
          {
            trial,
            score: evaluation.score,
            params: candidate,
            diagnostics: evaluation.diagnostics,
            timestamp: new Date().toISOString()
          }
        ].slice(-config.historyLimit);

        this.store.updateOptimizer({
          currentScore: evaluation.score,
          bestScore,
          bestParams,
          history,
          statusMessage:
            evaluation.diagnostics.length > 0
              ? `第 ${trial} 轮完成：${evaluation.diagnostics.join('；')}`
              : `第 ${trial} 轮完成`
        });

        await this.robotManager.sendCommand({
          type: 'gait_trial_stop',
          gaitName: config.gaitName,
          trialId: trial
        }).catch(() => null);

        if (config.settleTimeMs > 0) {
          await sleep(config.settleTimeMs);
        }
      }

      if (!abortToken.cancelled) {
        this.store.updateOptimizer({
          running: false,
          status: 'completed',
          statusMessage: '自动优化已完成',
          finishedAt: new Date().toISOString()
        });
      }
    } catch (error) {
      this.store.addLog('error', `自动优化失败：${error.message}`);
      this.store.updateOptimizer({
        running: false,
        status: 'error',
        statusMessage: error.message,
        finishedAt: new Date().toISOString()
      });
    } finally {
      if (this.abortToken === abortToken) {
        this.abortToken = null;
      }
    }
  }
}
