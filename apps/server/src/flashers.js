import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';

function setOtaState(store, target, inProgress) {
  if (target === 'camera') {
    store.updateCamera({ otaInProgress: inProgress });
    return;
  }

  store.updateRobot({ otaInProgress: inProgress });
}

export async function flashFirmwareOverOta({
  ip,
  filePath,
  endpointPath,
  store,
  target = 'robot',
  targetLabel = '机器人'
}) {
  if (!ip) {
    throw new Error(`OTA 模式缺少${targetLabel} IP`);
  }

  if (!filePath) {
    throw new Error('未找到已上传的固件文件');
  }

  const fileBuffer = await readFile(filePath);
  const form = new FormData();
  const fileName = path.basename(filePath);
  form.append(
    'firmware',
    new Blob([fileBuffer], { type: 'application/octet-stream' }),
    fileName
  );

  store.updateFirmware({
    progress: 10,
    lastResult: null,
    lastTarget: target,
    lastMode: 'ota'
  });
  setOtaState(store, target, true);
  store.addLog('info', `开始通过 Wi-Fi 升级${targetLabel}：${ip}`);

  try {
    const response = await fetch(`http://${ip}${endpointPath}`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(120000)
    });

    const responseText = await response.text();

    if (!response.ok) {
      store.updateFirmware({
        progress: 0,
        lastResult: 'failed',
        lastTarget: target,
        lastMode: 'ota'
      });
      throw new Error(`OTA 失败：${response.status} ${responseText}`);
    }

    store.updateFirmware({
      progress: 100,
      lastResult: 'success',
      lastTarget: target,
      lastMode: 'ota'
    });
    store.addLog('success', `${targetLabel} OTA 升级完成：${responseText || '设备已接受固件'}`);

    return {
      ok: true,
      message: responseText || 'OTA completed'
    };
  } finally {
    setOtaState(store, target, false);
  }
}

export async function flashFirmwareOverUsb({
  filePath,
  port,
  baudRate,
  writeOffset,
  store,
  target = 'robot',
  targetLabel = 'ESP32 设备'
}) {
  if (!filePath) {
    throw new Error('未找到已上传的固件文件');
  }

  if (!port) {
    throw new Error('USB 模式缺少串口端口');
  }

  store.updateFirmware({
    progress: 10,
    lastResult: null,
    lastTarget: target,
    lastMode: 'usb'
  });
  store.addLog('info', `开始通过 USB 烧录${targetLabel}，端口 ${port}`);

  const args = [
    '-m',
    'esptool',
    '--chip',
    'esp32',
    '--port',
    port,
    '--baud',
    String(baudRate),
    'write_flash',
    writeOffset,
    filePath
  ];

  await new Promise((resolve, reject) => {
    const child = spawn('python3', args, {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    child.stdout.on('data', (chunk) => {
      store.addLog('info', chunk.toString().trim());
    });

    child.stderr.on('data', (chunk) => {
      store.addLog('warn', chunk.toString().trim());
    });

    child.on('close', (code) => {
      if (code === 0) {
        store.updateFirmware({
          progress: 100,
          lastResult: 'success',
          lastTarget: target,
          lastMode: 'usb'
        });
        store.addLog('success', `${targetLabel} USB 烧录完成`);
        resolve();
        return;
      }

      store.updateFirmware({
        progress: 0,
        lastResult: 'failed',
        lastTarget: target,
        lastMode: 'usb'
      });
      reject(new Error(`USB 烧录失败，退出码 ${code}`));
    });

    child.on('error', reject);
  });

  return {
    ok: true,
    message: 'USB flash completed'
  };
}
