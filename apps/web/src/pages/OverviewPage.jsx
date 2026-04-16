import { StatusCard, formatTime, formatValue, servoControls } from '../dashboard-config.jsx';

export default function OverviewPage({
  dashboard,
  ip,
  setIp,
  busy,
  scriptPrompt,
  setScriptPrompt,
  scriptServoId,
  setScriptServoId,
  chatMessages,
  handleRunScript,
  handleRunWithBrain,
  handleStopScript,
  handleConnect,
  handleDisconnect,
  selectedFile,
  setSelectedFile,
  flashTarget,
  setFlashTarget,
  flashMode,
  setFlashMode,
  usbPort,
  setUsbPort,
  flashTargetLabel,
  flashTargetIp,
  handleUpload,
  handleFlash
}) {
  const scriptRunner = dashboard.scriptRunner || {
    running: false,
    statusMessage: '等待脚本',
    currentStep: '',
    loopIteration: 0,
    loopCount: 0,
    summary: [],
    startedAt: null,
    lastError: null
  };

  return (
    <section className="grid page-content">
      <article className="panel">
        <div className="panel-head">
          <h2>本地大脑对话框</h2>
          <span className="muted">中文脚本可直接执行，自然语言可交给 Ollama/Gemma 规划</span>
        </div>

        <div className="script-console-grid">
          <div className="script-editor-panel">
            <div className="script-config-grid">
              <label className="field">
                <span>机器人 IP</span>
                <input
                  value={ip}
                  onChange={(event) => setIp(event.target.value)}
                  placeholder="未连接时会用这里的地址自动连接"
                />
              </label>

              <label className="field">
                <span>默认目标舵机</span>
                <select
                  value={scriptServoId}
                  onChange={(event) => setScriptServoId(Number(event.target.value))}
                >
                  {servoControls.map(({ id, label, channel }) => (
                    <option key={`script-servo-${id}`} value={id}>
                      {label} · CH {channel}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="field">
              <span>指令 / 脚本</span>
              <textarea
                className="script-textarea"
                value={scriptPrompt}
                onChange={(event) => setScriptPrompt(event.target.value)}
                placeholder="可以输入自然语言，例如：站起来，往前走一下，然后抬头；也可以输入中文脚本。"
              />
            </label>

            <p className="panel-note">
              手动脚本支持：`启动`、`循环`、`初始化舵机`、`转到 90 度`、`延时 500ms / 1 秒`、`站立`、`下蹲`、`前进`、`后退`、`左转`、`右转`、`停止移动`、`急停`。
              Gemma 模式会先把自然语言规划成这些白名单脚本，再由本地服务执行。
            </p>

            <div className="button-row">
              <button
                className="accent"
                onClick={handleRunWithBrain}
                disabled={busy.script || busy.brain || !scriptPrompt.trim() || !(ip || dashboard.robot.ip)}
              >
                {busy.brain ? '规划中...' : 'Gemma 规划并执行'}
              </button>
              <button
                className="ghost"
                onClick={handleRunScript}
                disabled={busy.script || busy.brain || !scriptPrompt.trim() || !(ip || dashboard.robot.ip)}
              >
                {busy.script ? '提交中...' : '直接执行脚本'}
              </button>
              <button
                className="ghost"
                onClick={handleStopScript}
                disabled={busy.script || busy.brain || !scriptRunner.running}
              >
                停止脚本
              </button>
            </div>
          </div>

          <div className="script-status-panel">
            <div className="status-grid">
              <StatusCard
                label="脚本状态"
                value={scriptRunner.running ? '运行中' : scriptRunner.statusMessage || '空闲'}
                accent={scriptRunner.running ? 'good' : scriptRunner.lastError ? 'warn' : undefined}
              />
              <StatusCard
                label="当前步骤"
                value={scriptRunner.currentStep || '--'}
                accent={scriptRunner.currentStep ? 'good' : undefined}
              />
              <StatusCard
                label="循环进度"
                value={
                  scriptRunner.loopCount
                    ? `${scriptRunner.loopIteration}/${scriptRunner.loopCount}`
                    : scriptRunner.loopIteration
                      ? `第 ${scriptRunner.loopIteration} 轮`
                      : '--'
                }
              />
              <StatusCard label="开始时间" value={formatTime(scriptRunner.startedAt)} />
            </div>

            {scriptRunner.summary?.length ? (
              <div className="script-plan-card">
                <p className="block-title">当前执行计划</p>
                <div className="script-plan-list">
                  {scriptRunner.summary.map((item) => (
                    <p key={item}>{item}</p>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="script-chat-card">
              <div className="panel-head script-chat-head">
                <h2>聊天记录</h2>
                <span className="muted">Gemma 规划、本地解析结果与执行反馈</span>
              </div>

              <div className="script-chat-list">
                {chatMessages.map((message) => (
                  <article
                    key={message.id}
                    className={`script-chat-message ${message.role === 'user' ? 'user' : 'assistant'}`}
                  >
                    <strong>{message.role === 'user' ? '你' : '本地控制'}</strong>
                    <p>{message.content}</p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </div>
      </article>

      <div className="grid two-columns">
      <article className="panel">
        <div className="panel-head">
          <h2>连接区</h2>
          <span className="muted">通过本地服务连接 ESP32</span>
        </div>

        <label className="field">
          <span>机器人 IP</span>
          <input
            value={ip}
            onChange={(event) => setIp(event.target.value)}
            placeholder="例如 192.168.1.50"
          />
        </label>

        <div className="button-row">
          <button onClick={handleConnect} disabled={busy.connect || !ip}>
            {busy.connect ? '连接中...' : '连接'}
          </button>
          <button className="ghost" onClick={handleDisconnect} disabled={busy.connect}>
            断开
          </button>
        </div>

        <div className="status-grid">
          <StatusCard
            label="状态"
            value={dashboard.robot.connected ? '在线' : '离线'}
            accent={dashboard.robot.connected ? 'good' : 'warn'}
          />
          <StatusCard label="模式" value={dashboard.robot.mode || '--'} />
          <StatusCard label="延迟" value={formatValue(dashboard.robot.latencyMs, ' ms')} />
          <StatusCard label="信号" value={formatValue(dashboard.robot.signalStrength, ' dBm')} />
        </div>
      </article>

      <article className="panel">
        <div className="panel-head">
          <h2>烧录区</h2>
          <span className="muted">机器人主控 / 相机模块都可走 Wi-Fi OTA，USB 仍可救砖</span>
        </div>

        <label className="field">
          <span>固件文件</span>
          <input
            type="file"
            accept=".bin"
            onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
          />
        </label>

        <div className="segmented">
          <button
            className={flashTarget === 'robot' ? 'selected' : 'ghost'}
            onClick={() => setFlashTarget('robot')}
          >
            机器人主控
          </button>
          <button
            className={flashTarget === 'camera' ? 'selected' : 'ghost'}
            onClick={() => setFlashTarget('camera')}
          >
            相机模块
          </button>
        </div>

        <div className="segmented">
          <button
            className={flashMode === 'ota' ? 'selected' : 'ghost'}
            onClick={() => setFlashMode('ota')}
          >
            OTA
          </button>
          <button
            className={flashMode === 'usb' ? 'selected' : 'ghost'}
            onClick={() => setFlashMode('usb')}
          >
            USB
          </button>
        </div>

        {flashMode === 'usb' ? (
          <>
            <label className="field">
              <span>自动识别到的串口</span>
              <select value={usbPort} onChange={(event) => setUsbPort(event.target.value)}>
                <option value="">
                  {dashboard.serial.ports.length === 0 ? '暂无可用串口' : '请选择串口'}
                </option>
                {dashboard.serial.ports.map((port) => (
                  <option key={port.path} value={port.path}>
                    {port.path}
                    {port.likelyEsp32 ? '  ·  推荐' : ''}
                  </option>
                ))}
              </select>
            </label>

            <div className="detected-list">
              {dashboard.serial.ports.length === 0 ? (
                <p className="detected-empty">
                  当前没有识别到 USB 串口设备。你后续插上板子后，这里会自动刷新。
                </p>
              ) : (
                dashboard.serial.ports.map((port) => (
                  <button
                    key={port.path}
                    type="button"
                    className={port.path === usbPort ? 'selected' : 'ghost'}
                    onClick={() => setUsbPort(port.path)}
                  >
                    {port.label}
                    {port.likelyEsp32 ? ' · ESP32 候选' : ''}
                  </button>
                ))
              )}
            </div>

            <label className="field">
              <span>手动输入串口</span>
              <input
                value={usbPort}
                onChange={(event) => setUsbPort(event.target.value)}
                placeholder="/dev/cu.usbserial-0001"
              />
            </label>
          </>
        ) : null}

        <p className="panel-note">
          当前目标：{flashTargetLabel}
          {flashMode === 'ota'
            ? ` · 将通过 Wi-Fi 推送到 ${flashTargetIp || '未填写 IP'}`
            : ' · USB 模式下请确保选择的是目标板对应串口'}
        </p>

        <div className="button-row">
          <button onClick={handleUpload} disabled={busy.upload || !selectedFile}>
            {busy.upload ? '上传中...' : '上传固件'}
          </button>
          <button
            className="accent"
            onClick={handleFlash}
            disabled={
              busy.flash ||
              !dashboard.firmware.filePath ||
              (flashMode === 'ota' ? !flashTargetIp : !usbPort)
            }
          >
            {busy.flash ? '处理中...' : '上传并升级'}
          </button>
        </div>

        <div className="progress-block">
          <div className="progress-label">
            <span>{dashboard.firmware.fileName || '尚未上传固件'}</span>
            <strong>{dashboard.firmware.progress}%</strong>
          </div>
          <div className="progress-track">
            <div
              className="progress-bar"
              style={{ width: `${dashboard.firmware.progress}%` }}
            />
          </div>
        </div>
      </article>
      </div>
    </section>
  );
}
