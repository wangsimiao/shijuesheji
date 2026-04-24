/// <reference types="vite/client" />

import { getModelSettings } from '../store';
import {
  DOUBAO_5_IMAGE_MODEL,
  OPENROUTER_GPT_IMAGE_MODEL,
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
  apiBaseUrl: string;
  apiKey: string;
  headers?: Record<string, string>;
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

export type GenerateImageAIOptions = {
  systemPrompt?: string;
  outputCount?: number;
  sizeHint?: string;
};

export type GenerateImageAIResult = {
  images: string[];
  provider: ImageModelProvider;
  rawCount: number;
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
const OPENROUTER_DEFAULT_API_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_CHAT_MODEL = (
  import.meta.env.VITE_DOUBAO_CHAT_MODEL || 'doubao-seed-1-8-251228'
).trim();
const DEFAULT_VIDEO_MODEL = () => (import.meta.env.VITE_DOUBAO_VIDEO_MODEL || '').trim();

const DEFAULT_SYSTEM_PROMPT = `
你是“电商AI”设计助手，请始终使用中文回复。
当用户明确要求“生成图片/出图/改图/图生图”时，优先触发 generateImage 工具。
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

const DOUBAO_REFERENCE_IMAGE_MAX_COUNT = 14;
const DOUBAO_REFERENCE_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const DOUBAO_REFERENCE_IMAGE_MAX_PIXELS = 36_000_000;
const DOUBAO_REFERENCE_IMAGE_MIN_EDGE = 14;
const DOUBAO_REFERENCE_IMAGE_MAX_RATIO = 16;
const GROUP_OUTPUT_DEFAULT_COUNT = 4;
const GROUP_OUTPUT_MIN_COUNT = 2;
const GROUP_OUTPUT_MAX_COUNT = 4;

const SIZE_RATIO_MAP: Record<string, string> = {
  '1:1': '2048x2048',
  '4:3': '2048x1536',
  '3:4': '1536x2048',
  '16:9': '2048x1152',
  '9:16': '1152x2048',
};

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
        description: 'Optional output count for grouped generation, supports 2~4.',
      },
      sizeHint: {
        type: 'string',
        description: 'Optional explicit size hint, e.g. 2K / 2048x1536 / 16:9.',
      },
    },
    required: ['prompt'],
  },
};

function isOpenRouterImageModel(model: string) {
  return model.trim() === OPENROUTER_GPT_IMAGE_MODEL;
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
  return {
    provider: 'openrouter',
    apiBaseUrl: (provider.apiBaseUrl || OPENROUTER_DEFAULT_API_BASE_URL).trim() || OPENROUTER_DEFAULT_API_BASE_URL,
    apiKey: (provider.apiKey || '').trim(),
    imageModel: (provider.imageModel || OPENROUTER_GPT_IMAGE_MODEL).trim() || OPENROUTER_GPT_IMAGE_MODEL,
  };
}

function resolveImageProviderConfig(model: string): ImageProviderConfig {
  return isOpenRouterImageModel(model) ? resolveOpenRouterImageConfig() : resolveDoubaoImageConfig();
}

function resolveDoubaoChatConfig() {
  const config = resolveDoubaoImageConfig();
  return {
    apiBaseUrl: config.apiBaseUrl,
    apiKey: config.apiKey,
  };
}

export function isDoubaoConfigured() {
  return Boolean(resolveDoubaoChatConfig().apiKey);
}

export function isDoubaoVideoConfigured() {
  return Boolean(resolveDoubaoChatConfig().apiKey && DEFAULT_VIDEO_MODEL());
}

export function isImageModelConfigured(model: string) {
  const config = resolveImageProviderConfig(model || DOUBAO_5_IMAGE_MODEL);
  return Boolean(config.apiBaseUrl && config.apiKey);
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
    `请求失败（HTTP ${status}）`;
  return String(message);
}

async function postJSON(path: string, body: Record<string, unknown>, config: RequestConfig) {
  const response = await fetch(`${config.apiBaseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
      ...(config.headers || {}),
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(readErrorMessage(payload, response.status));
  }
  return payload;
}

async function getJSON(path: string, config: RequestConfig) {
  const response = await fetch(`${config.apiBaseUrl}${path}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      ...(config.headers || {}),
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

function parseExplicitSize(prompt: string, sizeHint?: string) {
  if (typeof sizeHint === 'string' && sizeHint.trim()) {
    const normalizedFromHint = normalizeSizeToken(sizeHint);
    if (normalizedFromHint) return normalizedFromHint;
  }
  return normalizeSizeToken(prompt);
}

function resolveImageGenerationIntent(
  prompt: string,
  options?: { outputCount?: number; sizeHint?: string }
): ImageGenerationIntent {
  const promptOutputCount = parseOutputCountFromPrompt(prompt);
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
  if (shouldGenerateImage(userMessage, attachedImages)) {
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
  if (!doubaoConfig.apiKey) {
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
    // 仅在用户明确要求尺寸时透传
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
  if (!config.apiKey) {
    throw new Error(getResolvedImageModelConfigurationMessage(model));
  }

  const refs = referenceImages.filter(Boolean);
  try {
    await validateDoubaoReferenceImages(refs);
    const resolvedModel = (model || config.imageModel).trim();
    const payload = await postJSON(
      '/images/generations',
      buildDoubaoImagePayload(prompt, resolvedModel, refs, options),
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
    throw new Error(mapImageGenerationError(error));
  }
}

async function generateOpenRouterImage(
  prompt: string,
  model: string,
  referenceImages: string[],
  options?: GenerateImageAIOptions
): Promise<GenerateImageAIResult> {
  const config = resolveOpenRouterImageConfig();
  if (!config.apiKey) {
    throw new Error(getResolvedImageModelConfigurationMessage(model));
  }

  const refs = referenceImages.filter(Boolean);
  const userContent = refs.length
    ? [
        { type: 'text', text: prompt } as ChatContentPart,
        ...refs.map(
          (image) =>
            ({
              type: 'image_url',
              image_url: { url: image },
            }) satisfies ChatContentPart
        ),
      ]
    : prompt;

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
    const payload = await postJSON(
      '/chat/completions',
      {
        model: (model || config.imageModel).trim(),
        messages,
        modalities: ['image', 'text'],
        stream: false,
      },
      {
        apiBaseUrl: config.apiBaseUrl,
        apiKey: config.apiKey,
        headers: getOpenRouterHeaders(),
      }
    );

    const imageEntries = Array.isArray(payload?.choices?.[0]?.message?.images)
      ? payload.choices[0].message.images
      : [];
    const images: string[] = [];

    for (const imageEntry of imageEntries) {
      const imageUrl = imageEntry?.image_url?.url;
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
  } catch (error) {
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

  if (isOpenRouterImageModel(model || '')) {
    return generateOpenRouterImage(cleanPrompt, model, referenceImages, options);
  }

  return generateDoubaoImage(cleanPrompt, model, referenceImages, options);
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
