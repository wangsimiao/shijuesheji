/// <reference types="vite/client" />

import { getModelSettings } from '../store';
import {
  DOUBAO_5_IMAGE_MODEL,
  OPENROUTER_GEMINI_FLASH_IMAGE_MODEL,
  OPENROUTER_GPT_IMAGE_MODEL,
  OPENROUTER_IMAGE_MODELS,
} from '../components/ai-vision/workspace-model';

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
    outputCount?: number;
    sizeHint?: string;
  };
};

type ImageModelProvider = 'doubao' | 'openrouter';

type ImageProviderConfig = {
  provider: ImageModelProvider;
  apiBaseUrl: string;
  apiKey: string;
  imageModel: string;
};

type RequestConfig = {
  provider?: ImageProviderConfig['provider'];
  apiBaseUrl: string;
  apiKey: string;
  headers?: Record<string, string>;
};

export type ChatWithAIOptions = {
  model?: string;
  systemPrompt?: string;
  temperature?: number;
  forceImageGeneration?: boolean;
};

export type GenerateVideoTaskResult = {
  taskId: string;
  status: string;
};

export type GenerateImageAIOptions = {
  systemPrompt?: string;
  outputCount?: number;
  sizeHint?: string;
  operation?: 'generate' | 'reference' | 'regenerate' | 'local-edit';
  preserveReferenceText?: boolean;
};

export type GenerateImageAIResult = {
  images: string[];
  provider: ImageModelProvider;
  rawCount: number;
};

export type OpenRouterCreditsStatus = {
  totalCredits: number;
  totalUsage: number;
  remaining: number;
  updatedAt: number;
};

export type VideoTaskStatusResult = {
  taskId: string;
  status: string;
  progress: number;
  videoUrl?: string;
};

type ImageGenerationIntent = {
  isGroupOutput: boolean;
  outputCount: number;
  explicitSize?: string;
};

const DOUBAO_DEFAULT_API_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';
const OPENROUTER_DEFAULT_API_BASE_URL = 'https://singapore.zw-ai.com/api/v1/chat/completions';
const OPENROUTER_OFFICIAL_API_BASE_URL = 'https://openrouter.ai/api/v1';
const BACKEND_PROXY_PATH = (import.meta.env.VITE_BACKEND_PROXY_PATH || '/api/proxy').trim() || '/api/proxy';
const ENABLE_BACKEND_PROXY = (import.meta.env.VITE_ENABLE_BACKEND_PROXY || 'true').trim() !== 'false';
const DEFAULT_CHAT_MODEL = (
  import.meta.env.VITE_DOUBAO_CHAT_MODEL || 'doubao-seed-1-8-251228'
).trim();
const DEFAULT_VIDEO_MODEL = () => (import.meta.env.VITE_DOUBAO_VIDEO_MODEL || '').trim();

const DEFAULT_SYSTEM_PROMPT = `
你是“电商AI”设计助手，请始终使用中文回复。
当用户明确要求“生成图片/出图/改图/图生图”时，优先触发 generateImage 工具。
当用户是咨询问题时，给出简明、可执行的建议。
`.trim();

const REFERENCE_TEXT_PRESERVATION_PROMPT = `
保留规则：如果参考图中包含文字、Logo、标签、品牌名、商品包装文字、UI 文案，除非用户明确要求修改这些内容，否则必须保持原样。不要删除、改写、重排、模糊、替换或生成乱码。
如果用户明确要求修改、替换或删除某些文字，只处理被明确要求的文字；其他未提到的文字、Logo、标签、品牌名和商品包装文字仍然必须保持原样。
`.trim();

