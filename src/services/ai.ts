/// <reference types="vite/client" />

type ChatHistoryMessage = {
  role: string;
  content: string;
};

type ChatContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

type GenerateImageFunctionCall = {
  name: 'generateImage';
  args: {
    prompt: string;
    referenceImages?: string[];
  };
};

export type ChatWithAIOptions = {
  model?: string;
  systemPrompt?: string;
  temperature?: number;
};

export type GenerateVideoTaskResult = {
  taskId: string;
  status: string;
};

export type VideoTaskStatusResult = {
  taskId: string;
  status: string;
  progress: number;
  videoUrl?: string;
};

const DOUBAO_API_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';
const DOUBAO_API_KEY = () => (import.meta.env.VITE_DOUBAO_API_KEY || '').trim();
const DEFAULT_CHAT_MODEL = (
  import.meta.env.VITE_DOUBAO_CHAT_MODEL || 'doubao-seed-1-8-251228'
).trim();
const DEFAULT_IMAGE_MODEL = (
  import.meta.env.VITE_DOUBAO_IMAGE_MODEL || 'doubao-seedream-5-0-260128'
).trim();
const DEFAULT_VIDEO_MODEL = () => (import.meta.env.VITE_DOUBAO_VIDEO_MODEL || '').trim();

const DEFAULT_SYSTEM_PROMPT = `
你是“电商AI”设计助手，请始终使用中文回答。
当用户明确要求“生图/出图/改图/图生图”时，优先触发 generateImage 工具。
当用户是咨询问题时，给出简明、可执行的建议。
`.trim();

const IMAGE_INTENT_KEYWORDS = [
  '生图',
  '出图',
  '生成图',
  '生成图片',
  '图生图',
  '改图',
  '海报',
  '主图',
  '详情图',
  'render',
  'image',
  'poster',
  'draw',
  'generate',
];

export const generateImageTool = {
  name: 'generateImage',
  description: '根据提示词生成图片，可选参考图。',
  parameters: {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        description: '用于生图的提示词。',
      },
      referenceImages: {
        type: 'array',
        description: '可选，参考图 URL 或 data URL 列表。',
        items: {
          type: 'string',
        },
      },
    },
    required: ['prompt'],
  },
};

export function isDoubaoConfigured() {
  return Boolean(DOUBAO_API_KEY());
}

export function isDoubaoVideoConfigured() {
  return Boolean(DOUBAO_API_KEY() && DEFAULT_VIDEO_MODEL());
}

function requireApiKey() {
  const key = DOUBAO_API_KEY();
  if (!key) {
    throw new Error('未配置豆包 API Key，请在 .env.local 中设置 VITE_DOUBAO_API_KEY。');
  }
  return key;
}

function requireVideoModel() {
  const model = DEFAULT_VIDEO_MODEL();
  if (!model) {
    throw new Error('未配置视频生成模型，请在 .env.local 中设置 VITE_DOUBAO_VIDEO_MODEL。');
  }
  return model;
}

function normalizeRole(role: string): 'system' | 'user' | 'assistant' {
  if (role === 'assistant' || role === 'system') return role;
  return 'user';
}

function buildUserContent(text: string, attachedImages: string[] = []): string | ChatContentPart[] {
  if (!attachedImages.length) return text;
  const parts: ChatContentPart[] = [{ type: 'text', text }];
  for (const image of attachedImages) {
    if (!image) continue;
    parts.push({
      type: 'image_url',
      image_url: { url: image },
    });
  }
  return parts;
}

function shouldGenerateImage(userMessage: string, attachedImages: string[] = []) {
  const text = userMessage.trim().toLowerCase();
  if (!text) return false;
  if (IMAGE_INTENT_KEYWORDS.some((keyword) => text.includes(keyword))) return true;
  return attachedImages.length > 0;
}

function readErrorMessage(payload: any, status: number) {
  const message =
    payload?.error?.message ||
    payload?.message ||
    payload?.msg ||
    payload?.detail ||
    `豆包请求失败（HTTP ${status}）`;
  return String(message);
}

