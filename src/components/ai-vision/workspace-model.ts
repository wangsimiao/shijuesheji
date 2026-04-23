import type { SyntheticEvent, WheelEvent } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type {
  AiVisionSceneTab,
  CanvasItem,
  CanvasPoint,
  ChatSession,
  Project,
  ViewState,
} from '../../types';

export type ToolMode = 'select' | 'draw' | 'text' | 'shape';
export type ActionPopoverType = 'regenerate' | 'video';
export type CropAspect = 'freeform' | '1:1' | '4:3' | '16:9';
export type SceneTab = AiVisionSceneTab;

export type ActionPopoverState = {
  type: ActionPopoverType;
  itemId: string;
  prompt: string;
  isSubmitting: boolean;
};

export type CropState = {
  itemId: string;
  aspect: CropAspect;
  freeWidth: number;
  freeHeight: number;
  uniformSize: number;
  offsetX: number;
  offsetY: number;
  isSubmitting: boolean;
};

export type WorkspaceSnapshot = {
  boardName: string;
  items: CanvasItem[];
  sessions: ChatSession[];
  currentSessionId: string;
  view: ViewState;
  selectedImageModel: string;
  sceneBySessionId: Record<string, SceneTab>;
};

export type ViewportSize = {
  width: number;
  height: number;
};

type PanInteraction = {
  type: 'pan';
  startClientX: number;
  startClientY: number;
  originX: number;
  originY: number;
};

type DragInteraction = {
  type: 'drag';
  itemId: string;
  startClientX: number;
  startClientY: number;
  originX: number;
  originY: number;
  scale: number;
};

type DrawInteraction = {
  type: 'draw';
  points: CanvasPoint[];
};

export type InteractionState = PanInteraction | DragInteraction | DrawInteraction | null;

export type MediaDimensions = {
  width: number;
  height: number;
};

export type CropRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type ImageModelOption = {
  value: string;
  label: string;
};

export type SceneTabOption = {
  value: SceneTab;
  label: string;
};

export const LEGACY_AI_VISION_STORAGE_KEY = 'ai_visual_workspace_v1';
export const DEFAULT_BOARD_NAME = 'AI视觉';
export const DEFAULT_VIEW: ViewState = {
  x: 160,
  y: 120,
  scale: 1,
  selectedItemIds: [],
};
export const DEFAULT_VIEWPORT: ViewportSize = {
  width: 1280,
  height: 720,
};
export const CHAT_IMAGE_LIMIT = 4;
export const DEFAULT_SCENE_TAB: SceneTab = 'general';
export const DRAW_STROKE_COLOR = '#f2f5fb';
export const DRAW_STROKE_WIDTH = 4;
export const FIT_VIEW_PADDING = 120;
export const MIN_SCALE = 0.35;
export const MAX_SCALE = 2.4;
export const CANVAS_WHEEL_LOCK_MS = 220;
export const CANVAS_ZOOM_STEP = 1.12;
export const VIDEO_DISABLED_REASON = '缺少视频模型 ID，待补充后启用。';
export const IMAGE_MODEL_OPTIONS: ImageModelOption[] = [
  {
    value: 'doubao-seedream-5-0-260128',
    label: '豆包5.0',
  },
];
export const DEFAULT_IMAGE_MODEL_OPTION = IMAGE_MODEL_OPTIONS[0];
export const SCENE_TAB_OPTIONS: SceneTabOption[] = [
  { value: 'general', label: '通用' },
  { value: 'main_image', label: '主图' },
  { value: 'detail_image', label: '详情' },
  { value: 'buyer_show', label: '买家秀' },
];

export function createEmptySession(): ChatSession {
  return {
    id: uuidv4(),
    title: '新对话',
    messages: [],
    createdAt: Date.now(),
  };
}

export function normalizeSceneTab(value: unknown): SceneTab {
  if (value === 'main_image' || value === 'detail_image' || value === 'buyer_show') {
    return value;
  }
  return DEFAULT_SCENE_TAB;
}

export function getSceneTabLabel(scene: SceneTab) {
  return SCENE_TAB_OPTIONS.find((item) => item.value === scene)?.label || SCENE_TAB_OPTIONS[0].label;
}

export function buildSceneAwarePrompt(scene: SceneTab, text: string) {
  return `当前创作场景：${getSceneTabLabel(scene)}\n${text}`.trim();
}

export function getDefaultSceneBySessionId(
  sessions: ChatSession[],
  previous?: Record<string, SceneTab> | null
) {
  const next: Record<string, SceneTab> = {};
  for (const session of sessions) {
    next[session.id] = normalizeSceneTab(previous?.[session.id]);
  }
  return next;
}

