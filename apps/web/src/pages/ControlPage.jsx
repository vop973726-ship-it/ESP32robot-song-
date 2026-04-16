import {
  StatusCard,
  actionButtons,
  formatValue,
  formatSignedValue,
  moveButtons,
  servoControls
} from '../dashboard-config.jsx';

export default function ControlPage({
  dashboard,
  handleCommand,
  centerAllServos,
  factoryCenterAllServos,
  servoDrafts,
  updateServo,
  commitServo,
  trimRange,
  servoTrimDrafts,
  updateServoTrim,
  commitServoTrim,
  servoLiveMode,
  setServoLiveMode
}) {
  const build = dashboard.runtime.build;
  const robotConnected = Boolean(dashboard.robot.connected);
  const driverReady = Boolean(build?.servoDriverReady);
  const driverStatusLabel = !robotConnected
    ? '未连接'
    : driverReady
      ? 'PCA9685 正常'
      : 'PCA9685 未识别';
  const driverStatusAccent = !robotConnected ? 'warn' : driverReady ? 'good' : 'warn';
  const showDriverWarning = Boolean(robotConnected && build && !driverReady);
  const batteryLabel =
    typeof dashboard.robot.battery === 'number' ? `${dashboard.robot.battery} V` : '--';

  return (
    <section className="grid two-columns page-content">
      <article className="panel">
        <div className="panel-head">
          <h2>实时控制区</h2>
          <span className="muted">先聚焦前进方向的企鹅步测试，其他方向暂时留空</span>
        </div>

        <div className="status-grid control-status-grid">
          <StatusCard
            label="机器人连接"
            value={robotConnected ? '在线' : '离线'}
            accent={robotConnected ? 'good' : 'warn'}
          />
          <StatusCard
            label="舵机驱动"
            value={driverStatusLabel}
            accent={driverStatusAccent}
          />
          <StatusCard label="电池电压" value={batteryLabel} />
          <StatusCard
            label="控制延迟"
            value={formatValue(dashboard.robot.latencyMs, ' ms')}
            accent={
              typeof dashboard.robot.latencyMs === 'number' && dashboard.robot.latencyMs <= 120
                ? 'good'
                : undefined
            }
          />
        </div>

        <div className="shortcut-strip">
          <span className="shortcut-pill">Space 急停</span>
          <span className="shortcut-pill">Esc 停止移动</span>
          <span className="shortcut-pill">↑ 前进测试</span>
        </div>

        {showDriverWarning ? (
          <div className="control-alert error">
            <strong>⚠️ 舵机驱动未就绪</strong>
            <p>{build.lastDriverError || '请检查 I2C 接线、PCA9685 供电与设备地址。'}</p>
          </div>
        ) : null}

        <div className="control-block">
          <p className="block-title">动作</p>
          <div className="button-grid">
            {actionButtons.map((item) => (
              <button
                key={item.label}
                className={item.danger ? 'danger' : ''}
                onClick={() => handleCommand(item.payload)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="control-block">
          <p className="block-title">移动</p>
          <div className="button-grid">
            {moveButtons.map((item) => (
              <button
                key={item.label}
                className="ghost"
                onClick={() => handleCommand(item.payload)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </article>

      <article className="panel">
        <div className="panel-head">
          <h2>舵机调节区</h2>
          <span className="muted">
            {showDriverWarning
              ? '驱动异常时已禁用舵机调节'
              : servoLiveMode
                ? '拖动滑块时会实时发送角度'
                : '松开滑块后发送角度'}
          </span>
        </div>

        <div className="live-servo-toolbar">
          <button
            type="button"
            className={servoLiveMode ? 'selected' : 'ghost'}
            onClick={() => setServoLiveMode((current) => !current)}
            disabled={showDriverWarning}
          >
            实时模式：{servoLiveMode ? '开' : '关'}
          </button>
          <span className="muted">开启后会按节流连续发送，方便实时观察舵机姿态。</span>
        </div>

        {servoControls.map(({ id, label, channel }) => (
          <label className={`servo-row ${showDriverWarning ? 'is-disabled' : ''}`} key={id}>
            <div className="servo-meta">
              <div className="servo-label-group">
                <span>{label}</span>
                <small>CH {channel}</small>
              </div>
              <strong>{servoDrafts[id]}°</strong>
            </div>
            <input
              type="range"
              min="0"
              max="180"
              value={servoDrafts[id]}
              disabled={showDriverWarning}
              onChange={(event) => updateServo(id, event.target.value)}
              onMouseUp={(event) => commitServo(id, event.currentTarget.value)}
              onTouchEnd={(event) => commitServo(id, event.currentTarget.value)}
            />
          </label>
        ))}

        <div className="trim-section">
          <div className="panel-head trim-head">
            <h2>零位校准</h2>
            <div className="button-grid">
              <button
                className="ghost"
                type="button"
                onClick={centerAllServos}
                disabled={showDriverWarning}
              >
                一键归中
              </button>
              <button
                className="ghost"
                type="button"
                onClick={factoryCenterAllServos}
                disabled={showDriverWarning}
              >
                一键归零
              </button>
            </div>
          </div>

          <p className="panel-note">
            “一键归中”会回到当前保存的零位基准；“一键归零”会忽略零位偏移，直接把全部舵机打到原厂物理 90 度。如果某个舵机的机械中位仍然偏了，再在这里微调偏移。校准会直接保存到主控板。
          </p>

          {servoControls.map(({ id, label }) => (
            <label className={`trim-row ${showDriverWarning ? 'is-disabled' : ''}`} key={`trim-${id}`}>
              <div className="trim-meta">
                <span>{label}</span>
                <strong>{formatSignedValue(servoTrimDrafts[id], '°')}</strong>
              </div>
              <input
                type="range"
                min={trimRange.min}
                max={trimRange.max}
                value={servoTrimDrafts[id]}
                disabled={showDriverWarning}
                onChange={(event) => updateServoTrim(id, event.target.value)}
                onMouseUp={(event) => commitServoTrim(id, event.currentTarget.value)}
                onTouchEnd={(event) => commitServoTrim(id, event.currentTarget.value)}
              />
            </label>
          ))}
        </div>
      </article>
    </section>
  );
}