async function postJSON(path: string, body: Record<string, unknown>) {
  const response = await fetch(`${DOUBAO_API_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${requireApiKey()}`,
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(readErrorMessage(payload, response.status));
  }
  return payload;
}

async function getJSON(path: string) {
  const response = await fetch(`${DOUBAO_API_BASE_URL}${path}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${requireApiKey()}`,
    },
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(readErrorMessage(payload, response.status));
  }
  return payload;
}

function extractAssistantText(payload: any) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        return typeof part?.text === 'string' ? part.text : '';
      })
      .join('');
  }
  return '';
}

function decodeJsonString(raw: string) {
  try {
    return JSON.parse(`"${raw}"`) as string;
  } catch {
    return raw;
  }
}

function parseFunctionCallsFromMarkers(rawText: string) {
  const functionCalls: GenerateImageFunctionCall[] = [];
  const markerRegex = /<\|FunctionCallBegin\|>([\s\S]*?)<\|FunctionCallEnd\|>/g;
  let match: RegExpExecArray | null;

  while ((match = markerRegex.exec(rawText)) !== null) {
    const text = (match[1] || '').trim();
    if (!text) continue;
    try {
      const parsed = JSON.parse(text);
      const calls = Array.isArray(parsed) ? parsed : [parsed];
      for (const call of calls) {
        if (call?.name !== 'generateImage') continue;
        const params = call?.parameters ?? call?.args ?? {};
        const prompt = typeof params?.prompt === 'string' ? params.prompt.trim() : '';
        if (!prompt) continue;
        const rawRefs =
          params?.referenceImages ??
          params?.reference_images ??
          params?.images ??
          (typeof params?.image === 'string' ? [params.image] : params?.image);
        const referenceImages = Array.isArray(rawRefs)
          ? rawRefs.filter((item: unknown) => typeof item === 'string' && item.trim())
          : [];
        functionCalls.push({
          name: 'generateImage',
          args: {
            prompt,
            referenceImages,
          },
        });
      }
    } catch {
      // ignore invalid marker block
    }
  }

  const cleanedText = rawText.replace(markerRegex, '').trim();
  return { cleanedText, functionCalls };
}

function parseFunctionCallsFallback(rawText: string): GenerateImageFunctionCall[] {
  if (!rawText.includes('generateImage')) return [];
  const promptMatch = rawText.match(/"prompt"\s*:\s*"((?:\\.|[^"\\])*)"/);
  if (!promptMatch?.[1]) return [];

  const prompt = decodeJsonString(promptMatch[1]).trim();
  if (!prompt) return [];

  const refs = new Set<string>();
  const imageMatch = rawText.match(/"image"\s*:\s*"((?:\\.|[^"\\])*)"/);
  if (imageMatch?.[1]) refs.add(decodeJsonString(imageMatch[1]).trim());

  const arrayMatch = rawText.match(/"referenceImages"\s*:\s*\[([\s\S]*?)\]/);
  if (arrayMatch?.[1]) {
    const itemRegex = /"((?:\\.|[^"\\])*)"/g;
    let itemMatch: RegExpExecArray | null;
    while ((itemMatch = itemRegex.exec(arrayMatch[1])) !== null) {
      refs.add(decodeJsonString(itemMatch[1]).trim());
    }
  }

  return [
    {
      name: 'generateImage',
      args: {
        prompt,
        referenceImages: Array.from(refs).filter(Boolean),
      },
    },
  ];
}

function parseAssistantOutput(rawText: string) {
  const parsed = parseFunctionCallsFromMarkers(rawText);
  if (parsed.functionCalls.length > 0) return parsed;

  if (rawText.includes('<|FunctionCallBegin|>')) {
    const fallback = parseFunctionCallsFallback(rawText);
    return {
      cleanedText: rawText.replace(/<\|FunctionCallBegin\|>[\s\S]*/g, '').trim(),
      functionCalls: fallback,
    };
  }

  return {
    cleanedText: rawText.trim(),
    functionCalls: [] as GenerateImageFunctionCall[],
  };
}