export function normalizeImageModel(value: unknown) {
  if (typeof value !== 'string') return DEFAULT_IMAGE_MODEL_OPTION.value;
  return IMAGE_MODEL_OPTIONS.some((option) => option.value === value)
    ? value
    : DEFAULT_IMAGE_MODEL_OPTION.value;
}

export function normalizeView(view?: Partial<ViewState> | null): ViewState {
  const selectedItemIds = Array.isArray(view?.selectedItemIds)
    ? view.selectedItemIds.filter((itemId): itemId is string => typeof itemId === 'string')
    : typeof view?.selectedItemId === 'string' && view.selectedItemId
      ? [view.selectedItemId]
      : [];

  return {
    x: typeof view?.x === 'number' ? view.x : DEFAULT_VIEW.x,
    y: typeof view?.y === 'number' ? view.y : DEFAULT_VIEW.y,
    scale:
      typeof view?.scale === 'number' && Number.isFinite(view.scale)
        ? clamp(view.scale, MIN_SCALE, MAX_SCALE)
        : DEFAULT_VIEW.scale,
    selectedItemIds,
  };
}

export function normalizeItem(item: unknown): CanvasItem | null {
  if (!item || typeof item !== 'object') return null;
  const candidate = item as Partial<CanvasItem>;
  if (typeof candidate.id !== 'string') return null;
  if (typeof candidate.type !== 'string') return null;
  if (
    typeof candidate.x !== 'number' ||
    typeof candidate.y !== 'number' ||
    typeof candidate.width !== 'number' ||
    typeof candidate.height !== 'number' ||
    typeof candidate.content !== 'string'
  ) {
    return null;
  }

  const normalizedType = candidate.type as CanvasItem['type'];
  if (!['image', 'video', 'text', 'drawing', 'shape', 'loading'].includes(normalizedType)) {
    return null;
  }

  const points = Array.isArray(candidate.points)
    ? candidate.points
        .filter(
          (point): point is CanvasPoint =>
            Boolean(point) &&
            typeof point === 'object' &&
            typeof (point as CanvasPoint).x === 'number' &&
            typeof (point as CanvasPoint).y === 'number'
        )
        .map((point) => ({ x: point.x, y: point.y }))
    : undefined;

  return {
    id: candidate.id,
    type: normalizedType,
    x: candidate.x,
    y: candidate.y,
    width: Math.max(20, candidate.width),
    height: Math.max(20, candidate.height),
    content: candidate.content,
    prompt: typeof candidate.prompt === 'string' ? candidate.prompt : undefined,
    mimeType: typeof candidate.mimeType === 'string' ? candidate.mimeType : undefined,
    sourceKind:
      candidate.sourceKind === 'uploaded' || candidate.sourceKind === 'generated'
        ? candidate.sourceKind
        : undefined,
    points,
    strokeColor: typeof candidate.strokeColor === 'string' ? candidate.strokeColor : undefined,
    strokeWidth: typeof candidate.strokeWidth === 'number' ? candidate.strokeWidth : undefined,
    shapeType: candidate.shapeType === 'rect' ? 'rect' : undefined,
  };
}

export function createDefaultWorkspaceSnapshot(name = DEFAULT_BOARD_NAME): WorkspaceSnapshot {
  const session = createEmptySession();
  return {
    boardName: name,
    items: [],
    sessions: [session],
    currentSessionId: session.id,
    view: { ...DEFAULT_VIEW },
    selectedImageModel: DEFAULT_IMAGE_MODEL_OPTION.value,
    sceneBySessionId: { [session.id]: DEFAULT_SCENE_TAB },
  };
}

