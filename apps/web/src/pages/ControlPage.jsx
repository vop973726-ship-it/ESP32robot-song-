import {
  actionButtons,
  formatSignedValue,
  moveButtons,
  servoControls
} from '../dashboard-config.jsx';

export default function ControlPage({
  handleCommand,
  centerAllServos,
  servoDrafts,
  updateServo,
  commitServo,
  trimRange,
  servoTrimDrafts,
  updateServoTrim,
  commitServoTrim
}) {
  return (
    <section className="grid two-columns page-content">
      <article className="panel">
        <div className="panel-head">
          <h2>实时控制区</h2>
          <span className="muted">高层动作和移动命令，企鹅步测试会直接启动无踝步态</span>
        </div>

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
          <span className="muted">松开滑块后发送角度</span>
        </div>

        {servoControls.map(({ id, label, channel }) => (
          <label className="servo-row" key={id}>
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
              <button className="ghost" type="button" onClick={centerAllServos}>
                一键归中
              </button>
            </div>
          </div>

          <p className="panel-note">
            当前零位基准已经保存到主控板。之后只需要使用“一键归中”把全部舵机拉回这套基准。如果某个舵机的机械中位仍然偏了，再在这里微调偏移。校准会直接保存到主控板。
          </p>

          {servoControls.map(({ id, label }) => (
            <label className="trim-row" key={`trim-${id}`}>
              <div className="trim-meta">
                <span>{label}</span>
                <strong>{formatSignedValue(servoTrimDrafts[id], '°')}</strong>
              </div>
              <input
                type="range"
                min={trimRange.min}
                max={trimRange.max}
                value={servoTrimDrafts[id]}
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
