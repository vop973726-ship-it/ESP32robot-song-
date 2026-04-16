import { useEffect, useState } from 'react';
import {
  StatusCard,
  appendCacheBuster,
  defaultCameraForm,
  defaultGaitConfig,
  defaultOptimizerForm,
  defaultScriptPrompt,
  defaultServoTrimDrafts,
  defaultState,
  getPageFromHash,
  normalizePageId,
  pageTabs,
  servoControls
} from './dashboard-config.jsx';
import CameraPage from './pages/CameraPage.jsx';
import ControlPage from './pages/ControlPage.jsx';
import OptimizePage from './pages/OptimizePage.jsx';
import OverviewPage from './pages/OverviewPage.jsx';
import SystemPage from './pages/SystemPage.jsx';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:3001';

function buildWsUrl() {
  if (API_BASE.startsWith('https://')) {
    return API_BASE.replace('https://', 'wss://') + '/ws';
  }

  return API_BASE.replace('http://', 'ws://') + '/ws';
}

function buildApiUrl(path) {
  return `${API_BASE}${path}`;
}

async function request(path, options) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      ...(options?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...options?.headers
    },
    ...options
  });

  const payload = await response.json();

  if (!response.ok || payload.ok === false) {
    throw new Error(payload.message || '请求失败');
  }

  return payload;
}

function createChatMessage(role, content) {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    role,
    content
  };
}

function normalizeDashboardState(payload) {
  const next = payload && typeof payload === 'object' ? payload : {};

  return {
    ...defaultState,
    ...next,
    service: {
      ...defaultState.service,
      ...(next.service || {})
    },
    robot: {
      ...defaultState.robot,
      ...(next.robot || {})
    },
    firmware: {
      ...defaultState.firmware,
      ...(next.firmware || {})
    },
    serial: {
      ...defaultState.serial,
      ...(next.serial || {})
    },
    runtime: {
      ...defaultState.runtime,
      ...(next.runtime || {}),
      capabilities: {
        ...defaultState.runtime.capabilities,
        ...(next.runtime?.capabilities || {})
      }
    },
    camera: {
      ...defaultState.camera,
      ...(next.camera || {})
    },
    imu: {
      ...defaultState.imu,
      ...(next.imu || {}),
      accel: {
        ...defaultState.imu.accel,
        ...(next.imu?.accel || {})
      },
      gyro: {
        ...defaultState.imu.gyro,
        ...(next.imu?.gyro || {})
      }
    },
    gait: {
      ...defaultState.gait,
      ...(next.gait || {}),
      telemetry: {
        ...defaultState.gait.telemetry,
        ...(next.gait?.telemetry || {})
      },
      optimizer: {
        ...defaultState.gait.optimizer,
        ...(next.gait?.optimizer || {})
      }
    },
    scriptRunner: {
      ...defaultState.scriptRunner,
      ...(next.scriptRunner || {})
    },
    servoAngles: {
      ...defaultState.servoAngles,
      ...(next.servoAngles || {})
    },
    logs: Array.isArray(next.logs) ? next.logs : defaultState.logs
  };
}

