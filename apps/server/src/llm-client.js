const DEFAULT_OLLAMA_BASE_URL = 'http://127.0.0.1:11434';
const DEFAULT_OLLAMA_MODEL = 'gemma4:26b';
const DEFAULT_OLLAMA_TIMEOUT_MS = 30000;

const SYSTEM_PROMPT = `你是一个 ESP32 双足机器人动作规划器。
你的任务是把用户的自然语言指令改写成可执行的中文机器人脚本。

必须只输出 JSON 对象，不要输出 Markdown，不要解释 JSON 外的内容。
JSON 格式：
{
  "script": ["启动", "站立", "延时 1 秒"],
  "reply": "一句简短中文反馈"
}

可用脚本行只有：
- 启动
- 循环 N 次
- 初始化舵机
- 站立
- 下蹲
- 急停
- 前进
- 后退
- 左转
- 右转
- 停止移动
- 舵机 N 转到 X 度
- 延时 Nms
- 延时 N 秒

约束：
- 舵机编号只能是 1 到 7。
- 舵机角度只能是 0 到 180。
- 没有必要时不要长时间循环。
- 用户要求危险、未知或无法确认的动作时，输出 ["启动", "急停"]。
- 如果用户没有指定具体动作，输出一个安全的短动作计划。`;

function normalizeBaseUrl(url) {
  return String(url || DEFAULT_OLLAMA_BASE_URL).replace(/\/+$/, '');
}

function extractJsonObject(text) {
  const rawText = String(text || '').trim();
  if (!rawText) {
    throw new Error('Ollama 没有返回可解析内容');
  }

  try {
    return JSON.parse(rawText);
  } catch {
    const match = rawText.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error(`Ollama 返回的内容不是 JSON：${rawText.slice(0, 160)}`);
    }

    return JSON.parse(match[0]);
  }
}

function normalizeScript(value) {
  if (Array.isArray(value)) {
    return value.map((line) => String(line || '').trim()).filter(Boolean).join('\n');
  }

  return String(value || '').trim();
}

export async function planRobotScriptWithOllama({
  prompt,
  servoId,
  model = process.env.OLLAMA_MODEL || DEFAULT_OLLAMA_MODEL,
  baseUrl = process.env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_BASE_URL,
  timeoutMs = Number(process.env.OLLAMA_TIMEOUT_MS || DEFAULT_OLLAMA_TIMEOUT_MS)
} = {}) {
  const userPrompt = String(prompt || '').trim();
  if (!userPrompt) {
    throw new Error('请输入要交给 Gemma 规划的指令');
  }

  const targetServoId = Number(servoId || 7);
  const response = await fetch(`${normalizeBaseUrl(baseUrl)}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      model,
      stream: false,
      format: 'json',
      options: {
        temperature: 0.1
      },
      messages: [
        {
          role: 'system',
          content: SYSTEM_PROMPT
        },
        {
          role: 'user',
          content: `默认目标舵机：${targetServoId}\n用户指令：${userPrompt}`
        }
      ]
    })
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Ollama 请求失败：${response.status} ${message}`.trim());
  }

  const payload = await response.json();
  const content = payload?.message?.content || payload?.response || '';
  const planned = extractJsonObject(content);
  const script = normalizeScript(planned.script);

  if (!script) {
    throw new Error('Gemma 没有生成可执行脚本');
  }

  return {
    model,
    script,
    reply: String(planned.reply || 'Gemma 已生成执行计划。').trim()
  };
}
