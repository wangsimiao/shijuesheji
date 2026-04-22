import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  Clapperboard,
  Copy,
  Crop,
  Download,
  History,
  ImagePlus,
  Loader2,
  MessageSquarePlus,
  Minus,
  MousePointer2,
  Pencil,
  Plus,
  RectangleHorizontal,
  RefreshCcw,
  Scan,
  Send,
  Sparkles,
  Trash2,
  Type,
  Video,
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { addBrandTemplateHydrated, getBrandTemplatesHydrated } from '../store';
import {
  chatWithAI,
  generateImageAI,
  isDoubaoConfigured,
} from '../services/ai';
import type {
  BrandTemplate,
  CanvasItem,
  CanvasPoint,
  ChatInputImage,
  ChatMessage,
  ChatSession,
  ViewState,
} from '../types';

type ToolMode = 'select' | 'draw' | 'text' | 'shape';
type ActionPopoverType = 'regenerate' | 'video';
type CropAspect = 'freeform' | '1:1' | '4:3' | '16:9';
type SceneTab = 'general' | 'main_image' | 'detail_image' | 'buyer_show';

type ActionPopoverState = {
  type: ActionPopoverType;
  itemId: string;
  prompt: string;
  isSubmitting: boolean;
};

type CropState = {
  itemId: string;
  aspect: CropAspect;
  freeWidth: number;
  freeHeight: number;
  uniformSize: number;
  offsetX: number;
  offsetY: number;
  isSubmitting: boolean;
};

type WorkspaceSnapshot = {
  boardName: string;
  items: CanvasItem[];
  sessions: ChatSession[];
  currentSessionId: string;
  view: ViewState;
  selectedImageModel?: string;
  sceneBySessionId?: Record<string, SceneTab>;
};