const LOCAL_EDIT_TEXT_PRESERVATION_PROMPT = `
局部修改规则：只修改用户标记区域。未标记区域必须尽量保持原图一致，尤其不要改变文字、Logo、标签、商品包装文字、人物脸部、商品主体和版式结构。最终图中不要保留遮罩、红色笔刷或任何标记。
如果用户明确要求修改、替换或删除某些文字，只处理被明确要求的文字；其他未提到的文字、Logo、标签、品牌名和商品包装文字仍然必须保持原样。
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

const IMAGE_INTENT_KEYWORDS_V2 = [
  '生图',
  '出图',
  '生成',
  '生成图',
  '生成图片',
  '图生图',
  '改图',
  '海报',
  '主图',
  '详情图',
  '买家秀',
  '电商图',
  '图片',
  '图像',
  '画一张',
  'render',
  'image',
  'poster',
  'draw',
  'generate',
];

const DOUBAO_REFERENCE_IMAGE_MAX_COUNT = 14;
const DOUBAO_REFERENCE_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const DOUBAO_REFERENCE_IMAGE_MAX_PIXELS = 36_000_000;
const DOUBAO_REFERENCE_IMAGE_MIN_EDGE = 14;
const DOUBAO_REFERENCE_IMAGE_MAX_RATIO = 16;
const DOUBAO_MIN_OUTPUT_PIXELS = 3_686_400;
const PROXY_SAFE_DATA_IMAGE_TOTAL_BYTES = 3 * 1024 * 1024;
const PROXY_SAFE_DATA_IMAGE_SINGLE_BYTES = 1.2 * 1024 * 1024;
const PROXY_SAFE_DATA_IMAGE_MIN_BYTES = 160 * 1024;
const GROUP_OUTPUT_DEFAULT_COUNT = 4;
export const GROUP_OUTPUT_MIN_COUNT = 2;
export const GROUP_OUTPUT_MAX_COUNT = 15;

const SIZE_RATIO_MAP: Record<string, string> = {
  '1:1': '2000x2000',
  '4:3': '1920x1440',
  '3:4': '1440x1920',
  '4:5': '1920x2400',
  '5:4': '2400x1920',
  '3:2': '2400x1600',
  '2:3': '1600x2400',
  '16:9': '2133x1200',
  '9:16': '1200x2133',
  '21:9': '2960x1269',
  '9:21': '1269x2960',
};
const DEFAULT_IMAGE_SIZE = SIZE_RATIO_MAP['1:1'];

export const generateImageTool = {
  name: 'generateImage',
  description: 'Generate images from prompt and optional references.',
  parameters: {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        description: 'Prompt for image generation.',
      },
      referenceImages: {
        type: 'array',
        description: 'Optional reference image URLs or data URLs.',
        items: {
          type: 'string',
        },
      },
      outputCount: {
        type: 'number',
        description: 'Optional output count for grouped generation, supports 2~15.',
      },
      sizeHint: {
        type: 'string',
        description: 'Optional explicit size hint, e.g. 2K / 2048x1536 / 16:9.',
      },
    },
    required: ['prompt'],
  },
};

function resolveImageModelAlias(model: string) {
  const normalized = model.trim();
  if (!normalized) return normalized;
  if (normalized.toLowerCase() === 'gpt2') return OPENROUTER_GPT_IMAGE_MODEL;
  if (normalized.toLowerCase() === 'gemini') return OPENROUTER_GEMINI_FLASH_IMAGE_MODEL;
  if (normalized.toLowerCase() === 'nano-banana-2') return OPENROUTER_GEMINI_FLASH_IMAGE_MODEL;
  return normalized;
}

function isOpenRouterImageModel(model: string) {
  const normalized = resolveImageModelAlias(model);
  return OPENROUTER_IMAGE_MODELS.some((item) => item === normalized);
}

function isOpenRouterGeminiFlashImageModel(model: string) {
  return resolveImageModelAlias(model) === OPENROUTER_GEMINI_FLASH_IMAGE_MODEL;
}

function resolveDoubaoImageConfig(): ImageProviderConfig {
  const settings = getModelSettings();
  const provider = settings.providers.doubao;
  return {
    provider: 'doubao',
    apiBaseUrl: (provider.apiBaseUrl || DOUBAO_DEFAULT_API_BASE_URL).trim() || DOUBAO_DEFAULT_API_BASE_URL,
    apiKey: (provider.apiKey || '').trim(),
    imageModel: (provider.imageModel || DOUBAO_5_IMAGE_MODEL).trim() || DOUBAO_5_IMAGE_MODEL,
  };
}

function resolveOpenRouterImageConfig(): ImageProviderConfig {
  const settings = getModelSettings();
  const provider = settings.providers.openrouter;
  const rawApiBaseUrl = (provider.apiBaseUrl || '').trim();
  const preferredApiBaseUrl =
    !rawApiBaseUrl || /^https:\/\/openrouter\.ai\/api\/v1\/?$/i.test(rawApiBaseUrl)
      ? OPENROUTER_DEFAULT_API_BASE_URL
      : rawApiBaseUrl;
  return {
    provider: 'openrouter',
    apiBaseUrl: preferredApiBaseUrl,
    apiKey: (provider.apiKey || '').trim(),
    imageModel: resolveImageModelAlias(provider.imageModel || OPENROUTER_GPT_IMAGE_MODEL) || OPENROUTER_GPT_IMAGE_MODEL,
  };
}

function resolveImageProviderConfig(model: string): ImageProviderConfig {
  return isOpenRouterImageModel(model) ? resolveOpenRouterImageConfig() : resolveDoubaoImageConfig();
}

function resolveDoubaoChatConfig() {
  const config = resolveDoubaoImageConfig();
  return {
    provider: config.provider,
    apiBaseUrl: config.apiBaseUrl,
    apiKey: config.apiKey,
  };
}

export function isDoubaoConfigured() {
  return ENABLE_BACKEND_PROXY || Boolean(resolveDoubaoChatConfig().apiKey);
}

export function isDoubaoVideoConfigured() {
  return Boolean((ENABLE_BACKEND_PROXY || resolveDoubaoChatConfig().apiKey) && DEFAULT_VIDEO_MODEL());
}

export function isImageModelConfigured(model: string) {
  const config = resolveImageProviderConfig(model || DOUBAO_5_IMAGE_MODEL);
  return Boolean(config.apiBaseUrl && (ENABLE_BACKEND_PROXY || config.apiKey));
}

export function getImageModelConfigurationMessage(model: string) {
  if (isOpenRouterImageModel(model || '')) {
    return '当前所选模型未配置，请前往模型设置页完成 OpenRouter 地址和 API Key 配置。';
  }
  return '当前所选模型未配置，请前往模型设置页完成豆包地址和 API Key 配置。';
}

function requireVideoModel() {
  const model = DEFAULT_VIDEO_MODEL();
  if (!model) {
    throw new Error('未配置视频生成模型，请在 .env.local 中设置 VITE_DOUBAO_VIDEO_MODEL。');
  }
  return model;
}

export function getResolvedImageModelConfigurationMessage(model: string) {
  return getImageModelConfigurationMessage(model);
}

function parseFiniteNumber(value: unknown) {
  const numberValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

export async function getOpenRouterCreditsStatus(): Promise<OpenRouterCreditsStatus> {
  const config = resolveOpenRouterImageConfig();
  if (!ENABLE_BACKEND_PROXY && !config.apiKey) {
    throw new Error('OpenRouter API Key ???????????????');
  }

  const payload = await getJSON('/credits', {
    provider: 'openrouter',
    apiBaseUrl: OPENROUTER_OFFICIAL_API_BASE_URL,
    apiKey: config.apiKey,
  });
  const data = payload?.data || {};
  const totalCredits = parseFiniteNumber(data.total_credits);
  const totalUsage = parseFiniteNumber(data.total_usage);

  return {
    totalCredits,
    totalUsage,
    remaining: totalCredits - totalUsage,
    updatedAt: Date.now(),
  };
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

function shouldGenerateImage(
  userMessage: string,
  attachedImages: string[] = [],
  forceImageGeneration: boolean = false
) {
  const text = userMessage.trim().toLowerCase();
  if (forceImageGeneration) {
    return Boolean(text || attachedImages.length > 0);
  }
  if (!text) return false;
  if (IMAGE_INTENT_KEYWORDS_V2.some((keyword) => text.includes(keyword))) return true;
  if (IMAGE_INTENT_KEYWORDS.some((keyword) => text.includes(keyword))) return true;
  return attachedImages.length > 0;
}

function readErrorMessage(payload: any, status: number) {
  const message =
    payload?.error?.message ||
    payload?.message ||
    payload?.msg ||
    payload?.detail ||
    `请求失败（HTTP ${status}）`;
  return String(message);
}

function normalizeApiBaseUrl(baseUrl: string) {
  const trimmed = (baseUrl || '').trim();
  if (!trimmed) return '';

  let normalized = trimmed.replace(/\/+$/, '');
  // Allow users to paste a full endpoint and still work.
  normalized = normalized.replace(/\/chat\/completions\/?$/i, '');
  return normalized;
}

function buildApiRequestUrl(baseUrl: string, path: string) {
  const normalizedBase = normalizeApiBaseUrl(baseUrl);
  const normalizedPath = `/${String(path || '').replace(/^\/+/, '')}`;
  return `${normalizedBase}${normalizedPath}`;
}

function is404LikeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '');
  const normalized = message.toLowerCase();
  return normalized.includes('404') || normalized.includes('not found');
}

async function proxyJSON(
  method: 'POST' | 'GET',
  path: string,
  config: RequestConfig,
  body?: Record<string, unknown>
) {
  const requestUrl = buildApiRequestUrl(config.apiBaseUrl, path);
  const payload = {
    targetUrl: requestUrl,
    method,
    provider: config.provider,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
      ...(config.headers || {}),
    },
    body,
  };
  let response: Response;
  try {
    response = await fetch(BACKEND_PROXY_PATH, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || 'unknown');
    throw new Error(`同源代理请求失败（${BACKEND_PROXY_PATH}）：${message}`);
  }
  const json = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(readErrorMessage(json, response.status));
  }
  return json;
}

async function postJSON(path: string, body: Record<string, unknown>, config: RequestConfig) {
  const requestUrl = buildApiRequestUrl(config.apiBaseUrl, path);
  if (ENABLE_BACKEND_PROXY) {
    return proxyJSON('POST', path, config, body);
  }
  let response: Response;
  try {
    response = await fetch(requestUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
        ...(config.headers || {}),
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || 'unknown');
    throw new Error(`网络请求失败（POST ${requestUrl}）：${message}`);
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(readErrorMessage(payload, response.status));
  }
  return payload;
}

async function getJSON(path: string, config: RequestConfig) {
  const requestUrl = buildApiRequestUrl(config.apiBaseUrl, path);
  if (ENABLE_BACKEND_PROXY) {
    return proxyJSON('GET', path, config);
  }
  let response: Response;
  try {
    response = await fetch(requestUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        ...(config.headers || {}),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || 'unknown');
    throw new Error(`网络请求失败（GET ${requestUrl}）：${message}`);
  }

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

function appendUniqueImageUrl(target: string[], candidate: unknown) {
  if (typeof candidate !== 'string') return;
  const trimmed = candidate.trim();
  if (!trimmed) return;
  if (!target.includes(trimmed)) {
    target.push(trimmed);
  }
}

function collectImageUrlsFromUnknown(input: unknown, target: string[]) {
  if (!Array.isArray(input)) return;
  for (const item of input) {
    if (typeof item === 'string') {
      appendUniqueImageUrl(target, item);
      continue;
    }
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    if (typeof record.b64_json === 'string' && record.b64_json.trim()) {
      appendUniqueImageUrl(target, `data:image/png;base64,${record.b64_json.trim()}`);
      continue;
    }
    appendUniqueImageUrl(target, record.url);
    appendUniqueImageUrl(target, record.image);
    appendUniqueImageUrl(target, record.data);
    if (record.imageUrl && typeof record.imageUrl === 'object') {
      const nested = record.imageUrl as Record<string, unknown>;
      appendUniqueImageUrl(target, nested.url);
    } else {
      appendUniqueImageUrl(target, record.imageUrl);
    }
    if (record.image_url && typeof record.image_url === 'object') {
      const nested = record.image_url as Record<string, unknown>;
      appendUniqueImageUrl(target, nested.url);
    } else {
      appendUniqueImageUrl(target, record.image_url);
    }
  }
}

function collectImageUrlsFromContent(content: unknown, target: string[]) {
  if (!Array.isArray(content)) return;
  for (const part of content) {
    if (!part || typeof part !== 'object') continue;
    const record = part as Record<string, unknown>;
    if (record.image_url && typeof record.image_url === 'object') {
      const nested = record.image_url as Record<string, unknown>;
      appendUniqueImageUrl(target, nested.url);
      continue;
    }
    if (typeof record.image_url === 'string') {
      appendUniqueImageUrl(target, record.image_url);
      continue;
    }
    if (record.imageUrl && typeof record.imageUrl === 'object') {
      const nested = record.imageUrl as Record<string, unknown>;
      appendUniqueImageUrl(target, nested.url);
      continue;
    }
    if (typeof record.imageUrl === 'string') {
      appendUniqueImageUrl(target, record.imageUrl);
      continue;
    }
    appendUniqueImageUrl(target, record.url);
    appendUniqueImageUrl(target, record.data);
  }
}

function extractOpenRouterImageUrls(payload: any) {
  const urls: string[] = [];

  collectImageUrlsFromUnknown(payload?.data, urls);
  collectImageUrlsFromUnknown(payload?.images, urls);

  const choices = Array.isArray(payload?.choices) ? payload.choices : [];
  for (const choice of choices) {
    if (!choice || typeof choice !== 'object') continue;
    const record = choice as Record<string, unknown>;

    collectImageUrlsFromUnknown(record.images, urls);
    collectImageUrlsFromUnknown(record.image, urls);

    const message = record.message;
    if (message && typeof message === 'object') {
      const messageRecord = message as Record<string, unknown>;
      collectImageUrlsFromUnknown(messageRecord.images, urls);
      collectImageUrlsFromUnknown(messageRecord.image, urls);
      collectImageUrlsFromContent(messageRecord.content, urls);
      if (messageRecord.imageUrl && typeof messageRecord.imageUrl === 'object') {
        const nested = messageRecord.imageUrl as Record<string, unknown>;
        appendUniqueImageUrl(urls, nested.url);
      } else {
        appendUniqueImageUrl(urls, messageRecord.imageUrl);
      }
      if (messageRecord.image_url && typeof messageRecord.image_url === 'object') {
        const nested = messageRecord.image_url as Record<string, unknown>;
        appendUniqueImageUrl(urls, nested.url);
      } else {
        appendUniqueImageUrl(urls, messageRecord.image_url);
      }
    }

    const delta = record.delta;
    if (delta && typeof delta === 'object') {
      const deltaRecord = delta as Record<string, unknown>;
      collectImageUrlsFromUnknown(deltaRecord.images, urls);
      collectImageUrlsFromUnknown(deltaRecord.image, urls);
      collectImageUrlsFromContent(deltaRecord.content, urls);
      if (deltaRecord.imageUrl && typeof deltaRecord.imageUrl === 'object') {
        const nested = deltaRecord.imageUrl as Record<string, unknown>;
        appendUniqueImageUrl(urls, nested.url);
      } else {
        appendUniqueImageUrl(urls, deltaRecord.imageUrl);
      }
      if (deltaRecord.image_url && typeof deltaRecord.image_url === 'object') {
        const nested = deltaRecord.image_url as Record<string, unknown>;
        appendUniqueImageUrl(urls, nested.url);
      } else {
        appendUniqueImageUrl(urls, deltaRecord.image_url);
      }
    }
  }

  return urls;
}

function buildForcedImagePromptV2(prompt: string, outputCount: number = 1) {
  const safePrompt = prompt.trim();
  if (outputCount > 1) {
    return `${safePrompt}\n\n请直接输出 ${outputCount} 张不同构图的图片结果，不要只返回文字描述。`;
  }
  return `${safePrompt}\n\n请直接生成图片并返回至少 1 张图像结果，不要只返回文字说明。`;
}

function buildImagePreservationPrompt(
  operation: GenerateImageAIOptions['operation'],
  hasReferenceImages: boolean,
  preserveReferenceText: boolean = true
) {
  if (!preserveReferenceText || !hasReferenceImages) return '';
  if (operation === 'local-edit') return LOCAL_EDIT_TEXT_PRESERVATION_PROMPT;
  return REFERENCE_TEXT_PRESERVATION_PROMPT;
}

function appendPromptSection(prompt: string, section: string) {
  const safePrompt = prompt.trim();
  const safeSection = section.trim();
  if (!safeSection) return safePrompt;
  return `${safePrompt}\n\n${safeSection}`;
}

function enhanceImageGenerationOptions(
  prompt: string,
  referenceImages: string[],
  options?: GenerateImageAIOptions
) {
  const hasReferenceImages = referenceImages.some((item) => typeof item === 'string' && item.trim());
  const operation = options?.operation || (hasReferenceImages ? 'reference' : 'generate');
  const preservationPrompt = buildImagePreservationPrompt(
    operation,
    hasReferenceImages,
    options?.preserveReferenceText !== false
  );

  return {
    prompt: appendPromptSection(prompt, preservationPrompt),
    options: {
      ...options,
      operation,
    },
  };
}

function parseSizeDimensions(value: string) {
  const match = value.trim().match(/^(\d{2,5})\s*[xX]\s*(\d{2,5})$/);
  if (!match?.[1] || !match[2]) return null;
  const width = Number.parseInt(match[1], 10);
  const height = Number.parseInt(match[2], 10);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  return { width, height };
}

async function loadImageDimensionsFromSource(source: string) {
  if (typeof Image === 'undefined') return null;
  return new Promise<{ width: number; height: number } | null>((resolve) => {
    const image = new Image();
    image.onload = () =>
      resolve({
        width: image.naturalWidth || image.width,
        height: image.naturalHeight || image.height,
      });
    image.onerror = () => resolve(null);
    image.src = source;
  });
}

async function resolveSingleReferenceSizeHint(referenceImages: string[]) {
  if (referenceImages.length !== 1) return undefined;
  const source = referenceImages[0];
  if (!source) return undefined;
  const dimensions = await loadImageDimensionsFromSource(source).catch(() => null);
  if (!dimensions) return undefined;

  const width = Math.max(1, Math.round(dimensions.width));
  const height = Math.max(1, Math.round(dimensions.height));
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return undefined;
  }

  return `${width}x${height}`;
}

function resolvePromptReferenceIndex(prompt: string, referenceCount: number) {
  if (referenceCount <= 0) return -1;
  if (referenceCount === 1) return 0;

  const normalized = prompt.trim().toLowerCase();
  if (!normalized) return 0;

  const lastIndex = referenceCount - 1;
  if (/(最后|末尾|最后一张|最后那个|最后这张|last|latest)/i.test(normalized)) {
    return lastIndex;
  }

  const ordinalPatterns: Array<[RegExp, number]> = [
    [/(第一张|第1张|第一个|第1个|1号|一号|首张|前一张|左边|左侧|上面|上方|first)/i, 0],
    [/(第二张|第2张|第二个|第2个|2号|二号|second)/i, 1],
    [/(第三张|第3张|第三个|第3个|3号|三号|third)/i, 2],
    [/(第四张|第4张|第四个|第4个|4号|四号|fourth)/i, 3],
    [/(第五张|第5张|第五个|第5个|5号|五号|fifth)/i, 4],
  ];

  for (const [pattern, index] of ordinalPatterns) {
    if (pattern.test(normalized)) {
      return Math.min(index, lastIndex);
    }
  }

  // "这张图/这个图/原图" usually refers to the primary attached image.
  return 0;
}

async function resolvePreferredReferenceSizeHint(prompt: string, referenceImages: string[]) {
  const refs = referenceImages.filter(Boolean).map((item) => item.trim()).filter(Boolean);
  if (!refs.length) return undefined;

  const preferredIndex = resolvePromptReferenceIndex(prompt, refs.length);
  const source = refs[preferredIndex] || refs[0];
  if (!source) return undefined;

  const dimensions = await loadImageDimensionsFromSource(source).catch(() => null);
  if (!dimensions) return undefined;

  const width = Math.max(1, Math.round(dimensions.width));
  const height = Math.max(1, Math.round(dimensions.height));
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return undefined;
  }

  return `${width}x${height}`;
}

function shouldInheritReferenceSize(prompt: string, referenceImages: string[]) {
  if (!referenceImages.length) return false;
  const normalized = prompt.trim().toLowerCase();
  if (!normalized) return false;
  return (
    /修改|改图|改一下|改成|换成|替换|重绘|局部|修图|处理这张|处理这个|保持|保留|不要改变|不变/i.test(normalized) ||
    /原图|参考图|这张图|这个图|这图|图片里|图里|基于这张|基于这个|基于原图|根据这张|根据这个|按照这张|按照这个|照着|参考|图生图/i.test(normalized) ||
    /based on this|use this|this image|reference image|original image|same size|original size|keep.*size|edit|modify|replace|change this|inpaint/i.test(normalized)
  );
}

async function resolveEffectiveImageGenerationIntent(
  prompt: string,
  referenceImages: string[],
  options?: { outputCount?: number; sizeHint?: string }
) {
  const intent = resolveImageGenerationIntent(prompt, options);
  if (intent.explicitSize) return intent;

  if (!shouldInheritReferenceSize(prompt, referenceImages)) {
    return {
      ...intent,
      explicitSize: DEFAULT_IMAGE_SIZE,
    };
  }

  const inheritedSize = await resolvePreferredReferenceSizeHint(prompt, referenceImages);
  if (!inheritedSize) {
    return {
      ...intent,
      explicitSize: DEFAULT_IMAGE_SIZE,
    };
  }

  return {
    ...intent,
    explicitSize: inheritedSize,
  };
}

function normalizeInheritedDoubaoSize(sizeHint?: string) {
  if (!sizeHint) return undefined;
  const parsed = parseSizeDimensions(sizeHint);
  if (!parsed) return undefined;
  let width = Math.max(1, Math.round(parsed.width));
  let height = Math.max(1, Math.round(parsed.height));
  const pixels = width * height;
  if (pixels < DOUBAO_MIN_OUTPUT_PIXELS) {
    // 豆包要求最小输出像素；不足时按原图比例等比放大到阈值。
    const scale = Math.sqrt(DOUBAO_MIN_OUTPUT_PIXELS / Math.max(pixels, 1));
    width = Math.max(1, Math.ceil(width * scale));
    height = Math.max(1, Math.ceil(height * scale));
  }
  return `${width}x${height}`;
}

function decodeJsonString(raw: string) {
  try {
    return JSON.parse(`"${raw}"`) as string;
  } catch {
    return raw;
  }
}

function clampOutputCount(value: number) {
  if (!Number.isFinite(value)) return 1;
  const rounded = Math.round(value);
  if (rounded <= 1) return 1;
  return Math.min(GROUP_OUTPUT_MAX_COUNT, Math.max(GROUP_OUTPUT_MIN_COUNT, rounded));
}

function parseOutputCountFromUnknown(value: unknown): number | undefined {
  if (typeof value === 'number') return clampOutputCount(value);
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseInt(value.trim(), 10);
    if (!Number.isNaN(parsed)) {
      return clampOutputCount(parsed);
    }
  }
  return undefined;
}

function parseOutputCountFromPrompt(prompt: string): number | undefined {
  const matchers: RegExp[] = [
    /([1-4])\s*(?:张|個|个|幅|组|套|images?|pics?|posters?)/i,
    /(?:生成|出|给我|来|要)\s*([1-4])\s*(?:张|個|个|幅|组|套)/i,
    /(?:x|×)\s*([1-4])\s*(?:张|個|个|幅|images?)/i,
    /\b([1-4])\s*(?:images?|variations?)\b/i,
  ];
  for (const matcher of matchers) {
    const matched = prompt.match(matcher);
    if (!matched?.[1]) continue;
    const parsed = Number.parseInt(matched[1], 10);
    if (Number.isNaN(parsed)) continue;
    if (parsed <= 1) return 1;
    return clampOutputCount(parsed);
  }

  if (/(两|兩)\s*(?:张|個|个|幅|组|套)/.test(prompt)) return 2;
  if (/(三)\s*(?:张|個|个|幅|组|套)/.test(prompt)) return 3;
  if (/(四)\s*(?:张|個|个|幅|组|套)/.test(prompt)) return 4;
  return undefined;
}

function hasGroupOutputIntent(prompt: string) {
  const normalized = prompt.toLowerCase();
  const keywords = [
    '组图',
    '多图',
    '多张',
    '一组',
    '分镜',
    '四宫格',
    '九宫格',
    '组海报',
    'multi image',
    'multiple images',
    'set of',
    'variations',
  ];
  return keywords.some((keyword) => normalized.includes(keyword));
}

function parseOutputCountFromPromptV2(prompt: string): number | undefined {
  const matchers: RegExp[] = [
    /(1[0-5]|[1-9])\s*(?:张|幅|个|组|图|images?|pics?|posters?|variations?)/i,
    /(?:生成|给我|来|要|做)\s*(1[0-5]|[1-9])\s*(?:张|幅|个|组|图|images?|pics?|posters?|variations?)/i,
    /(?:x|×|脳)\s*(1[0-5]|[1-9])\s*(?:张|幅|个|组|图|images?|pics?|posters?|variations?)/i,
    /\b(1[0-5]|[1-9])\s*(?:images?|variations?)\b/i,
  ];

  for (const matcher of matchers) {
    const matched = prompt.match(matcher);
    if (!matched?.[1]) continue;
    const parsed = Number.parseInt(matched[1], 10);
    if (Number.isNaN(parsed)) continue;
    if (parsed <= 1) return 1;
    return clampOutputCount(parsed);
  }

  if (/(two|双图|两张|二张|2张)/i.test(prompt)) return 2;
  if (/(three|三张|3张)/i.test(prompt)) return 3;
  if (/(four|四张|4张)/i.test(prompt)) return 4;
  if (/(five|五张|5张)/i.test(prompt)) return 5;
  if (/(six|六张|6张)/i.test(prompt)) return 6;
  if (/(seven|七张|7张)/i.test(prompt)) return 7;
  if (/(eight|八张|8张)/i.test(prompt)) return 8;
  if (/(nine|九张|9张)/i.test(prompt)) return 9;
  if (/(ten|十张|10张)/i.test(prompt)) return 10;
  if (/(eleven|十一张|11张)/i.test(prompt)) return 11;
  if (/(twelve|十二张|12张)/i.test(prompt)) return 12;
  if (/(thirteen|十三张|13张)/i.test(prompt)) return 13;
  if (/(fourteen|十四张|14张)/i.test(prompt)) return 14;
  if (/(fifteen|十五张|15张)/i.test(prompt)) return 15;
  return undefined;
}

function normalizeSizeToken(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const kMatch = trimmed.match(/\b([1-4])\s*k\b/i);
  if (kMatch?.[1]) {
    return `${kMatch[1]}K`;
  }

  const pixelMatch = trimmed.match(/(\d{2,5})\s*[x×*]\s*(\d{2,5})/i);
  if (pixelMatch?.[1] && pixelMatch[2]) {
    return `${pixelMatch[1]}x${pixelMatch[2]}`;
  }

  const ratioMatch = trimmed.match(/\b(1:1|4:3|3:4|16:9|9:16)\b/i);
  if (ratioMatch?.[1]) {
    return SIZE_RATIO_MAP[ratioMatch[1].toLowerCase()];
  }

  return undefined;
}

function normalizeSizeTokenV2(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const normalized = trimmed
    .toLowerCase()
    .replace(/：/g, ':')
    .replace(/比/g, ':')
    .replace(/\s+/g, ' ');

  const kMatch = normalized.match(/\b([1-4])\s*k\b/i);
  if (kMatch?.[1]) {
    const kMap: Record<string, string> = {
      '1': '1024x1024',
      '2': '2048x2048',
      '3': '3072x3072',
      '4': '4096x4096',
    };
    return kMap[kMatch[1]] || undefined;
  }

  const pixelMatch = normalized.match(/(\d{2,5})\s*[x×脳*]\s*(\d{2,5})/i);
  if (pixelMatch?.[1] && pixelMatch[2]) {
    return `${pixelMatch[1]}x${pixelMatch[2]}`;
  }

  const ratioDirect = normalized.match(/\b(1:1|4:3|3:4|4:5|5:4|3:2|2:3|16:9|9:16|21:9|9:21)\b/i);
  if (ratioDirect?.[1]) {
    return SIZE_RATIO_MAP[ratioDirect[1].toLowerCase()];
  }

  const ratioMatch = normalized.match(/\b(\d{1,2})\s*:\s*(\d{1,2})\b/i);
  if (ratioMatch?.[1] && ratioMatch[2]) {
    const key = `${ratioMatch[1]}:${ratioMatch[2]}`;
    if (SIZE_RATIO_MAP[key]) return SIZE_RATIO_MAP[key];
  }

  if (/\b1080p\b/i.test(normalized)) return '1920x1080';
  if (/\b720p\b/i.test(normalized)) return '1280x720';
  if (/(square|正方形|方图)/i.test(normalized)) return SIZE_RATIO_MAP['1:1'];
  if (/(portrait|竖版|竖图)/i.test(normalized)) return SIZE_RATIO_MAP['3:4'];
  if (/(landscape|横版|横图)/i.test(normalized)) return SIZE_RATIO_MAP['4:3'];

  return undefined;
}

function parseExplicitSize(prompt: string, sizeHint?: string) {
  if (typeof sizeHint === 'string' && sizeHint.trim()) {
    const normalizedFromHint = normalizeSizeTokenV2(sizeHint);
    if (normalizedFromHint) return normalizedFromHint;
  }
  return normalizeSizeTokenV2(prompt);
}

function resolveImageGenerationIntent(
  prompt: string,
  options?: { outputCount?: number; sizeHint?: string }
): ImageGenerationIntent {
  const promptOutputCount = parseOutputCountFromPromptV2(prompt);
  const requestedOutputCount = parseOutputCountFromUnknown(options?.outputCount);
  const explicitSize = parseExplicitSize(prompt, options?.sizeHint);
  const groupedByPrompt = hasGroupOutputIntent(prompt);
  const baseCount = requestedOutputCount ?? promptOutputCount;
  const outputCount = baseCount ?? (groupedByPrompt ? GROUP_OUTPUT_DEFAULT_COUNT : 1);
  const isGroupOutput = outputCount > 1 || groupedByPrompt;

  return {
    isGroupOutput,
    outputCount: isGroupOutput ? clampOutputCount(outputCount) : 1,
    explicitSize,
  };
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
        const parsedOutputCount = parseOutputCountFromUnknown(
          params?.outputCount ?? params?.output_count ?? params?.max_images
        );
        const parsedSizeHint =
          typeof params?.sizeHint === 'string'
            ? params.sizeHint.trim()
            : typeof params?.size_hint === 'string'
            ? params.size_hint.trim()
            : typeof params?.size === 'string'
            ? params.size.trim()
            : undefined;
        const intent = resolveImageGenerationIntent(prompt, {
          outputCount: parsedOutputCount,
          sizeHint: parsedSizeHint,
        });
        functionCalls.push({
          name: 'generateImage',
          args: {
            prompt,
            referenceImages,
            outputCount: intent.outputCount > 1 ? intent.outputCount : undefined,
            sizeHint: intent.explicitSize,
          },
        });
      }
    } catch {
      // ignore malformed call blocks
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

  const outputCountMatch = rawText.match(/"outputCount"\s*:\s*(\d+)/i);
  const sizeHintMatch = rawText.match(/"sizeHint"\s*:\s*"((?:\\.|[^"\\])*)"/i);
  const outputCount = outputCountMatch?.[1] ? Number.parseInt(outputCountMatch[1], 10) : undefined;
  const sizeHint = sizeHintMatch?.[1] ? decodeJsonString(sizeHintMatch[1]).trim() : undefined;
  const intent = resolveImageGenerationIntent(prompt, {
    outputCount,
    sizeHint,
  });

  return [
    {
      name: 'generateImage',
      args: {
        prompt,
        referenceImages: Array.from(refs).filter(Boolean),
        outputCount: intent.outputCount > 1 ? intent.outputCount : undefined,
        sizeHint: intent.explicitSize,
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

function getOpenRouterHeaders() {
  const headers: Record<string, string> = {
    'X-Title': 'ecommerce-ai',
  };

  if (typeof window !== 'undefined' && window.location?.origin) {
    headers['HTTP-Referer'] = window.location.origin;
  }

  return headers;
}

export async function chatWithAI(
  messages: ChatHistoryMessage[],
  userMessage: string,
  attachedImages: string[] = [],
  options?: ChatWithAIOptions
) {
  if (shouldGenerateImage(userMessage, attachedImages, Boolean(options?.forceImageGeneration))) {
    const intent = resolveImageGenerationIntent(userMessage);
    return {
      text: '',
      functionCalls: [
        {
          name: 'generateImage',
          args: {
            prompt: userMessage,
            referenceImages: attachedImages.filter(Boolean),
            outputCount: intent.outputCount > 1 ? intent.outputCount : undefined,
            sizeHint: intent.explicitSize,
          },
        } satisfies GenerateImageFunctionCall,
      ],
    };
  }

  const doubaoConfig = resolveDoubaoChatConfig();
  if (!ENABLE_BACKEND_PROXY && !doubaoConfig.apiKey) {
    throw new Error('未配置豆包对话能力，请在模型设置页完成豆包 API Key 配置。');
  }

  const resolvedSystemPrompt = options?.systemPrompt?.trim()
    ? `${DEFAULT_SYSTEM_PROMPT}\n\n${options.systemPrompt.trim()}`
    : DEFAULT_SYSTEM_PROMPT;

  const payload = await postJSON(
    '/chat/completions',
    {
      model: (options?.model || DEFAULT_CHAT_MODEL).trim(),
      temperature: typeof options?.temperature === 'number' ? options.temperature : 0.7,
      stream: false,
      messages: [
        {
          role: 'system',
          content: resolvedSystemPrompt.trim(),
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
    },
    doubaoConfig
  );

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

function mapImageGenerationError(error: unknown) {
  if (!(error instanceof Error)) return '图片生成失败，请稍后重试。';
  const message = error.message || '图片生成失败，请稍后重试。';
  const normalized = message.toLowerCase();

  if (isInvalidFieldError(message)) {
    return `图片生成失败：参数不符合模型要求（${message}）。请调整提示词后重试。`;
  }
  if (
    normalized.includes('429') ||
    normalized.includes('rate limit') ||
    normalized.includes('too many requests')
  ) {
    return '图片生成失败：请求过于频繁，请稍后重试。';
  }
  if (
    normalized.includes('413') ||
    normalized.includes('content too large') ||
    normalized.includes('payload too large')
  ) {
    return '图片生成失败：请求体过大（HTTP 413）。已自动压缩参考图；若仍失败，请减少参考图数量或改用更小图片。';
  }
  if (
    normalized.includes('502') ||
    normalized.includes('503') ||
    normalized.includes('504') ||
    normalized.includes('gateway') ||
    normalized.includes('network') ||
    normalized.includes('failed to fetch') ||
    normalized.includes('cors')
  ) {
    return '图片生成失败：网络或网关异常，请稍后重试。';
  }
  return message;
}

function mapInsufficientCreditsError(error: unknown) {
  if (!(error instanceof Error)) return null;
  const normalized = (error.message || '').toLowerCase();
  const isInsufficientCredits =
    normalized.includes('insufficient credits') ||
    normalized.includes('payment required') ||
    normalized.includes('quota exceeded') ||
    normalized.includes('余额不足') ||
    normalized.includes('欠费') ||
    normalized.includes('http 402') ||
    normalized.includes('402');
  if (!isInsufficientCredits) return null;
  return '图片生成失败：当前模型账户已欠费（余额不足）。请先充值后重试：https://openrouter.ai/settings/credits';
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

function parseDataUrlMimeAndBody(dataUrl: string) {
  const matched = dataUrl.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,([\s\S]+)$/i);
  if (!matched?.[1] || !matched[2]) return null;
  return {
    mimeType: matched[1].toLowerCase(),
    base64Body: matched[2].replace(/\s+/g, ''),
  };
}

function estimateBase64Bytes(base64Body: string) {
  const padding = (base64Body.match(/=+$/)?.[0]?.length ?? 0);
  return Math.floor((base64Body.length * 3) / 4) - padding;
}

function estimateDataUrlBytes(dataUrl: string) {
  const parsed = parseDataUrlMimeAndBody(dataUrl);
  if (!parsed) return 0;
  return estimateBase64Bytes(parsed.base64Body);
}

function isBase64ImageDataUrl(value: string) {
  return /^data:image\/[a-zA-Z0-9+.-]+;base64,/i.test(value.trim());
}

async function loadImageElement(source: string) {
  if (typeof Image === 'undefined') return null;
  return new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = source;
  });
}

async function compressDataImageForProxy(
  source: string,
  targetBytes: number,
  maxDimension: number
) {
  if (typeof document === 'undefined') return source;
  const parsed = parseDataUrlMimeAndBody(source);
  if (!parsed) return source;
  const currentBytes = estimateBase64Bytes(parsed.base64Body);
  if (currentBytes <= targetBytes) return source;

  const image = await loadImageElement(source);
  if (!image) return source;

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return source;

  let width = image.naturalWidth || image.width;
  let height = image.naturalHeight || image.height;
  if (!width || !height) return source;

  const scale = Math.min(1, maxDimension / Math.max(width, height));
  width = Math.max(1, Math.round(width * scale));
  height = Math.max(1, Math.round(height * scale));

  const render = (quality: number) => {
    canvas.width = width;
    canvas.height = height;
    context.clearRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', quality);
  };

  let quality = 0.9;
  let result = render(quality);

  while (estimateDataUrlBytes(result) > targetBytes && quality > 0.45) {
    quality = Math.max(0.45, quality - 0.08);
    result = render(quality);
    if (quality <= 0.45) break;
  }

  let resizeCount = 0;
  while (estimateDataUrlBytes(result) > targetBytes && resizeCount < 4) {
    width = Math.max(64, Math.round(width * 0.85));
    height = Math.max(64, Math.round(height * 0.85));
    quality = Math.min(quality, 0.82);
    result = render(quality);
    while (estimateDataUrlBytes(result) > targetBytes && quality > 0.4) {
      quality = Math.max(0.4, quality - 0.08);
      result = render(quality);
      if (quality <= 0.4) break;
    }
    resizeCount += 1;
  }

  return result;
}

async function prepareReferenceImagesForProxy(referenceImages: string[]) {
  const refs = referenceImages.filter(Boolean).map((item) => item.trim()).filter(Boolean);
  if (!ENABLE_BACKEND_PROXY) return refs;

  const dataImageIndexes = refs
    .map((value, index) => (isBase64ImageDataUrl(value) ? index : -1))
    .filter((index) => index >= 0);
  if (!dataImageIndexes.length) return refs;

  const perImageBudget = Math.max(
    PROXY_SAFE_DATA_IMAGE_MIN_BYTES,
    Math.min(
      PROXY_SAFE_DATA_IMAGE_SINGLE_BYTES,
      Math.floor(PROXY_SAFE_DATA_IMAGE_TOTAL_BYTES / dataImageIndexes.length)
    )
  );
  const maxDimension = dataImageIndexes.length >= 6 ? 1024 : dataImageIndexes.length >= 3 ? 1280 : 1536;

  const nextRefs = [...refs];
  await Promise.all(
    dataImageIndexes.map(async (index) => {
      nextRefs[index] = await compressDataImageForProxy(nextRefs[index], perImageBudget, maxDimension);
    })
  );

  const totalDataImageBytes = nextRefs.reduce((sum, item) => sum + estimateDataUrlBytes(item), 0);
  if (totalDataImageBytes > PROXY_SAFE_DATA_IMAGE_TOTAL_BYTES) {
    throw new Error(
      '参考图总大小超过代理上限，请减少参考图数量，或先压缩后再试。建议单次参考图总大小控制在 3MB 以内。'
    );
  }

  return nextRefs;
}

async function loadDataUrlDimensions(dataUrl: string) {
  if (typeof Image === 'undefined') return null;
  return new Promise<{ width: number; height: number } | null>((resolve) => {
    const image = new Image();
    image.onload = () => {
      resolve({
        width: image.naturalWidth || image.width,
        height: image.naturalHeight || image.height,
      });
    };
    image.onerror = () => resolve(null);
    image.src = dataUrl;
  });
}

async function validateDoubaoReferenceImages(referenceImages: string[]) {
  if (referenceImages.length > DOUBAO_REFERENCE_IMAGE_MAX_COUNT) {
    throw new Error(`参考图最多支持 ${DOUBAO_REFERENCE_IMAGE_MAX_COUNT} 张，请减少后重试。`);
  }

  for (const imageRef of referenceImages) {
    if (!imageRef || typeof imageRef !== 'string') {
      throw new Error('参考图格式无效，请重新上传后重试。');
    }

    const trimmed = imageRef.trim();
    if (!trimmed) {
      throw new Error('参考图格式无效，请重新上传后重试。');
    }

    if (trimmed.startsWith('data:')) {
      const parsed = parseDataUrlMimeAndBody(trimmed);
      if (!parsed) {
        throw new Error('参考图仅支持图片 data URL（base64）格式。');
      }

      const bytes = estimateBase64Bytes(parsed.base64Body);
      if (bytes > DOUBAO_REFERENCE_IMAGE_MAX_BYTES) {
        throw new Error('参考图单张大小不能超过 10MB，请压缩后重试。');
      }

      const dimensions = await loadDataUrlDimensions(trimmed);
      if (!dimensions) continue;

      if (
        dimensions.width <= DOUBAO_REFERENCE_IMAGE_MIN_EDGE ||
        dimensions.height <= DOUBAO_REFERENCE_IMAGE_MIN_EDGE
      ) {
        throw new Error('参考图分辨率过小，请使用更清晰的图片。');
      }
      const ratio = Math.max(dimensions.width / dimensions.height, dimensions.height / dimensions.width);
      if (ratio > DOUBAO_REFERENCE_IMAGE_MAX_RATIO) {
        throw new Error('参考图宽高比超出限制（需在 1/16 到 16 之间）。');
      }
      if (dimensions.width * dimensions.height > DOUBAO_REFERENCE_IMAGE_MAX_PIXELS) {
        throw new Error('参考图像素过大（不能超过 6000x6000），请压缩后重试。');
      }
      continue;
    }

    try {
      // eslint-disable-next-line no-new
      new URL(trimmed);
    } catch {
      throw new Error('参考图 URL 无效，请检查后重试。');
    }
  }
}

function isSeedream5Model(model: string) {
  return /seedream[-_]?5/i.test(model);
}

async function extractImagesFromGenerationPayload(
  payload: any
): Promise<{ images: string[]; rawCount: number }> {
  const entries = Array.isArray(payload?.data) ? payload.data : [];
  const images: string[] = [];

  for (const entry of entries) {
    if (entry?.b64_json && typeof entry.b64_json === 'string') {
      images.push(`data:image/png;base64,${entry.b64_json}`);
      continue;
    }
    if (entry?.url && typeof entry.url === 'string') {
      try {
        images.push(await fetchImageAsDataUrl(entry.url));
      } catch {
        images.push(entry.url);
      }
    }
  }

  return {
    images,
    rawCount: entries.length || images.length,
  };
}

function buildDoubaoImagePayload(
  prompt: string,
  model: string,
  referenceImages: string[],
  options?: GenerateImageAIOptions
) {
  const intent = resolveImageGenerationIntent(prompt, {
    outputCount: options?.outputCount,
    sizeHint: options?.sizeHint,
  });
  const finalPrompt = options?.systemPrompt?.trim()
    ? `[系统规范]\n${options.systemPrompt.trim()}\n\n[用户需求]\n${prompt}`
    : prompt;
  const payload: Record<string, unknown> = {
    model,
    prompt: finalPrompt,
    response_format: 'b64_json',
    watermark: false,
    sequential_image_generation: intent.isGroupOutput ? 'auto' : 'disabled',
  };

  if (isSeedream5Model(model)) {
    payload.output_format = 'png';
  }
  if (intent.explicitSize) {
    // 仅在用户明确要求尺寸时透传。
    payload.size = intent.explicitSize;
  }
  if (intent.isGroupOutput) {
    payload.sequential_image_generation_options = {
      max_images: intent.outputCount,
    };
  }
  if (referenceImages.length === 1) {
    payload.image = referenceImages[0];
  } else if (referenceImages.length > 1) {
    payload.image = referenceImages;
  }

  return payload;
}

async function generateDoubaoImage(
  prompt: string,
  model: string,
  referenceImages: string[],
  options?: GenerateImageAIOptions
): Promise<GenerateImageAIResult> {
  const config = resolveDoubaoImageConfig();
  if (!ENABLE_BACKEND_PROXY && !config.apiKey) {
    throw new Error(getResolvedImageModelConfigurationMessage(model));
  }

  const originalRefs = referenceImages
    .filter(Boolean)
    .map((item) => item.trim())
    .filter(Boolean);
  const refs = await prepareReferenceImagesForProxy(originalRefs);
  try {
    await validateDoubaoReferenceImages(refs);
    const resolvedModel = (model || config.imageModel).trim();
    const baseIntent = resolveImageGenerationIntent(prompt, {
      outputCount: options?.outputCount,
      sizeHint: options?.sizeHint,
    });
    let fallbackSize: string | undefined;
    if (!baseIntent.explicitSize) {
      fallbackSize = shouldInheritReferenceSize(prompt, originalRefs)
        ? normalizeInheritedDoubaoSize(await resolvePreferredReferenceSizeHint(prompt, originalRefs)) || DEFAULT_IMAGE_SIZE
        : DEFAULT_IMAGE_SIZE;
    }
    const resolvedOptions =
      fallbackSize && !options?.sizeHint
        ? {
            ...options,
            sizeHint: fallbackSize,
          }
        : options;
    const payload = await postJSON(
      '/images/generations',
      buildDoubaoImagePayload(prompt, resolvedModel, refs, resolvedOptions),
      config
    );
    const extracted = await extractImagesFromGenerationPayload(payload);
    if (extracted.images.length === 0) {
      const message =
        payload?.error?.message || payload?.message || payload?.msg || '图片生成成功但未返回可用图片。';
      throw new Error(String(message));
    }
    return {
      images: extracted.images,
      provider: 'doubao',
      rawCount: extracted.rawCount,
    };
  } catch (error) {
    const billingMessage = mapInsufficientCreditsError(error);
    if (billingMessage) {
      throw new Error(billingMessage);
    }
    throw new Error(mapImageGenerationError(error));
  }
}

function mapDimensionsToOpenRouterAspectRatio(width: number, height: number) {
  const supportedRatios = [
    '1:1',
    '2:3',
    '3:2',
    '3:4',
    '4:3',
    '4:5',
    '5:4',
    '9:16',
    '16:9',
    '21:9',
    '1:4',
    '4:1',
    '1:8',
    '8:1',
  ];
  const ratio = width / height;
  let best = '1:1';
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const option of supportedRatios) {
    const [rawWidth, rawHeight] = option.split(':');
    const optionRatio = Number(rawWidth) / Number(rawHeight);
    const distance = Math.abs(Math.log(ratio / optionRatio));
    if (distance < bestDistance) {
      best = option;
      bestDistance = distance;
    }
  }

  return best;
}

function mapDimensionsToOpenRouterImageSize(width: number, height: number) {
  const maxEdge = Math.max(width, height);
  if (maxEdge >= 3500) return '4K';
  if (maxEdge >= 1536) return '2K';
  if (maxEdge <= 768) return '0.5K';
  return '1K';
}

async function resolveOpenRouterImageConfigOptions(
  intent: ImageGenerationIntent,
  referenceImages: string[],
  model: string
) {
  const imageConfig: Record<string, unknown> = {};
  const explicitDimensions = intent.explicitSize ? parseSizeDimensions(intent.explicitSize) : null;

  if (isOpenRouterGeminiFlashImageModel(model)) {
    if (explicitDimensions) {
      imageConfig.aspect_ratio = mapDimensionsToOpenRouterAspectRatio(
        explicitDimensions.width,
        explicitDimensions.height
      );
      imageConfig.image_size = mapDimensionsToOpenRouterImageSize(
        explicitDimensions.width,
        explicitDimensions.height
      );
    } else {
      imageConfig.aspect_ratio = '1:1';
      imageConfig.image_size = '1K';
    }
    return imageConfig;
  }

  if (explicitDimensions) {
    imageConfig.aspect_ratio = mapDimensionsToOpenRouterAspectRatio(
      explicitDimensions.width,
      explicitDimensions.height
    );
    imageConfig.image_size = mapDimensionsToOpenRouterImageSize(
      explicitDimensions.width,
      explicitDimensions.height
    );
    return imageConfig;
  }

  if (!referenceImages.length) {
    return undefined;
  }

  // 无显式尺寸时，优先让模型按参考图自动继承尺寸/比例，而不是强制映射到固定档位。
  imageConfig.size = 'auto';
  return imageConfig;
}

function pushUniqueImages(source: string[], target: string[]) {
  for (const item of source) {
    if (!item || target.includes(item)) continue;
    target.push(item);
  }
}

async function requestOpenRouterImagePayload(
  requestBody: Record<string, unknown>,
  config: ImageProviderConfig
) {
  const baseUrlCandidates = Array.from(
    new Set(
      [config.apiBaseUrl, OPENROUTER_DEFAULT_API_BASE_URL, OPENROUTER_OFFICIAL_API_BASE_URL]
        .map((value) => normalizeApiBaseUrl(value))
        .filter(Boolean)
    )
  );
  let payload: any = null;
  let last404Error: Error | null = null;

  for (const baseUrl of baseUrlCandidates) {
    try {
      payload = await postJSON('/chat/completions', requestBody, {
        provider: 'openrouter',
        apiBaseUrl: baseUrl,
        apiKey: config.apiKey,
        headers: getOpenRouterHeaders(),
      });
      break;
    } catch (error) {
      if (is404LikeError(error)) {
        last404Error = error instanceof Error ? error : new Error(String(error || 'HTTP 404'));
        continue;
      }
      throw error;
    }
  }

  if (!payload) {
    throw last404Error || new Error('OpenRouter chat/completions endpoint not found.');
  }

  return payload;
}

async function generateOpenRouterImage(
  prompt: string,
  model: string,
  referenceImages: string[],
  options?: GenerateImageAIOptions
): Promise<GenerateImageAIResult> {
  const config = resolveOpenRouterImageConfig();
  if (!ENABLE_BACKEND_PROXY && !config.apiKey) {
    throw new Error(getResolvedImageModelConfigurationMessage(model));
  }

  const intent = await resolveEffectiveImageGenerationIntent(prompt, referenceImages, {
    outputCount: options?.outputCount,
    sizeHint: options?.sizeHint,
  });
  const refs = await prepareReferenceImagesForProxy(referenceImages);
  const targetOutputCount = Math.max(1, intent.outputCount || 1);
  const forcedPrompt = buildForcedImagePromptV2(prompt, targetOutputCount);
  const userContent = refs.length
    ? [
        { type: 'text', text: forcedPrompt } as ChatContentPart,
        ...refs.map(
          (image) =>
            ({
              type: 'image_url',
              image_url: { url: image },
            }) satisfies ChatContentPart
        ),
      ]
    : forcedPrompt;

  const messages: Array<{ role: 'system' | 'user'; content: string | ChatContentPart[] }> = [];
  if (options?.systemPrompt?.trim()) {
    messages.push({
      role: 'system',
      content: options.systemPrompt.trim(),
    });
  }
  messages.push({
    role: 'user',
    content: userContent,
  });

  try {
    const resolvedModel = resolveImageModelAlias(model || config.imageModel) || OPENROUTER_GPT_IMAGE_MODEL;
    const imageConfig = await resolveOpenRouterImageConfigOptions(intent, refs, resolvedModel);
    const requestBody: Record<string, unknown> = {
      model: resolvedModel,
      messages,
      modalities: ['image', 'text'],
      stream: false,
    };
    if (imageConfig && Object.keys(imageConfig).length > 0) {
      requestBody.image_config = imageConfig;
    }

    const maxAttempts =
      targetOutputCount > 1
        ? Math.min(targetOutputCount + 2, GROUP_OUTPUT_MAX_COUNT + 2)
        : 1;
    const images: string[] = [];
    let rawCount = 0;
    let lastPayload: any = null;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const payload = await requestOpenRouterImagePayload(requestBody, config);
      lastPayload = payload;
      const imageEntries = extractOpenRouterImageUrls(payload);
      rawCount += imageEntries.length;

      const convertedBatch: string[] = [];
      for (const imageUrl of imageEntries) {
        if (typeof imageUrl !== 'string' || !imageUrl.trim()) continue;
        if (imageUrl.startsWith('data:')) {
          convertedBatch.push(imageUrl);
          continue;
        }
        try {
          convertedBatch.push(await fetchImageAsDataUrl(imageUrl));
        } catch {
          convertedBatch.push(imageUrl);
        }
      }
      pushUniqueImages(convertedBatch, images);

      if (images.length >= targetOutputCount) {
        break;
      }
      if (targetOutputCount <= 1) {
        break;
      }
      if (!imageEntries.length && attempt >= 1) {
        break;
      }
    }

    if (!images.length) {
      const message =
        lastPayload?.error?.message ||
        lastPayload?.message ||
        lastPayload?.msg ||
        'OpenRouter did not return any usable images.';
      throw new Error(String(message));
    }

    const finalImages = images.slice(0, targetOutputCount);
    return {
      images: finalImages,
      provider: 'openrouter',
      rawCount: rawCount || finalImages.length,
    };

    /* legacy fallback (kept for migration diff)
    if (!payload) {
      throw (
        last404Error ||
        new Error('OpenRouter 请求失败：未找到可用 chat/completions 端点，请检查模型配置中的 Base URL。')
      );
    }

    const imageEntries = extractOpenRouterImageUrls(payload);
    const images: string[] = [];

    for (const imageUrl of imageEntries) {
      if (typeof imageUrl !== 'string' || !imageUrl.trim()) continue;
      if (imageUrl.startsWith('data:')) {
        images.push(imageUrl);
      } else {
        try {
          images.push(await fetchImageAsDataUrl(imageUrl));
        } catch {
          images.push(imageUrl);
        }
      }
    }

    if (!images.length) {
      const message =
        payload?.error?.message || payload?.message || payload?.msg || 'OpenRouter 未返回可用图片。';
      throw new Error(String(message));
    }

    return {
      images,
      provider: 'openrouter',
      rawCount: imageEntries.length || images.length,
    };
    */
  } catch (error) {
    const billingMessage = mapInsufficientCreditsError(error);
    if (billingMessage) {
      throw new Error(billingMessage);
    }
    throw new Error(mapImageGenerationError(error));
  }
}

export async function generateImageAI(
  prompt: string,
  model: string = DOUBAO_5_IMAGE_MODEL,
  referenceImages: string[] = [],
  options?: GenerateImageAIOptions
): Promise<GenerateImageAIResult> {
  const cleanPrompt = prompt.trim();
  if (!cleanPrompt) {
    throw new Error('提示词不能为空。');
  }
  const enhanced = enhanceImageGenerationOptions(cleanPrompt, referenceImages, options);

  if (isOpenRouterImageModel(model || '')) {
    return generateOpenRouterImage(enhanced.prompt, model, referenceImages, enhanced.options);
  }

  return generateDoubaoImage(enhanced.prompt, model, referenceImages, enhanced.options);
}

export async function generateVideoAI(
  prompt: string,
  referenceImages: string[] = []
): Promise<GenerateVideoTaskResult> {
  const cleanPrompt = prompt.trim();
  if (!cleanPrompt) {
    throw new Error('视频生成提示词不能为空。');
  }

  const doubaoConfig = resolveDoubaoChatConfig();
  if (!doubaoConfig.apiKey) {
    throw new Error('未配置豆包视频能力，请先在模型设置页配置豆包 API Key。');
  }

  const refs = await prepareReferenceImagesForProxy(referenceImages);
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
        const payload = await postJSON(path, body, doubaoConfig);
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

  const doubaoConfig = resolveDoubaoChatConfig();
  if (!doubaoConfig.apiKey) {
    throw new Error('未配置豆包视频能力，请先在模型设置页配置豆包 API Key。');
  }

  const pathCandidates = [`/videos/generations/${cleanTaskId}`, `/videos/${cleanTaskId}`];
  let lastError: Error | null = null;

  for (const path of pathCandidates) {
    try {
      const payload = await getJSON(path, doubaoConfig);
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