export function parseLegacyWorkspaceSnapshot(raw: string | null | undefined): WorkspaceSnapshot | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<WorkspaceSnapshot>;
    const sessions =
      Array.isArray(parsed.sessions) && parsed.sessions.length > 0
        ? parsed.sessions
            .filter((session): session is ChatSession => {
              return (
                Boolean(session) &&
                typeof session === 'object' &&
                typeof session.id === 'string' &&
                typeof session.title === 'string' &&
                Array.isArray(session.messages) &&
                typeof session.createdAt === 'number'
              );
            })
            .map((session) => ({
              ...session,
              messages: session.messages.filter((message) => {
                return (
                  Boolean(message) &&
                  typeof message === 'object' &&
                  typeof message.id === 'string' &&
                  (message.role === 'user' || message.role === 'assistant' || message.role === 'system') &&
                  typeof message.content === 'string'
                );
              }),
            }))
        : [createEmptySession()];

    const currentSessionId = sessions.some((session) => session.id === parsed.currentSessionId)
      ? String(parsed.currentSessionId)
      : sessions[0].id;

    return {
      boardName:
        typeof parsed.boardName === 'string' && parsed.boardName.trim()
          ? parsed.boardName
          : DEFAULT_BOARD_NAME,
      items: Array.isArray(parsed.items)
        ? parsed.items.map((item) => normalizeItem(item)).filter((item): item is CanvasItem => Boolean(item))
        : [],
      sessions,
      currentSessionId,
      view: normalizeView(parsed.view),
      selectedImageModel: normalizeImageModel(parsed.selectedImageModel),
      sceneBySessionId: getDefaultSceneBySessionId(
        sessions,
        parsed.sceneBySessionId && typeof parsed.sceneBySessionId === 'object'
          ? parsed.sceneBySessionId
          : undefined
      ),
    };
  } catch {
    return null;
  }
}

export function createWorkspaceSnapshotFromProject(project: Project): WorkspaceSnapshot {
  const sessions =
    Array.isArray(project.sessions) && project.sessions.length > 0
      ? project.sessions
      : [createEmptySession()];
  const currentSessionId = sessions.some((session) => session.id === project.currentSessionId)
    ? String(project.currentSessionId)
    : sessions[0].id;

  return {
    boardName: project.name?.trim() || DEFAULT_BOARD_NAME,
    items: Array.isArray(project.items)
      ? project.items.map((item) => normalizeItem(item)).filter((item): item is CanvasItem => Boolean(item))
      : [],
    sessions,
    currentSessionId,
    view: normalizeView(project.view),
    selectedImageModel: normalizeImageModel(project.selectedImageModel),
    sceneBySessionId: getDefaultSceneBySessionId(sessions, project.sceneBySessionId),
  };
}

export function buildProjectFromWorkspace(project: Project, snapshot: WorkspaceSnapshot): Project {
  return {
    ...project,
    name: snapshot.boardName.trim() || DEFAULT_BOARD_NAME,
    items: snapshot.items,
    sessions: snapshot.sessions,
    currentSessionId: snapshot.currentSessionId,
    view: snapshot.view,
    selectedImageModel: snapshot.selectedImageModel,
    sceneBySessionId: snapshot.sceneBySessionId,
    updatedAt: Date.now(),
  };
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function sanitizeFilename(value: string) {
  return value.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function getDisplayFilename(item: CanvasItem) {
  return sanitizeFilename(item.prompt || '') || `ai-vision-${Date.now()}`;
}

export function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('读取文件失败。'));
    reader.readAsDataURL(file);
  });
}

export function loadImageDimensions(src: string) {
  return new Promise<MediaDimensions>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      resolve({
        width: image.naturalWidth || 1024,
        height: image.naturalHeight || 1024,
      });
    };
    image.onerror = () => reject(new Error('读取图片尺寸失败。'));
    image.src = src;
  });
}

export function loadVideoDimensions(src: string) {
  return new Promise<MediaDimensions>((resolve, reject) => {
    const video = document.createElement('video');
    const cleanup = () => {
      video.pause();
      video.removeAttribute('src');
      video.load();
    };

    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      const width = video.videoWidth || 1280;
      const height = video.videoHeight || 720;
      cleanup();
      resolve({ width, height });
    };
    video.onerror = () => {
      cleanup();
      reject(new Error('读取视频尺寸失败。'));
    };
    video.src = src;
  });
}

export function fitIntoBounds(width: number, height: number, maxWidth: number, maxHeight: number) {
  const ratio = Math.min(maxWidth / Math.max(width, 1), maxHeight / Math.max(height, 1), 1);
  return {
    width: Math.max(48, Math.round(width * ratio)),
    height: Math.max(48, Math.round(height * ratio)),
  };
}

export function getViewportCenterPosition(
  view: ViewState,
  viewport: ViewportSize,
  width: number,
  height: number
) {
  return {
    x: (-view.x + viewport.width / 2) / view.scale - width / 2,
    y: (-view.y + viewport.height / 2) / view.scale - height / 2,
  };
}