type ViewportSize = {
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

type InteractionState = PanInteraction | DragInteraction | DrawInteraction | null;

type MediaDimensions = {
  width: number;
  height: number;
};

type CropRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type ImageModelOption = {
  value: string;
  label: string;
};

type SceneTabOption = {
  value: SceneTab;
  label: string;
};

const STORAGE_KEY = 'ai_visual_workspace_v1';
const DEFAULT_BOARD_NAME = 'AI视觉';
const DEFAULT_VIEW: ViewState = {
  x: 160,
  y: 120,
  scale: 1,
  selectedItemIds: [],
};
const DEFAULT_VIEWPORT: ViewportSize = {
  width: 1280,
  height: 720,
};
const CHAT_IMAGE_LIMIT = 4;
const DEFAULT_SCENE_TAB: SceneTab = 'general';
const DRAW_STROKE_COLOR = '#f2f5fb';
const DRAW_STROKE_WIDTH = 4;
const FIT_VIEW_PADDING = 120;
const MIN_SCALE = 0.35;
const MAX_SCALE = 2.4;
const CANVAS_WHEEL_LOCK_MS = 220;
const CANVAS_ZOOM_STEP = 1.12;
const VIDEO_DISABLED_REASON = '缺少视频模型 ID，待补充后启用。';
const IMAGE_MODEL_OPTIONS: ImageModelOption[] = [
  {
    value: 'doubao-seedream-5-0-260128',
    label: '豆包5.0',
  },
];
const DEFAULT_IMAGE_MODEL_OPTION = IMAGE_MODEL_OPTIONS[0];
const SCENE_TAB_OPTIONS: SceneTabOption[] = [
  { value: 'general', label: '通用' },
  { value: 'main_image', label: '主图' },
  { value: 'detail_image', label: '详情' },
  { value: 'buyer_show', label: '买家秀' },
];

function createEmptySession(): ChatSession {
  return {
    id: uuidv4(),
    title: '新对话',
    messages: [],
    createdAt: Date.now(),
  };
}

function normalizeSceneTab(value: unknown): SceneTab {
  if (value === 'main_image' || value === 'detail_image' || value === 'buyer_show') {
    return value;
  }
  return DEFAULT_SCENE_TAB;
}

function getSceneTabLabel(scene: SceneTab) {
  return SCENE_TAB_OPTIONS.find((item) => item.value === scene)?.label || SCENE_TAB_OPTIONS[0].label;
}

function buildSceneAwarePrompt(scene: SceneTab, text: string) {
  return `当前创作场景：${getSceneTabLabel(scene)}\n${text}`.trim();
}

function getDefaultSceneBySessionId(sessions: ChatSession[], previous?: Record<string, SceneTab>) {
  const next: Record<string, SceneTab> = {};
  for (const session of sessions) {
    next[session.id] = normalizeSceneTab(previous?.[session.id]);
  }
  return next;
}

function normalizeImageModel(value: unknown) {
  if (typeof value !== 'string') return DEFAULT_IMAGE_MODEL_OPTION.value;
  return IMAGE_MODEL_OPTIONS.some((option) => option.value === value)
    ? value
    : DEFAULT_IMAGE_MODEL_OPTION.value;
}

function normalizeView(view?: Partial<ViewState> | null): ViewState {
  const selectedItemIds = Array.isArray(view?.selectedItemIds)
    ? view?.selectedItemIds.filter((itemId): itemId is string => typeof itemId === 'string')
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

function normalizeItem(item: unknown): CanvasItem | null {
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

function loadWorkspaceSnapshot(): WorkspaceSnapshot {
  if (typeof window === 'undefined') {
    const session = createEmptySession();
    return {
      boardName: DEFAULT_BOARD_NAME,
      items: [],
      sessions: [session],
      currentSessionId: session.id,
      view: { ...DEFAULT_VIEW },
      selectedImageModel: DEFAULT_IMAGE_MODEL_OPTION.value,
      sceneBySessionId: { [session.id]: DEFAULT_SCENE_TAB },
    };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const session = createEmptySession();
      return {
        boardName: DEFAULT_BOARD_NAME,
        items: [],
        sessions: [session],
        currentSessionId: session.id,
        view: { ...DEFAULT_VIEW },
        selectedImageModel: DEFAULT_IMAGE_MODEL_OPTION.value,
        sceneBySessionId: { [session.id]: DEFAULT_SCENE_TAB },
      };
    }

    const parsed = JSON.parse(raw) as Partial<WorkspaceSnapshot>;
    const sessions = Array.isArray(parsed.sessions) && parsed.sessions.length > 0
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
            messages: session.messages.filter((message): message is ChatMessage => {
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
    const session = createEmptySession();
    return {
      boardName: DEFAULT_BOARD_NAME,
      items: [],
      sessions: [session],
      currentSessionId: session.id,
      view: { ...DEFAULT_VIEW },
      selectedImageModel: DEFAULT_IMAGE_MODEL_OPTION.value,
      sceneBySessionId: { [session.id]: DEFAULT_SCENE_TAB },
    };
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function sanitizeFilename(value: string) {
  return value.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function getDisplayFilename(item: CanvasItem) {
  return sanitizeFilename(item.prompt || '') || `ai-vision-${Date.now()}`;
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('读取文件失败。'));
    reader.readAsDataURL(file);
  });
}

function loadImageDimensions(src: string) {
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

function loadVideoDimensions(src: string) {
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

function fitIntoBounds(width: number, height: number, maxWidth: number, maxHeight: number) {
  const scale = Math.min(maxWidth / width, maxHeight / height, 1);
  return {
    width: Math.max(120, Math.round(width * scale)),
    height: Math.max(90, Math.round(height * scale)),
  };
}

function getViewportCenterPosition(
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

function createAvoidOverlapPosition(
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

function getClientToWorldPoint(
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

function buildDrawingFrame(points: CanvasPoint[], strokeWidth: number): CanvasItem | null {
  if (points.length < 2) return null;

  let minX = points[0].x;
  let maxX = points[0].x;
  let minY = points[0].y;
  let maxY = points[0].y;

  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }

  const padding = strokeWidth * 2;
  const width = Math.max(8, maxX - minX + padding * 2);
  const height = Math.max(8, maxY - minY + padding * 2);
  const offsetX = minX - padding;
  const offsetY = minY - padding;

  return {
    id: uuidv4(),
    type: 'drawing',
    x: offsetX,
    y: offsetY,
    width,
    height,
    content: 'freehand',
    points: points.map((point) => ({
      x: point.x - offsetX,
      y: point.y - offsetY,
    })),
    strokeColor: DRAW_STROKE_COLOR,
    strokeWidth,
  };
}

function getAspectRatio(aspect: CropAspect) {
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

function getCropRect(
  naturalWidth: number,
  naturalHeight: number,
  state: CropState
): CropRect {
  const fixedRatio = getAspectRatio(state.aspect);

  if (!fixedRatio) {
    const width = Math.max(1, naturalWidth * (state.freeWidth / 100));
    const height = Math.max(1, naturalHeight * (state.freeHeight / 100));
    const maxLeft = Math.max(0, naturalWidth - width);
    const maxTop = Math.max(0, naturalHeight - height);
    return {
      left: maxLeft * (state.offsetX / 100),
      top: maxTop * (state.offsetY / 100),
      width,
      height,
    };
  }

  let maxWidth = naturalWidth;
  let maxHeight = maxWidth / fixedRatio;
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

function cropImageSource(src: string, rect: CropRect, mimeType = 'image/png') {
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

async function downloadAsset(url: string, fileName: string) {
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

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') return true;
  return Boolean(target.closest('[contenteditable="true"]'));
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function stopCanvasToolbarEvent(event: React.SyntheticEvent) {
  event.stopPropagation();
}

function stopCanvasToolbarWheel(event: React.WheelEvent) {
  event.preventDefault();
  event.stopPropagation();
}

function ToolbarButton({
  icon: Icon,
  label,
  active,
  disabled,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-10 w-10 items-center justify-center rounded-[18px] border text-slate-100 transition ${
        active
          ? 'border-[#8e81ff] bg-[#3b325f] shadow-[0_0_0_1px_rgba(142,129,255,0.45)]'
          : 'border-transparent bg-white/[0.04] hover:bg-white/[0.08]'
      } ${disabled ? 'cursor-not-allowed opacity-40' : ''}`}
    >
      <Icon className="h-4.5 w-4.5" />
    </button>
  );
}

function ContextButton({
  icon: Icon,
  label,
  disabled,
  textOnly,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  disabled?: boolean;
  textOnly?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-10 items-center gap-1.5 rounded-[11px] px-2.5 text-[13px] font-medium text-slate-100 transition ${
        textOnly ? 'min-w-[124px] justify-center' : 'justify-center'
      } ${disabled ? 'cursor-not-allowed opacity-40' : 'hover:bg-white/[0.08]'}`}
    >
      <Icon className="h-4 w-4" />
      {textOnly ? <span>{label}</span> : null}
    </button>
  );
}

export default function AiVisionWorkspace({ onBack }: { onBack: () => void }) {
  const initialSnapshot = useMemo(() => loadWorkspaceSnapshot(), []);

  const [boardName, setBoardName] = useState(initialSnapshot.boardName);
  const [items, setItems] = useState<CanvasItem[]>(initialSnapshot.items);
  const [sessions, setSessions] = useState<ChatSession[]>(initialSnapshot.sessions);
  const [currentSessionId, setCurrentSessionId] = useState(initialSnapshot.currentSessionId);
  const [view, setView] = useState<ViewState>(initialSnapshot.view);
  const [tool, setTool] = useState<ToolMode>('select');
  const [chatInput, setChatInput] = useState('');
  const [chatInputImages, setChatInputImages] = useState<ChatInputImage[]>([]);
  const [brandTemplates, setBrandTemplates] = useState<BrandTemplate[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [sceneBySessionId, setSceneBySessionId] = useState<Record<string, SceneTab>>(
    initialSnapshot.sceneBySessionId || {}
  );
  const [actionPopover, setActionPopover] = useState<ActionPopoverState | null>(null);
  const [cropState, setCropState] = useState<CropState | null>(null);
  const [cropPreviewSize, setCropPreviewSize] = useState<MediaDimensions | null>(null);
  const [drawPreviewPoints, setDrawPreviewPoints] = useState<CanvasPoint[] | null>(null);
  const [selectedImageModel, setSelectedImageModel] = useState(
    initialSnapshot.selectedImageModel || DEFAULT_IMAGE_MODEL_OPTION.value
  );
  const [isHistoryMenuOpen, setIsHistoryMenuOpen] = useState(false);
  const [isBrandMenuOpen, setIsBrandMenuOpen] = useState(false);
  const [canvasHover, setCanvasHover] = useState(false);
  const [canvasWheelLock, setCanvasWheelLock] = useState(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const [viewportSize, setViewportSize] = useState<ViewportSize>(DEFAULT_VIEWPORT);

  const canvasViewportRef = useRef<HTMLDivElement | null>(null);
  const cropPanelRef = useRef<HTMLDivElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const chatUploadInputRef = useRef<HTMLInputElement | null>(null);
  const brandTemplateInputRef = useRef<HTMLInputElement | null>(null);
  const historyMenuRef = useRef<HTMLDivElement | null>(null);
  const brandMenuRef = useRef<HTMLDivElement | null>(null);
  const wheelLockTimerRef = useRef<number | null>(null);
  const interactionRef = useRef<InteractionState>(null);

  const itemsRef = useRef(items);
  const sessionsRef = useRef(sessions);
  const currentSessionIdRef = useRef(currentSessionId);
  const viewRef = useRef(view);
  const viewportSizeRef = useRef(viewportSize);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  useEffect(() => {
    currentSessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  useEffect(() => {
    viewportSizeRef.current = viewportSize;
  }, [viewportSize]);

  useEffect(() => {
    return () => {
      if (wheelLockTimerRef.current) {
        window.clearTimeout(wheelLockTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!statusNotice) return undefined;
    const timer = window.setTimeout(() => setStatusNotice(null), 2800);
    return () => window.clearTimeout(timer);
  }, [statusNotice]);

  useEffect(() => {
    let cancelled = false;
    void getBrandTemplatesHydrated().then((templates) => {
      if (!cancelled) {
        setBrandTemplates(templates);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const element = canvasViewportRef.current;
    if (!element) return undefined;

    const updateSize = () => {
      const rect = element.getBoundingClientRect();
      setViewportSize({
        width: rect.width || DEFAULT_VIEWPORT.width,
        height: rect.height || DEFAULT_VIEWPORT.height,
      });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    window.addEventListener('resize', updateSize);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, []);

  useEffect(() => {
    if (!sessions.length) {
      const session = createEmptySession();
      setSessions([session]);
      setCurrentSessionId(session.id);
      return;
    }

    if (!sessions.some((session) => session.id === currentSessionId)) {
      setCurrentSessionId(sessions[0].id);
    }
  }, [sessions, currentSessionId]);

  useEffect(() => {
    setSceneBySessionId((previous) => {
      const next = getDefaultSceneBySessionId(sessions, previous);
      const sameLength = Object.keys(next).length === Object.keys(previous).length;
      const unchanged = sameLength && Object.keys(next).every((key) => next[key] === previous[key]);
      return unchanged ? previous : next;
    });
  }, [sessions]);

  useEffect(() => {
    if (!cropState) return;
    setCanvasHover(false);
    setCanvasWheelLock(false);
    if (wheelLockTimerRef.current) {
      window.clearTimeout(wheelLockTimerRef.current);
      wheelLockTimerRef.current = null;
    }
  }, [cropState]);

  useEffect(() => {
    if (cropState) return undefined;

    const handleWheelCapture = (event: WheelEvent) => {
      if (!(canvasHover || canvasWheelLock)) return;
      const canvas = canvasViewportRef.current;
      if (!canvas) return;

      const targetNode = event.target instanceof Node ? event.target : null;
      const isInsideCanvas = Boolean(targetNode && canvas.contains(targetNode));
      if (isInsideCanvas) return;

      event.preventDefault();
      event.stopPropagation();
    };

    window.addEventListener('wheel', handleWheelCapture, {
      capture: true,
      passive: false,
    });

    return () => {
      window.removeEventListener('wheel', handleWheelCapture, true);
    };
  }, [canvasHover, canvasWheelLock, cropState]);

  useEffect(() => {
    try {
      const payload: WorkspaceSnapshot = {
        boardName,
        items,
        sessions,
        currentSessionId,
        view,
        selectedImageModel,
        sceneBySessionId,
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      setStorageWarning(null);
    } catch (error) {
      const message = getErrorMessage(error);
      setStorageWarning(`本地保存失败：${message}`);
    }
  }, [boardName, items, sessions, currentSessionId, sceneBySessionId, selectedImageModel, view]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target instanceof Node ? event.target : null;
      if (historyMenuRef.current && target && !historyMenuRef.current.contains(target)) {
        setIsHistoryMenuOpen(false);
      }
      if (brandMenuRef.current && target && !brandMenuRef.current.contains(target)) {
        setIsBrandMenuOpen(false);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    return () => window.removeEventListener('mousedown', handlePointerDown);
  }, []);

  const currentSession = useMemo(
    () => sessions.find((session) => session.id === currentSessionId) || sessions[0] || null,
    [sessions, currentSessionId]
  );
  const currentScene = currentSession ? sceneBySessionId[currentSession.id] || DEFAULT_SCENE_TAB : DEFAULT_SCENE_TAB;

  const selectedItemId = view.selectedItemIds[0] || null;
  const selectedItem = selectedItemId
    ? items.find((item) => item.id === selectedItemId) || null
    : null;
  const selectedImageItem = selectedItem?.type === 'image' ? selectedItem : null;

  const selectedImageToolbarPosition = selectedImageItem
    ? {
        left: view.x + (selectedImageItem.x + selectedImageItem.width / 2) * view.scale,
        top: view.y + selectedImageItem.y * view.scale - 18,
      }
    : null;

  const cropTargetItem =
    cropState && items.find((item) => item.id === cropState.itemId && item.type === 'image')
      ? (items.find((item) => item.id === cropState.itemId && item.type === 'image') as CanvasItem)
      : null;

  useEffect(() => {
    if (!cropTargetItem) {
      setCropPreviewSize(null);
      return;
    }

    let canceled = false;
    loadImageDimensions(cropTargetItem.content)
      .then((size) => {
        if (!canceled) setCropPreviewSize(size);
      })
      .catch(() => {
        if (!canceled) setCropPreviewSize({ width: 1024, height: 1024 });
      });

    return () => {
      canceled = true;
    };
  }, [cropTargetItem]);

  useEffect(() => {
    if (!actionPopover) return;
    const exists = items.some(
      (item) => item.id === actionPopover.itemId && item.type === 'image'
    );
    if (!exists) setActionPopover(null);
  }, [actionPopover, items]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActionPopover(null);
        setCropState(null);
        if (tool !== 'select') setTool('select');
        return;
      }

      if (isEditableTarget(event.target)) return;

      if ((event.key === 'Backspace' || event.key === 'Delete') && selectedItemId) {
        event.preventDefault();
        setItems((previous) => previous.filter((item) => item.id !== selectedItemId));
        setView((previous) => ({ ...previous, selectedItemIds: [] }));
        setActionPopover(null);
        if (cropState?.itemId === selectedItemId) {
          setCropState(null);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cropState?.itemId, selectedItemId, tool]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const currentInteraction = interactionRef.current;
      const canvas = canvasViewportRef.current;
      if (!currentInteraction || !canvas) return;

      if (currentInteraction.type === 'pan') {
        setView((previous) => ({
          ...previous,
          x: currentInteraction.originX + (event.clientX - currentInteraction.startClientX),
          y: currentInteraction.originY + (event.clientY - currentInteraction.startClientY),
        }));
        return;
      }

      if (currentInteraction.type === 'drag') {
        const deltaX = (event.clientX - currentInteraction.startClientX) / currentInteraction.scale;
        const deltaY = (event.clientY - currentInteraction.startClientY) / currentInteraction.scale;
        setItems((previous) =>
          previous.map((item) =>
            item.id === currentInteraction.itemId
              ? {
                  ...item,
                  x: currentInteraction.originX + deltaX,
                  y: currentInteraction.originY + deltaY,
                }
              : item
          )
        );
        return;
      }

      const rect = canvas.getBoundingClientRect();
      const point = getClientToWorldPoint(event.clientX, event.clientY, rect, viewRef.current);
      const lastPoint = currentInteraction.points[currentInteraction.points.length - 1];
      if (!lastPoint || Math.hypot(point.x - lastPoint.x, point.y - lastPoint.y) < 1.5) {
        return;
      }
      currentInteraction.points = [...currentInteraction.points, point];
      setDrawPreviewPoints(currentInteraction.points);
    };

    const handlePointerUp = () => {
      const currentInteraction = interactionRef.current;
      if (!currentInteraction) return;

      if (currentInteraction.type === 'draw') {
        const drawing = buildDrawingFrame(currentInteraction.points, DRAW_STROKE_WIDTH);
        if (drawing) {
          setItems((previous) => [...previous, drawing]);
        }
      }

      interactionRef.current = null;
      setDrawPreviewPoints(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, []);

  function setSingleSelection(itemId: string | null) {
    setView((previous) => ({
      ...previous,
      selectedItemIds: itemId ? [itemId] : [],
    }));
  }

  function armCanvasWheelLock() {
    setCanvasWheelLock(true);
    if (wheelLockTimerRef.current) {
      window.clearTimeout(wheelLockTimerRef.current);
    }
    wheelLockTimerRef.current = window.setTimeout(() => {
      setCanvasWheelLock(false);
      wheelLockTimerRef.current = null;
    }, CANVAS_WHEEL_LOCK_MS);
  }

  function updateScaleFromViewportPoint(nextScale: number, originX: number, originY: number) {
    setView((previous) => {
      const safeScale = clamp(nextScale, MIN_SCALE, MAX_SCALE);
      const worldX = (originX - previous.x) / previous.scale;
      const worldY = (originY - previous.y) / previous.scale;

      return {
        ...previous,
        scale: safeScale,
        x: originX - worldX * safeScale,
        y: originY - worldY * safeScale,
      };
    });
  }

  function getCanvasViewportCenter() {
    return {
      x: viewportSizeRef.current.width / 2,
      y: viewportSizeRef.current.height / 2,
    };
  }

  function handleZoomIn() {
    armCanvasWheelLock();
    const center = getCanvasViewportCenter();
    updateScaleFromViewportPoint(viewRef.current.scale * CANVAS_ZOOM_STEP, center.x, center.y);
  }

  function handleZoomOut() {
    armCanvasWheelLock();
    const center = getCanvasViewportCenter();
    updateScaleFromViewportPoint(viewRef.current.scale / CANVAS_ZOOM_STEP, center.x, center.y);
  }

  function handleFitCanvasView() {
    const currentItems = itemsRef.current;
    const viewport = viewportSizeRef.current;

    if (!currentItems.length) {
      setView((previous) => ({
        ...previous,
        x: DEFAULT_VIEW.x,
        y: DEFAULT_VIEW.y,
        scale: DEFAULT_VIEW.scale,
      }));
      return;
    }

    let minX = currentItems[0].x;
    let minY = currentItems[0].y;
    let maxX = currentItems[0].x + currentItems[0].width;
    let maxY = currentItems[0].y + currentItems[0].height;

    for (const item of currentItems) {
      minX = Math.min(minX, item.x);
      minY = Math.min(minY, item.y);
      maxX = Math.max(maxX, item.x + item.width);
      maxY = Math.max(maxY, item.y + item.height);
    }

    const contentWidth = Math.max(160, maxX - minX);
    const contentHeight = Math.max(120, maxY - minY);
    const availableWidth = Math.max(240, viewport.width - FIT_VIEW_PADDING * 2);
    const availableHeight = Math.max(200, viewport.height - FIT_VIEW_PADDING * 2);
    const nextScale = clamp(
      Math.min(availableWidth / contentWidth, availableHeight / contentHeight),
      MIN_SCALE,
      MAX_SCALE
    );
    const contentCenterX = minX + contentWidth / 2;
    const contentCenterY = minY + contentHeight / 2;

    setView((previous) => ({
      ...previous,
      scale: nextScale,
      x: viewport.width / 2 - contentCenterX * nextScale,
      y: viewport.height / 2 - contentCenterY * nextScale,
    }));
  }

  function updateCurrentSessionMessages(
    sessionId: string,
    updater: (previousMessages: ChatMessage[]) => ChatMessage[],
    nextTitle?: string
  ) {
    setSessions((previous) =>
      previous.map((session) => {
        if (session.id !== sessionId) return session;
        return {
          ...session,
          messages: updater(session.messages),
          title: nextTitle || session.title,
        };
      })
    );
  }

  async function addChatReferenceImage(data: string, name?: string, source: ChatInputImage['source'] = 'canvas') {
    setChatInputImages((previous) => {
      if (previous.some((item) => item.data === data)) {
        setStatusNotice('这张图片已经在对话参考图里了。');
        return previous;
      }
      if (previous.length >= CHAT_IMAGE_LIMIT) {
        setStatusNotice(`最多添加 ${CHAT_IMAGE_LIMIT} 张参考图。`);
        return previous;
      }
      setStatusNotice('已添加到对话。');
      return [
        ...previous,
        {
          id: uuidv4(),
          data,
          source,
          name: name || '画布引用',
        },
      ];
    });
  }

  function handleCreateSession() {
    const session = createEmptySession();
    setSessions((previous) => [session, ...previous]);
    setCurrentSessionId(session.id);
    setSceneBySessionId((previous) => ({
      ...previous,
      [session.id]: DEFAULT_SCENE_TAB,
    }));
    setIsHistoryMenuOpen(false);
  }

  function handleSelectScene(scene: SceneTab) {
    if (!currentSession) return;
    setSceneBySessionId((previous) => ({
      ...previous,
      [currentSession.id]: scene,
    }));
  }

  async function handleSelectBrandTemplate(template: BrandTemplate) {
    await addChatReferenceImage(template.image, template.name, 'brand');
    setIsBrandMenuOpen(false);
  }

  async function handleUploadBrandTemplate(file: File) {
    const data = await readFileAsDataUrl(file);
    const template = await addBrandTemplateHydrated(file.name.replace(/\.[^.]+$/, ''), data);
    setBrandTemplates((previous) => [template, ...previous.filter((item) => item.id !== template.id)]);
    await addChatReferenceImage(template.image, template.name, 'brand');
    setIsBrandMenuOpen(false);
    setStatusNotice('品牌模板已加入输入框。');
  }

  async function importImageFiles(files: FileList | null) {
    if (!files?.length) return;

    for (const file of Array.from(files)) {
      try {
        const dataUrl = await readFileAsDataUrl(file);
        const naturalSize = await loadImageDimensions(dataUrl).catch(() => ({ width: 1024, height: 1024 }));
        const size = fitIntoBounds(naturalSize.width, naturalSize.height, 520, 520);
        const position = createAvoidOverlapPosition(
          itemsRef.current,
          viewRef.current,
          viewportSizeRef.current,
          size.width,
          size.height
        );

        const nextItem: CanvasItem = {
          id: uuidv4(),
          type: 'image',
          x: position.x,
          y: position.y,
          width: size.width,
          height: size.height,
          content: dataUrl,
          prompt: file.name.replace(/\.[^.]+$/, ''),
          mimeType: file.type || 'image/png',
          sourceKind: 'uploaded',
        };

        setItems((previous) => [...previous, nextItem]);
        setSingleSelection(nextItem.id);
      } catch (error) {
        setStatusNotice(getErrorMessage(error));
      }
    }
  }

  async function importVideoFiles(files: FileList | null) {
    if (!files?.length) return;

    for (const file of Array.from(files)) {
      try {
        const dataUrl = await readFileAsDataUrl(file);
        const naturalSize = await loadVideoDimensions(dataUrl).catch(() => ({ width: 1280, height: 720 }));
        const size = fitIntoBounds(naturalSize.width, naturalSize.height, 560, 360);
        const position = createAvoidOverlapPosition(
          itemsRef.current,
          viewRef.current,
          viewportSizeRef.current,
          size.width,
          size.height
        );

        const nextItem: CanvasItem = {
          id: uuidv4(),
          type: 'video',
          x: position.x,
          y: position.y,
          width: size.width,
          height: size.height,
          content: dataUrl,
          mimeType: file.type || 'video/mp4',
          prompt: file.name.replace(/\.[^.]+$/, ''),
          sourceKind: 'uploaded',
        };

        setItems((previous) => [...previous, nextItem]);
        setSingleSelection(nextItem.id);
      } catch (error) {
        setStatusNotice(getErrorMessage(error));
      }
    }
  }

  function createTextItem(point: CanvasPoint) {
    const item: CanvasItem = {
      id: uuidv4(),
      type: 'text',
      x: point.x,
      y: point.y,
      width: 240,
      height: 84,
      content: '双击编辑文字',
      mimeType: 'text/plain',
    };
    setItems((previous) => [...previous, item]);
    setSingleSelection(item.id);
  }

  function createShapeItem(point: CanvasPoint) {
    const item: CanvasItem = {
      id: uuidv4(),
      type: 'shape',
      x: point.x,
      y: point.y,
      width: 220,
      height: 140,
      content: '矩形',
      shapeType: 'rect',
    };
    setItems((previous) => [...previous, item]);
    setSingleSelection(item.id);
  }

  function createLoadingItem(prompt: string, preferred?: { x: number; y: number }) {
    const width = 260;
    const height = 168;
    const position = createAvoidOverlapPosition(
      itemsRef.current,
      viewRef.current,
      viewportSizeRef.current,
      width,
      height,
      preferred
    );
    const item: CanvasItem = {
      id: uuidv4(),
      type: 'loading',
      x: position.x,
      y: position.y,
      width,
      height,
      content: prompt || '正在生成…',
      prompt,
    };
    setItems((previous) => [...previous, item]);
    return item.id;
  }

  function handleCanvasPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;

    const canvas = canvasViewportRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const point = getClientToWorldPoint(event.clientX, event.clientY, rect, viewRef.current);

    if (tool === 'draw') {
      interactionRef.current = {
        type: 'draw',
        points: [point],
      };
      setDrawPreviewPoints([point]);
      setSingleSelection(null);
      return;
    }

    if (tool === 'text') {
      createTextItem(point);
      setTool('select');
      return;
    }

    if (tool === 'shape') {
      createShapeItem(point);
      setTool('select');
      return;
    }

    setSingleSelection(null);
    interactionRef.current = {
      type: 'pan',
      startClientX: event.clientX,
      startClientY: event.clientY,
      originX: viewRef.current.x,
      originY: viewRef.current.y,
    };
  }

  function handleItemPointerDown(event: React.PointerEvent<HTMLDivElement>, item: CanvasItem) {
    event.stopPropagation();
    if (event.button !== 0) return;

    setSingleSelection(item.id);
    if (tool !== 'select') return;

    interactionRef.current = {
      type: 'drag',
      itemId: item.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      originX: item.x,
      originY: item.y,
      scale: viewRef.current.scale,
    };
  }

  function handleCanvasWheel(event: React.WheelEvent<HTMLDivElement>) {
    if (cropState) return;
    event.preventDefault();
    const canvas = canvasViewportRef.current;
    if (!canvas) return;

    armCanvasWheelLock();
    const rect = canvas.getBoundingClientRect();
    const originX = event.clientX - rect.left;
    const originY = event.clientY - rect.top;
    updateScaleFromViewportPoint(
      viewRef.current.scale * (event.deltaY < 0 ? 1.08 : 0.92),
      originX,
      originY
    );
  }

  function handleItemDoubleClick(item: CanvasItem) {
    if (item.type !== 'text') return;
    const next = window.prompt('编辑文字', item.content);
    if (typeof next !== 'string') return;
    setItems((previous) =>
      previous.map((current) =>
        current.id === item.id
          ? {
              ...current,
              content: next || '双击编辑文字',
            }
          : current
      )
    );
  }

  function handleCopySelectedImage() {
    if (!selectedImageItem) return;

    const nextItem: CanvasItem = {
      ...selectedImageItem,
      id: uuidv4(),
      x: selectedImageItem.x + 32,
      y: selectedImageItem.y + 32,
    };
    setItems((previous) => [...previous, nextItem]);
    setSingleSelection(nextItem.id);
    setStatusNotice('已复制图片。');
  }

  async function handleDownloadSelectedImage() {
    if (!selectedImageItem) return;
    try {
      const extension =
        selectedImageItem.mimeType?.includes('jpeg') || selectedImageItem.mimeType?.includes('jpg')
          ? 'jpg'
          : 'png';
      await downloadAsset(selectedImageItem.content, `${getDisplayFilename(selectedImageItem)}.${extension}`);
      setStatusNotice('图片已开始下载。');
    } catch (error) {
      setStatusNotice(getErrorMessage(error));
    }
  }

  function openRegeneratePopover() {
    if (!selectedImageItem) return;
    setActionPopover({
      type: 'regenerate',
      itemId: selectedImageItem.id,
      prompt: selectedImageItem.prompt || '',
      isSubmitting: false,
    });
  }

  function openVideoPopover() {
    setStatusNotice(VIDEO_DISABLED_REASON);
  }

  function openCropModal() {
    if (!selectedImageItem) return;
    setCropState({
      itemId: selectedImageItem.id,
      aspect: 'freeform',
      freeWidth: 82,
      freeHeight: 82,
      uniformSize: 84,
      offsetX: 50,
      offsetY: 50,
      isSubmitting: false,
    });
  }

  async function handleRegenerateSubmit() {
    if (!actionPopover || actionPopover.type !== 'regenerate') return;
    const targetItem = itemsRef.current.find(
      (item) => item.id === actionPopover.itemId && item.type === 'image'
    );
    if (!targetItem) return;

    const prompt = actionPopover.prompt.trim();
    if (!prompt) {
      setStatusNotice('请先输入重绘提示词。');
      return;
    }

    setActionPopover((previous) =>
      previous ? { ...previous, isSubmitting: true } : previous
    );

    try {
      const nextImage = await generateImageAI(prompt, selectedImageModel, [targetItem.content]);
      setItems((previous) =>
        previous.map((item) =>
          item.id === targetItem.id
            ? {
                ...item,
                content: nextImage,
                prompt,
                mimeType: 'image/png',
                sourceKind: 'generated',
              }
            : item
        )
      );
      setActionPopover(null);
      setStatusNotice('图片已重新生成。');
    } catch (error) {
      setActionPopover((previous) =>
        previous ? { ...previous, isSubmitting: false } : previous
      );
      setStatusNotice(getErrorMessage(error));
    }
  }

  async function handleVideoSubmit() {
    setStatusNotice(VIDEO_DISABLED_REASON);
  }

  async function handleCropConfirm() {
    if (!cropState || !cropTargetItem || !cropPreviewSize) return;

    setCropState((previous) => (previous ? { ...previous, isSubmitting: true } : previous));
    try {
      const rect = getCropRect(cropPreviewSize.width, cropPreviewSize.height, cropState);
      const dataUrl = await cropImageSource(
        cropTargetItem.content,
        rect,
        cropTargetItem.mimeType || 'image/png'
      );
      const fitted = fitIntoBounds(rect.width, rect.height, 560, 560);
      setItems((previous) =>
        previous.map((item) =>
          item.id === cropTargetItem.id
            ? {
                ...item,
                content: dataUrl,
                width: fitted.width,
                height: fitted.height,
                mimeType: cropTargetItem.mimeType || 'image/png',
              }
            : item
        )
      );
      setCropState(null);
      setStatusNotice('图片已裁剪。');
    } catch (error) {
      setCropState((previous) => (previous ? { ...previous, isSubmitting: false } : previous));
      setStatusNotice(getErrorMessage(error));
    }
  }

  async function handleSendMessage() {
    if (isChatLoading || !currentSession) return;

    const text = chatInput.trim();
    const attachedImages = chatInputImages.map((item) => item.data);
    if (!text && attachedImages.length === 0) return;

    const effectiveText = text || '请基于这些参考图继续创作。';
    const effectiveTextForModel = buildSceneAwarePrompt(currentScene, effectiveText);
    const userMessage: ChatMessage = {
      id: uuidv4(),
      role: 'user',
      content: effectiveText,
      attachedImages: attachedImages.length ? attachedImages : undefined,
    };
    const loadingMessageId = uuidv4();
    const loadingMessage: ChatMessage = {
      id: loadingMessageId,
      role: 'assistant',
      content: '正在处理…',
    };

    setChatInput('');
    setChatInputImages([]);
    setIsChatLoading(true);

    updateCurrentSessionMessages(
      currentSession.id,
      (previous) => [...previous, userMessage, loadingMessage],
      currentSession.messages.length === 0
        ? effectiveText.slice(0, 18) || '新对话'
        : undefined
    );

    try {
      const history = currentSession.messages.map((message) => ({
        role: message.role,
        content: message.content,
      }));

      const response = await chatWithAI(history, effectiveTextForModel, attachedImages);
      let nextAssistantMessages: ChatMessage[] | null = null;

      updateCurrentSessionMessages(currentSession.id, (previous) => {
        const withoutLoading = previous.filter((message) => message.id !== loadingMessageId);
        nextAssistantMessages = withoutLoading;
        if (response.text.trim()) {
          nextAssistantMessages = [
            ...withoutLoading,
            {
              id: uuidv4(),
              role: 'assistant',
              content: response.text.trim(),
            },
          ];
          return nextAssistantMessages;
        }
        return withoutLoading;
      });

      const calls = response.functionCalls || [];
      if (calls.length > 0) {
        for (const call of calls) {
          if (call.name !== 'generateImage') continue;

          const prompt = call.args.prompt.trim();
          const loadingItemId = createLoadingItem(prompt || '正在生成图片…');

          try {
            const imageUrl = await generateImageAI(
              prompt,
              selectedImageModel,
              call.args.referenceImages || attachedImages
            );
            const imageSize = await loadImageDimensions(imageUrl).catch(() => ({
              width: 1024,
              height: 1024,
            }));
            const fitted = fitIntoBounds(imageSize.width, imageSize.height, 520, 520);

            setItems((previous) =>
              previous.map((item) =>
                item.id === loadingItemId
                  ? {
                      ...item,
                      type: 'image',
                      width: fitted.width,
                      height: fitted.height,
                      content: imageUrl,
                      prompt,
                      mimeType: 'image/png',
                      sourceKind: 'generated',
                    }
                  : item
              )
            );

            updateCurrentSessionMessages(currentSession.id, (previous) => [
              ...previous,
              {
                id: uuidv4(),
                role: 'assistant',
                content: `已生成图片：${prompt}`,
                imageUrl,
              },
            ]);
          } catch (error) {
            const message = getErrorMessage(error);
            setItems((previous) =>
              previous.map((item) =>
                item.id === loadingItemId
                  ? {
                      ...item,
                      content: message,
                    }
                  : item
              )
            );
            updateCurrentSessionMessages(currentSession.id, (previous) => [
              ...previous,
              {
                id: uuidv4(),
                role: 'assistant',
                content: `图片生成失败：${message}`,
              },
            ]);
          }
        }
      } else if (!response.text.trim() && nextAssistantMessages) {
        updateCurrentSessionMessages(currentSession.id, (previous) => [
          ...previous,
          {
            id: uuidv4(),
            role: 'assistant',
            content: '我已经收到需求了，可以继续补充你想保留的视觉方向、构图和材质细节。',
          },
        ]);
      }
    } catch (error) {
      updateCurrentSessionMessages(currentSession.id, (previous) => [
        ...previous.filter((message) => message.id !== loadingMessageId),
        {
          id: uuidv4(),
          role: 'assistant',
          content: `请求失败：${getErrorMessage(error)}`,
        },
      ]);
    } finally {
      setIsChatLoading(false);
    }
  }

  const cropRect = cropState && cropPreviewSize ? getCropRect(cropPreviewSize.width, cropPreviewSize.height, cropState) : null;
  const cropPreviewFrame =
    cropRect && cropPreviewSize
      ? {
          left: `${(cropRect.left / cropPreviewSize.width) * 100}%`,
          top: `${(cropRect.top / cropPreviewSize.height) * 100}%`,
          width: `${(cropRect.width / cropPreviewSize.width) * 100}%`,
          height: `${(cropRect.height / cropPreviewSize.height) * 100}%`,
        }
      : null;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#090b11] text-slate-100">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[62px] items-center border-b border-white/[0.06] bg-[#0d111a]/95 px-4">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex h-10 items-center gap-1.5 rounded-[18px] border border-white/[0.08] bg-white/[0.03] px-3.5 text-[13px] text-slate-100 transition hover:bg-white/[0.06]"
            >
              <ChevronLeft className="h-4 w-4" />
              返回
            </button>
            <div className="h-5 w-px bg-white/[0.08]" />
            <input
              value={boardName}
              onChange={(event) => setBoardName(event.target.value)}
              className="w-[210px] rounded-xl border border-transparent bg-transparent px-3 py-2 text-base font-semibold text-white outline-none transition focus:border-white/[0.08] focus:bg-white/[0.03]"
            />
          </div>
        </header>

        <div className="relative min-h-0 flex-1">
          <div
            ref={canvasViewportRef}
            onPointerEnter={() => {
              if (!cropState) setCanvasHover(true);
            }}
            onPointerLeave={() => {
              setCanvasHover(false);
            }}
            onPointerDown={handleCanvasPointerDown}
            onWheel={handleCanvasWheel}
            className="relative h-full overflow-hidden bg-[#0b0d14]"
            style={{
              backgroundImage:
                'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.08) 1px, transparent 0)',
              backgroundSize: '18px 18px',
              backgroundPosition: 'center center',
            }}
          >
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  'radial-gradient(circle at top left, rgba(74, 64, 120, 0.28), transparent 38%), radial-gradient(circle at bottom right, rgba(34, 69, 110, 0.22), transparent 34%)',
              }}
            />

            <div
              className="absolute left-0 top-0 origin-top-left"
              style={{
                transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
                transformOrigin: '0 0',
              }}
            >
              {items.map((item) => {
                const isSelected = selectedItemId === item.id;
                return (
                  <div
                    key={item.id}
                    onPointerDown={(event) => handleItemPointerDown(event, item)}
                    onDoubleClick={() => handleItemDoubleClick(item)}
                    className={`absolute overflow-visible rounded-[26px] transition ${
                      tool === 'select' ? 'cursor-move' : 'cursor-default'
                    }`}
                    style={{
                      left: item.x,
                      top: item.y,
                      width: item.width,
                      height: item.height,
                    }}
                  >
                    <div
                      className={`relative h-full w-full overflow-hidden rounded-[22px] border ${
                        isSelected
                          ? 'border-[#8e81ff] shadow-[0_0_0_1px_rgba(142,129,255,0.3)]'
                          : 'border-white/[0.06]'
                      } ${
                        item.type === 'shape'
                          ? 'bg-white/[0.06]'
                          : item.type === 'text'
                            ? 'bg-[#f5f1e8] text-[#1f2230]'
                            : 'bg-[#11151f]'
                      }`}
                    >
                      {item.type === 'image' ? (
                        <img
                          src={item.content}
                          alt={item.prompt || 'canvas item'}
                          className="h-full w-full select-none object-cover"
                          draggable={false}
                        />
                      ) : null}

                      {item.type === 'video' ? (
                        <video
                          src={item.content}
                          className="h-full w-full select-none object-cover"
                          muted
                          loop
                          autoPlay
                          playsInline
                        />
                      ) : null}

                      {item.type === 'text' ? (
                        <div className="flex h-full w-full items-center justify-center px-5 text-center text-[18px] font-medium leading-snug">
                          {item.content}
                        </div>
                      ) : null}

                      {item.type === 'shape' ? (
                        <div className="h-full w-full rounded-[22px] border border-white/[0.12] bg-[linear-gradient(135deg,rgba(255,255,255,0.12),rgba(255,255,255,0.02))]" />
                      ) : null}

                      {item.type === 'loading' ? (
                        <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] px-6 text-center">
                          <Loader2 className="h-8 w-8 animate-spin text-[#8e81ff]" />
                          <div className="space-y-2">
                            <div className="text-[13px] font-medium text-slate-100">{item.prompt || 'AI 正在处理中'}</div>
                            <div className="text-xs leading-5 text-slate-400">{item.content}</div>
                          </div>
                        </div>
                      ) : null}

                      {item.type === 'drawing' ? (
                        <svg
                          className="h-full w-full"
                          viewBox={`0 0 ${item.width} ${item.height}`}
                          preserveAspectRatio="none"
                        >
                          <polyline
                            points={(item.points || []).map((point) => `${point.x},${point.y}`).join(' ')}
                            fill="none"
                            stroke={item.strokeColor || DRAW_STROKE_COLOR}
                            strokeWidth={item.strokeWidth || DRAW_STROKE_WIDTH}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      ) : null}
                    </div>

                    {isSelected ? (
                      <>
                        {[
                          { left: -5, top: -5 },
                          { right: -5, top: -5 },
                          { left: -5, bottom: -5 },
                          { right: -5, bottom: -5 },
                        ].map((handleStyle, index) => (
                          <span
                            key={index}
                            className="pointer-events-none absolute h-3 w-3 rounded-[2px] border border-[#8e81ff] bg-white shadow-[0_0_0_1px_rgba(142,129,255,0.25)]"
                            style={handleStyle}
                          />
                        ))}
                      </>
                    ) : null}
                  </div>
                );
              })}

              {drawPreviewPoints && drawPreviewPoints.length > 1 ? (
                (() => {
                  const previewItem = buildDrawingFrame(drawPreviewPoints, DRAW_STROKE_WIDTH);
                  if (!previewItem) return null;
                  return (
                    <div
                      className="absolute pointer-events-none"
                      style={{
                        left: previewItem.x,
                        top: previewItem.y,
                        width: previewItem.width,
                        height: previewItem.height,
                      }}
                    >
                      <svg
                        className="h-full w-full"
                        viewBox={`0 0 ${previewItem.width} ${previewItem.height}`}
                        preserveAspectRatio="none"
                      >
                        <polyline
                          points={(previewItem.points || [])
                            .map((point) => `${point.x},${point.y}`)
                            .join(' ')}
                          fill="none"
                          stroke={DRAW_STROKE_COLOR}
                          strokeWidth={DRAW_STROKE_WIDTH}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>
                  );
                })()
              ) : null}
            </div>

            <div className="absolute left-5 top-1/2 z-20 -translate-y-1/2 rounded-[26px] border border-white/[0.08] bg-[#1d202b]/95 p-2.5 shadow-[0_20px_60px_rgba(0,0,0,0.28)] backdrop-blur-xl">
              <div className="flex flex-col items-center gap-1.5">
                <ToolbarButton
                  icon={MousePointer2}
                  label="选择"
                  active={tool === 'select'}
                  onClick={() => setTool('select')}
                />
                <ToolbarButton
                  icon={ImagePlus}
                  label="导入图片"
                  onClick={() => imageInputRef.current?.click()}
                />
                <ToolbarButton
                  icon={Video}
                  label="导入视频"
                  onClick={() => videoInputRef.current?.click()}
                />
                <div className="my-1 h-px w-6 bg-white/[0.1]" />
                <ToolbarButton
                  icon={Pencil}
                  label="画笔"
                  active={tool === 'draw'}
                  onClick={() => setTool('draw')}
                />
                <ToolbarButton
                  icon={Type}
                  label="文字"
                  active={tool === 'text'}
                  onClick={() => setTool('text')}
                />
                <ToolbarButton
                  icon={RectangleHorizontal}
                  label="矩形"
                  active={tool === 'shape'}
                  onClick={() => setTool('shape')}
                />
              </div>
            </div>

            {!cropState ? (
              <div className="absolute bottom-5 left-1/2 z-20 -translate-x-1/2">
                <div className="inline-flex items-center rounded-full border border-white/[0.08] bg-[#232632]/95 px-2 py-1 shadow-[0_20px_50px_rgba(0,0,0,0.32)] backdrop-blur-xl">
                  <button
                    type="button"
                    onClick={handleFitCanvasView}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-100 transition hover:bg-white/[0.08]"
                    title="适应画布"
                  >
                    <Scan className="h-4 w-4" />
                  </button>
                  <div className="mx-1.5 h-5 w-px bg-white/[0.08]" />
                  <button
                    type="button"
                    onClick={handleZoomOut}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-100 transition hover:bg-white/[0.08]"
                    title="缩小"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <div className="min-w-[68px] text-center text-[13px] font-semibold tracking-[0.02em] text-white">
                    {Math.round(view.scale * 100)} %
                  </div>
                  <button
                    type="button"
                    onClick={handleZoomIn}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-100 transition hover:bg-white/[0.08]"
                    title="放大"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ) : null}

            {selectedImageItem && selectedImageToolbarPosition ? (
              <div
                className="absolute z-30"
                style={{
                  left: selectedImageToolbarPosition.left,
                  top: selectedImageToolbarPosition.top,
                  transform: 'translate(-50%, -100%)',
                }}
              >
                <div
                  onPointerDown={stopCanvasToolbarEvent}
                  onMouseDown={stopCanvasToolbarEvent}
                  onClick={stopCanvasToolbarEvent}
                  onWheel={stopCanvasToolbarWheel}
                  className="inline-flex items-center gap-1 rounded-[20px] border border-white/[0.08] bg-[#1e212d]/95 px-2.5 py-1.5 shadow-[0_18px_40px_rgba(0,0,0,0.3)] backdrop-blur-xl"
                >
                  <ContextButton
                    icon={RefreshCcw}
                    label="重新生成"
                    disabled={!isDoubaoConfigured()}
                    onClick={() => {
                      if (!isDoubaoConfigured()) {
                        setStatusNotice('未配置 VITE_DOUBAO_API_KEY，暂时无法重新生成。');
                        return;
                      }
                      openRegeneratePopover();
                    }}
                  />
                  <ContextButton
                    icon={Clapperboard}
                    label="生成视频"
                    disabled={false}
                    onClick={openVideoPopover}
                  />
                  <div className="mx-1 h-6 w-px bg-white/[0.08]" />
                  <ContextButton icon={Copy} label="复制" onClick={handleCopySelectedImage} />
                  <ContextButton icon={Crop} label="裁剪" onClick={openCropModal} />
                  <div className="mx-1 h-6 w-px bg-white/[0.08]" />
                  <ContextButton icon={Download} label="下载" onClick={handleDownloadSelectedImage} />
                  <ContextButton
                    icon={MessageSquarePlus}
                    label="添加到对话"
                    textOnly
                    onClick={() => addChatReferenceImage(selectedImageItem.content, selectedImageItem.prompt || '画布图片')}
                  />
                </div>
              </div>
            ) : null}

            {actionPopover && selectedImageToolbarPosition ? (
              <div
                className="absolute z-40 w-[360px]"
                style={{
                  left: selectedImageToolbarPosition.left,
                  top: Math.max(20, selectedImageToolbarPosition.top - 12),
                  transform: 'translate(-50%, -100%)',
                }}
              >
                <div
                  onPointerDown={stopCanvasToolbarEvent}
                  onMouseDown={stopCanvasToolbarEvent}
                  onClick={stopCanvasToolbarEvent}
                  onWheel={stopCanvasToolbarWheel}
                  className="rounded-[24px] border border-white/[0.08] bg-[#161925]/97 p-3.5 shadow-[0_24px_60px_rgba(0,0,0,0.38)] backdrop-blur-xl"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <h3 className="text-[13px] font-semibold text-white">
                        {actionPopover.type === 'regenerate' ? '重新生成图片' : '从图片生成视频'}
                      </h3>
                      <p className="mt-1 text-[11px] text-slate-400">
                        {actionPopover.type === 'regenerate'
                          ? '将当前图片作为参考图，生成后直接替换'
                          : '将当前图片作为参考图，生成后在右侧新增视频卡片'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActionPopover(null)}
                      className="rounded-full p-1.5 text-slate-400 transition hover:bg-white/[0.06] hover:text-white"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <textarea
                    value={actionPopover.prompt}
                    onChange={(event) =>
                      setActionPopover((previous) =>
                        previous ? { ...previous, prompt: event.target.value } : previous
                      )
                    }
                    placeholder="描述你想要保留或变化的内容"
                    rows={4}
                    className="w-full resize-none rounded-[18px] border border-white/[0.08] bg-white/[0.03] px-3.5 py-2.5 text-[13px] text-white outline-none placeholder:text-slate-500 focus:border-[#8e81ff]/50"
                  />

                  {!isDoubaoConfigured() && actionPopover.type === 'regenerate' ? (
                    <div className="mt-3 rounded-[18px] border border-amber-300/20 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100">
                      未配置 `VITE_DOUBAO_API_KEY`，这个按钮不会真正发起生成。
                    </div>
                  ) : null}

                  {actionPopover.type === 'video' ? (
                    <div className="mt-3 rounded-[18px] border border-amber-300/20 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100">
                      {VIDEO_DISABLED_REASON}
                    </div>
                  ) : null}

                  <div className="mt-4 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setActionPopover(null)}
                      className="rounded-[18px] border border-white/[0.08] px-3.5 py-2 text-[13px] text-slate-200 transition hover:bg-white/[0.05]"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      disabled={
                        actionPopover.isSubmitting ||
                        (actionPopover.type === 'regenerate'
                          ? !isDoubaoConfigured()
                          : true)
                      }
                      onClick={
                        actionPopover.type === 'regenerate'
                          ? handleRegenerateSubmit
                          : handleVideoSubmit
                      }
                      className="inline-flex items-center gap-1.5 rounded-[18px] bg-[#7c6df7] px-3.5 py-2 text-[13px] font-medium text-white transition hover:bg-[#8a7cfa] disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      {actionPopover.isSubmitting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4" />
                      )}
                      {actionPopover.type === 'regenerate' ? '开始重绘' : '开始生成'}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              multiple
              onChange={(event) => {
                void importImageFiles(event.target.files);
                event.target.value = '';
              }}
            />
            <input
              ref={videoInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              multiple
              onChange={(event) => {
                void importVideoFiles(event.target.files);
                event.target.value = '';
              }}
            />
          </div>
        </div>
      </div>

      <aside className="flex h-full w-[380px] shrink-0 flex-col border-l border-white/[0.06] bg-[#0e1119]">
        <div className="border-b border-white/[0.06] px-4 py-3.5">
          <div className="flex items-center justify-between">
            <div ref={historyMenuRef} className="relative flex items-center gap-2.5">
              <h2 className="text-[13px] font-semibold text-white">AI 对话</h2>
              <button
                type="button"
                onClick={() => setIsHistoryMenuOpen((previous) => !previous)}
                className="inline-flex h-8 items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 text-[11px] text-slate-200 transition hover:bg-white/[0.06]"
              >
                <History className="h-3 w-3" />
                历史对话
                <ChevronDown className={`h-3 w-3 transition ${isHistoryMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {isHistoryMenuOpen ? (
                <div className="absolute left-0 top-full z-40 mt-2 w-[248px] rounded-[22px] border border-white/[0.08] bg-[#171b26]/98 p-2.5 shadow-[0_24px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl">
                  <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
                    {sessions.map((session) => (
                      <button
                        key={session.id}
                        type="button"
                        onClick={() => {
                          setCurrentSessionId(session.id);
                          setIsHistoryMenuOpen(false);
                        }}
                        className={`w-full rounded-[18px] border px-3 py-2 text-left transition ${
                          session.id === currentSessionId
                            ? 'border-[#8e81ff]/35 bg-[#2a2442] text-[#ece8ff]'
                            : 'border-transparent bg-white/[0.03] text-slate-200 hover:bg-white/[0.06]'
                        }`}
                      >
                        <div className="truncate text-[13px] font-medium">
                          {session.title || '新对话'}
                        </div>
                        <div className="mt-1 text-[10px] text-slate-500">
                          {new Date(session.createdAt).toLocaleString('zh-CN')}
                        </div>
                      </button>
                    ))}
                  </div>

                  <div className="mt-3 border-t border-white/[0.06] pt-3">
                    <button
                      type="button"
                      onClick={handleCreateSession}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-[18px] border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[13px] text-white transition hover:bg-white/[0.06]"
                    >
                      <Plus className="h-4 w-4" />
                      新建对话
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            <button
              type="button"
              onClick={handleCreateSession}
              className="inline-flex h-9 w-9 items-center justify-center rounded-[18px] border border-white/[0.08] bg-white/[0.03] transition hover:bg-white/[0.06]"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="space-y-2.5">
            {currentSession?.messages.map((message) => (
              <div
                key={message.id}
                className={`rounded-[20px] border px-3.5 py-2.5 text-[13px] leading-5.5 ${
                  message.role === 'user'
                    ? 'ml-8 border-[#8e81ff]/20 bg-[#2a2341] text-[#f0edff]'
                    : 'mr-8 border-white/[0.06] bg-white/[0.04] text-slate-100'
                }`}
              >
                <p className="whitespace-pre-wrap break-words">{message.content}</p>
                {message.imageUrl ? (
                  <img
                    src={message.imageUrl}
                    alt="assistant result"
                    className="mt-2.5 w-full rounded-[18px] border border-white/[0.08] object-cover"
                  />
                ) : null}
              </div>
            ))}

            {isChatLoading ? (
              <div className="mr-8 inline-flex items-center gap-2 rounded-[18px] border border-white/[0.06] bg-white/[0.04] px-3.5 py-2.5 text-[13px] text-slate-200">
                <Loader2 className="h-4 w-4 animate-spin" />
                正在思考与编排画布结果…
              </div>
            ) : null}
          </div>
        </div>

        <div className="border-t border-white/[0.06] px-4 py-3.5">
          <div className="flex flex-wrap gap-1.5">
            {SCENE_TAB_OPTIONS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => handleSelectScene(tab.value)}
                className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                  currentScene === tab.value
                    ? 'border-[#8e81ff]/40 bg-[#2a2442] text-[#ece8ff]'
                    : 'border-white/[0.08] bg-white/[0.03] text-slate-300 hover:bg-white/[0.06]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative -mt-px rounded-[22px] border border-white/[0.08] bg-white/[0.03] p-2.5">
            <div className="flex items-center gap-2.5 overflow-x-auto pb-1 pr-1">
              {chatInputImages.map((item) => (
                <div key={item.id} className="group relative h-12 w-12 shrink-0">
                  <img
                    src={item.data}
                    alt={item.name || '参考图'}
                    className="h-full w-full rounded-full border border-white/[0.08] object-cover shadow-[0_10px_24px_rgba(0,0,0,0.22)]"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setChatInputImages((previous) =>
                        previous.filter((current) => current.id !== item.id)
                      )
                    }
                    className="absolute -right-1 -top-1 inline-flex h-4.5 w-4.5 items-center justify-center rounded-full border border-white/[0.12] bg-black/75 text-white opacity-0 transition group-hover:opacity-100 hover:bg-black/90"
                    aria-label={`移除${item.name || '参考图'}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}

              <div className="hidden" aria-hidden="true">
                <button
                  type="button"
                  onClick={() => setIsBrandMenuOpen((previous) => !previous)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/[0.08] bg-[#111522] px-3 text-sm text-slate-200 transition hover:bg-white/[0.06]"
                >
                  品牌模板
                  <ChevronDown className={`h-3.5 w-3.5 transition ${isBrandMenuOpen ? 'rotate-180' : ''}`} />
                </button>

                {isBrandMenuOpen ? (
                  <div className="absolute left-0 top-full z-40 mt-2 w-[260px] rounded-[22px] border border-white/[0.08] bg-[#171b26]/98 p-3 shadow-[0_24px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl">
                    {brandTemplates.length > 0 ? (
                      <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                        {brandTemplates.map((template) => (
                          <button
                            key={template.id}
                            type="button"
                            onClick={() => {
                              void handleSelectBrandTemplate(template);
                            }}
                            className="flex w-full items-center gap-3 rounded-2xl border border-transparent bg-white/[0.03] p-2 text-left transition hover:bg-white/[0.06]"
                          >
                            <img
                              src={template.image}
                              alt={template.name}
                              className="h-12 w-12 rounded-xl border border-white/[0.08] object-cover"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium text-white">{template.name}</div>
                              <div className="mt-1 text-xs text-slate-400">点击附加到输入框</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.03] px-3 py-4 text-center text-xs leading-5 text-slate-400">
                        暂无品牌模板，先上传一个吧。
                      </div>
                    )}

                    <div className="mt-3 border-t border-white/[0.06] pt-3">
                      <button
                        type="button"
                        onClick={() => brandTemplateInputRef.current?.click()}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-white transition hover:bg-white/[0.06]"
                      >
                        <ImagePlus className="h-4 w-4" />
                        上传新模板
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => chatUploadInputRef.current?.click()}
                disabled={chatInputImages.length >= CHAT_IMAGE_LIMIT}
                className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.05] text-slate-200 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-45"
                title="上传参考图"
              >
                <Plus className="h-5 w-5" />
              </button>

            </div>

            {!isDoubaoConfigured() ? (
              <div className="mt-2.5 rounded-[18px] border border-amber-300/20 bg-amber-500/10 px-3 py-2 text-[10px] leading-4.5 text-amber-100">
                未配置 `VITE_DOUBAO_API_KEY`，对话和出图会失败。
              </div>
            ) : null}

            {storageWarning ? (
              <div className="mt-2.5 rounded-[18px] border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[10px] leading-4.5 text-slate-300">
                {storageWarning}
              </div>
            ) : null}

            {chatInputImages.length > 0 ? (
              <div className="mt-3 hidden gap-2 overflow-x-auto pb-1">
                {chatInputImages.map((item) => (
                  <div
                    key={item.id}
                    className="relative h-16 w-24 shrink-0 overflow-hidden rounded-2xl border border-white/[0.08]"
                  >
                    <img src={item.data} alt={item.name || '参考图'} className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() =>
                        setChatInputImages((previous) =>
                          previous.filter((current) => current.id !== item.id)
                        )
                      }
                      className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white transition hover:bg-black/80"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="mt-3">
              <textarea
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void handleSendMessage();
                  }
                }}
                rows={4}
                placeholder="告诉 AI 你想继续扩图、改风格、补场景还是生成一组新画面"
                className="min-h-[104px] w-full resize-none rounded-[18px] border border-white/[0.08] bg-[#0f131d] px-3 py-2.5 text-[13px] leading-5.5 text-white outline-none placeholder:text-slate-500"
              />

              <button hidden
                type="button"
                disabled={isChatLoading || (!chatInput.trim() && chatInputImages.length === 0)}
                onClick={() => {
                  void handleSendMessage();
                }}
                className="absolute bottom-3 right-3 inline-flex h-10 items-center gap-2 rounded-2xl bg-[#7c6df7] px-4 text-sm font-medium text-white transition hover:bg-[#8a7cfa] disabled:cursor-not-allowed disabled:opacity-45"
              >
                {isChatLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                发送
              </button>
            </div>

            <div className="mt-2.5 flex items-center gap-2">
              <select
                value={selectedImageModel}
                onChange={(event) => setSelectedImageModel(event.target.value)}
                className="h-9 w-[104px] rounded-[11px] border border-white/[0.08] bg-[#111522] px-3 text-[13px] text-white outline-none transition focus:border-[#8e81ff]/50"
              >
                {IMAGE_MODEL_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              <div ref={brandMenuRef} className="relative">
                <button
                  type="button"
                  onClick={() => setIsBrandMenuOpen((previous) => !previous)}
                  className="inline-flex h-9 items-center gap-1 rounded-[11px] border border-white/[0.08] bg-[#111522] px-3 text-[13px] text-slate-200 transition hover:bg-white/[0.06]"
                >
                  品牌模板
                  <ChevronDown className={`h-3 w-3 transition ${isBrandMenuOpen ? 'rotate-180' : ''}`} />
                </button>

                {isBrandMenuOpen ? (
                  <div className="absolute bottom-full left-0 z-40 mb-2 w-[248px] rounded-[20px] border border-white/[0.08] bg-[#171b26]/98 p-2.5 shadow-[0_24px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl">
                    {brandTemplates.length > 0 ? (
                      <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                        {brandTemplates.map((template) => (
                          <button
                            key={template.id}
                            type="button"
                            onClick={() => {
                              void handleSelectBrandTemplate(template);
                            }}
                            className="flex w-full items-center gap-2.5 rounded-[18px] border border-transparent bg-white/[0.03] p-2 text-left transition hover:bg-white/[0.06]"
                          >
                            <img
                              src={template.image}
                              alt={template.name}
                              className="h-10 w-10 rounded-[11px] border border-white/[0.08] object-cover"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium text-white">{template.name}</div>
                              <div className="mt-1 text-xs text-slate-400">点击附加到输入框</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-[18px] border border-dashed border-white/[0.08] bg-white/[0.03] px-3 py-3.5 text-center text-[11px] leading-5 text-slate-400">
                        暂无品牌模板，先上传一个吧。
                      </div>
                    )}

                    <div className="mt-3 border-t border-white/[0.06] pt-3">
                      <button
                        type="button"
                        onClick={() => brandTemplateInputRef.current?.click()}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-[18px] border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[13px] text-white transition hover:bg-white/[0.06]"
                      >
                        <ImagePlus className="h-4 w-4" />
                        上传新模板
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="ml-auto flex items-center gap-2.5">
                <div className="text-[10px] text-slate-500">
                  {chatInputImages.length}/{CHAT_IMAGE_LIMIT}
                </div>
                <button
                  type="button"
                  disabled={isChatLoading || (!chatInput.trim() && chatInputImages.length === 0)}
                  onClick={() => {
                    void handleSendMessage();
                  }}
                  className="inline-flex h-9 items-center gap-1.5 rounded-[18px] bg-[#7c6df7] px-3.5 text-[13px] font-medium text-white transition hover:bg-[#8a7cfa] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {isChatLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  发送
                </button>
              </div>
            </div>
          </div>

          <input
            ref={chatUploadInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (!file) return;
              try {
                const data = await readFileAsDataUrl(file);
                await addChatReferenceImage(data, file.name, 'local');
              } catch (error) {
                setStatusNotice(getErrorMessage(error));
              }
            }}
          />
          <input
            ref={brandTemplateInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (!file) return;
              try {
                await handleUploadBrandTemplate(file);
              } catch (error) {
                setStatusNotice(getErrorMessage(error));
              }
            }}
          />
        </div>
      </aside>

      {cropState && cropTargetItem && cropPreviewFrame ? (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/65 px-6 py-8 backdrop-blur-sm">
          <div className="flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-[32px] border border-white/[0.08] bg-[#111522] shadow-[0_32px_90px_rgba(0,0,0,0.45)]">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold text-white">裁剪图片</h3>
                <p className="mt-1 text-sm text-slate-400">支持 freeform / 1:1 / 4:3 / 16:9</p>
              </div>
              <button
                type="button"
                onClick={() => setCropState(null)}
                className="rounded-2xl border border-white/[0.08] px-4 py-2 text-sm text-slate-200 transition hover:bg-white/[0.05]"
              >
                关闭
              </button>
            </div>

            <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[1.3fr_0.7fr]">
              <div className="relative flex min-h-[420px] items-center justify-center bg-[#0c1018] p-6">
                <div className="relative max-h-full w-full max-w-3xl overflow-hidden rounded-[28px] border border-white/[0.06] bg-black/20">
                  <img
                    src={cropTargetItem.content}
                    alt="crop preview"
                    className="h-full max-h-[64vh] w-full object-contain"
                  />
                  <div className="pointer-events-none absolute inset-0">
                    <div className="absolute inset-0 bg-black/35" />
                    <div
                      className="absolute border-2 border-[#8e81ff] shadow-[0_0_0_9999px_rgba(0,0,0,0.42)]"
                      style={cropPreviewFrame}
                    />
                  </div>
                </div>
              </div>

              <div
                ref={cropPanelRef}
                className="flex flex-col gap-5 overflow-y-auto border-l border-white/[0.06] bg-[#121723] px-6 py-6"
              >
                <div>
                  <div className="mb-3 text-sm font-medium text-white">比例</div>
                  <div className="flex flex-wrap gap-2">
                    {(['freeform', '1:1', '4:3', '16:9'] as CropAspect[]).map((aspect) => (
                      <button
                        key={aspect}
                        type="button"
                        onClick={() =>
                          setCropState((previous) =>
                            previous
                              ? {
                                  ...previous,
                                  aspect,
                                  freeWidth: aspect === 'freeform' ? previous.freeWidth : 82,
                                  freeHeight: aspect === 'freeform' ? previous.freeHeight : 82,
                                }
                              : previous
                          )
                        }
                        className={`rounded-full border px-3 py-1.5 text-xs transition ${
                          cropState.aspect === aspect
                            ? 'border-[#8e81ff]/40 bg-[#2b2443] text-[#ece8ff]'
                            : 'border-white/[0.08] bg-white/[0.03] text-slate-300 hover:bg-white/[0.06]'
                        }`}
                      >
                        {aspect}
                      </button>
                    ))}
                  </div>
                </div>

                {cropState.aspect === 'freeform' ? (
                  <>
                    <label className="space-y-2">
                      <div className="flex items-center justify-between text-sm text-slate-200">
                        <span>裁剪宽度</span>
                        <span>{Math.round(cropState.freeWidth)}%</span>
                      </div>
                      <input
                        type="range"
                        min={10}
                        max={100}
                        value={cropState.freeWidth}
                        onChange={(event) =>
                          setCropState((previous) =>
                            previous
                              ? { ...previous, freeWidth: Number(event.target.value) }
                              : previous
                          )
                        }
                        className="w-full accent-[#8e81ff]"
                      />
                    </label>

                    <label className="space-y-2">
                      <div className="flex items-center justify-between text-sm text-slate-200">
                        <span>裁剪高度</span>
                        <span>{Math.round(cropState.freeHeight)}%</span>
                      </div>
                      <input
                        type="range"
                        min={10}
                        max={100}
                        value={cropState.freeHeight}
                        onChange={(event) =>
                          setCropState((previous) =>
                            previous
                              ? { ...previous, freeHeight: Number(event.target.value) }
                              : previous
                          )
                        }
                        className="w-full accent-[#8e81ff]"
                      />
                    </label>
                  </>
                ) : (
                  <label className="space-y-2">
                    <div className="flex items-center justify-between text-sm text-slate-200">
                      <span>裁剪尺寸</span>
                      <span>{Math.round(cropState.uniformSize)}%</span>
                    </div>
                    <input
                      type="range"
                      min={12}
                      max={100}
                      value={cropState.uniformSize}
                      onChange={(event) =>
                        setCropState((previous) =>
                          previous
                            ? { ...previous, uniformSize: Number(event.target.value) }
                            : previous
                        )
                      }
                      className="w-full accent-[#8e81ff]"
                    />
                  </label>
                )}

                <label className="space-y-2">
                  <div className="flex items-center justify-between text-sm text-slate-200">
                    <span>水平位置</span>
                    <span>{Math.round(cropState.offsetX)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={cropState.offsetX}
                    onChange={(event) =>
                      setCropState((previous) =>
                        previous ? { ...previous, offsetX: Number(event.target.value) } : previous
                      )
                    }
                    className="w-full accent-[#8e81ff]"
                  />
                </label>

                <label className="space-y-2">
                  <div className="flex items-center justify-between text-sm text-slate-200">
                    <span>垂直位置</span>
                    <span>{Math.round(cropState.offsetY)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={cropState.offsetY}
                    onChange={(event) =>
                      setCropState((previous) =>
                        previous ? { ...previous, offsetY: Number(event.target.value) } : previous
                      )
                    }
                    className="w-full accent-[#8e81ff]"
                  />
                </label>

                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-xs leading-6 text-slate-300">
                  裁剪确认后会直接替换当前图片，不保留版本回退。
                </div>

                <div className="mt-auto flex items-center justify-end gap-2 pt-4">
                  <button
                    type="button"
                    onClick={() => setCropState(null)}
                    className="rounded-2xl border border-white/[0.08] px-4 py-2 text-sm text-slate-200 transition hover:bg-white/[0.05]"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    disabled={cropState.isSubmitting}
                    onClick={() => {
                      void handleCropConfirm();
                    }}
                    className="inline-flex items-center gap-2 rounded-2xl bg-[#7c6df7] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#8a7cfa] disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {cropState.isSubmitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Crop className="h-4 w-4" />
                    )}
                    确认裁剪
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {statusNotice ? (
        <div className="pointer-events-none absolute bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full border border-white/[0.08] bg-[#171b27]/95 px-4 py-2 text-sm text-slate-100 shadow-[0_18px_40px_rgba(0,0,0,0.28)]">
          {statusNotice}
        </div>
      ) : null}
    </div>
  );
}
