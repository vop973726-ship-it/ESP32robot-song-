import {
  StatusCard,
  formatParameterValue,
  formatSignedValue,
  formatTime,
  formatValue
} from '../dashboard-config.jsx';

export default function OptimizePage({
  dashboard,
  imu,
  gaitTelemetry,
  optimizerForm,
  updateOptimizerForm,
  busy,
  handleStartOptimization,
  handleStopOptimization,
  gaitOptimizer,
  gaitConfig
}) {
  return (
    <section className="grid two-columns page-content">
      <article className="panel">
        <div className="panel-head">
          <h2>IMU 反馈区</h2>
          <span className="muted">姿态、跌倒和企鹅步阶段反馈</span>
        </div>

        <div className="status-grid">
          <StatusCard
            label="Roll"
            value={formatSignedValue(imu.roll, '°')}
            accent={imu.available ? 'good' : 'warn'}
          />
          <StatusCard
            label="Pitch"
            value={formatSignedValue(imu.pitch, '°')}
            accent={imu.available ? 'good' : 'warn'}
          />
          <StatusCard
            label="Yaw"
            value={formatSignedValue(imu.yaw, '°')}
            accent={imu.available ? 'good' : 'warn'}
          />
          <StatusCard
            label="跌倒判定"
            value={imu.fallen || gaitTelemetry.fallen ? '已触发' : '正常'}
            accent={imu.fallen || gaitTelemetry.fallen ? 'warn' : 'good'}
          />
        </div>

        <div className="info-table">
          <div className="info-row">
            <span>校准状态</span>
            <strong>{imu.calibrated ? '已校准' : '未校准 / 未上报'}</strong>
          </div>
          <div className="info-row">
            <span>加速度</span>
            <strong>
              X {formatValue(imu.accel?.x)} / Y {formatValue(imu.accel?.y)} / Z {formatValue(imu.accel?.z)}
            </strong>
          </div>
          <div className="info-row">
            <span>角速度</span>
            <strong>
              X {formatValue(imu.gyro?.x)} / Y {formatValue(imu.gyro?.y)} / Z {formatValue(imu.gyro?.z)}
            </strong>
          </div>
          <div className="info-row">
            <span>步态阶段</span>
            <strong>{gaitTelemetry.phase || '--'}</strong>
          </div>
          <div className="info-row">
            <span>步数</span>
            <strong>{gaitTelemetry.stepCount ?? '--'}</strong>
          </div>
          <div className="info-row">
            <span>前进反馈</span>
            <strong>{formatValue(gaitTelemetry.forwardProgress, ' m')}</strong>
          </div>
          <div className="info-row">
            <span>侧向漂移</span>
            <strong>{formatSignedValue(gaitTelemetry.lateralDrift, ' m')}</strong>
          </div>
          <div className="info-row">
            <span>偏航漂移</span>
            <strong>{formatSignedValue(gaitTelemetry.yawDrift, '°')}</strong>
          </div>
          <div className="info-row">
            <span>稳定性评分</span>
            <strong>{formatValue(gaitTelemetry.stabilityScore)}</strong>
          </div>
          <div className="info-row">
            <span>最后更新</span>
            <strong>{formatTime(imu.lastUpdatedAt || gaitTelemetry.lastUpdatedAt)}</strong>
          </div>
        </div>
      </article>

      <article className="panel">
        <div className="panel-head">
          <h2>自动步态优化</h2>
          <span className="muted">本地服务根据 IMU 反馈搜索更稳的企鹅步参数</span>
        </div>

        <label className="field">
          <span>优化目标</span>
          <select
            value={optimizerForm.target}
            onChange={(event) => updateOptimizerForm('target', event.target.value)}
          >
            <option value="stability">先稳住</option>
            <option value="balanced">稳住后兼顾前进</option>
          </select>
        </label>

        <div className="optimizer-fields">
          <label className="field">
            <span>最大轮次</span>
            <input
              type="number"
              min="1"
              max="100"
              value={optimizerForm.maxTrials}
              onChange={(event) => updateOptimizerForm('maxTrials', event.target.value)}
            />
          </label>
          <label className="field">
            <span>单轮时长（ms）</span>
            <input
              type="number"
              min="800"
              max="15000"
              value={optimizerForm.trialDurationMs}
              onChange={(event) => updateOptimizerForm('trialDurationMs', event.target.value)}
            />
          </label>
          <label className="field">
            <span>恢复时间（ms）</span>
            <input
              type="number"
              min="0"
              max="5000"
              value={optimizerForm.settleTimeMs}
              onChange={(event) => updateOptimizerForm('settleTimeMs', event.target.value)}
            />
          </label>
        </div>

        <div className="button-row">
          <button
            className="accent"
            onClick={handleStartOptimization}
            disabled={busy.gait || !dashboard.robot.connected}
          >
            {busy.gait && !gaitOptimizer.running ? '启动中...' : '开始自动优化'}
          </button>
          <button
            className="ghost"
            onClick={handleStopOptimization}
            disabled={busy.gait || !gaitOptimizer.running}
          >
            {busy.gait && gaitOptimizer.running ? '停止中...' : '停止优化'}
          </button>
        </div>

        <p className="panel-note">
          {imu.available
            ? 'IMU 已在线，当前可以根据姿态稳定性自动打分。若固件再上报前进距离，系统会自动纳入速度目标。'
            : '尚未收到 IMU 数据。面板已接好，但真实打分仍依赖固件把 roll/pitch/yaw 和跌倒状态上报到本地服务。'}
        </p>

        <div className="status-grid">
          <StatusCard
            label="优化状态"
            value={gaitOptimizer.status || '--'}
            accent={gaitOptimizer.running ? 'good' : 'warn'}
          />
          <StatusCard
            label="当前轮次"
            value={
              gaitOptimizer.maxTrials
                ? `${gaitOptimizer.currentTrial}/${gaitOptimizer.maxTrials}`
                : '--'
            }
          />
          <StatusCard label="当前得分" value={formatValue(gaitOptimizer.currentScore)} />
          <StatusCard label="最优得分" value={formatValue(gaitOptimizer.bestScore)} />
        </div>

        <div className="info-table">
          <div className="info-row">
            <span>状态说明</span>
            <strong>{gaitOptimizer.statusMessage || '--'}</strong>
          </div>
          <div className="info-row">
            <span>启动时间</span>
            <strong>{formatTime(gaitOptimizer.startedAt)}</strong>
          </div>
          <div className="info-row">
            <span>结束时间</span>
            <strong>{formatTime(gaitOptimizer.finishedAt)}</strong>
          </div>
        </div>

        <div className="param-section">
          <p className="block-title">当前参数</p>
          <div className="param-grid">
            {(gaitConfig.parameterSchema || []).map((definition) => (
              <div className="param-card" key={`current-${definition.key}`}>
                <span>{definition.label}</span>
                <strong>
                  {formatParameterValue(
                    definition.key,
                    gaitOptimizer.currentParams?.[definition.key]
                  )}
                </strong>
              </div>
            ))}
          </div>
        </div>

        <div className="param-section">
          <p className="block-title">当前最优参数</p>
          <div className="param-grid">
            {(gaitConfig.parameterSchema || []).map((definition) => (
              <div className="param-card" key={`best-${definition.key}`}>
                <span>{definition.label}</span>
                <strong>
                  {formatParameterValue(
                    definition.key,
                    gaitOptimizer.bestParams?.[definition.key]
                  )}
                </strong>
              </div>
            ))}
          </div>
        </div>

        <div className="history-section">
          <p className="block-title">最近试验</p>
          <div className="history-list">
            {gaitOptimizer.history.length === 0 ? (
              <p className="empty-log">还没有试验记录。</p>
            ) : (
              [...gaitOptimizer.history].reverse().map((entry) => (
                <div className="history-entry" key={`${entry.trial}-${entry.timestamp}`}>
                  <div className="history-meta">
                    <strong>第 {entry.trial} 轮</strong>
                    <span>{entry.score}</span>
                  </div>
                  <p>{entry.diagnostics?.length > 0 ? entry.diagnostics.join('；') : '无异常提示'}</p>
                  <small>{formatTime(entry.timestamp)}</small>
                </div>
              ))
            )}
          </div>
        </div>
      </article>
    </section>
  );
}