export default function App() {
  const [dashboard, setDashboard] = useState(defaultState);
  const [gaitConfig, setGaitConfig] = useState(defaultGaitConfig);
  const [optimizerForm, setOptimizerForm] = useState(defaultOptimizerForm);
  const [activePage, setActivePage] = useState(() => getPageFromHash());
  const [ip, setIp] = useState('');
  const [cameraForm, setCameraForm] = useState(defaultCameraForm);
  const [cameraSnapshotToken, setCameraSnapshotToken] = useState(Date.now());
  const [cameraSnapshotRequested, setCameraSnapshotRequested] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [flashTarget, setFlashTarget] = useState('robot');
  const [flashMode, setFlashMode] = useState('ota');
  const [usbPort, setUsbPort] = useState('/dev/cu.usbserial-0001');
  const [scriptPrompt, setScriptPrompt] = useState(defaultScriptPrompt);
  const [scriptServoId, setScriptServoId] = useState(7);
  const [chatMessages, setChatMessages] = useState(() => [
    createChatMessage(
      'assistant',
      '这里是本地机器人控制窗口。可以直接输入中文脚本执行，也可以输入自然语言后交给本地 Ollama/Gemma 规划成脚本再执行。'
    )
  ]);
  const [busy, setBusy] = useState({
    connect: false,
    camera: false,
    upload: false,
    flash: false,
    gait: false,
    script: false,
    brain: false
  });
  const [servoDrafts, setServoDrafts] = useState(defaultState.servoAngles);
  const [servoTrimDrafts, setServoTrimDrafts] = useState(defaultServoTrimDrafts);
  const [toast, setToast] = useState('');

  useEffect(() => {
    function handleHashChange() {
      setActivePage(getPageFromHash());
    }

    if (!window.location.hash) {
      window.history.replaceState(null, '', `#${pageTabs[0].id}`);
    } else {
      handleHashChange();
    }

    window.addEventListener('hashchange', handleHashChange);

    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);

  useEffect(() => {
    loadStatus().catch(() => {});
    loadGaitConfig().catch(() => {});
    const socket = new WebSocket(buildWsUrl());

    socket.addEventListener('message', (event) => {
      try {
        const payload = JSON.parse(event.data);

        if (payload.type === 'snapshot' || payload.type === 'status') {
          setDashboard(normalizeDashboardState(payload.data));
          return;
        }

        if (payload.type === 'log') {
          setDashboard((current) => ({
            ...current,
            logs: [...current.logs.slice(-199), payload.data]
          }));
        }
      } catch (error) {
        console.error(error);
      }
    });

    const poller = window.setInterval(() => {
      loadStatus().catch(() => {});
    }, 10000);

    return () => {
      window.clearInterval(poller);
      socket.close();
    };
  }, []);

  useEffect(() => {
    setServoDrafts(dashboard.servoAngles);
    if (dashboard.robot.ip) {
      setIp(dashboard.robot.ip);
    }
  }, [dashboard.servoAngles, dashboard.robot.ip]);

  useEffect(() => {
    const offsets = dashboard.runtime.build?.servoZeroOffsets;
    if (!Array.isArray(offsets)) {
      return;
    }

    setServoTrimDrafts(
      Object.fromEntries(
        servoControls.map(({ id }, index) => [id, Number(offsets[index] ?? 0)])
      )
    );
  }, [dashboard.runtime.build?.servoZeroOffsets]);

  useEffect(() => {
    if (dashboard.scriptRunner?.targetServoId) {
      setScriptServoId(Number(dashboard.scriptRunner.targetServoId));
    }
  }, [dashboard.scriptRunner?.targetServoId]);

  useEffect(() => {
    const camera = dashboard.camera || defaultState.camera;
    if (!camera.connected && !camera.ip && !camera.baseUrl) {
      return;
    }

    setCameraForm((current) => {
      if (!camera.connected && current.ip && current.ip !== camera.ip) {
        return current;
      }

      return {
        ...current,
        ip: camera.ip || current.ip,
        label: camera.label || current.label,
        streamPath: camera.streamPath || current.streamPath,
        snapshotPath: camera.snapshotPath || current.snapshotPath,
        statusPath: camera.statusPath || current.statusPath,
        otaPath: camera.otaPath || current.otaPath
      };
    });
  }, [dashboard.camera]);

  useEffect(() => {
    const ports = dashboard.serial?.ports || [];
    if (ports.length === 0) {
      return;
    }

    const currentExists = ports.some((port) => port.path === usbPort);
    if (!usbPort || !currentExists) {
      setUsbPort(dashboard.serial.recommendedPort || ports[0].path);
    }
  }, [dashboard.serial, usbPort]);

  async function loadStatus() {
    const payload = await request('/api/status');
    setDashboard(normalizeDashboardState(payload.data));
  }

  async function loadGaitConfig() {
    const payload = await request('/api/gait/config');
    setGaitConfig(payload.data);
    setOptimizerForm((current) => ({
      ...current,
      ...payload.data.defaults
    }));
  }

  async function handleConnect() {
    setBusy((current) => ({ ...current, connect: true }));

    try {
      await request('/api/connect', {
        method: 'POST',
        body: JSON.stringify({ ip })
      });
      setToast('机器人连接成功');
    } catch (error) {
      setToast(error.message);
    } finally {
      setBusy((current) => ({ ...current, connect: false }));
    }
  }

  async function handleDisconnect() {
    setBusy((current) => ({ ...current, connect: true }));

    try {
      await request('/api/disconnect', {
        method: 'POST'
      });
      setToast('连接已断开');
    } catch (error) {
      setToast(error.message);
    } finally {
      setBusy((current) => ({ ...current, connect: false }));
    }
  }

  async function handleCameraConnect() {
    setBusy((current) => ({ ...current, camera: true }));

    try {
      await request('/api/camera/connect', {
        method: 'POST',
        body: JSON.stringify(cameraForm)
      });
      setCameraSnapshotRequested(false);
      setToast('独立相机模块连接成功');
    } catch (error) {
      setToast(error.message);
    } finally {
      setBusy((current) => ({ ...current, camera: false }));
    }
  }

  async function handleCameraDisconnect() {
    setBusy((current) => ({ ...current, camera: true }));

    try {
      await request('/api/camera/disconnect', {
        method: 'POST'
      });
      setCameraSnapshotRequested(false);
      setToast('独立相机模块已断开');
    } catch (error) {
      setToast(error.message);
    } finally {
      setBusy((current) => ({ ...current, camera: false }));
    }
  }

  async function handleCommand(payload) {
    try {
      await request('/api/control', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    } catch (error) {
      setToast(error.message);
    }
  }

  async function centerAllServos() {
    setServoDrafts((current) =>
      Object.fromEntries(Object.keys(current).map((key) => [key, 90]))
    );

    try {
      await request('/api/control', {
        method: 'POST',
        body: JSON.stringify({
          type: 'action',
          name: 'center'
        })
      });
      setToast('已执行一键归中');
    } catch (error) {
      setToast(error.message);
    }
  }

  async function handleUpload() {
    if (!selectedFile) {
      setToast('请先选择 .bin 固件');
      return;
    }

    setBusy((current) => ({ ...current, upload: true }));
    const formData = new FormData();
    formData.append('firmware', selectedFile);

    try {
      await request('/api/firmware/upload', {
        method: 'POST',
        body: formData
      });
      setToast('固件上传成功');
    } catch (error) {
      setToast(error.message);
    } finally {
      setBusy((current) => ({ ...current, upload: false }));
    }
  }

  async function handleFlash() {
    setBusy((current) => ({ ...current, flash: true }));

    try {
      const targetIp = flashTarget === 'camera' ? cameraForm.ip : ip;
      await request('/api/firmware/flash', {
        method: 'POST',
        body: JSON.stringify({
          target: flashTarget,
          mode: flashMode,
          ip: targetIp,
          endpointPath: flashTarget === 'camera' ? cameraForm.otaPath : undefined,
          port: flashMode === 'usb' ? usbPort : undefined
        })
      });
      const targetLabel = flashTarget === 'camera' ? '相机模块' : '机器人主控';
      setToast(
        flashMode === 'usb'
          ? `${targetLabel} USB 烧录完成`
          : `${targetLabel} OTA 升级命令已发送`
      );
    } catch (error) {
      setToast(error.message);
    } finally {
      setBusy((current) => ({ ...current, flash: false }));
    }
  }

  async function handleStartOptimization() {
    setBusy((current) => ({ ...current, gait: true }));

    try {
      await request('/api/gait/start', {
        method: 'POST',
        body: JSON.stringify(optimizerForm)
      });
      setToast('自动优化已启动');
    } catch (error) {
      setToast(error.message);
    } finally {
      setBusy((current) => ({ ...current, gait: false }));
    }
  }

  async function handleStopOptimization() {
    setBusy((current) => ({ ...current, gait: true }));

    try {
      await request('/api/gait/stop', {
        method: 'POST'
      });
      setToast('自动优化已停止');
    } catch (error) {
      setToast(error.message);
    } finally {
      setBusy((current) => ({ ...current, gait: false }));
    }
  }

  async function handleRunScript() {
    const resolvedIp = ip || dashboard.robot.ip;
    setBusy((current) => ({ ...current, script: true }));
    setChatMessages((current) => [...current.slice(-11), createChatMessage('user', scriptPrompt)]);

    try {
      const payload = await request('/api/script/run', {
        method: 'POST',
        body: JSON.stringify({
          script: scriptPrompt,
          ip: resolvedIp,
          servoId: Number(scriptServoId)
        })
      });
      const summary = payload.data?.plan?.summary || [];
      const reply =
        summary.length > 0
          ? `已开始执行。\n${summary.join('\n')}`
          : '脚本已提交，服务端开始执行。';
      setChatMessages((current) => [...current.slice(-11), createChatMessage('assistant', reply)]);
      setToast('脚本已开始执行');
    } catch (error) {
      setChatMessages((current) => [
        ...current.slice(-11),
        createChatMessage('assistant', `执行失败：${error.message}`)
      ]);
      setToast(error.message);
    } finally {
      setBusy((current) => ({ ...current, script: false }));
    }
  }

  async function handleRunWithBrain() {
    const resolvedIp = ip || dashboard.robot.ip;
    setBusy((current) => ({ ...current, brain: true }));
    setChatMessages((current) => [...current.slice(-11), createChatMessage('user', scriptPrompt)]);

    try {
      const payload = await request('/api/brain/run', {
        method: 'POST',
        body: JSON.stringify({
          prompt: scriptPrompt,
          ip: resolvedIp,
          servoId: Number(scriptServoId)
        })
      });
      const summary = payload.data?.plan?.summary || [];
      const brain = payload.data?.brain || {};
      if (brain.script) {
        setScriptPrompt(brain.script);
      }
      const reply = [
        brain.reply || 'Gemma 已生成脚本并开始执行。',
        brain.script ? `生成脚本：\n${brain.script}` : '',
        summary.length > 0 ? `执行计划：\n${summary.join('\n')}` : ''
      ]
        .filter(Boolean)
        .join('\n\n');
      setChatMessages((current) => [...current.slice(-11), createChatMessage('assistant', reply)]);
      setToast('Gemma 已规划并开始执行');
    } catch (error) {
      setChatMessages((current) => [
        ...current.slice(-11),
        createChatMessage('assistant', `Gemma 规划失败：${error.message}`)
      ]);
      setToast(error.message);
    } finally {
      setBusy((current) => ({ ...current, brain: false }));
    }
  }

  async function handleStopScript() {
    setBusy((current) => ({ ...current, script: true }));

    try {
      await request('/api/script/stop', {
        method: 'POST'
      });
      setChatMessages((current) => [
        ...current.slice(-11),
        createChatMessage('assistant', '当前脚本已停止。')
      ]);
      setToast('脚本已停止');
    } catch (error) {
      setToast(error.message);
    } finally {
      setBusy((current) => ({ ...current, script: false }));
    }
  }

  function updateServo(id, angle) {
    setServoDrafts((current) => ({
      ...current,
      [id]: Number(angle)
    }));
  }

  function commitServo(id, angle = servoDrafts[id]) {
    handleCommand({
      type: 'servo',
      id,
      angle: Number(angle)
    });
  }

  function updateServoTrim(id, offset) {
    setServoTrimDrafts((current) => ({
      ...current,
      [id]: Number(offset)
    }));
  }

  function commitServoTrim(id, offset = servoTrimDrafts[id]) {
    handleCommand({
      type: 'servo_trim',
      id,
      offset: Number(offset),
      applyNow: true
    });
  }

  function updateOptimizerForm(field, value) {
    setOptimizerForm((current) => ({
      ...current,
      [field]: field === 'target' ? value : Number(value)
    }));
  }

  function updateCameraForm(field, value) {
    setCameraForm((current) => ({
      ...current,
      [field]: value
    }));
  }

  function requestSnapshot() {
    setCameraSnapshotRequested(true);
    setCameraSnapshotToken(Date.now());
  }

  function navigateToPage(pageId) {
    const nextPage = normalizePageId(pageId);
    setActivePage(nextPage);

    if (window.location.hash !== `#${nextPage}`) {
      window.location.hash = nextPage;
    }
  }

  function renderActivePage() {
    switch (activePage) {
      case 'overview':
        return (
          <OverviewPage
            dashboard={dashboard}
            ip={ip}
            setIp={setIp}
            busy={busy}
            scriptPrompt={scriptPrompt}
            setScriptPrompt={setScriptPrompt}
            scriptServoId={scriptServoId}
            setScriptServoId={setScriptServoId}
            chatMessages={chatMessages}
            handleRunScript={handleRunScript}
            handleRunWithBrain={handleRunWithBrain}
            handleStopScript={handleStopScript}
            handleConnect={handleConnect}
            handleDisconnect={handleDisconnect}
            selectedFile={selectedFile}
            setSelectedFile={setSelectedFile}
            flashTarget={flashTarget}
            setFlashTarget={setFlashTarget}
            flashMode={flashMode}
            setFlashMode={setFlashMode}
            usbPort={usbPort}
            setUsbPort={setUsbPort}
            flashTargetLabel={flashTargetLabel}
            flashTargetIp={flashTargetIp}
            handleUpload={handleUpload}
            handleFlash={handleFlash}
          />
        );
      case 'camera':
        return (
          <CameraPage
            cameraForm={cameraForm}
            updateCameraForm={updateCameraForm}
            busy={busy}
            handleCameraConnect={handleCameraConnect}
            handleCameraDisconnect={handleCameraDisconnect}
            requestSnapshot={requestSnapshot}
            camera={camera}
            cameraStreamProxyUrl={cameraStreamProxyUrl}
            cameraSnapshotProxyUrl={cameraSnapshotProxyUrl}
            liveStreamUrl={liveStreamUrl}
            snapshotPreviewUrl={snapshotPreviewUrl}
          />
        );
      case 'control':
        return (
          <ControlPage
            handleCommand={handleCommand}
            centerAllServos={centerAllServos}
            servoDrafts={servoDrafts}
            updateServo={updateServo}
            commitServo={commitServo}
            trimRange={trimRange}
            servoTrimDrafts={servoTrimDrafts}
            updateServoTrim={updateServoTrim}
            commitServoTrim={commitServoTrim}
          />
        );
      case 'optimize':
        return (
          <OptimizePage
            dashboard={dashboard}
            imu={imu}
            gaitTelemetry={gaitTelemetry}
            optimizerForm={optimizerForm}
            updateOptimizerForm={updateOptimizerForm}
            busy={busy}
            handleStartOptimization={handleStartOptimization}
            handleStopOptimization={handleStopOptimization}
            gaitOptimizer={gaitOptimizer}
            gaitConfig={gaitConfig}
          />
        );
      case 'system':
        return <SystemPage dashboard={dashboard} />;
      default:
        return null;
    }
  }

  const activePageMeta = pageTabs.find((item) => item.id === activePage) || pageTabs[0];
  const trimRange = dashboard.runtime.build?.servoTrimRange || {
    min: -30,
    max: 30
  };
  const camera = dashboard.camera || defaultState.camera;
  const imu = dashboard.imu || defaultState.imu;
  const gaitTelemetry = dashboard.gait?.telemetry || defaultState.gait.telemetry;
  const gaitOptimizer = dashboard.gait?.optimizer || defaultState.gait.optimizer;
  const scriptRunner = dashboard.scriptRunner || defaultState.scriptRunner;
  const flashTargetLabel = flashTarget === 'camera' ? '相机模块' : '机器人主控';
  const flashTargetIp = flashTarget === 'camera' ? cameraForm.ip : ip;
  const cameraStreamProxyUrl = camera.baseUrl ? buildApiUrl('/api/camera/stream') : '';
  const cameraSnapshotProxyUrl = camera.baseUrl ? buildApiUrl('/api/camera/snapshot') : '';
  const liveStreamUrl = cameraStreamProxyUrl || camera.streamUrl;
  const snapshotPreviewUrl = cameraSnapshotRequested && cameraSnapshotProxyUrl
    ? appendCacheBuster(cameraSnapshotProxyUrl, cameraSnapshotToken)
    : '';

  return (
    <div className="app-shell">
      <div className="backdrop backdrop-a" />
      <div className="backdrop backdrop-b" />

      <main className="dashboard">
        <section className="hero-panel">
          <div>
            <p className="eyebrow">ESP32 Robot Console</p>
            <h1>机器人图形化控制与 OTA 烧录台</h1>
            <p className="hero-copy">
              本地服务负责烧录、IMU 反馈、独立相机模块管理和自动步态优化调度，网页负责实时控制、状态监控和结果可视化。
            </p>
          </div>
          <div className="hero-meta">
            <span className={`pill ${dashboard.robot.connected ? 'online' : 'offline'}`}>
              {dashboard.robot.connected ? '已连接' : '未连接'}
            </span>
            <span className={`pill ${camera.connected ? 'online' : 'offline'}`}>
              {camera.connected ? 'CAM 在线' : 'CAM 未连接'}
            </span>
            <span className={`pill ${imu.available ? 'online' : 'offline'}`}>
              {imu.available ? 'IMU 在线' : 'IMU 未就绪'}
            </span>
            <span className="pill subtle">浏览器客户端 {dashboard.service.connectedClients}</span>
          </div>
        </section>

        {toast ? (
          <div className="toast" onAnimationEnd={() => setToast('')}>
            {toast}
          </div>
        ) : null}

        <section className="page-nav-panel">
          <div className="page-nav-copy">
            <p className="eyebrow">功能页面</p>
            <h2>{activePageMeta.label}</h2>
            <p className="page-nav-description">{activePageMeta.description}</p>
          </div>

          <div className="page-tab-list" role="tablist" aria-label="功能页面切换">
            {pageTabs.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={activePage === item.id}
                className={`page-tab ${activePage === item.id ? 'selected' : 'ghost'}`}
                onClick={() => navigateToPage(item.id)}
              >
                <span>{item.label}</span>
                <small>{item.description}</small>
              </button>
            ))}
          </div>
        </section>

        <section className="page-summary-grid">
          <StatusCard
            label="机器人"
            value={dashboard.robot.connected ? '已连接' : '未连接'}
            accent={dashboard.robot.connected ? 'good' : 'warn'}
          />
          <StatusCard
            label="相机"
            value={camera.connected ? '在线' : '未连接'}
            accent={camera.connected ? 'good' : 'warn'}
          />
          <StatusCard
            label="IMU"
            value={imu.available ? '在线' : '未就绪'}
            accent={imu.available ? 'good' : 'warn'}
          />
          <StatusCard
            label="优化器"
            value={gaitOptimizer.running ? '运行中' : gaitOptimizer.status || '空闲'}
            accent={gaitOptimizer.running ? 'good' : 'warn'}
          />
          <StatusCard
            label="脚本"
            value={scriptRunner.running ? '运行中' : scriptRunner.statusMessage || '空闲'}
            accent={scriptRunner.running ? 'good' : scriptRunner.lastError ? 'warn' : undefined}
          />
        </section>

        {renderActivePage()}
      </main>
    </div>
  );
}