export async function chatWithAI(
  messages: ChatHistoryMessage[],
  userMessage: string,
  attachedImages: string[] = [],
  options?: ChatWithAIOptions
) {
  if (shouldGenerateImage(userMessage, attachedImages)) {
    return {
      text: '',
      functionCalls: [
        {
          name: 'generateImage',
          args: {
            prompt: userMessage,
            referenceImages: attachedImages.filter(Boolean),
          },
        } satisfies GenerateImageFunctionCall,
      ],
    };
  }

  const payload = await postJSON('/chat/completions', {
    model: (options?.model || DEFAULT_CHAT_MODEL).trim(),
    temperature: typeof options?.temperature === 'number' ? options.temperature : 0.7,
    messages: [
      {
        role: 'system',
        content: (options?.systemPrompt || DEFAULT_SYSTEM_PROMPT).trim(),
      },
      ...messages.map((message) => ({
        role: normalizeRole(message.role),
        content: message.content,
      })),
      {
        role: 'user',
        content: buildUserContent(userMessage, attachedImages),
      },
    ],
  });

  const rawText = extractAssistantText(payload);
  const parsed = parseAssistantOutput(rawText);
  return {
    text: parsed.cleanedText,
    functionCalls: parsed.functionCalls,
  };
}

async function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('读取图片失败'));
    reader.readAsDataURL(blob);
  });
}

async function fetchImageAsDataUrl(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`下载图片失败（HTTP ${response.status}）`);
  }
  return blobToDataUrl(await response.blob());
}

function isInvalidFieldError(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('unknown') ||
    normalized.includes('invalid') ||
    normalized.includes('unexpected') ||
    normalized.includes('schema') ||
    normalized.includes('field') ||
    normalized.includes('parameter')
  );
}

function isRetryableVideoShapeError(message: string) {
  const normalized = message.toLowerCase();
  return (
    isInvalidFieldError(message) ||
    normalized.includes('404') ||
    normalized.includes('405') ||
    normalized.includes('not found') ||
    normalized.includes('unsupported') ||
    normalized.includes('method not allowed')
  );
}

function extractTaskId(payload: any) {
  return (
    payload?.id ||
    payload?.task_id ||
    payload?.taskId ||
    payload?.data?.id ||
    payload?.data?.task_id ||
    payload?.data?.taskId ||
    payload?.metadata?.task_id ||
    payload?.metadata?.taskId ||
    ''
  );
}

function extractVideoStatus(payload: any) {
  const rawStatus =
    payload?.status ||
    payload?.state ||
    payload?.task_status ||
    payload?.taskStatus ||
    payload?.data?.status ||
    payload?.data?.state ||
    payload?.data?.task_status ||
    payload?.metadata?.task_status ||
    payload?.metadata?.taskStatus ||
    'PENDING';
  return String(rawStatus);
}

function extractVideoProgress(payload: any) {
  const candidates = [
    payload?.progress,
    payload?.percent,
    payload?.percentage,
    payload?.data?.progress,
    payload?.data?.percent,
    payload?.data?.percentage,
  ];
  const value = candidates.find((candidate) => typeof candidate === 'number');
  return typeof value === 'number' ? value : 0;
}

function extractVideoUrl(payload: any) {
  return (
    payload?.video_url ||
    payload?.videoUrl ||
    payload?.url ||
    payload?.data?.video_url ||
    payload?.data?.videoUrl ||
    payload?.data?.url ||
    payload?.output?.video_url ||
    payload?.output?.url ||
    payload?.result?.video_url ||
    payload?.result?.url ||
    payload?.data?.video?.url ||
    payload?.data?.videos?.[0]?.url ||
    payload?.videos?.[0]?.url ||
    undefined
  );
}

