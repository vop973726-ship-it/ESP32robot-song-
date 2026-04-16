const DEFAULT_DELAY_MS = 800;
const MAX_DELAY_MS = 60000;

const SERVO_NAME_MAP = new Map([
  ['左膝', 1],
  ['右膝', 2],
  ['左胯r', 3],
  ['右胯r', 4],
  ['左胯p', 5],
  ['右胯p', 6],
  ['脖子', 7],
  ['颈部', 7],
  ['头部', 7]
]);

function createAbortError(message) {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

function sanitizeLine(rawLine) {
  return rawLine.replace(/^[\s>*\-•\d.、]+/, '').trim();
}

function parseLoopCount(line) {
  const match = line.match(/循环(?:\s*(\d+)\s*次)?/);
  if (!match) {
    return null;
  }

  return match[1] ? Number(match[1]) : null;
}

function parseDurationMs(line) {
  const normalized = line.replace(/\s+/g, '');
  const msMatch = normalized.match(/(\d+)(ms|毫秒)/i);
  if (msMatch) {
    return Math.min(Number(msMatch[1]), MAX_DELAY_MS);
  }

  const secondMatch = normalized.match(/(\d+(?:\.\d+)?)(秒|s)/i);
  if (secondMatch) {
    return Math.min(Math.round(Number(secondMatch[1]) * 1000), MAX_DELAY_MS);
  }

  return DEFAULT_DELAY_MS;
}

function parseSpeed(line, fallback) {
  const match = line.match(/速度\s*(\d+)/);
  if (!match) {
    return fallback;
  }

  return Math.max(0, Math.min(100, Number(match[1])));
}

function resolveServoId(line, defaultServoId) {
  const servoMatch = line.match(/舵机\s*(\d+)/);
  if (servoMatch) {
    return Number(servoMatch[1]);
  }

  for (const [name, id] of SERVO_NAME_MAP.entries()) {
    if (line.includes(name)) {
      return id;
    }
  }

  return Number(defaultServoId || 7);
}

function parseStep(line, options) {
  if (/^(初始化舵机|舵机初始化|初始化|回中|归中)$/.test(line)) {
    return {
      type: 'action',
      name: 'center',
      description: '初始化舵机并回中'
    };
  }

  if (/^(站立|站起来)$/.test(line)) {
    return {
      type: 'action',
      name: 'stand',
      description: '执行站立动作'
    };
  }

  if (/^(下蹲|蹲下)$/.test(line)) {
    return {
      type: 'action',
      name: 'squat',
      description: '执行下蹲动作'
    };
  }

  if (/^(急停|停止|立刻停止)$/.test(line)) {
    return {
      type: 'emergency_stop',
      description: '执行急停'
    };
  }

  if (/^(前进|向前|往前走)/.test(line)) {
    return {
      type: 'move',
      direction: 'forward',
      speed: parseSpeed(line, 40),
      description: '执行前进'
    };
  }

  if (/^(后退|向后|往后退)/.test(line)) {
    return {
      type: 'move',
      direction: 'backward',
      speed: parseSpeed(line, 30),
      description: '执行后退'
    };
  }

  if (/^(左转|向左转)/.test(line)) {
    return {
      type: 'move',
      direction: 'left',
      speed: parseSpeed(line, 25),
      description: '执行左转'
    };
  }

  if (/^(右转|向右转)/.test(line)) {
    return {
      type: 'move',
      direction: 'right',
      speed: parseSpeed(line, 25),
      description: '执行右转'
    };
  }

  if (/^(停止移动|停下|停住)$/.test(line)) {
    return {
      type: 'move',
      direction: 'stop',
      speed: 0,
      description: '停止移动'
    };
  }

  if (/(延时|等待|暂停|停顿)/.test(line)) {
    const durationMs = parseDurationMs(line);
    return {
      type: 'delay',
      durationMs,
      description: `延时 ${durationMs} ms`
    };
  }

  if (/(转到|回到|打到|设到|设置到)/.test(line) && /度/.test(line)) {
    const angleMatch = line.match(/(-?\d+)\s*度/);
    if (!angleMatch) {
      throw new Error(`无法识别角度：${line}`);
    }

    const servoId = resolveServoId(line, options.defaultServoId);
    const angle = Number(angleMatch[1]);
    if (!Number.isFinite(angle)) {
      throw new Error(`舵机角度无效：${line}`);
    }

    return {
      type: 'servo',
      id: servoId,
      angle: Math.max(0, Math.min(180, angle)),
      description: `舵机 ${servoId} 转到 ${Math.max(0, Math.min(180, angle))}°`
    };
  }

  throw new Error(`暂不支持这条脚本指令：${line}`);
}

export function parseRobotScript(script, options = {}) {
  const lines = String(script || '')
    .split(/\r?\n/)
    .map(sanitizeLine)
    .filter(Boolean);

  if (lines.length === 0) {
    throw new Error('请输入要执行的脚本');
  }

  const setupSteps = [];
  const loopSteps = [];
  let inLoop = false;
  let loopCount = 0;

  for (const line of lines) {
    if (/^启动$/.test(line)) {
      inLoop = false;
      continue;
    }

    if (/^循环/.test(line)) {
      inLoop = true;
      loopCount = parseLoopCount(line);
      continue;
    }

    const step = parseStep(line, options);
    if (inLoop) {
      loopSteps.push(step);
    } else {
      setupSteps.push(step);
    }
  }

  if (setupSteps.length === 0 && loopSteps.length === 0) {
    throw new Error('没有识别到可执行指令');
  }

  const summary = [];
  if (setupSteps.length > 0) {
    summary.push(`启动：${setupSteps.map((step) => step.description).join(' -> ')}`);
  }
  if (loopSteps.length > 0) {
    summary.push(
      `${loopCount ? `循环 ${loopCount} 次` : '循环执行'}：${loopSteps
        .map((step) => step.description)
        .join(' -> ')}`
    );
  }

  return {
    setupSteps,
    loopSteps,
    loopCount,
    targetServoId: Number(options.defaultServoId || 7),
    summary
  };
}

export class ScriptRunner {
  constructor(store, robotManager) {
    this.store = store;
    this.robotManager = robotManager;
    this.currentRunId = 0;
    this.abortController = null;
  }

  isRunning() {
    return Boolean(this.abortController) && !this.abortController.signal.aborted;
  }

  async run({ script, ip, servoId }) {
    const targetIp = String(ip || this.store.snapshot().robot.ip || '').trim();
    if (!targetIp) {
      throw new Error('请先填写机器人 IP');
    }

    const plan = parseRobotScript(script, {
      defaultServoId: servoId
    });

    if (this.isRunning()) {
      await this.stop('已停止上一条脚本');
    }

    this.abortController = new AbortController();
    const runId = Date.now();
    this.currentRunId = runId;

    this.store.updateScriptRunner({
      running: true,
      status: 'connecting',
      statusMessage: '正在连接机器人',
      prompt: script,
      targetServoId: plan.targetServoId,
      targetIp,
      currentStep: '',
      loopIteration: 0,
      loopCount: plan.loopCount,
      summary: plan.summary,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      lastError: null
    });

    this.store.addLog('info', `脚本控制已启动，目标舵机 ${plan.targetServoId}`);

    try {
      if (!this.robotManager.isConnected() || this.store.snapshot().robot.ip !== targetIp) {
        await this.robotManager.connect(targetIp);
      }

      await this.robotManager.fetchStatus().catch(() => null);
    } catch (error) {
      this.abortController = null;
      this.currentRunId = 0;
      this.store.updateScriptRunner({
        running: false,
        status: 'error',
        statusMessage: error.message,
        finishedAt: new Date().toISOString(),
        lastError: error.message
      });
      throw error;
    }

    void this.executePlan(runId, plan, this.abortController.signal).catch((error) => {
      if (error?.name === 'AbortError') {
        return;
      }

      if (this.currentRunId !== runId) {
        return;
      }

      this.store.addLog('error', `脚本执行失败：${error.message}`);
      this.finishRun(runId, {
        status: 'error',
        statusMessage: error.message,
        lastError: error.message
      });
    });

    return {
      ok: true,
      plan: {
        targetServoId: plan.targetServoId,
        summary: plan.summary,
        loopCount: plan.loopCount
      }
    };
  }

  async stop(reason = '脚本已停止') {
    if (!this.isRunning()) {
      return {
        ok: true
      };
    }

    if (this.abortController) {
      this.abortController.abort(createAbortError(reason));
      this.abortController = null;
    }

    const runId = this.currentRunId;
    if (!runId) {
      this.store.updateScriptRunner({
        running: false,
        status: 'idle',
        statusMessage: reason
      });
      return {
        ok: true
      };
    }

    this.store.addLog('warn', reason);
    this.finishRun(runId, {
      status: 'stopped',
      statusMessage: reason
    });

    return {
      ok: true
    };
  }

  async executePlan(runId, plan, signal) {
    await this.runStepGroup(runId, plan.setupSteps, 'setup', 1, signal);

    if (plan.loopSteps.length === 0) {
      this.finishRun(runId, {
        status: 'completed',
        statusMessage: '脚本执行完成'
      });
      return;
    }

    let iteration = 0;
    while (!signal.aborted) {
      iteration += 1;
      await this.runStepGroup(runId, plan.loopSteps, 'loop', iteration, signal);

      if (plan.loopCount && iteration >= plan.loopCount) {
        this.finishRun(runId, {
          status: 'completed',
          statusMessage: `循环 ${plan.loopCount} 次后已完成`
        });
        return;
      }
    }
  }

  async runStepGroup(runId, steps, phase, iteration, signal) {
    for (const step of steps) {
      this.ensureActive(runId, signal);
      this.store.updateScriptRunner({
        running: true,
        status: phase,
        statusMessage: phase === 'setup' ? '正在执行启动步骤' : '正在循环执行',
        currentStep: step.description,
        loopIteration: phase === 'loop' ? iteration : 0
      });
      await this.executeStep(step, signal);
    }
  }

  async executeStep(step, signal) {
    if (step.type === 'delay') {
      await this.wait(step.durationMs, signal);
      return;
    }

    if (step.type === 'servo') {
      await this.robotManager.sendCommand({
        type: 'servo',
        id: step.id,
        angle: step.angle
      });
      return;
    }

    if (step.type === 'action') {
      await this.robotManager.sendCommand({
        type: 'action',
        name: step.name
      });
      return;
    }

    if (step.type === 'move') {
      await this.robotManager.sendCommand({
        type: 'move',
        direction: step.direction,
        speed: step.speed
      });
      return;
    }

    if (step.type === 'emergency_stop') {
      await this.robotManager.sendCommand({
        type: 'emergency_stop'
      });
    }
  }

  wait(durationMs, signal) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        resolve();
      }, durationMs);

      function cleanup() {
        clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
      }

      function onAbort() {
        cleanup();
        reject(createAbortError('脚本已停止'));
      }

      signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  ensureActive(runId, signal) {
    if (this.currentRunId !== runId || signal.aborted) {
      throw createAbortError('脚本已停止');
    }
  }

  finishRun(runId, partial) {
    if (this.currentRunId !== runId) {
      return;
    }

    this.abortController = null;
    this.currentRunId = 0;
    this.store.updateScriptRunner({
      running: false,
      currentStep: '',
      finishedAt: new Date().toISOString(),
      ...partial
    });

    if (partial.status === 'completed') {
      this.store.addLog('success', partial.statusMessage || '脚本执行完成');
    }
  }
}