export function createAvoidOverlapPosition(
  items: CanvasItem[],
  view: ViewState,
  viewport: ViewportSize,
  width: number,
  height: number,
  preferred?: { x: number; y: number }
) {
  const base = preferred || getViewportCenterPosition(view, viewport, width, height);
  const step = 36;
  for (let index = 0; index < 80; index += 1) {
    const candidate = {
      x: base.x + index * step,
      y: base.y + index * step,
    };
    const overlaps = items.some((item) => {
      return (
        candidate.x < item.x + item.width + 24 &&
        candidate.x + width + 24 > item.x &&
        candidate.y < item.y + item.height + 24 &&
        candidate.y + height + 24 > item.y
      );
    });
    if (!overlaps) return candidate;
  }
  return base;
}

export function getClientToWorldPoint(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  view: ViewState
) {
  return {
    x: (clientX - rect.left - view.x) / view.scale,
    y: (clientY - rect.top - view.y) / view.scale,
  };
}

export function buildDrawingFrame(points: CanvasPoint[], strokeWidth: number): CanvasItem | null {
  if (points.length < 2) return null;

  let minX = points[0].x;
  let minY = points[0].y;
  let maxX = points[0].x;
  let maxY = points[0].y;

  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  const padding = strokeWidth * 1.5;
  const normalizedPoints = points.map((point) => ({
    x: point.x - minX + padding,
    y: point.y - minY + padding,
  }));

  return {
    id: uuidv4(),
    type: 'drawing',
    x: minX - padding,
    y: minY - padding,
    width: Math.max(20, maxX - minX + padding * 2),
    height: Math.max(20, maxY - minY + padding * 2),
    content: 'drawing',
    points: normalizedPoints,
    strokeColor: DRAW_STROKE_COLOR,
    strokeWidth,
  };
}

export function getAspectRatio(aspect: CropAspect) {
  switch (aspect) {
    case '1:1':
      return 1;
    case '4:3':
      return 4 / 3;
    case '16:9':
      return 16 / 9;
    default:
      return null;
  }
}

export function getCropRect(naturalWidth: number, naturalHeight: number, state: CropState): CropRect {
  if (state.aspect === 'freeform') {
    const width = Math.max(1, naturalWidth * clamp(state.freeWidth / 100, 0.1, 1));
    const height = Math.max(1, naturalHeight * clamp(state.freeHeight / 100, 0.1, 1));
    const maxLeft = Math.max(0, naturalWidth - width);
    const maxTop = Math.max(0, naturalHeight - height);

    return {
      left: maxLeft * (state.offsetX / 100),
      top: maxTop * (state.offsetY / 100),
      width,
      height,
    };
  }

  const fixedRatio = getAspectRatio(state.aspect) || 1;
  let maxWidth = naturalWidth;
  let maxHeight = naturalWidth / fixedRatio;

  if (maxHeight > naturalHeight) {
    maxHeight = naturalHeight;
    maxWidth = maxHeight * fixedRatio;
  }

  const scale = clamp(state.uniformSize / 100, 0.12, 1);
  const width = Math.max(1, maxWidth * scale);
  const height = Math.max(1, maxHeight * scale);
  const maxLeft = Math.max(0, naturalWidth - width);
  const maxTop = Math.max(0, naturalHeight - height);

  return {
    left: maxLeft * (state.offsetX / 100),
    top: maxTop * (state.offsetY / 100),
    width,
    height,
  };
}

export function cropImageSource(src: string, rect: CropRect, mimeType = 'image/png') {
  return new Promise<string>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(rect.width));
      canvas.height = Math.max(1, Math.round(rect.height));
      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('裁剪失败，无法创建画布。'));
        return;
      }

      context.drawImage(
        image,
        rect.left,
        rect.top,
        rect.width,
        rect.height,
        0,
        0,
        canvas.width,
        canvas.height
      );

      const dataUrl = canvas.toDataURL(mimeType === 'image/jpeg' ? 'image/jpeg' : 'image/png', 0.92);
      resolve(dataUrl);
    };
    image.onerror = () => reject(new Error('裁剪失败，图片加载异常。'));
    image.src = src;
  });
}

export async function downloadAsset(url: string, fileName: string) {
  if (url.startsWith('data:')) {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    return;
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`下载失败（HTTP ${response.status}）。`);
  }
  const blob = await response.blob();
  const objectUrl = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.click();
  window.URL.revokeObjectURL(objectUrl);
}

export function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') return true;
  return Boolean(target.closest('[contenteditable="true"]'));
}

export function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function stopCanvasToolbarEvent(event: SyntheticEvent) {
  event.stopPropagation();
}

export function stopCanvasToolbarWheel(event: WheelEvent) {
  event.preventDefault();
  event.stopPropagation();
}
