import type { SyntheticEvent, WheelEvent } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type {
  AiVisionSceneTab,
  CanvasCrop,
  CanvasItem,
  CanvasPoint,
  ChatSession,
  Project,
  ViewState,
} from '../../types';

export type ToolMode = 'select' | 'draw' | 'line' | 'text' | 'shape';
export type ActionPopoverType = 'regenerate';
export type CropAspect = 'freeform' | '1:1' | '4:3' | '16:9';
export type SceneTab = AiVisionSceneTab;
export type ResizeHandle = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';

export type ActionPopoverState = {
  type: ActionPopoverType;
  itemId: string;
  prompt: string;
  isSubmitting: boolean;
};

export type CropState = {
  itemId: string;
  aspect: CropAspect;
  rect: CanvasCrop;
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

type LineCreateInteraction = {
  type: 'line-create';
  startPoint: CanvasPoint;
  currentPoint: CanvasPoint;
};

type ResizeInteraction = {
  type: 'resize';
  itemId: string;
  handle: ResizeHandle;
  startClientX: number;
  startClientY: number;
  originX: number;
  originY: number;
  originWidth: number;
  originHeight: number;
  scale: number;
  minWidth: number;
  minHeight: number;
};

type LineEndpointInteraction = {
  type: 'line-endpoint';
  itemId: string;
  endpointIndex: 0 | 1;
  startClientX: number;
  startClientY: number;
  scale: number;
  startPoints: [CanvasPoint, CanvasPoint];
};

type CropMoveInteraction = {
  type: 'crop-move';
  itemId: string;
  startClientX: number;
  startClientY: number;
  startRect: CanvasCrop;
  itemWidth: number;
  itemHeight: number;
  scale: number;
};

type CropResizeInteraction = {
  type: 'crop-resize';
  itemId: string;
  handle: ResizeHandle;
  startClientX: number;
  startClientY: number;
  startRect: CanvasCrop;
  itemWidth: number;
  itemHeight: number;
  scale: number;
  aspect: CropAspect;
};

export type InteractionState =
  | PanInteraction
  | DragInteraction
  | DrawInteraction
  | LineCreateInteraction
  | ResizeInteraction
  | LineEndpointInteraction
  | CropMoveInteraction
  | CropResizeInteraction
  | null;

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

export const DOUBAO_5_IMAGE_MODEL = 'doubao-seedream-5-0-260128';
export const OPENROUTER_GPT_IMAGE_MODEL = 'openai/gpt-5.4-image-2';

export const LEGACY_AI_VISION_STORAGE_KEY = 'ai_visual_workspace_v1';
export const DEFAULT_BOARD_NAME = 'AI 视觉';
export const WORKSPACE_HEADER_HEIGHT = 62;
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
export const DEFAULT_LINE_COLOR = '#f2f5fb';
export const DEFAULT_SHAPE_FILL = '#d8deea';
export const DEFAULT_SHAPE_STROKE = '#d9dfec';
export const DEFAULT_SHAPE_STROKE_WIDTH = 2;
export const DEFAULT_TEXT_COLOR = '#f4f7fb';
export const DEFAULT_TEXT_FONT_SIZE = 28;
export const DEFAULT_TEXT_FONT_WEIGHT = 600;
export const DEFAULT_TEXT_ALIGN: NonNullable<CanvasItem['textAlign']> = 'left';
export const DEFAULT_CROP_RECT: CanvasCrop = {
  x: 0,
  y: 0,
  width: 1,
  height: 1,
};
export const CROP_MIN_SIZE = 0.1;
export const FIT_VIEW_PADDING = 120;
export const MIN_SCALE = 0.35;
export const MAX_SCALE = 2.4;
export const CANVAS_WHEEL_LOCK_MS = 220;
export const CANVAS_ZOOM_STEP = 1.12;
export const IMAGE_MODEL_OPTIONS: ImageModelOption[] = [
  {
    value: 'doubao-seedream-5-0-260128',
    label: '豆包 5.0',
  },
];
IMAGE_MODEL_OPTIONS.splice(
  0,
  IMAGE_MODEL_OPTIONS.length,
  {
    value: OPENROUTER_GPT_IMAGE_MODEL,
    label: 'GPT 5.4 Image 2',
  },
  {
    value: DOUBAO_5_IMAGE_MODEL,
    label: '豆包 5.0',
  }
);
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

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function normalizeCrop(candidate: unknown): CanvasCrop | undefined {
  if (!candidate || typeof candidate !== 'object') return undefined;
  const crop = candidate as Partial<CanvasCrop>;
  if (
    typeof crop.x !== 'number' ||
    typeof crop.y !== 'number' ||
    typeof crop.width !== 'number' ||
    typeof crop.height !== 'number'
  ) {
    return undefined;
  }

  const next: CanvasCrop = {
    x: clamp(crop.x, 0, 1),
    y: clamp(crop.y, 0, 1),
    width: clamp(crop.width, CROP_MIN_SIZE, 1),
    height: clamp(crop.height, CROP_MIN_SIZE, 1),
  };

  if (next.x + next.width > 1) {
    next.width = Math.max(CROP_MIN_SIZE, 1 - next.x);
  }
  if (next.y + next.height > 1) {
    next.height = Math.max(CROP_MIN_SIZE, 1 - next.y);
  }

  const isFull =
    Math.abs(next.x) < 0.0001 &&
    Math.abs(next.y) < 0.0001 &&
    Math.abs(next.width - 1) < 0.0001 &&
    Math.abs(next.height - 1) < 0.0001;

  return isFull ? undefined : next;
}

function normalizePoints(candidate: unknown): CanvasPoint[] | undefined {
  if (!Array.isArray(candidate)) return undefined;
  const points = candidate
    .filter(
      (point): point is CanvasPoint =>
        Boolean(point) &&
        typeof point === 'object' &&
        typeof (point as CanvasPoint).x === 'number' &&
        typeof (point as CanvasPoint).y === 'number'
    )
    .map((point) => ({ x: point.x, y: point.y }));
  return points.length ? points : undefined;
}

function getItemMinWidth(type: CanvasItem['type']) {
  if (type === 'line') return 2;
  if (type === 'text') return 96;
  return 20;
}

function getItemMinHeight(type: CanvasItem['type']) {
  if (type === 'line') return 2;
  if (type === 'text') return 40;
  return 20;
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
  if (!['image', 'video', 'text', 'drawing', 'shape', 'line', 'loading'].includes(normalizedType)) {
    return null;
  }

  const width = Math.max(getItemMinWidth(normalizedType), candidate.width);
  const height = Math.max(getItemMinHeight(normalizedType), candidate.height);
  const crop = normalizeCrop(candidate.crop);
  const points = normalizePoints(candidate.points);

  return {
    id: candidate.id,
    type: normalizedType,
    x: candidate.x,
    y: candidate.y,
    width,
    height,
    content: candidate.content,
    prompt: typeof candidate.prompt === 'string' ? candidate.prompt : undefined,
    mimeType: typeof candidate.mimeType === 'string' ? candidate.mimeType : undefined,
    sourceKind:
      candidate.sourceKind === 'uploaded' || candidate.sourceKind === 'generated'
        ? candidate.sourceKind
        : undefined,
    points,
    strokeColor:
      typeof candidate.strokeColor === 'string'
        ? candidate.strokeColor
        : normalizedType === 'shape'
          ? DEFAULT_SHAPE_STROKE
          : normalizedType === 'line' || normalizedType === 'drawing'
            ? DEFAULT_LINE_COLOR
            : undefined,
    strokeWidth:
      typeof candidate.strokeWidth === 'number'
        ? candidate.strokeWidth
        : normalizedType === 'shape'
          ? DEFAULT_SHAPE_STROKE_WIDTH
          : normalizedType === 'line' || normalizedType === 'drawing'
            ? DRAW_STROKE_WIDTH
            : undefined,
    shapeType: candidate.shapeType === 'rect' ? 'rect' : normalizedType === 'shape' ? 'rect' : undefined,
    fillColor:
      typeof candidate.fillColor === 'string'
        ? candidate.fillColor
        : normalizedType === 'shape'
          ? DEFAULT_SHAPE_FILL
          : undefined,
    crop,
    fontSize:
      typeof candidate.fontSize === 'number' && Number.isFinite(candidate.fontSize)
        ? clamp(candidate.fontSize, 12, 120)
        : normalizedType === 'text'
          ? DEFAULT_TEXT_FONT_SIZE
          : undefined,
    fontWeight:
      typeof candidate.fontWeight === 'number' && Number.isFinite(candidate.fontWeight)
        ? clamp(Math.round(candidate.fontWeight), 400, 800)
        : normalizedType === 'text'
          ? DEFAULT_TEXT_FONT_WEIGHT
          : undefined,
    color:
      typeof candidate.color === 'string'
        ? candidate.color
        : normalizedType === 'text'
          ? DEFAULT_TEXT_COLOR
          : undefined,
    textAlign:
      candidate.textAlign === 'left' || candidate.textAlign === 'center' || candidate.textAlign === 'right'
        ? candidate.textAlign
        : normalizedType === 'text'
          ? DEFAULT_TEXT_ALIGN
          : undefined,
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

export function createLineItem(startPoint: CanvasPoint, endPoint: CanvasPoint): CanvasItem {
  const minX = Math.min(startPoint.x, endPoint.x);
  const minY = Math.min(startPoint.y, endPoint.y);
  const maxX = Math.max(startPoint.x, endPoint.x);
  const maxY = Math.max(startPoint.y, endPoint.y);

  return {
    id: uuidv4(),
    type: 'line',
    x: minX,
    y: minY,
    width: Math.max(2, maxX - minX),
    height: Math.max(2, maxY - minY),
    content: 'line',
    points: [
      { x: startPoint.x - minX, y: startPoint.y - minY },
      { x: endPoint.x - minX, y: endPoint.y - minY },
    ],
    strokeColor: DEFAULT_LINE_COLOR,
    strokeWidth: DRAW_STROKE_WIDTH,
  };
}

export function getLineAbsolutePoints(item: CanvasItem): [CanvasPoint, CanvasPoint] {
  const points = item.points || [
    { x: 0, y: 0 },
    { x: item.width, y: item.height },
  ];
  const first = points[0] || { x: 0, y: 0 };
  const second = points[1] || { x: item.width, y: item.height };
  return [
    { x: item.x + first.x, y: item.y + first.y },
    { x: item.x + second.x, y: item.y + second.y },
  ];
}

export function updateLineEndpoint(
  item: CanvasItem,
  endpointIndex: 0 | 1,
  nextPoint: CanvasPoint
): CanvasItem {
  const [startPoint, endPoint] = getLineAbsolutePoints(item);
  const absolutePoints: [CanvasPoint, CanvasPoint] =
    endpointIndex === 0 ? [nextPoint, endPoint] : [startPoint, nextPoint];

  const nextLine = createLineItem(absolutePoints[0], absolutePoints[1]);
  return {
    ...item,
    x: nextLine.x,
    y: nextLine.y,
    width: nextLine.width,
    height: nextLine.height,
    points: nextLine.points,
  };
}

function getLineRows(content: string) {
  return content.replace(/\r/g, '').split('\n');
}

export function measureTextItemBox(
  content: string,
  options?: Pick<CanvasItem, 'fontSize' | 'fontWeight'>
) {
  const fontSize = options?.fontSize || DEFAULT_TEXT_FONT_SIZE;
  const fontWeight = options?.fontWeight || DEFAULT_TEXT_FONT_WEIGHT;
  const rows = getLineRows(content || '文字');

  if (typeof document === 'undefined') {
    return {
      width: 180,
      height: Math.max(48, rows.length * Math.round(fontSize * 1.5)),
    };
  }

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) {
    return {
      width: 180,
      height: Math.max(48, rows.length * Math.round(fontSize * 1.5)),
    };
  }

  context.font = `${fontWeight} ${fontSize}px "PingFang SC", "Microsoft YaHei", sans-serif`;
  const maxLineWidth = rows.reduce((maxWidth, row) => {
    const width = context.measureText(row || ' ').width;
    return Math.max(maxWidth, width);
  }, 0);

  return {
    width: clamp(Math.ceil(maxLineWidth + fontSize * 0.8), 120, 420),
    height: Math.max(48, Math.ceil(rows.length * fontSize * 1.45 + fontSize * 0.3)),
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

export function getCommittedCrop(baseCrop: CanvasCrop | undefined, localCrop: CanvasCrop): CanvasCrop {
  const base = baseCrop || DEFAULT_CROP_RECT;
  return normalizeCrop({
    x: base.x + localCrop.x * base.width,
    y: base.y + localCrop.y * base.height,
    width: base.width * localCrop.width,
    height: base.height * localCrop.height,
  }) || DEFAULT_CROP_RECT;
}

export function getCropRect(
  naturalWidth: number,
  naturalHeight: number,
  crop?: CanvasCrop | null
): CropRect {
  const safeCrop = crop || DEFAULT_CROP_RECT;
  return {
    left: naturalWidth * safeCrop.x,
    top: naturalHeight * safeCrop.y,
    width: naturalWidth * safeCrop.width,
    height: naturalHeight * safeCrop.height,
  };
}

export function getRenderedImageStyle(crop?: CanvasCrop) {
  const safeCrop = crop || DEFAULT_CROP_RECT;
  return {
    width: `${100 / safeCrop.width}%`,
    height: `${100 / safeCrop.height}%`,
    left: `${(-safeCrop.x / safeCrop.width) * 100}%`,
    top: `${(-safeCrop.y / safeCrop.height) * 100}%`,
  };
}

export function createInitialCropState(itemId: string): CropState {
  return {
    itemId,
    aspect: 'freeform',
    rect: { ...DEFAULT_CROP_RECT },
  };
}

export function moveCropRect(startRect: CanvasCrop, deltaX: number, deltaY: number) {
  const next = {
    ...startRect,
    x: clamp(startRect.x + deltaX, 0, 1 - startRect.width),
    y: clamp(startRect.y + deltaY, 0, 1 - startRect.height),
  };
  return next;
}

function fitCropWithinBounds(rect: CanvasCrop, aspectRatio: number, anchorX: number, anchorY: number) {
  let width = rect.width;
  let height = rect.height;
  const horizontalDirection = rect.x >= anchorX ? 1 : -1;
  const verticalDirection = rect.y >= anchorY ? 1 : -1;
  const maxWidth = horizontalDirection > 0 ? 1 - anchorX : anchorX;
  const maxHeight = verticalDirection > 0 ? 1 - anchorY : anchorY;

  width = Math.min(width, maxWidth);
  height = width / aspectRatio;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * aspectRatio;
  }

  const x = horizontalDirection > 0 ? anchorX : anchorX - width;
  const y = verticalDirection > 0 ? anchorY : anchorY - height;
  return {
    x,
    y,
    width,
    height,
  };
}

export function resizeCropRect(
  startRect: CanvasCrop,
  handle: ResizeHandle,
  deltaX: number,
  deltaY: number,
  aspect: CropAspect
) {
  const minSize = CROP_MIN_SIZE;
  const ratio = getAspectRatio(aspect);

  if (!ratio) {
    const next = {
      x: startRect.x,
      y: startRect.y,
      width: startRect.width,
      height: startRect.height,
    };

    if (handle.includes('w')) {
      const nextX = clamp(startRect.x + deltaX, 0, startRect.x + startRect.width - minSize);
      next.width = startRect.x + startRect.width - nextX;
      next.x = nextX;
    }
    if (handle.includes('e')) {
      next.width = clamp(startRect.width + deltaX, minSize, 1 - startRect.x);
    }
    if (handle.includes('n')) {
      const nextY = clamp(startRect.y + deltaY, 0, startRect.y + startRect.height - minSize);
      next.height = startRect.y + startRect.height - nextY;
      next.y = nextY;
    }
    if (handle.includes('s')) {
      next.height = clamp(startRect.height + deltaY, minSize, 1 - startRect.y);
    }

    return next;
  }

  if (handle === 'n' || handle === 's') {
    const anchorY = handle === 'n' ? startRect.y + startRect.height : startRect.y;
    const centerX = startRect.x + startRect.width / 2;
    const rawHeight = clamp(
      handle === 'n' ? anchorY - (startRect.y + deltaY) : startRect.height + deltaY,
      minSize,
      1
    );
    const width = rawHeight * ratio;
    const rect = {
      x: centerX - width / 2,
      y: handle === 'n' ? anchorY - rawHeight : anchorY,
      width,
      height: rawHeight,
    };
    return normalizeCrop(rect) || startRect;
  }

  if (handle === 'e' || handle === 'w') {
    const anchorX = handle === 'w' ? startRect.x + startRect.width : startRect.x;
    const centerY = startRect.y + startRect.height / 2;
    const rawWidth = clamp(
      handle === 'w' ? anchorX - (startRect.x + deltaX) : startRect.width + deltaX,
      minSize,
      1
    );
    const height = rawWidth / ratio;
    const rect = {
      x: handle === 'w' ? anchorX - rawWidth : anchorX,
      y: centerY - height / 2,
      width: rawWidth,
      height,
    };
    return normalizeCrop(rect) || startRect;
  }

  const anchorX = handle.includes('w') ? startRect.x + startRect.width : startRect.x;
  const anchorY = handle.includes('n') ? startRect.y + startRect.height : startRect.y;
  const targetX = handle.includes('w') ? startRect.x + deltaX : startRect.x + startRect.width + deltaX;
  const targetY = handle.includes('n') ? startRect.y + deltaY : startRect.y + startRect.height + deltaY;
  const rawWidth = Math.abs(targetX - anchorX);
  const rawHeight = Math.abs(targetY - anchorY);
  let width = rawWidth;
  let height = rawHeight;

  if (width / Math.max(height, 0.0001) > ratio) {
    height = width / ratio;
  } else {
    width = height * ratio;
  }

  width = Math.max(width, minSize);
  height = Math.max(height, minSize);

  const rect = fitCropWithinBounds(
    {
      x: targetX >= anchorX ? anchorX : anchorX - width,
      y: targetY >= anchorY ? anchorY : anchorY - height,
      width,
      height,
    },
    ratio,
    anchorX,
    anchorY
  );

  return normalizeCrop(rect) || startRect;
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