export async function generateImageAI(
  prompt: string,
  model: string = DEFAULT_IMAGE_MODEL,
  referenceImages: string[] = []
): Promise<string> {
  const cleanPrompt = prompt.trim();
  if (!cleanPrompt) {
    throw new Error('提示词不能为空。');
  }

  const refs = referenceImages.filter(Boolean);
  const basePayload: Record<string, unknown> = {
    model: (model || DEFAULT_IMAGE_MODEL).trim(),
    prompt: cleanPrompt,
    response_format: 'b64_json',
    watermark: false,
  };

  let payload: any;
  if (!refs.length) {
    payload = await postJSON('/images/generations', basePayload);
  } else {
    const candidates: Record<string, unknown>[] = [
      { ...basePayload, image: refs.length === 1 ? refs[0] : refs },
      { ...basePayload, images: refs },
      { ...basePayload, reference_images: refs },
      { ...basePayload, image_urls: refs },
    ];

    let lastSchemaError: Error | null = null;
    for (const candidate of candidates) {
      try {
        payload = await postJSON('/images/generations', candidate);
        lastSchemaError = null;
        break;
      } catch (error) {
        if (!(error instanceof Error) || !isInvalidFieldError(error.message)) {
          throw error;
        }
        lastSchemaError = error;
      }
    }
    if (lastSchemaError) {
      throw lastSchemaError;
    }
  }

  const image = payload?.data?.[0];
  if (image?.b64_json) {
    return `data:image/png;base64,${image.b64_json}`;
  }

  if (image?.url) {
    try {
      return await fetchImageAsDataUrl(String(image.url));
    } catch {
      return String(image.url);
    }
  }

  const message =
    payload?.error?.message || payload?.message || payload?.msg || '生图成功但未返回可用图片。';
  throw new Error(String(message));
}

export async function generateVideoAI(
  prompt: string,
  referenceImages: string[] = []
): Promise<GenerateVideoTaskResult> {
  const cleanPrompt = prompt.trim();
  if (!cleanPrompt) {
    throw new Error('视频生成提示词不能为空。');
  }

  const refs = referenceImages.filter(Boolean);
  const basePayload: Record<string, unknown> = {
    model: requireVideoModel(),
    prompt: cleanPrompt,
  };

  const bodyCandidates: Record<string, unknown>[] = refs.length
    ? [
        { ...basePayload, image: refs[0] },
        { ...basePayload, image: refs },
        { ...basePayload, images: refs },
        { ...basePayload, reference_images: refs },
        { ...basePayload, image_urls: refs },
      ]
    : [basePayload];

  const pathCandidates = ['/videos/generations', '/videos'];
  let lastError: Error | null = null;

  for (const path of pathCandidates) {
    for (const body of bodyCandidates) {
      try {
        const payload = await postJSON(path, body);
        const taskId = String(extractTaskId(payload) || '').trim();
        if (!taskId) {
          throw new Error('视频生成任务已创建，但未返回任务 ID。');
        }
        return {
          taskId,
          status: extractVideoStatus(payload),
        };
      } catch (error) {
        if (!(error instanceof Error)) {
          throw error;
        }
        lastError = error;
        if (!isRetryableVideoShapeError(error.message)) {
          throw error;
        }
      }
    }
  }

  throw lastError || new Error('视频生成任务创建失败。');
}

export async function pollVideoTask(taskId: string): Promise<VideoTaskStatusResult> {
  const cleanTaskId = taskId.trim();
  if (!cleanTaskId) {
    throw new Error('视频任务 ID 不能为空。');
  }

  const pathCandidates = [`/videos/generations/${cleanTaskId}`, `/videos/${cleanTaskId}`];
  let lastError: Error | null = null;

  for (const path of pathCandidates) {
    try {
      const payload = await getJSON(path);
      return {
        taskId: String(extractTaskId(payload) || cleanTaskId),
        status: extractVideoStatus(payload),
        progress: extractVideoProgress(payload),
        videoUrl: extractVideoUrl(payload),
      };
    } catch (error) {
      if (!(error instanceof Error)) {
        throw error;
      }
      lastError = error;
      if (!isRetryableVideoShapeError(error.message)) {
        throw error;
      }
    }
  }

  throw lastError || new Error('视频任务状态查询失败。');
}
