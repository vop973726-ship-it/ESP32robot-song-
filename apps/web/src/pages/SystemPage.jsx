import { Chip } from '../dashboard-config.jsx';

export default function SystemPage({ dashboard }) {
  return (
    <section className="grid two-columns page-content">
      <article className="panel">
        <div className="panel-head">
          <h2>固件生效能力</h2>
          <span className="muted">直接读取 ESP32 当前固件上报</span>
        </div>

        <div className="firmware-info-block">
          <p className="block-title">启用模块</p>
          <div className="chip-wrap">
            {(dashboard.runtime.capabilities.modules || []).map((moduleName) => (
              <Chip key={moduleName}>{moduleName}</Chip>
            ))}
          </div>
        </div>

        <div className="firmware-info-block">
          <p className="block-title">支持动作</p>
          <div className="chip-wrap">
            {(dashboard.runtime.capabilities.actions || []).map((actionName) => (
              <Chip key={actionName}>{actionName}</Chip>
            ))}
          </div>
        </div>

        <div className="firmware-info-block">
          <p className="block-title">支持移动</p>
          <div className="chip-wrap">
            {(dashboard.runtime.capabilities.moves || []).map((moveName) => (
              <Chip key={moveName}>{moveName}</Chip>
            ))}
          </div>
        </div>

        <div className="info-table">
          <div className="info-row">
            <span>当前 IP</span>
            <strong>{dashboard.runtime.network?.ip || '--'}</strong>
          </div>
          <div className="info-row">
            <span>固定 IP</span>
            <strong>{dashboard.runtime.network?.staticIpEnabled ? '开启' : '关闭'}</strong>
          </div>
          <div className="info-row">
            <span>网关</span>
            <strong>{dashboard.runtime.network?.gateway || '--'}</strong>
          </div>
          <div className="info-row">
            <span>编译时间</span>
            <strong>{dashboard.runtime.build?.compiledAt || '--'}</strong>
          </div>
          <div className="info-row">
            <span>舵机数量</span>
            <strong>{dashboard.runtime.build?.servoCount || '--'}</strong>
          </div>
          <div className="info-row">
            <span>驱动方式</span>
            <strong>{dashboard.runtime.build?.servoDriver || '--'}</strong>
          </div>
          <div className="info-row">
            <span>PCA9685 状态</span>
            <strong>{dashboard.runtime.build?.servoDriverReady ? '已识别' : '未识别'}</strong>
          </div>
          <div className="info-row">
            <span>I2C 引脚</span>
            <strong>
              {typeof dashboard.runtime.build?.i2cSdaPin === 'number' &&
              typeof dashboard.runtime.build?.i2cSclPin === 'number'
                ? `SDA ${dashboard.runtime.build.i2cSdaPin}, SCL ${dashboard.runtime.build.i2cSclPin}`
                : '--'}
            </strong>
          </div>
          <div className="info-row">
            <span>舵机通道</span>
            <strong>{dashboard.runtime.build?.servoChannels?.join(', ') || '--'}</strong>
          </div>
          <div className="info-row">
            <span>零位偏移</span>
            <strong>{dashboard.runtime.build?.servoZeroOffsets?.join(', ') || '--'}</strong>
          </div>
          <div className="info-row">
            <span>写失败次数</span>
            <strong>{dashboard.runtime.build?.servoWriteFailures ?? '--'}</strong>
          </div>
          <div className="info-row">
            <span>驱动报错</span>
            <strong>{dashboard.runtime.build?.lastDriverError || '--'}</strong>
          </div>
          <div className="info-row">
            <span>角度范围</span>
            <strong>
              {dashboard.runtime.build?.angleRange
                ? `${dashboard.runtime.build.angleRange.min} - ${dashboard.runtime.build.angleRange.max}`
                : '--'}
            </strong>
          </div>
          <div className="info-row">
            <span>安全超时</span>
            <strong>
              {dashboard.runtime.build?.safetyTimeoutMs
                ? `${dashboard.runtime.build.safetyTimeoutMs} ms`
                : '--'}
            </strong>
          </div>
        </div>
      </article>

      <article className="panel">
        <div className="panel-head">
          <h2>日志输出区</h2>
          <span className="muted">本地服务与机器人统一日志</span>
        </div>

        <div className="log-list">
          {dashboard.logs.length === 0 ? (
            <p className="empty-log">还没有日志，先连接机器人试试。</p>
          ) : (
            [...dashboard.logs].reverse().map((entry) => (
              <div className={`log-entry ${entry.level}`} key={entry.id}>
                <span>{new Date(entry.timestamp).toLocaleTimeString('zh-CN', { hour12: false })}</span>
                <strong>{entry.level.toUpperCase()}</strong>
                <p>{entry.message}</p>
              </div>
            ))
          )}
        </div>
      </article>
    </section>
  );
}
