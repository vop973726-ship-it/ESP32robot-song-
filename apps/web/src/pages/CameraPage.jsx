import { StatusCard, formatTime, formatValue } from '../dashboard-config.jsx';

export default function CameraPage({
  cameraForm,
  updateCameraForm,
  busy,
  handleCameraConnect,
  handleCameraDisconnect,
  requestSnapshot,
  camera,
  cameraStreamProxyUrl,
  cameraSnapshotProxyUrl,
  liveStreamUrl,
  snapshotPreviewUrl
}) {
  return (
    <section className="grid two-columns page-content">
      <article className="panel wide-panel">
        <div className="panel-head">
          <h2>独立相机模块</h2>
          <span className="muted">单独 ESP32-CAM，默认使用 /stream、/capture、/status</span>
        </div>

        <div className="camera-form-grid">
          <label className="field">
            <span>相机 IP / 地址</span>
            <input
              value={cameraForm.ip}
              onChange={(event) => updateCameraForm('ip', event.target.value)}
              placeholder="例如 172.20.10.11"
            />
          </label>
          <label className="field">
            <span>视频流路径</span>
            <input
              value={cameraForm.streamPath}
              onChange={(event) => updateCameraForm('streamPath', event.target.value)}
              placeholder="/stream"
            />
          </label>
          <label className="field">
            <span>抓拍路径</span>
            <input
              value={cameraForm.snapshotPath}
              onChange={(event) => updateCameraForm('snapshotPath', event.target.value)}
              placeholder="/capture"
            />
          </label>
          <label className="field">
            <span>状态路径</span>
            <input
              value={cameraForm.statusPath}
              onChange={(event) => updateCameraForm('statusPath', event.target.value)}
              placeholder="/status"
            />
          </label>
          <label className="field">
            <span>OTA 路径</span>
            <input
              value={cameraForm.otaPath}
              onChange={(event) => updateCameraForm('otaPath', event.target.value)}
              placeholder="/update"
            />
          </label>
        </div>

        <div className="button-row">
          <button onClick={handleCameraConnect} disabled={busy.camera || !cameraForm.ip}>
            {busy.camera ? '连接中...' : '连接相机'}
          </button>
          <button className="ghost" onClick={handleCameraDisconnect} disabled={busy.camera}>
            断开相机
          </button>
          <button className="ghost" onClick={requestSnapshot} disabled={!camera.baseUrl}>
            刷新抓拍
          </button>
        </div>

        <p className="panel-note">
          相机板和当前舵机控制板分离。ESP32-CAM 当前是单线程服务，实时流、抓拍、状态轮询同时打过去容易互相阻塞，所以这里默认优先显示实时流，抓拍改成手动刷新。
        </p>

        <div className="status-grid">
          <StatusCard
            label="连接状态"
            value={camera.connected ? '在线' : camera.status || '未连接'}
            accent={camera.connected ? 'good' : 'warn'}
          />
          <StatusCard label="延迟" value={formatValue(camera.latencyMs, ' ms')} />
          <StatusCard label="Framesize" value={formatValue(camera.framesize)} />
          <StatusCard label="Quality" value={formatValue(camera.quality)} />
        </div>

        <div className="info-table">
          <div className="info-row">
            <span>基础地址</span>
            <strong>{camera.baseUrl || '--'}</strong>
          </div>
          <div className="info-row">
            <span>视频流 URL</span>
            <strong>{camera.streamUrl || '--'}</strong>
          </div>
          <div className="info-row">
            <span>本地代理流</span>
            <strong>{cameraStreamProxyUrl || '--'}</strong>
          </div>
          <div className="info-row">
            <span>抓拍 URL</span>
            <strong>{camera.snapshotUrl || '--'}</strong>
          </div>
          <div className="info-row">
            <span>本地代理抓拍</span>
            <strong>{cameraSnapshotProxyUrl || '--'}</strong>
          </div>
          <div className="info-row">
            <span>状态 URL</span>
            <strong>{camera.statusUrl || '--'}</strong>
          </div>
          <div className="info-row">
            <span>OTA URL</span>
            <strong>{camera.otaUrl || '--'}</strong>
          </div>
          <div className="info-row">
            <span>亮度 / 对比度</span>
            <strong>
              {formatValue(camera.brightness)} / {formatValue(camera.contrast)}
            </strong>
          </div>
          <div className="info-row">
            <span>饱和度 / 白平衡</span>
            <strong>
              {formatValue(camera.saturation)} / {formatValue(camera.wbMode)}
            </strong>
          </div>
          <div className="info-row">
            <span>最后轮询</span>
            <strong>{formatTime(camera.lastCheckedAt)}</strong>
          </div>
          <div className="info-row">
            <span>最近错误</span>
            <strong>{camera.lastError || '--'}</strong>
          </div>
        </div>

        <div className="camera-preview-grid">
          <div className="camera-frame">
            <div className="camera-frame-head">
              <strong>实时画面</strong>
              {cameraStreamProxyUrl ? (
                <a href={cameraStreamProxyUrl} target="_blank" rel="noreferrer">
                  打开代理流
                </a>
              ) : null}
            </div>
            {liveStreamUrl ? (
              <img src={liveStreamUrl} alt="ESP32-CAM 实时画面" />
            ) : (
              <div className="camera-placeholder">相机未连接，暂无视频流。</div>
            )}
          </div>

          <div className="camera-frame">
            <div className="camera-frame-head">
              <strong>最新抓拍</strong>
              {snapshotPreviewUrl ? (
                <a href={snapshotPreviewUrl} target="_blank" rel="noreferrer">
                  打开抓拍原图
                </a>
              ) : null}
            </div>
            {snapshotPreviewUrl ? (
              <img src={snapshotPreviewUrl} alt="ESP32-CAM 抓拍画面" />
            ) : (
              <div className="camera-placeholder">点击“刷新抓拍”后，这里会显示一张最新照片。</div>
            )}
          </div>
        </div>
      </article>
    </section>
  );
}
