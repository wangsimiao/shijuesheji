import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Brush, ChevronLeft, Eraser, Loader2, Redo2, Undo2, X } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import {
  addBrandTemplateHydrated,
  createNewProject,
  deleteBrandSpec,
  getBrandSpecs,
  getBrandTemplatesHydrated,
  saveProject,
  upsertBrandSpec,
} from '../store';
import {
  chatWithAI,
  generateImageAI,
  getResolvedImageModelConfigurationMessage,
  isImageModelConfigured,
  GROUP_OUTPUT_MAX_COUNT,
} from '../services/ai';
import type {
  AiVisionLaunchIntent,
  BrandSpec,
  BrandTemplate,
  CanvasCrop,
  CanvasItem,
  CanvasPoint,
  ChatInputImage,
  ChatMessage,
  ChatSession,
  Project,
  ViewState,
} from '../types';
import CanvasStage from './ai-vision/CanvasStage';
import ChatSidebar from './ai-vision/ChatSidebar';
import {
  ActionPopoverState,
  CANVAS_WHEEL_LOCK_MS,
  CANVAS_ZOOM_STEP,
  CHAT_IMAGE_LIMIT,
  CropAspect,
  CropState,
  DEFAULT_BOARD_NAME,
  DEFAULT_CROP_RECT,
  DEFAULT_IMAGE_MODEL_OPTION,
  DEFAULT_LINE_COLOR,
  DEFAULT_SCENE_TAB,
  DEFAULT_SHAPE_FILL,
  DEFAULT_SHAPE_STROKE,
  DEFAULT_SHAPE_STROKE_WIDTH,
  DEFAULT_TEXT_ALIGN,
  DEFAULT_TEXT_COLOR,
  DEFAULT_TEXT_FONT_SIZE,
  DEFAULT_TEXT_FONT_WEIGHT,
  DEFAULT_VIEW,
  DEFAULT_VIEWPORT,
  DRAW_STROKE_WIDTH,
  FIT_VIEW_PADDING,
  InteractionState,
  LocalEditState,
  MAX_SCALE,
  MIN_SCALE,
  ResizeHandle,
  SceneTab,
  ToolMode,
  ViewportSize,
  WORKSPACE_HEADER_HEIGHT,
  buildProjectFromWorkspace,
  buildDrawingFrame,
  clamp,
  createAvoidOverlapPosition,
  createEmptySession,
  createInitialCropState,
  createInitialLocalEditState,
  createLineItem,
  createLocalEditMarkedReferenceSource,
  createLocalEditMaskSource,
  createWorkspaceSnapshotFromProject,
  cropImageSource,
  downloadAsset,
  fitIntoBounds,
  getAspectRatio,
  getClientToWorldPoint,
  getCommittedCrop,
  getCropRect,
  getDefaultSceneBySessionId,
  getDisplayFilename,
  getErrorMessage,
  isOpenRouterImageModelId,
  isEditableTarget,
  loadImageDimensions,
  loadVideoDimensions,
  measureTextItemBox,
  moveCropRect,
  readFileAsDataUrl,
  resizeCropRect,
  updateLineEndpoint,
} from './ai-vision/workspace-model';

interface AiVisionWorkspaceProps {
  project: Project;
  onBack: () => void;
  onOpenProject: (project: Project) => void;
  launchIntent?: AiVisionLaunchIntent | null;
  onConsumeLaunchIntent?: () => void;
}

const WHEEL_PAN_SENSITIVITY = 0.9;
const WHEEL_ZOOM_SENSITIVITY = 0.0048;
const WHEEL_DELTA_DEADZONE = 0.2;
const WHEEL_ZOOM_DEADZONE = 0.01;
const MAX_WHEEL_PAN_DELTA = 180;
const MAX_WHEEL_ZOOM_DELTA = 220;
const PINCH_CENTER_LERP = 0.82;
const PINCH_DISTANCE_LERP = 0.92;
const VIEW_COMMIT_DELAY_MS = 96;

function normalizeProjectName(value: string) {
  return value.replace(/\s+/g, '').trim();
}

function shouldAutoRenameProject(name: string) {
  const normalized = normalizeProjectName(name);
  return (
    normalized.length === 0 ||
    normalized === normalizeProjectName(DEFAULT_BOARD_NAME) ||
    normalized === 'AI设计画布' ||
    normalized === 'AI设计项目' ||
    normalized === 'AI视觉项目' ||
    normalized === 'AI视觉' ||
    normalized === 'AI设计'
  );
}

function deriveProjectNameFromPrompt(prompt: string) {
  const normalized = prompt.replace(/\s+/g, ' ').trim();
  return normalized.slice(0, 18) || DEFAULT_BOARD_NAME;
}

function isFullCrop(crop: CanvasCrop | undefined) {
  if (!crop) return true;
  return (
    Math.abs(crop.x) < 0.0001 &&
    Math.abs(crop.y) < 0.0001 &&
    Math.abs(crop.width - 1) < 0.0001 &&
    Math.abs(crop.height - 1) < 0.0001
  );
}

function getInitialTextBox() {
  const measured = measureTextItemBox('输入文字', {
    fontSize: DEFAULT_TEXT_FONT_SIZE,
    fontWeight: DEFAULT_TEXT_FONT_WEIGHT,
  });
  return {
    width: measured.width,
    height: measured.height,
  };
}

function fitCropRectToAspect(rect: CanvasCrop, aspect: CropAspect): CanvasCrop {
  if (aspect === 'freeform') return rect;
  const ratio = getAspectRatio(aspect);
  if (!ratio) return rect;

  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  const maxWidth = Math.max(0.001, Math.min(centerX * 2, (1 - centerX) * 2, 1));
  const maxHeight = Math.max(0.001, Math.min(centerY * 2, (1 - centerY) * 2, 1));
  let nextWidth = maxWidth;
  let nextHeight = nextWidth / ratio;

  if (nextHeight > maxHeight) {
    nextHeight = maxHeight;
    nextWidth = nextHeight * ratio;
  }

  return {
    x: centerX - nextWidth / 2,
    y: centerY - nextHeight / 2,
    width: nextWidth,
    height: nextHeight,
  };
}

function getItemResizeMinimum(item: CanvasItem) {
  if (item.type === 'text') return { width: 96, height: 40 };
  if (item.type === 'line') return { width: 2, height: 2 };
  return { width: 20, height: 20 };
}

function isAspectLockedItem(item: CanvasItem) {
  return item.type === 'image' || item.type === 'video';
}

function resizeItemFreeform(item: CanvasItem, handle: ResizeHandle, deltaX: number, deltaY: number) {
  const min = getItemResizeMinimum(item);
  let nextX = item.x;
  let nextY = item.y;
  let nextWidth = item.width;
  let nextHeight = item.height;

  if (handle.includes('w')) {
    const candidateX = Math.min(item.x + deltaX, item.x + item.width - min.width);
    nextWidth = item.x + item.width - candidateX;
    nextX = candidateX;
  }
  if (handle.includes('e')) {
    nextWidth = Math.max(min.width, item.width + deltaX);
  }
  if (handle.includes('n')) {
    const candidateY = Math.min(item.y + deltaY, item.y + item.height - min.height);
    nextHeight = item.y + item.height - candidateY;
    nextY = candidateY;
  }
  if (handle.includes('s')) {
    nextHeight = Math.max(min.height, item.height + deltaY);
  }

  return {
    ...item,
    x: nextX,
    y: nextY,
    width: nextWidth,
    height: nextHeight,
  };
}

function resizeItemWithLockedAspect(
  item: CanvasItem,
  handle: ResizeHandle,
  deltaX: number,
  deltaY: number
) {
  if (!handle.includes('n') && !handle.includes('s')) return item;
  if (!handle.includes('e') && !handle.includes('w')) return item;

  const min = getItemResizeMinimum(item);
  const safeWidth = Math.max(item.width, 1);
  const safeHeight = Math.max(item.height, 1);
  const scaleFromX = (safeWidth + (handle.includes('w') ? -deltaX : deltaX)) / safeWidth;
  const scaleFromY = (safeHeight + (handle.includes('n') ? -deltaY : deltaY)) / safeHeight;
  const dominantScale =
    Math.abs(scaleFromX - 1) >= Math.abs(scaleFromY - 1) ? scaleFromX : scaleFromY;
  const minScale = Math.max(min.width / safeWidth, min.height / safeHeight);
  const nextScale = Math.max(minScale, dominantScale);
  const nextWidth = safeWidth * nextScale;
  const nextHeight = safeHeight * nextScale;
  const anchorX = handle.includes('w') ? item.x + item.width : item.x;
  const anchorY = handle.includes('n') ? item.y + item.height : item.y;

  return {
    ...item,
    x: handle.includes('w') ? anchorX - nextWidth : anchorX,
    y: handle.includes('n') ? anchorY - nextHeight : anchorY,
    width: nextWidth,
    height: nextHeight,
  };
}

function resizeItem(item: CanvasItem, handle: ResizeHandle, deltaX: number, deltaY: number) {
  if (isAspectLockedItem(item)) {
    return resizeItemWithLockedAspect(item, handle, deltaX, deltaY);
  }
  return resizeItemFreeform(item, handle, deltaX, deltaY);
}

type NativeGestureEvent = Event & {
  clientX?: number;
  clientY?: number;
  scale?: number;
};

type NativeGestureDriver = 'touch' | 'pointer' | null;

type PointerClientPoint = {
  clientX: number;
  clientY: number;
};

function isTargetInsideContainer(target: EventTarget | null, container: HTMLElement | null) {
  return Boolean(container && target instanceof Node && container.contains(target));
}

function isTouchInsideContainer(touch: Touch, container: HTMLElement | null) {
  if (!container) return false;
  if (isTargetInsideContainer(touch.target, container)) return true;

  const rect = container.getBoundingClientRect();
  return (
    touch.clientX >= rect.left &&
    touch.clientX <= rect.right &&
    touch.clientY >= rect.top &&
    touch.clientY <= rect.bottom
  );
}

function getTouchDistance(first: Touch, second: Touch) {
  return Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
}

function getTouchCenter(first: Touch, second: Touch, rect: DOMRect): CanvasPoint {
  return {
    x: (first.clientX + second.clientX) / 2 - rect.left,
    y: (first.clientY + second.clientY) / 2 - rect.top,
  };
}

function getClientPointDistance(first: PointerClientPoint, second: PointerClientPoint) {
  return Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
}

function getClientPointCenter(
  first: PointerClientPoint,
  second: PointerClientPoint,
  rect: DOMRect
): CanvasPoint {
  return {
    x: (first.clientX + second.clientX) / 2 - rect.left,
    y: (first.clientY + second.clientY) / 2 - rect.top,
  };
}

type MarqueeRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function createMarqueeRect(startPoint: CanvasPoint, currentPoint: CanvasPoint): MarqueeRect {
  const left = Math.min(startPoint.x, currentPoint.x);
  const top = Math.min(startPoint.y, currentPoint.y);
  return {
    x: left,
    y: top,
    width: Math.abs(currentPoint.x - startPoint.x),
    height: Math.abs(currentPoint.y - startPoint.y),
  };
}

function isItemIntersectingMarquee(item: CanvasItem, marquee: MarqueeRect) {
  const itemLeft = item.x;
  const itemTop = item.y;
  const itemRight = item.x + item.width;
  const itemBottom = item.y + item.height;
  const marqueeRight = marquee.x + marquee.width;
  const marqueeBottom = marquee.y + marquee.height;

  return (
    marquee.x <= itemRight &&
    marqueeRight >= itemLeft &&
    marquee.y <= itemBottom &&
    marqueeBottom >= itemTop
  );
}

function cloneCanvasItem(item: CanvasItem, offset = 0): CanvasItem {
  return {
    ...item,
    id: uuidv4(),
    x: item.x + offset,
    y: item.y + offset,
    points: item.points ? item.points.map((point) => ({ ...point })) : undefined,
    crop: item.crop ? { ...item.crop } : undefined,
  };
}

const INTERRUPTED_GENERATION_MESSAGE = '已中断本次生成。';

function resolveInterruptedGenerationState(snapshot: ReturnType<typeof createWorkspaceSnapshotFromProject>) {
  if (!hasTransientGenerationState(snapshot.items, snapshot.sessions)) {
    return snapshot;
  }

  return {
    ...snapshot,
    items: snapshot.items.filter((item) => item.type !== 'loading'),
    sessions: snapshot.sessions.map((session) => {
      if (!session.messages.some((message) => message.isImageLoading)) return session;
      return {
        ...session,
        messages: [
          ...session.messages.filter((message) => !message.isImageLoading),
          {
            id: uuidv4(),
            role: 'assistant' as const,
            content: INTERRUPTED_GENERATION_MESSAGE,
          },
        ],
      };
    }),
  };
}

function hasTransientGenerationState(items: CanvasItem[], sessions: ChatSession[]) {
  return (
    items.some((item) => item.type === 'loading') ||
    sessions.some((session) => session.messages.some((message) => message.isImageLoading))
  );
}

export default function AiVisionWorkspace({
  project,
  onBack,
  onOpenProject,
  launchIntent = null,
  onConsumeLaunchIntent,
}: AiVisionWorkspaceProps) {
  const initialSnapshot = useMemo(
    () => resolveInterruptedGenerationState(createWorkspaceSnapshotFromProject(project)),
    [project]
  );

  const [boardName, setBoardName] = useState(initialSnapshot.boardName);
  const [items, setItems] = useState<CanvasItem[]>(initialSnapshot.items);
  const [sessions, setSessions] = useState<ChatSession[]>(initialSnapshot.sessions);
  const [currentSessionId, setCurrentSessionId] = useState(initialSnapshot.currentSessionId);
  const [view, setView] = useState<ViewState>(initialSnapshot.view);
  const [tool, setTool] = useState<ToolMode>('select');
  const [chatInput, setChatInput] = useState('');
  const [chatInputImages, setChatInputImages] = useState<ChatInputImage[]>([]);
  const [brandTemplates, setBrandTemplates] = useState<BrandTemplate[]>([]);
  const [brandSpecs, setBrandSpecs] = useState<BrandSpec[]>([]);
  const [activeBrandSpecId, setActiveBrandSpecId] = useState<string | null>(initialSnapshot.activeBrandSpecId || null);
  const [activeBrandTemplateId, setActiveBrandTemplateId] = useState<string | null>(initialSnapshot.activeBrandTemplateId || null);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [sceneBySessionId, setSceneBySessionId] = useState<Record<string, SceneTab>>(
    initialSnapshot.sceneBySessionId
  );
  const [actionPopover, setActionPopover] = useState<ActionPopoverState | null>(null);
  const [cropState, setCropState] = useState<CropState | null>(null);
  const [localEditState, setLocalEditState] = useState<LocalEditState | null>(null);
  const [marqueeRect, setMarqueeRect] = useState<MarqueeRect | null>(null);
  const [drawPreviewPoints, setDrawPreviewPoints] = useState<CanvasPoint[] | null>(null);
  const [linePreviewItem, setLinePreviewItem] = useState<CanvasItem | null>(null);
  const [selectedImageModel, setSelectedImageModel] = useState(initialSnapshot.selectedImageModel);
  const [isHistoryMenuOpen, setIsHistoryMenuOpen] = useState(false);
  const [isBrandSpecMenuOpen, setIsBrandSpecMenuOpen] = useState(false);
  const [isBrandMenuOpen, setIsBrandMenuOpen] = useState(false);
  const [isChatSidebarCollapsed, setIsChatSidebarCollapsed] = useState(false);
  const [isSizeConfigMenuOpen, setIsSizeConfigMenuOpen] = useState(false);
  const [activeSizeId, setActiveSizeId] = useState<string | null>(initialSnapshot.activeSizeId || null);
  const [canvasHover, setCanvasHover] = useState(false);
  const [canvasWheelLock, setCanvasWheelLock] = useState(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const [viewportSize, setViewportSize] = useState<ViewportSize>(DEFAULT_VIEWPORT);
  const [editingTextItemId, setEditingTextItemId] = useState<string | null>(null);
  const [editingTextValue, setEditingTextValue] = useState('');
  const [replaceTargetItemId, setReplaceTargetItemId] = useState<string | null>(null);
  const [isCanvasGestureLocked, setIsCanvasGestureLocked] = useState(false);

  const canvasRootRef = useRef<HTMLDivElement | null>(null);
  const canvasViewportRef = useRef<HTMLDivElement | null>(null);
  const canvasTransformRef = useRef<HTMLDivElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const replaceImageInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const chatUploadInputRef = useRef<HTMLInputElement | null>(null);
  const brandTemplateInputRef = useRef<HTMLInputElement | null>(null);
  const localEditImageFrameRef = useRef<HTMLDivElement | null>(null);
  const historyMenuRef = useRef<HTMLDivElement | null>(null);
  const brandSpecMenuRef = useRef<HTMLDivElement | null>(null);
  const brandMenuRef = useRef<HTMLDivElement | null>(null);
  const sizeConfigMenuRef = useRef<HTMLDivElement | null>(null);
  const hasManualBoardNameEditRef = useRef(false);
  const wheelLockTimerRef = useRef<number | null>(null);
  const interactionRef = useRef<InteractionState>(null);
  const localEditStateRef = useRef<LocalEditState | null>(null);
  const activeTouchGestureRef = useRef(false);
  const gestureStartedInCanvasRef = useRef(false);
  const activeTouchIdsRef = useRef<Set<number>>(new Set());
  const activeTouchPointerIdsRef = useRef<Set<number>>(new Set());
  const touchPointerPositionsRef = useRef<Map<number, PointerClientPoint>>(new Map());
  const nativeGestureDriverRef = useRef<NativeGestureDriver>(null);
  const lastPinchDistanceRef = useRef<number | null>(null);
  const lastPinchCenterRef = useRef<CanvasPoint | null>(null);
  const pinchFrameRef = useRef<number | null>(null);
  const pinchPendingRef = useRef<{
    previousCenter: CanvasPoint;
    previousDistance: number;
    nextCenter: CanvasPoint;
    nextDistance: number;
  } | null>(null);
  const wheelFrameRef = useRef<number | null>(null);
  const wheelPanDeltaRef = useRef({ x: 0, y: 0 });
  const wheelZoomDeltaRef = useRef<{
    originX: number;
    originY: number;
    deltaY: number;
  } | null>(null);
  const viewCommitTimerRef = useRef<number | null>(null);
  const isDirectViewInteractionRef = useRef(false);

  const itemsRef = useRef(items);
  const sessionsRef = useRef(sessions);
  const viewRef = useRef(view);
  const viewportSizeRef = useRef(viewportSize);
  const chatInputImagesRef = useRef(chatInputImages);
  const copiedItemsRef = useRef<CanvasItem[] | null>(null);
  const consumedLaunchIntentNonceRef = useRef<string | null>(null);

  function clearTouchGestureState() {
    if (isDirectViewInteractionRef.current) {
      commitLiveViewToState();
    }
    activeTouchGestureRef.current = false;
    gestureStartedInCanvasRef.current = false;
    activeTouchIdsRef.current.clear();
    activeTouchPointerIdsRef.current.clear();
    touchPointerPositionsRef.current.clear();
    nativeGestureDriverRef.current = null;
    lastPinchDistanceRef.current = null;
    lastPinchCenterRef.current = null;
    pinchPendingRef.current = null;
    setIsCanvasGestureLocked(false);
    setCanvasHover(false);
    setCanvasWheelLock(false);
    if (wheelLockTimerRef.current) {
      window.clearTimeout(wheelLockTimerRef.current);
      wheelLockTimerRef.current = null;
    }
    if (pinchFrameRef.current !== null) {
      window.cancelAnimationFrame(pinchFrameRef.current);
      pinchFrameRef.current = null;
    }
    wheelPanDeltaRef.current = { x: 0, y: 0 };
    wheelZoomDeltaRef.current = null;
    if (wheelFrameRef.current !== null) {
      window.cancelAnimationFrame(wheelFrameRef.current);
      wheelFrameRef.current = null;
    }
    if (viewCommitTimerRef.current !== null) {
      window.clearTimeout(viewCommitTimerRef.current);
      viewCommitTimerRef.current = null;
    }
    isDirectViewInteractionRef.current = false;
  }

  function renderViewTransform(nextView: ViewState) {
    viewRef.current = nextView;
    const transformNode = canvasTransformRef.current;
    if (transformNode) {
      transformNode.style.transform = `translate3d(${nextView.x}px, ${nextView.y}px, 0) scale(${nextView.scale})`;
    }
  }

  function commitLiveViewToState() {
    if (viewCommitTimerRef.current !== null) {
      window.clearTimeout(viewCommitTimerRef.current);
      viewCommitTimerRef.current = null;
    }
    isDirectViewInteractionRef.current = false;
    const nextView = viewRef.current;
    setView((previous) => {
      if (
        Math.abs(previous.x - nextView.x) < 0.0001 &&
        Math.abs(previous.y - nextView.y) < 0.0001 &&
        Math.abs(previous.scale - nextView.scale) < 0.000001
      ) {
        return previous;
      }
      return {
        ...previous,
        x: nextView.x,
        y: nextView.y,
        scale: nextView.scale,
      };
    });
  }

  function scheduleLiveViewCommit() {
    if (viewCommitTimerRef.current !== null) {
      window.clearTimeout(viewCommitTimerRef.current);
    }
    viewCommitTimerRef.current = window.setTimeout(() => {
      commitLiveViewToState();
    }, VIEW_COMMIT_DELAY_MS);
  }

  function applyLiveViewUpdate(updater: (previous: ViewState) => ViewState) {
    isDirectViewInteractionRef.current = true;
    const nextView = updater(viewRef.current);
    renderViewTransform(nextView);
    scheduleLiveViewCommit();
  }

  function applyPinchTransform(
    previous: ViewState,
    previousCenter: CanvasPoint,
    previousDistance: number,
    nextCenter: CanvasPoint,
    nextDistance: number
  ) {
    const safeScaleRatio = previousDistance > 0 ? nextDistance / previousDistance : 1;
    const nextScale = clamp(previous.scale * safeScaleRatio, MIN_SCALE, MAX_SCALE);
    const worldX = (previousCenter.x - previous.x) / previous.scale;
    const worldY = (previousCenter.y - previous.y) / previous.scale;

    return {
      ...previous,
      scale: nextScale,
      x: nextCenter.x - worldX * nextScale,
      y: nextCenter.y - worldY * nextScale,
    };
  }

  function schedulePinchViewUpdate(payload: {
    previousCenter: CanvasPoint;
    previousDistance: number;
    nextCenter: CanvasPoint;
    nextDistance: number;
  }) {
    pinchPendingRef.current = payload;
    if (pinchFrameRef.current !== null) return;
    pinchFrameRef.current = window.requestAnimationFrame(() => {
      pinchFrameRef.current = null;
      const pending = pinchPendingRef.current;
      pinchPendingRef.current = null;
      if (!pending) return;
      applyLiveViewUpdate((previous) =>
        applyPinchTransform(
          previous,
          pending.previousCenter,
          pending.previousDistance,
          pending.nextCenter,
          pending.nextDistance
        )
      );
    });
  }

  function scheduleWheelViewUpdate() {
    if (wheelFrameRef.current !== null) return;
    wheelFrameRef.current = window.requestAnimationFrame(() => {
      wheelFrameRef.current = null;
      const panDelta = wheelPanDeltaRef.current;
      const zoomDelta = wheelZoomDeltaRef.current;
      wheelPanDeltaRef.current = { x: 0, y: 0 };
      wheelZoomDeltaRef.current = null;

      if (
        Math.abs(panDelta.x) < WHEEL_DELTA_DEADZONE &&
        Math.abs(panDelta.y) < WHEEL_DELTA_DEADZONE &&
        (!zoomDelta || Math.abs(zoomDelta.deltaY) < WHEEL_ZOOM_DEADZONE)
      ) {
        return;
      }

      applyLiveViewUpdate((previous) => {
        let next = previous;
        if (
          Math.abs(panDelta.x) >= WHEEL_DELTA_DEADZONE ||
          Math.abs(panDelta.y) >= WHEEL_DELTA_DEADZONE
        ) {
          next = {
            ...next,
            x: next.x - panDelta.x * WHEEL_PAN_SENSITIVITY,
            y: next.y - panDelta.y * WHEEL_PAN_SENSITIVITY,
          };
        }

        if (zoomDelta && Math.abs(zoomDelta.deltaY) >= WHEEL_ZOOM_DEADZONE) {
          const rawScaleRatio = Math.exp(-zoomDelta.deltaY * WHEEL_ZOOM_SENSITIVITY);
          const scaleRatio = clamp(rawScaleRatio, 0.35, 2.8);
          const safeScale = clamp(next.scale * scaleRatio, MIN_SCALE, MAX_SCALE);
          const worldX = (zoomDelta.originX - next.x) / next.scale;
          const worldY = (zoomDelta.originY - next.y) / next.scale;
          next = {
            ...next,
            scale: safeScale,
            x: zoomDelta.originX - worldX * safeScale,
            y: zoomDelta.originY - worldY * safeScale,
          };
        }

        return next;
      });
    });
  }

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    localEditStateRef.current = localEditState;
  }, [localEditState]);

  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  useEffect(() => {
    if (isDirectViewInteractionRef.current) return;
    renderViewTransform(view);
  }, [view]);

  useEffect(() => {
    viewportSizeRef.current = viewportSize;
  }, [viewportSize]);

  useEffect(() => {
    chatInputImagesRef.current = chatInputImages;
  }, [chatInputImages]);

  useEffect(() => {
    return () => {
      if (wheelLockTimerRef.current) {
        window.clearTimeout(wheelLockTimerRef.current);
      }
      if (pinchFrameRef.current !== null) {
        window.cancelAnimationFrame(pinchFrameRef.current);
      }
      if (wheelFrameRef.current !== null) {
        window.cancelAnimationFrame(wheelFrameRef.current);
      }
      if (viewCommitTimerRef.current !== null) {
        window.clearTimeout(viewCommitTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.add('ai-vision-workspace-active');
    document.body.classList.add('ai-vision-workspace-active');

    const viewportMeta = document.querySelector('meta[name="viewport"]');
    const previousViewportContent = viewportMeta?.getAttribute('content') || null;
    viewportMeta?.setAttribute(
      'content',
      'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no'
    );

    return () => {
      document.documentElement.classList.remove('ai-vision-workspace-active');
      document.body.classList.remove('ai-vision-workspace-active');
      if (viewportMeta) {
        viewportMeta.setAttribute(
          'content',
          previousViewportContent || 'width=device-width, initial-scale=1.0'
        );
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
    const specs = getBrandSpecs();
    if (!cancelled) {
      setBrandSpecs(specs);
      setActiveBrandSpecId(null);
    }
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
    const preventCapturedGesture = (event: Event) => {
      if (event.cancelable) {
        event.preventDefault();
      }
      event.stopPropagation();
    };

    const preventDefaultOnly = (event: Event) => {
      if (event.cancelable) {
        event.preventDefault();
      }
    };

    const handleTouchStartCapture = (event: TouchEvent) => {
      if (nativeGestureDriverRef.current === 'pointer') return;
      const canvas = canvasRootRef.current;
      if (!canvas) return;

      let hasCanvasTouchStart = false;

      for (const touch of Array.from(event.changedTouches)) {
        if (isTouchInsideContainer(touch, canvas)) {
          activeTouchIdsRef.current.add(touch.identifier);
          hasCanvasTouchStart = true;
        }
      }

      const currentTouches = Array.from(event.touches);
      const hasCanvasOwnedTouch = currentTouches.some((touch) =>
        activeTouchIdsRef.current.has(touch.identifier)
      );

       if (hasCanvasTouchStart || hasCanvasOwnedTouch) {
        preventDefaultOnly(event);
      }

      if (!activeTouchGestureRef.current && currentTouches.length >= 2 && hasCanvasOwnedTouch) {
        const [firstTouch, secondTouch] = currentTouches;
        const rect = canvas.getBoundingClientRect();
        nativeGestureDriverRef.current = 'touch';
        gestureStartedInCanvasRef.current = true;
        activeTouchGestureRef.current = true;
        setIsCanvasGestureLocked(true);
        interactionRef.current = null;
        lastPinchDistanceRef.current = getTouchDistance(firstTouch, secondTouch);
        lastPinchCenterRef.current = getTouchCenter(firstTouch, secondTouch, rect);
      }

      if (gestureStartedInCanvasRef.current) {
        preventCapturedGesture(event);
      }
    };

    const handleTouchMoveCapture = (event: TouchEvent) => {
      if (nativeGestureDriverRef.current === 'pointer') return;
      if (activeTouchIdsRef.current.size > 0) {
        preventDefaultOnly(event);
      }
      if (!gestureStartedInCanvasRef.current) return;

      if (!activeTouchGestureRef.current || event.touches.length < 2) {
        preventCapturedGesture(event);
        return;
      }

      const canvas = canvasRootRef.current;
      if (!canvas) {
        clearTouchGestureState();
        return;
      }

      const [firstTouch, secondTouch] = Array.from(event.touches);
      const rect = canvas.getBoundingClientRect();
      const nextCenter = getTouchCenter(firstTouch, secondTouch, rect);
      const nextDistance = getTouchDistance(firstTouch, secondTouch);
      const previousCenter = lastPinchCenterRef.current || nextCenter;
      const previousDistance = lastPinchDistanceRef.current || nextDistance;
      const smoothCenter = {
        x: previousCenter.x + (nextCenter.x - previousCenter.x) * PINCH_CENTER_LERP,
        y: previousCenter.y + (nextCenter.y - previousCenter.y) * PINCH_CENTER_LERP,
      };
      const smoothDistance =
        previousDistance + (nextDistance - previousDistance) * PINCH_DISTANCE_LERP;

      preventCapturedGesture(event);

      schedulePinchViewUpdate({
        previousCenter,
        previousDistance,
        nextCenter: smoothCenter,
        nextDistance: smoothDistance,
      });

      lastPinchDistanceRef.current = smoothDistance;
      lastPinchCenterRef.current = smoothCenter;
    };

    const handleTouchEndCapture = (event: TouchEvent) => {
      if (nativeGestureDriverRef.current === 'pointer') return;
      if (activeTouchIdsRef.current.size > 0 || gestureStartedInCanvasRef.current) {
        preventDefaultOnly(event);
      }
      for (const touch of Array.from(event.changedTouches)) {
        activeTouchIdsRef.current.delete(touch.identifier);
      }

      if (!gestureStartedInCanvasRef.current) {
        if (event.touches.length === 0) {
          activeTouchIdsRef.current.clear();
        }
        return;
      }

      if (event.touches.length < 2) {
        activeTouchGestureRef.current = false;
        lastPinchDistanceRef.current = null;
        lastPinchCenterRef.current = null;
      }

      if (event.touches.length === 0) {
        clearTouchGestureState();
      }

      preventCapturedGesture(event);
    };

    const handleTouchCancelCapture = (event: TouchEvent) => {
      if (nativeGestureDriverRef.current === 'pointer') return;
      if (!gestureStartedInCanvasRef.current && activeTouchIdsRef.current.size === 0) return;
      clearTouchGestureState();
      preventCapturedGesture(event);
    };

    const handleGestureCapture = (event: Event) => {
      const canvas = canvasRootRef.current;
      if (
        activeTouchGestureRef.current ||
        gestureStartedInCanvasRef.current ||
        isTargetInsideContainer((event as NativeGestureEvent).target, canvas)
      ) {
        preventCapturedGesture(event);
      }
    };

    const getOwnedPointerTouches = () => {
      return Array.from(activeTouchPointerIdsRef.current)
        .map((pointerId) => touchPointerPositionsRef.current.get(pointerId))
        .filter((point): point is PointerClientPoint => Boolean(point))
        .slice(0, 2);
    };

    const handlePointerDownCapture = (event: PointerEvent) => {
      if (event.pointerType !== 'touch' || nativeGestureDriverRef.current === 'touch') return;

      const canvas = canvasRootRef.current;
      if (!canvas) return;

      const isCanvasHit = isTargetInsideContainer(event.target, canvas);
      const shouldOwnPointer =
        isCanvasHit ||
        activeTouchPointerIdsRef.current.size > 0 ||
        gestureStartedInCanvasRef.current ||
        activeTouchGestureRef.current;

      if (!shouldOwnPointer) return;

      preventDefaultOnly(event);

      activeTouchPointerIdsRef.current.add(event.pointerId);
      touchPointerPositionsRef.current.set(event.pointerId, {
        clientX: event.clientX,
        clientY: event.clientY,
      });

      try {
        canvas.setPointerCapture(event.pointerId);
      } catch {
        // Ignore unsupported capture errors; document listeners still keep ownership.
      }

      if (!activeTouchGestureRef.current && activeTouchPointerIdsRef.current.size >= 2) {
        const points = getOwnedPointerTouches();
        if (points.length >= 2) {
          const rect = canvas.getBoundingClientRect();
          nativeGestureDriverRef.current = 'pointer';
          gestureStartedInCanvasRef.current = true;
          activeTouchGestureRef.current = true;
          setIsCanvasGestureLocked(true);
          interactionRef.current = null;
          lastPinchDistanceRef.current = getClientPointDistance(points[0], points[1]);
          lastPinchCenterRef.current = getClientPointCenter(points[0], points[1], rect);
        }
      }

      if (gestureStartedInCanvasRef.current || activeTouchPointerIdsRef.current.size >= 2) {
        preventCapturedGesture(event);
      }
    };

    const handlePointerMoveCapture = (event: PointerEvent) => {
      if (event.pointerType !== 'touch' || nativeGestureDriverRef.current === 'touch') return;
      if (!activeTouchPointerIdsRef.current.has(event.pointerId)) return;

      preventDefaultOnly(event);

      touchPointerPositionsRef.current.set(event.pointerId, {
        clientX: event.clientX,
        clientY: event.clientY,
      });

      if (!gestureStartedInCanvasRef.current || nativeGestureDriverRef.current !== 'pointer') return;

      preventCapturedGesture(event);

      const canvas = canvasRootRef.current;
      if (!canvas) {
        clearTouchGestureState();
        return;
      }

      const points = getOwnedPointerTouches();
      if (points.length < 2) return;

      const rect = canvas.getBoundingClientRect();
      const nextCenter = getClientPointCenter(points[0], points[1], rect);
      const nextDistance = getClientPointDistance(points[0], points[1]);
      const previousCenter = lastPinchCenterRef.current || nextCenter;
      const previousDistance = lastPinchDistanceRef.current || nextDistance;
      const smoothCenter = {
        x: previousCenter.x + (nextCenter.x - previousCenter.x) * PINCH_CENTER_LERP,
        y: previousCenter.y + (nextCenter.y - previousCenter.y) * PINCH_CENTER_LERP,
      };
      const smoothDistance =
        previousDistance + (nextDistance - previousDistance) * PINCH_DISTANCE_LERP;

      schedulePinchViewUpdate({
        previousCenter,
        previousDistance,
        nextCenter: smoothCenter,
        nextDistance: smoothDistance,
      });

      lastPinchDistanceRef.current = smoothDistance;
      lastPinchCenterRef.current = smoothCenter;
    };

    const handlePointerReleaseCapture = (event: PointerEvent) => {
      if (event.pointerType !== 'touch' || nativeGestureDriverRef.current === 'touch') return;
      if (!activeTouchPointerIdsRef.current.has(event.pointerId) && !gestureStartedInCanvasRef.current) return;

      preventDefaultOnly(event);

      activeTouchPointerIdsRef.current.delete(event.pointerId);
      touchPointerPositionsRef.current.delete(event.pointerId);

      if (nativeGestureDriverRef.current === 'pointer' && gestureStartedInCanvasRef.current) {
        preventCapturedGesture(event);
      }

      if (activeTouchPointerIdsRef.current.size < 2) {
        activeTouchGestureRef.current = false;
        lastPinchDistanceRef.current = null;
        lastPinchCenterRef.current = null;
      }

      if (activeTouchPointerIdsRef.current.size === 0) {
        clearTouchGestureState();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') {
        clearTouchGestureState();
      }
    };

    const handleWindowBlur = () => {
      clearTouchGestureState();
    };

    document.addEventListener('touchstart', handleTouchStartCapture, {
      capture: true,
      passive: false,
    });
    document.addEventListener('touchmove', handleTouchMoveCapture, {
      capture: true,
      passive: false,
    });
    document.addEventListener('touchend', handleTouchEndCapture, {
      capture: true,
      passive: false,
    });
    document.addEventListener('touchcancel', handleTouchCancelCapture, {
      capture: true,
      passive: false,
    });
    document.addEventListener('pointerdown', handlePointerDownCapture, {
      capture: true,
      passive: false,
    });
    document.addEventListener('pointermove', handlePointerMoveCapture, {
      capture: true,
      passive: false,
    });
    document.addEventListener('pointerup', handlePointerReleaseCapture, {
      capture: true,
      passive: false,
    });
    document.addEventListener('pointercancel', handlePointerReleaseCapture, {
      capture: true,
      passive: false,
    });
    document.addEventListener('lostpointercapture', handlePointerReleaseCapture, {
      capture: true,
      passive: false,
    });
    document.addEventListener('gesturestart', handleGestureCapture, {
      capture: true,
      passive: false,
    } as AddEventListenerOptions);
    document.addEventListener('gesturechange', handleGestureCapture, {
      capture: true,
      passive: false,
    } as AddEventListenerOptions);
    document.addEventListener('gestureend', handleGestureCapture, {
      capture: true,
      passive: false,
    } as AddEventListenerOptions);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      document.removeEventListener('touchstart', handleTouchStartCapture, true);
      document.removeEventListener('touchmove', handleTouchMoveCapture, true);
      document.removeEventListener('touchend', handleTouchEndCapture, true);
      document.removeEventListener('touchcancel', handleTouchCancelCapture, true);
      document.removeEventListener('pointerdown', handlePointerDownCapture, true);
      document.removeEventListener('pointermove', handlePointerMoveCapture, true);
      document.removeEventListener('pointerup', handlePointerReleaseCapture, true);
      document.removeEventListener('pointercancel', handlePointerReleaseCapture, true);
      document.removeEventListener('lostpointercapture', handlePointerReleaseCapture, true);
      document.removeEventListener('gesturestart', handleGestureCapture, true);
      document.removeEventListener('gesturechange', handleGestureCapture, true);
      document.removeEventListener('gestureend', handleGestureCapture, true);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, []);

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
    if (hasTransientGenerationState(items, sessions)) {
      return undefined;
    }

    let cancelled = false;

    void saveProject(
      buildProjectFromWorkspace(project, {
        boardName,
        items,
        sessions,
        currentSessionId,
        view,
        selectedImageModel,
        activeSizeId,
        activeBrandSpecId,
        activeBrandTemplateId,
        sceneBySessionId,
      })
    )
      .then(() => {
        if (!cancelled) {
          setStorageWarning(null);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setStorageWarning(`本地保存失败：${getErrorMessage(error)}`);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [boardName, currentSessionId, items, project, sceneBySessionId, selectedImageModel, sessions, view]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target instanceof Node ? event.target : null;
      if (historyMenuRef.current && target && !historyMenuRef.current.contains(target)) {
        setIsHistoryMenuOpen(false);
      }
      if (brandSpecMenuRef.current && target && !brandSpecMenuRef.current.contains(target)) {
        setIsBrandSpecMenuOpen(false);
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
  const activeBrandSpec = activeBrandSpecId
    ? brandSpecs.find((item) => item.id === activeBrandSpecId) || null
    : null;
  const activeBrandTemplate = activeBrandTemplateId
    ? brandTemplates.find((item) => item.id === activeBrandTemplateId) || null
    : null;
  const activeBrandSpecSystemPrompt = activeBrandSpec?.specText?.trim()
    ? `当前品牌规范（仅供模型遵循，不要原文复述给用户）：\n${activeBrandSpec.specText.trim()}`
    : '';
  const activeBrandTemplateSystemPrompt = activeBrandTemplate
    ? `当前品牌模板：${activeBrandTemplate.name}。请保持与该模板一致的品牌视觉语气与版式风格。`
    : '';
  const activeBrandSystemPrompt = [activeBrandSpecSystemPrompt, activeBrandTemplateSystemPrompt]
    .filter(Boolean)
    .join('\n\n') || undefined;
  const hiddenTemplateReferences = activeBrandTemplate?.image ? [activeBrandTemplate.image] : [];
  const effectiveSelectedImageModel = selectedImageModel || DEFAULT_IMAGE_MODEL_OPTION.value;
  const isSelectedImageModelConfigured = isImageModelConfigured(effectiveSelectedImageModel);
  const selectedImageModelConfigurationMessage = getResolvedImageModelConfigurationMessage(
    effectiveSelectedImageModel
  );

  useEffect(() => {
    if (!launchIntent) return;
    if (launchIntent.targetProjectId !== project.id) return;
    if (!currentSession) return;
    if (consumedLaunchIntentNonceRef.current === launchIntent.nonce) return;

    consumedLaunchIntentNonceRef.current = launchIntent.nonce;

    const normalizedPrompt = (launchIntent.prompt || '').trim();
    const normalizedImages = Array.isArray(launchIntent.attachedImages)
      ? launchIntent.attachedImages.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : [];
    const attachedImages = normalizedImages.slice(0, CHAT_IMAGE_LIMIT);
    const launchSystemPrompt = launchIntent.systemPrompt?.trim() || undefined;

    if (launchIntent.selectedImageModel) {
      setSelectedImageModel(launchIntent.selectedImageModel);
    }
    if (typeof launchIntent.activeBrandSpecId !== 'undefined') {
      setActiveBrandSpecId(launchIntent.activeBrandSpecId || null);
    }
    if (typeof launchIntent.activeSizeId !== 'undefined') {
      setActiveSizeId(launchIntent.activeSizeId || null);
    }
    setChatInput('');
    setChatInputImages([]);
    onConsumeLaunchIntent?.();

    if (!normalizedPrompt && attachedImages.length === 0) return;

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        void handleSendMessage({
          prompt: normalizedPrompt,
          attachedImages,
          selectedModel: launchIntent.selectedImageModel || selectedImageModel,
          sizeHint: launchIntent.activeSizeId || undefined,
          systemPrompt: launchSystemPrompt,
        });
      });
    });
  }, [currentSession, launchIntent, onConsumeLaunchIntent, project.id, selectedImageModel]);

  const selectedItemId = view.selectedItemIds[0] || null;
  const selectedItem = selectedItemId
    ? items.find((item) => item.id === selectedItemId) || null
    : null;
  const selectedImageItem = selectedItem?.type === 'image' ? selectedItem : null;

  const selectedItemToolbarPosition = selectedItem
    ? {
        left: view.x + (selectedItem.x + selectedItem.width / 2) * view.scale,
        top: view.y + selectedItem.y * view.scale - 18,
      }
    : null;

  const cropTargetItem =
    cropState && items.find((item) => item.id === cropState.itemId && item.type === 'image')
      ? (items.find((item) => item.id === cropState.itemId && item.type === 'image') as CanvasItem)
      : null;

  useEffect(() => {
    if (!actionPopover) return;
    const exists = items.some((item) => item.id === actionPopover.itemId && item.type === 'image');
    if (!exists) setActionPopover(null);
  }, [actionPopover, items]);

  useEffect(() => {
    if (!cropState) return;
    const exists = items.some((item) => item.id === cropState.itemId && item.type === 'image');
    if (!exists) setCropState(null);
  }, [cropState, items]);

  useEffect(() => {
    if (!localEditState) return;
    const exists = items.some((item) => item.id === localEditState.itemId && item.type === 'image');
    if (!exists) setLocalEditState(null);
  }, [localEditState, items]);

  useEffect(() => {
    if (editingTextItemId && !items.some((item) => item.id === editingTextItemId)) {
      setEditingTextItemId(null);
      setEditingTextValue('');
    }
  }, [editingTextItemId, items]);

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

  function getWheelDeltaInPixels(delta: number, deltaMode: number) {
    if (deltaMode === 1) return delta * 16;
    if (deltaMode === 2) return delta * viewportSizeRef.current.height;
    return delta;
  }

  function applyCanvasPanFromWheel(event: Pick<WheelEvent, 'deltaX' | 'deltaY' | 'deltaMode'>) {
    const deltaX = clamp(
      getWheelDeltaInPixels(event.deltaX, event.deltaMode),
      -MAX_WHEEL_PAN_DELTA,
      MAX_WHEEL_PAN_DELTA
    );
    const deltaY = clamp(
      getWheelDeltaInPixels(event.deltaY, event.deltaMode),
      -MAX_WHEEL_PAN_DELTA,
      MAX_WHEEL_PAN_DELTA
    );
    if (Math.abs(deltaX) < WHEEL_DELTA_DEADZONE && Math.abs(deltaY) < WHEEL_DELTA_DEADZONE) {
      return;
    }
    wheelPanDeltaRef.current = {
      x: wheelPanDeltaRef.current.x + deltaX,
      y: wheelPanDeltaRef.current.y + deltaY,
    };
    scheduleWheelViewUpdate();
  }

  function applyCanvasZoomFromWheel(deltaY: number, originX: number, originY: number) {
    const normalizedDeltaY = clamp(deltaY, -MAX_WHEEL_ZOOM_DELTA, MAX_WHEEL_ZOOM_DELTA);
    if (Math.abs(normalizedDeltaY) < WHEEL_ZOOM_DEADZONE) {
      return;
    }
    const existing = wheelZoomDeltaRef.current;
    if (existing) {
      existing.deltaY += normalizedDeltaY;
      existing.originX = originX;
      existing.originY = originY;
    } else {
      wheelZoomDeltaRef.current = { deltaY: normalizedDeltaY, originX, originY };
    }
    scheduleWheelViewUpdate();
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

  async function exportImageSource(item: CanvasItem) {
    if (item.type !== 'image' || !item.crop) return item.content;
    const natural = await loadImageDimensions(item.content).catch(() => ({ width: 1024, height: 1024 }));
    const rect = getCropRect(natural.width, natural.height, item.crop);
    return cropImageSource(item.content, rect, item.mimeType || 'image/png');
  }

  async function addChatReferenceImage(
    data: string,
    name?: string,
    source: ChatInputImage['source'] = 'canvas'
  ) {
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

  async function handleCreateSession() {
    const nextProject = await createNewProject(DEFAULT_BOARD_NAME);
    onOpenProject(nextProject);
  }

  function handleSelectScene(scene: SceneTab) {
    if (!currentSession) return;
    setSceneBySessionId((previous) => ({
      ...previous,
      [currentSession.id]: scene,
    }));
  }

  function handleSelectBrandSpec(brandSpecId: string | null) {
    if (!brandSpecId) {
      setActiveBrandSpecId(null);
      setStatusNotice('已取消品牌规范');
      return;
    }
    if (!brandSpecs.some((item) => item.id === brandSpecId)) return;
    setActiveBrandSpecId(brandSpecId);
    setStatusNotice(`已选中品牌规范：${brandSpecs.find((item) => item.id === brandSpecId)?.brandName || ''}`);
  }

  async function handleDeleteBrandSpec(brandSpecId: string) {
    const nextSpecs = deleteBrandSpec(brandSpecId);
    setBrandSpecs(nextSpecs);
    const nextActiveId =
      nextSpecs.find((item) => item.id === activeBrandSpecId)?.id || null;
    setActiveBrandSpecId(nextActiveId);
    setStatusNotice('品牌规范已删除');
  }

  async function handleSaveBrandSpec(brandSpecId: string, specText: string) {
    const existing = brandSpecs.find((item) => item.id === brandSpecId);
    if (!existing) return;
    const nextSpec = upsertBrandSpec(existing.brandName, specText);
    setBrandSpecs((previous) =>
      previous.map((item) => (item.id === existing.id ? nextSpec : item))
    );
    setActiveBrandSpecId(nextSpec.id);
    setStatusNotice('品牌规范已保存。');
  }

  async function handleCreateBrandSpec(brandName: string) {
    const trimmed = brandName.trim();
    if (!trimmed) {
      setStatusNotice('请先输入品牌名。');
      return;
    }
    const nextSpec = upsertBrandSpec(trimmed, '');
    setBrandSpecs((previous) => {
      const existingIndex = previous.findIndex((item) => item.id === nextSpec.id);
      if (existingIndex >= 0) {
        return previous.map((item) => (item.id === nextSpec.id ? nextSpec : item));
      }
      return [nextSpec, ...previous];
    });
    setActiveBrandSpecId(nextSpec.id);
    setStatusNotice(`已新增品牌规范：${trimmed}`);
  }

  function handleSelectBrandTemplate(templateId: string | null) {
    setActiveBrandTemplateId(templateId);
    setStatusNotice(templateId ? '已选中品牌模板' : '已取消品牌模板');
  }

  async function handleUploadBrandTemplate(file: File) {
    const data = await readFileAsDataUrl(file);
    const template = await addBrandTemplateHydrated(file.name.replace(/\.[^.]+$/, ''), data);
    setBrandTemplates((previous) => [template, ...previous.filter((item) => item.id !== template.id)]);
    setActiveBrandTemplateId(template.id);
    setIsBrandMenuOpen(false);
    setStatusNotice('品牌模板已加入输入区。');
  }

  async function handleUploadReferenceImage(file: File) {
    try {
      const data = await readFileAsDataUrl(file);
      await addChatReferenceImage(data, file.name, 'local');
    } catch (error) {
      setStatusNotice(getErrorMessage(error));
    }
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

  async function replaceSelectedImageFile(file: File) {
    const targetId = replaceTargetItemId || selectedImageItem?.id;
    if (!targetId) return;

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setItems((previous) =>
        previous.map((item) =>
          item.id === targetId && item.type === 'image'
            ? {
                ...item,
                content: dataUrl,
                prompt: file.name.replace(/\.[^.]+$/, ''),
                mimeType: file.type || 'image/png',
                sourceKind: 'uploaded',
                crop: undefined,
              }
            : item
        )
      );
      setStatusNotice('图片已替换。');
    } catch (error) {
      setStatusNotice(getErrorMessage(error));
    } finally {
      setReplaceTargetItemId(null);
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

  function startTextEditing(item: CanvasItem) {
    if (item.type !== 'text') return;
    setSingleSelection(item.id);
    setEditingTextItemId(item.id);
    setEditingTextValue(item.content);
    setCropState(null);
  }

  function createTextItem(point: CanvasPoint) {
    const defaultText = '输入文字';
    const box = getInitialTextBox();
    const item: CanvasItem = {
      id: uuidv4(),
      type: 'text',
      x: point.x,
      y: point.y,
      width: box.width,
      height: box.height,
      content: defaultText,
      mimeType: 'text/plain',
      fontSize: DEFAULT_TEXT_FONT_SIZE,
      fontWeight: DEFAULT_TEXT_FONT_WEIGHT,
      color: DEFAULT_TEXT_COLOR,
      textAlign: DEFAULT_TEXT_ALIGN,
    };
    setItems((previous) => [...previous, item]);
    setSingleSelection(item.id);
    setEditingTextItemId(item.id);
    setEditingTextValue(defaultText);
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
      fillColor: DEFAULT_SHAPE_FILL,
      strokeColor: DEFAULT_SHAPE_STROKE,
      strokeWidth: DEFAULT_SHAPE_STROKE_WIDTH,
    };
    setItems((previous) => [...previous, item]);
    setSingleSelection(item.id);
  }

  function createLoadingItem(prompt: string, preferred?: { x: number; y: number }) {
    const width = 520;
    const height = 520;
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
      content: prompt || '正在生成...',
      prompt,
    };
    setItems((previous) => [...previous, item]);
    return item.id;
  }

  function createLoadingItems(prompt: string, count: number) {
    const safeCount = Math.max(1, Math.min(GROUP_OUTPUT_MAX_COUNT, Math.round(count || 1)));
    if (safeCount === 1) {
      return [createLoadingItem(prompt)];
    }

    const width = 520;
    const height = 520;
    const gap = 28;
    const columns = safeCount > 4 ? 4 : (safeCount > 2 ? 2 : safeCount);
    const occupiedItems: CanvasItem[] = [...itemsRef.current];
    const seedPosition = createAvoidOverlapPosition(
      occupiedItems,
      viewRef.current,
      viewportSizeRef.current,
      width,
      height
    );

    const loadingItems: CanvasItem[] = Array.from({ length: safeCount }).map((_, index) => {
      const row = Math.floor(index / columns);
      const column = index % columns;
      const preferred = {
        x: seedPosition.x + column * (width + gap),
        y: seedPosition.y + row * (height + gap),
      };
      const position = createAvoidOverlapPosition(
        occupiedItems,
        viewRef.current,
        viewportSizeRef.current,
        width,
        height,
        preferred
      );
      const nextItem: CanvasItem = {
        id: uuidv4(),
        type: 'loading',
        x: position.x,
        y: position.y,
        width,
        height,
        content: prompt || '正在生成...',
        prompt,
      };
      occupiedItems.push(nextItem);
      return nextItem;
    });

    setItems((previous) => [...previous, ...loadingItems]);
    return loadingItems.map((item) => item.id);
  }

  function finishTextEditing() {
    if (!editingTextItemId) return;
    const item = itemsRef.current.find((current) => current.id === editingTextItemId && current.type === 'text');
    if (!item) {
      setEditingTextItemId(null);
      setEditingTextValue('');
      return;
    }

    const nextContent = editingTextValue.trim();
    if (!nextContent) {
      setItems((previous) => previous.filter((current) => current.id !== editingTextItemId));
      if (selectedItemId === editingTextItemId) {
        setSingleSelection(null);
      }
      setEditingTextItemId(null);
      setEditingTextValue('');
      return;
    }

    const measured = measureTextItemBox(nextContent, {
      fontSize: item.fontSize,
      fontWeight: item.fontWeight,
    });

    setItems((previous) =>
      previous.map((current) =>
        current.id === editingTextItemId
          ? {
              ...current,
              content: nextContent,
              width: measured.width,
              height: measured.height,
            }
          : current
      )
    );
    setEditingTextItemId(null);
    setEditingTextValue('');
  }

  function handleCanvasPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    if (event.pointerType === 'touch' && gestureStartedInCanvasRef.current) return;
    if (editingTextItemId) finishTextEditing();
    if (cropState) return;
    if (localEditState) return;

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

    if (tool === 'line') {
      interactionRef.current = {
        type: 'line-create',
        startPoint: point,
        currentPoint: point,
      };
      setLinePreviewItem(createLineItem(point, point));
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

    setActionPopover(null);
    if (event.altKey) {
      setSingleSelection(null);
      interactionRef.current = {
        type: 'pan',
        startClientX: event.clientX,
        startClientY: event.clientY,
        originX: viewRef.current.x,
        originY: viewRef.current.y,
      };
      return;
    }

    if (!event.shiftKey) {
      setSingleSelection(null);
    }
    interactionRef.current = {
      type: 'marquee',
      startClientX: event.clientX,
      startClientY: event.clientY,
      currentClientX: event.clientX,
      currentClientY: event.clientY,
      startPoint: point,
      currentPoint: point,
      appendSelection: event.shiftKey,
    };
    setMarqueeRect(createMarqueeRect(point, point));
  }

  function handleItemPointerDown(event: React.PointerEvent<HTMLDivElement>, item: CanvasItem) {
    event.stopPropagation();
    if (event.button !== 0) return;
    if (event.pointerType === 'touch' && gestureStartedInCanvasRef.current) return;
    if (cropState) return;
    if (localEditState) return;
    if (editingTextItemId && editingTextItemId !== item.id) finishTextEditing();

    if (tool === 'select' && event.shiftKey) {
      setView((previous) => {
        const selectedIds = new Set(previous.selectedItemIds);
        if (selectedIds.has(item.id)) {
          selectedIds.delete(item.id);
        } else {
          selectedIds.add(item.id);
        }
        return {
          ...previous,
          selectedItemIds: Array.from(selectedIds),
        };
      });
      return;
    }

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

  function handleResizeHandlePointerDown(
    event: React.PointerEvent<HTMLButtonElement>,
    item: CanvasItem,
    handle: ResizeHandle
  ) {
    if (event.pointerType === 'touch' && gestureStartedInCanvasRef.current) return;
    event.stopPropagation();
    interactionRef.current = {
      type: 'resize',
      itemId: item.id,
      handle,
      startClientX: event.clientX,
      startClientY: event.clientY,
      originX: item.x,
      originY: item.y,
      originWidth: item.width,
      originHeight: item.height,
      scale: viewRef.current.scale,
      ...getItemResizeMinimum(item),
    };
  }

  function handleLineEndpointPointerDown(
    event: React.PointerEvent<HTMLButtonElement>,
    item: CanvasItem,
    endpointIndex: 0 | 1
  ) {
    if (event.pointerType === 'touch' && gestureStartedInCanvasRef.current) return;
    event.stopPropagation();
    const [firstPoint, secondPoint] = [
      {
        x: item.x + (item.points?.[0]?.x ?? 0),
        y: item.y + (item.points?.[0]?.y ?? 0),
      },
      {
        x: item.x + (item.points?.[1]?.x ?? item.width),
        y: item.y + (item.points?.[1]?.y ?? item.height),
      },
    ] as [CanvasPoint, CanvasPoint];

    interactionRef.current = {
      type: 'line-endpoint',
      itemId: item.id,
      endpointIndex,
      startClientX: event.clientX,
      startClientY: event.clientY,
      scale: viewRef.current.scale,
      startPoints: [firstPoint, secondPoint],
    };
  }

  function handleCropMovePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!cropState || !cropTargetItem) return;
    if (event.pointerType === 'touch' && gestureStartedInCanvasRef.current) return;
    event.stopPropagation();
    interactionRef.current = {
      type: 'crop-move',
      itemId: cropState.itemId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startRect: cropState.rect,
      itemWidth: cropTargetItem.width,
      itemHeight: cropTargetItem.height,
      scale: viewRef.current.scale,
    };
  }

  function handleCropHandlePointerDown(
    event: React.PointerEvent<HTMLButtonElement>,
    handle: ResizeHandle
  ) {
    if (!cropState || !cropTargetItem) return;
    if (event.pointerType === 'touch' && gestureStartedInCanvasRef.current) return;
    event.stopPropagation();
    interactionRef.current = {
      type: 'crop-resize',
      itemId: cropState.itemId,
      handle,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startRect: cropState.rect,
      itemWidth: cropTargetItem.width,
      itemHeight: cropTargetItem.height,
      scale: viewRef.current.scale,
      aspect: cropState.aspect,
    };
  }

  useEffect(() => {
    if (cropState) return undefined;

    const canvas = canvasViewportRef.current;
    if (!canvas) return undefined;

    const handleCanvasWheel = (event: WheelEvent) => {
      event.preventDefault();
      armCanvasWheelLock();

      if (!event.ctrlKey) {
        applyCanvasPanFromWheel(event);
        return;
      }

      const rect = canvas.getBoundingClientRect();
      const originX = event.clientX - rect.left;
      const originY = event.clientY - rect.top;
      applyCanvasZoomFromWheel(getWheelDeltaInPixels(event.deltaY, event.deltaMode), originX, originY);
    };

    canvas.addEventListener('wheel', handleCanvasWheel, {
      passive: false,
    });

    return () => {
      canvas.removeEventListener('wheel', handleCanvasWheel);
    };
  }, [cropState]);

  function handleItemDoubleClick(item: CanvasItem) {
    if (item.type !== 'text') return;
    startTextEditing(item);
  }

  function handleUpdateSelectedItem(updates: Partial<CanvasItem>) {
    if (!selectedItemId) return;
    setItems((previous) =>
      previous.map((item) =>
        item.id === selectedItemId
          ? {
              ...item,
              ...updates,
            }
          : item
      )
    );
  }

  function getOrderedSelectedItems() {
    const selectedIdSet = new Set(viewRef.current.selectedItemIds);
    return itemsRef.current.filter((item) => selectedIdSet.has(item.id));
  }

  function copySelectedItemsToClipboard(silent = false) {
    const selected = getOrderedSelectedItems();
    if (!selected.length) return false;
    copiedItemsRef.current = selected.map((item) => ({
      ...item,
      points: item.points ? item.points.map((point) => ({ ...point })) : undefined,
      crop: item.crop ? { ...item.crop } : undefined,
    }));
    if (!silent) {
      setStatusNotice(`已复制 ${selected.length} 个元素。`);
    }
    return true;
  }

  function pasteCopiedItems(silent = false) {
    const copied = copiedItemsRef.current;
    if (!copied?.length) return false;

    const pasted = copied.map((item, index) => cloneCanvasItem(item, 32 + index * 10));
    setItems((previous) => [...previous, ...pasted]);
    setView((previous) => ({
      ...previous,
      selectedItemIds: pasted.map((item) => item.id),
    }));

    if (!silent) {
      setStatusNotice(`已粘贴 ${pasted.length} 个元素。`);
    }
    return true;
  }

  function handleCopySelectedItem() {
    const selected = getOrderedSelectedItems();
    if (!selected.length) return;
    if (editingTextItemId) finishTextEditing();
    if (!copySelectedItemsToClipboard(true)) return;
    pasteCopiedItems(true);
    setStatusNotice('元素已复制。');
  }

  function handleDeleteSelectedItem() {
    const selectedIds = viewRef.current.selectedItemIds;
    if (!selectedIds.length) return;
    const selectedIdSet = new Set(selectedIds);
    setItems((previous) => previous.filter((item) => !selectedIdSet.has(item.id)));
    setSingleSelection(null);
    if (editingTextItemId && selectedIdSet.has(editingTextItemId)) {
      setEditingTextItemId(null);
      setEditingTextValue('');
    }
    if (cropState?.itemId && selectedIdSet.has(cropState.itemId)) {
      setCropState(null);
    }
    if (localEditState?.itemId && selectedIdSet.has(localEditState.itemId)) {
      setLocalEditState(null);
    }
    setActionPopover(null);
  }

  async function handleAddSelectedImagesToChat() {
    const selectedImages = getOrderedSelectedItems().filter((item) => item.type === 'image');
    if (!selectedImages.length) {
      setStatusNotice('请先选中图片再添加到对话。');
      return;
    }

    const current = chatInputImagesRef.current;
    const available = Math.max(0, CHAT_IMAGE_LIMIT - current.length);
    if (available <= 0) {
      setStatusNotice(`最多添加 ${CHAT_IMAGE_LIMIT} 张参考图。`);
      return;
    }

    const candidates = selectedImages.slice(0, CHAT_IMAGE_LIMIT);
    const exported = await Promise.all(
      candidates.map(async (item) => ({
        item,
        data: await exportImageSource(item),
      }))
    );

    const nextImages = [...current];
    let addedCount = 0;
    for (const payload of exported) {
      if (nextImages.length >= CHAT_IMAGE_LIMIT) break;
      if (nextImages.some((entry) => entry.data === payload.data)) continue;
      nextImages.push({
        id: uuidv4(),
        data: payload.data,
        source: 'canvas',
        name: payload.item.prompt || '画布图片',
      });
      addedCount += 1;
    }
    setChatInputImages(nextImages);

    if (addedCount > 0) {
      const skipped = selectedImages.length - addedCount;
      setStatusNotice(
        skipped > 0
          ? `已添加 ${addedCount} 张到对话，剩余图片因重复或超出上限未添加。`
          : `已添加 ${addedCount} 张到对话。`
      );
    } else {
      setStatusNotice('选中的图片已在对话参考图中，或已达到 4 张上限。');
    }
  }

  async function handleDownloadSelectedImage() {
    if (!selectedImageItem) return;
    try {
      const exported = await exportImageSource(selectedImageItem);
      const extension =
        selectedImageItem.mimeType?.includes('jpeg') || selectedImageItem.mimeType?.includes('jpg')
          ? 'jpg'
          : 'png';
      await downloadAsset(exported, `${getDisplayFilename(selectedImageItem)}.${extension}`);
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

  function startCrop() {
    if (!selectedImageItem) return;
    if (editingTextItemId) finishTextEditing();
    setActionPopover(null);
    setLocalEditState(null);
    setCropState(createInitialCropState(selectedImageItem.id));
  }

  function cancelCrop() {
    setCropState(null);
  }

  function confirmCrop() {
    if (!cropState || !cropTargetItem) return;
    const committedCrop = getCommittedCrop(cropTargetItem.crop, cropState.rect);
    const nextCrop = isFullCrop(committedCrop) ? undefined : committedCrop;

    setItems((previous) =>
      previous.map((item) =>
        item.id === cropTargetItem.id
          ? {
              ...item,
              x: item.x + item.width * cropState.rect.x,
              y: item.y + item.height * cropState.rect.y,
              width: Math.max(32, item.width * cropState.rect.width),
              height: Math.max(32, item.height * cropState.rect.height),
              crop: nextCrop,
            }
          : item
      )
    );
    setCropState(null);
    setStatusNotice('图片已裁剪。');
  }

  function handleSelectCropAspect(aspect: CropAspect) {
    setCropState((previous) => {
      if (!previous) return previous;
      return {
        ...previous,
        aspect,
        rect: fitCropRectToAspect(previous.rect, aspect),
      };
    });
  }

  async function startLocalEdit() {
    if (!selectedImageItem) return;
    if (!isSelectedImageModelConfigured) {
      setStatusNotice(selectedImageModelConfigurationMessage);
      return;
    }
    if (editingTextItemId) finishTextEditing();
    setActionPopover(null);
    setCropState(null);
    setTool('select');
    setSingleSelection(selectedImageItem.id);
    const targetItem = selectedImageItem;
    setLocalEditState({
      ...createInitialLocalEditState(targetItem.id),
      isPreparing: true,
    });

    try {
      const baseImageDataUrl = await exportImageSource(targetItem);
      const dimensions = await loadImageDimensions(baseImageDataUrl).catch(() => ({
        width: Math.max(1, Math.round(targetItem.width)),
        height: Math.max(1, Math.round(targetItem.height)),
      }));
      setLocalEditState((previous) =>
        previous && previous.itemId === targetItem.id
          ? {
              ...previous,
              baseImageDataUrl,
              baseImageWidth: dimensions.width,
              baseImageHeight: dimensions.height,
              isPreparing: false,
            }
          : previous
      );
    } catch (error) {
      setLocalEditState(null);
      setStatusNotice(getErrorMessage(error));
    }
  }

  function cancelLocalEdit() {
    setLocalEditState(null);
  }

  function handleLocalEditPromptChange(prompt: string) {
    setLocalEditState((previous) => (previous ? { ...previous, prompt } : previous));
  }

  function handleLocalEditBrushSizeChange(brushSize: number) {
    const safeBrushSize = clamp(Math.round(brushSize), 8, 140);
    setLocalEditState((previous) =>
      previous ? { ...previous, brushSize: safeBrushSize } : previous
    );
  }

  function handleLocalEditModeChange(mode: 'paint' | 'erase') {
    setLocalEditState((previous) => (previous ? { ...previous, mode } : previous));
  }

  function clearLocalEditMarks() {
    setLocalEditState((previous) =>
      previous
        ? { ...previous, strokes: [], redoStrokes: previous.strokes, activeStroke: null }
        : previous
    );
  }

  function undoLocalEditStroke() {
    setLocalEditState((previous) => {
      if (!previous || previous.isSubmitting || previous.isPreparing || previous.activeStroke) {
        return previous;
      }
      const stroke = previous.strokes[previous.strokes.length - 1];
      if (!stroke) return previous;
      return {
        ...previous,
        strokes: previous.strokes.slice(0, -1),
        redoStrokes: [stroke, ...previous.redoStrokes],
      };
    });
  }

  function redoLocalEditStroke() {
    setLocalEditState((previous) => {
      if (!previous || previous.isSubmitting || previous.isPreparing || previous.activeStroke) {
        return previous;
      }
      const stroke = previous.redoStrokes[0];
      if (!stroke) return previous;
      return {
        ...previous,
        strokes: [...previous.strokes, stroke],
        redoStrokes: previous.redoStrokes.slice(1),
      };
    });
  }

  function beginLocalEditStroke(point: CanvasPoint) {
    setLocalEditState((previous) => {
      if (!previous || previous.isSubmitting) return previous;
      const stroke = {
        id: uuidv4(),
        mode: previous.mode,
        brushSize: previous.brushSize,
        points: [point],
      };
      return {
        ...previous,
        strokes: [...previous.strokes, stroke],
        redoStrokes: [],
        activeStroke: stroke,
      };
    });
  }

  function appendLocalEditStrokePoint(point: CanvasPoint) {
    setLocalEditState((previous) => {
      if (!previous?.activeStroke || previous.isSubmitting) return previous;
      const activeStroke = previous.activeStroke;
      const lastPoint = activeStroke.points[activeStroke.points.length - 1];
      if (lastPoint && Math.hypot(point.x - lastPoint.x, point.y - lastPoint.y) < 0.003) {
        return previous;
      }
      const nextStroke = {
        ...activeStroke,
        points: [...activeStroke.points, point],
      };
      return {
        ...previous,
        activeStroke: nextStroke,
        strokes: previous.strokes.map((stroke) =>
          stroke.id === nextStroke.id ? nextStroke : stroke
        ),
      };
    });
  }

  function endLocalEditStroke() {
    setLocalEditState((previous) => (previous ? { ...previous, activeStroke: null } : previous));
  }

  function getLocalEditPointerPoint(event: React.PointerEvent<HTMLDivElement>): CanvasPoint | null {
    const frame = localEditImageFrameRef.current;
    if (!frame) return null;
    const rect = frame.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    return {
      x: clamp(x, 0, 1),
      y: clamp(y, 0, 1),
    };
  }

  function handleLocalEditCanvasPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    const state = localEditStateRef.current;
    if (!state || state.isSubmitting || state.isPreparing) return;
    if (event.button !== 0) return;
    const point = getLocalEditPointerPoint(event);
    if (!point) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    beginLocalEditStroke(point);
  }

  function handleLocalEditCanvasPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const state = localEditStateRef.current;
    if (!state?.activeStroke || state.isSubmitting || state.isPreparing) return;
    const point = getLocalEditPointerPoint(event);
    if (!point) return;
    event.preventDefault();
    event.stopPropagation();
    appendLocalEditStrokePoint(point);
  }

  function handleLocalEditCanvasPointerEnd(event: React.PointerEvent<HTMLDivElement>) {
    const state = localEditStateRef.current;
    if (!state?.activeStroke) return;
    event.preventDefault();
    event.stopPropagation();
    endLocalEditStroke();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function buildLocalEditPrompt(prompt: string) {
    return [
      `局部重绘需求：${prompt}`,
      '请以第一张图片作为原图，只修改红色半透明标记或遮罩指示的区域。',
      '未标记区域必须尽量保持与原图一致，包括构图、文字、Logo、商品主体、人物脸部、光影和版式。',
      '最终输出必须是一张干净的新图，不要保留红色标记、遮罩、笔刷痕迹或说明文字。',
    ].join('\n');
  }

  async function submitLocalEdit() {
    const state = localEditStateRef.current;
    if (!state || state.isSubmitting || state.isPreparing) return;
    if (!currentSession) {
      setStatusNotice('请先创建或选择一个对话。');
      return;
    }
    if (isChatLoading) {
      setStatusNotice('当前还有请求在处理中，请稍后再试。');
      return;
    }
    if (!isSelectedImageModelConfigured) {
      setStatusNotice(selectedImageModelConfigurationMessage);
      return;
    }

    const targetItem = itemsRef.current.find(
      (item) => item.id === state.itemId && item.type === 'image'
    );
    if (!targetItem) {
      setLocalEditState(null);
      return;
    }

    const prompt = state.prompt.trim();
    if (!prompt) {
      setStatusNotice('请先输入局部重绘提示词。');
      return;
    }

    const strokes = state.strokes.filter((stroke) => stroke.points.length > 0);
    const hasPaintStroke = strokes.some((stroke) => stroke.mode === 'paint');
    if (!hasPaintStroke) {
      setStatusNotice('请先涂抹需要修改的区域。');
      return;
    }

    const baseImageDataUrl = state.baseImageDataUrl;
    if (!baseImageDataUrl) {
      setStatusNotice('图片还在准备中，请稍后再试。');
      return;
    }

    const sessionId = currentSession.id;
    const userMessageId = uuidv4();
    const loadingMessageId = uuidv4();
    setIsChatLoading(true);
    setLocalEditState(null);
    updateCurrentSessionMessages(sessionId, (previous) => [
      ...previous,
      {
        id: userMessageId,
        role: 'user',
        content: `局部重绘：${prompt}`,
      },
      {
        id: loadingMessageId,
        role: 'assistant',
        content: '正在局部重绘图片...',
        isImageLoading: true,
        imageUrls: [''],
      },
    ]);

    try {
      const baseDimensions =
        state.baseImageWidth && state.baseImageHeight
          ? {
              width: state.baseImageWidth,
              height: state.baseImageHeight,
            }
          : await loadImageDimensions(baseImageDataUrl).catch(() => ({
              width: Math.max(1, Math.round(targetItem.width)),
              height: Math.max(1, Math.round(targetItem.height)),
            }));
      const maskDataUrl = await createLocalEditMaskSource(
        strokes,
        baseDimensions.width,
        baseDimensions.height
      );
      const markedReferenceDataUrl = await createLocalEditMarkedReferenceSource(
        baseImageDataUrl,
        strokes
      );

      updateCurrentSessionMessages(sessionId, (previous) =>
        previous.map((message) =>
          message.id === userMessageId
            ? { ...message, attachedImages: [markedReferenceDataUrl] }
            : message
        )
      );

      const result = await generateImageAI(
        buildLocalEditPrompt(prompt),
        effectiveSelectedImageModel,
        [baseImageDataUrl, markedReferenceDataUrl, maskDataUrl, ...hiddenTemplateReferences],
        {
          systemPrompt: activeBrandSystemPrompt,
          operation: 'local-edit',
          preserveReferenceText: true,
        }
      );
      const nextImage = result.images[0];
      if (!nextImage) {
        throw new Error('局部重绘未返回可用图片。');
      }

      const imageSize = await loadImageDimensions(nextImage).catch(() => ({
        width: baseDimensions.width,
        height: baseDimensions.height,
      }));
      const displaySize = fitIntoBounds(imageSize.width, imageSize.height, 620, 620);
      const preferredPosition = {
        x: targetItem.x + targetItem.width + 40,
        y: targetItem.y,
      };
      const position = createAvoidOverlapPosition(
        itemsRef.current,
        viewRef.current,
        viewportSizeRef.current,
        displaySize.width,
        displaySize.height,
        preferredPosition
      );
      const nextItem: CanvasItem = {
        id: uuidv4(),
        type: 'image',
        x: position.x,
        y: position.y,
        width: displaySize.width,
        height: displaySize.height,
        content: nextImage,
        prompt,
        mimeType: 'image/png',
        sourceKind: 'generated',
      };

      setItems((previous) => [...previous, nextItem]);
      setSingleSelection(nextItem.id);
      setLocalEditState(null);
      updateCurrentSessionMessages(sessionId, (previous) => [
        ...previous.filter((message) => message.id !== loadingMessageId),
        {
          id: uuidv4(),
          role: 'assistant',
          content: `已局部重绘：${prompt}`,
          imageUrl: nextImage,
          imageUrls: [nextImage],
        },
      ]);
      setStatusNotice('局部重绘已生成新图。');
    } catch (error) {
      const message = getErrorMessage(error);
      setLocalEditState((previous) =>
        previous ? { ...previous, isSubmitting: false, activeStroke: null } : previous
      );
      updateCurrentSessionMessages(sessionId, (previous) => [
        ...previous.filter((item) => item.id !== loadingMessageId),
        {
          id: uuidv4(),
          role: 'assistant',
          content: `局部重绘失败：${message}`,
        },
      ]);
      setStatusNotice(message);
    } finally {
      setIsChatLoading(false);
    }
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

    setActionPopover((previous) => (previous ? { ...previous, isSubmitting: true } : previous));

    try {
      const referenceImage = await exportImageSource(targetItem);
      const result = await generateImageAI(
        prompt,
        selectedImageModel,
        [referenceImage, ...hiddenTemplateReferences],
        {
          systemPrompt: activeBrandSystemPrompt,
          operation: 'regenerate',
        }
      );
      const nextImage = result.images[0];
      if (!nextImage) {
        throw new Error('重绘未返回可用图片。');
      }
      setItems((previous) =>
        previous.map((item) =>
          item.id === targetItem.id
            ? {
                ...item,
                content: nextImage,
                prompt,
                mimeType: 'image/png',
                sourceKind: 'generated',
                crop: undefined,
              }
            : item
        )
      );
      setActionPopover(null);
      setStatusNotice('图片已重新生成。');
    } catch (error) {
      setActionPopover((previous) => (previous ? { ...previous, isSubmitting: false } : previous));
      setStatusNotice(getErrorMessage(error));
    }
  }

  async function handleEnhanceSelectedImage() {
    if (!selectedImageItem) return;
    if (!currentSession) {
      setStatusNotice('请先创建或选择一个对话。');
      return;
    }
    if (isChatLoading) {
      setStatusNotice('当前还有请求在处理中，请稍后再试。');
      return;
    }
    if (!isSelectedImageModelConfigured) {
      setStatusNotice(selectedImageModelConfigurationMessage);
      return;
    }

    const targetItem = selectedImageItem;
    const prompt = [
      '高清处理：请基于参考图生成一张更清晰、更高质感的新图。',
      '保留原图的构图、主体、文字、Logo、版式、颜色关系和整体风格。',
      '只做清晰度、细节、锐度、材质、边缘质量和噪点控制的提升，不要改变内容，不要新增或删除元素。',
      '最终输出干净自然，不要出现修复痕迹、变形、乱码或额外说明文字。',
    ].join('\n');
    const sessionId = currentSession.id;
    const loadingMessageId = uuidv4();

    setIsChatLoading(true);
    setActionPopover(null);
    setCropState(null);
    setLocalEditState(null);

    try {
      const referenceImage = await exportImageSource(targetItem);
      updateCurrentSessionMessages(sessionId, (previous) => [
        ...previous,
        {
          id: uuidv4(),
          role: 'user',
          content: '高清处理',
          attachedImages: [referenceImage],
        },
        {
          id: loadingMessageId,
          role: 'assistant',
          content: '正在生成高清图片...',
          isImageLoading: true,
          imageUrls: [''],
        },
      ]);

      const result = await generateImageAI(
        prompt,
        effectiveSelectedImageModel,
        [referenceImage, ...hiddenTemplateReferences],
        {
          systemPrompt: activeBrandSystemPrompt,
          operation: 'reference',
          preserveReferenceText: true,
        }
      );
      const nextImage = result.images[0];
      if (!nextImage) {
        throw new Error('高清处理未返回可用图片。');
      }

      const imageSize = await loadImageDimensions(nextImage).catch(() => ({
        width: Math.max(1, Math.round(targetItem.width)),
        height: Math.max(1, Math.round(targetItem.height)),
      }));
      const displaySize = fitIntoBounds(imageSize.width, imageSize.height, 720, 720);
      const preferredPosition = {
        x: targetItem.x + targetItem.width + 40,
        y: targetItem.y,
      };
      const position = createAvoidOverlapPosition(
        itemsRef.current,
        viewRef.current,
        viewportSizeRef.current,
        displaySize.width,
        displaySize.height,
        preferredPosition
      );
      const nextItem: CanvasItem = {
        id: uuidv4(),
        type: 'image',
        x: position.x,
        y: position.y,
        width: displaySize.width,
        height: displaySize.height,
        content: nextImage,
        prompt: '高清处理',
        mimeType: 'image/png',
        sourceKind: 'generated',
      };

      setItems((previous) => [...previous, nextItem]);
      setSingleSelection(nextItem.id);
      updateCurrentSessionMessages(sessionId, (previous) => [
        ...previous.filter((message) => message.id !== loadingMessageId),
        {
          id: uuidv4(),
          role: 'assistant',
          content: '已生成高清图片',
          imageUrl: nextImage,
          imageUrls: [nextImage],
        },
      ]);
      setStatusNotice('高清图片已生成。');
    } catch (error) {
      const message = getErrorMessage(error);
      updateCurrentSessionMessages(sessionId, (previous) => [
        ...previous.filter((message) => message.id !== loadingMessageId),
        {
          id: uuidv4(),
          role: 'assistant',
          content: `高清处理失败：${message}`,
        },
      ]);
      setStatusNotice(message);
    } finally {
      setIsChatLoading(false);
    }
  }

  async function handleSendMessage(payload?: {
    prompt?: string;
    attachedImages?: string[];
    selectedModel?: string;
    sizeHint?: string;
    systemPrompt?: string;
  }) {
    if (isChatLoading || !currentSession) return;

    const text = (payload?.prompt ?? chatInput).trim();
    const attachedImages = payload?.attachedImages ?? chatInputImages.map((item) => item.data);
    const requestReferenceImages = Array.from(new Set([...attachedImages, ...hiddenTemplateReferences]));
    if (!text && attachedImages.length === 0) return;
    const modelForRequest = payload?.selectedModel || selectedImageModel;
    const systemPromptForRequest = payload?.systemPrompt ?? activeBrandSystemPrompt;
    const preferredSizeHint = payload?.sizeHint || activeSizeId || undefined;

    const effectiveText = text || '请基于这些参考图继续创作。';
    const effectiveTextForModel = effectiveText;
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
      content: '正在处理...',
    };

    if (
      currentSession.messages.length === 0 &&
      !hasManualBoardNameEditRef.current &&
      shouldAutoRenameProject(boardName)
    ) {
      setBoardName(deriveProjectNameFromPrompt(effectiveText));
    }

    setChatInput('');
    setChatInputImages([]);
    setIsChatLoading(true);

    updateCurrentSessionMessages(
      currentSession.id,
      (previous) => [...previous, userMessage, loadingMessage],
      currentSession.messages.length === 0 ? effectiveText.slice(0, 18) || '新对话' : undefined
    );

    try {
      const history = currentSession.messages.map((message) => ({
        role: message.role,
        content: message.content,
      }));

      const response = await chatWithAI(history, effectiveTextForModel, requestReferenceImages, {
        systemPrompt: systemPromptForRequest,
        forceImageGeneration: isOpenRouterImageModelId(modelForRequest || ''),
      });
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
          const expectedOutputCount = Math.max(1, Math.min(GROUP_OUTPUT_MAX_COUNT, Math.round(call.args.outputCount || 1)));
          const imageLoadingMessageId = uuidv4();
          const loadingItemIds = createLoadingItems(prompt || '正在生成图片...', expectedOutputCount);
          updateCurrentSessionMessages(currentSession.id, (previous) => [
            ...previous,
            {
              id: imageLoadingMessageId,
              role: 'assistant',
              content: '正在生成图片...',
              isImageLoading: true,
              imageUrls: Array.from({ length: expectedOutputCount }).map(() => ''),
            },
          ]);

          try {
            const effectiveSizeHint = preferredSizeHint || call.args.sizeHint;
            const referenceImages = call.args.referenceImages || attachedImages;

            const imageResult = await generateImageAI(
              prompt,
              modelForRequest,
              [...referenceImages, ...hiddenTemplateReferences],
              {
                systemPrompt: systemPromptForRequest,
                outputCount: expectedOutputCount,
                sizeHint: effectiveSizeHint,
                operation: referenceImages.length || hiddenTemplateReferences.length ? 'reference' : 'generate',
              }
            );
            const generatedUrls = imageResult.images;
            if (!generatedUrls.length) {
              throw new Error('图片生成未返回可用结果。');
            }
            const preparedImages = await Promise.all(
              generatedUrls.map(async (imageUrl) => {
                const imageSize = await loadImageDimensions(imageUrl).catch(() => ({
                  width: 1024,
                  height: 1024,
                }));
                return {
                  imageUrl,
                  size: {
                    width: Math.max(1, Math.round(imageSize.width)),
                    height: Math.max(1, Math.round(imageSize.height)),
                  },
                };
              })
            );

            setItems((previous) =>
              previous.flatMap((item) => {
                const slotIndex = loadingItemIds.indexOf(item.id);
                if (slotIndex < 0) return [item];
                const nextImage = preparedImages[slotIndex];
                if (!nextImage) return [];
                const maxWidth = Math.max(...preparedImages.map((image) => image.size.width), 1);
                const maxHeight = Math.max(...preparedImages.map((image) => image.size.height), 1);
                const columns = preparedImages.length > 4 ? 4 : preparedImages.length > 2 ? 2 : preparedImages.length;
                const firstLoadingItem =
                  previous.find((current) => current.id === loadingItemIds[0]) || item;
                const row = Math.floor(slotIndex / columns);
                const column = slotIndex % columns;
                return [
                  {
                    ...item,
                    type: 'image',
                    x: firstLoadingItem.x + column * (maxWidth + 28),
                    y: firstLoadingItem.y + row * (maxHeight + 28),
                    width: nextImage.size.width,
                    height: nextImage.size.height,
                    content: nextImage.imageUrl,
                    prompt,
                    mimeType: 'image/png',
                    sourceKind: 'generated',
                    crop: undefined,
                  },
                ];
              })
            );
            const failedCount = Math.max(0, (imageResult.rawCount || generatedUrls.length) - generatedUrls.length);
            if (failedCount > 0) {
              setStatusNotice(`本次有 ${failedCount} 张图片生成失败，已保留成功结果。`);
            }
            updateCurrentSessionMessages(currentSession.id, (previous) =>
              previous.filter((message) => message.id !== imageLoadingMessageId)
            );

            updateCurrentSessionMessages(currentSession.id, (previous) => [
              ...previous,
              {
                id: uuidv4(),
                role: 'assistant',
                content: `已生成图片：${prompt}`,
                imageUrl: generatedUrls[0],
                imageUrls: generatedUrls,
              },
            ]);
          } catch (error) {
            const message = getErrorMessage(error);
            const loadingIdSet = new Set(loadingItemIds);
            setItems((previous) =>
              previous.map((item) =>
                loadingIdSet.has(item.id)
                  ? {
                      ...item,
                      content: message,
                    }
                  : item
              )
            );
            updateCurrentSessionMessages(currentSession.id, (previous) =>
              previous.filter((message) => message.id !== imageLoadingMessageId)
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

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActionPopover(null);
        if (cropState) {
          setCropState(null);
          return;
        }
        if (localEditState) {
          if (!localEditState.isSubmitting) {
            setLocalEditState(null);
          }
          return;
        }
        if (editingTextItemId) {
          finishTextEditing();
          return;
        }
        if (tool !== 'select') setTool('select');
        return;
      }

      if (isEditableTarget(event.target)) return;

      const key = event.key.toLowerCase();
      const withSystemModifier = event.ctrlKey || event.metaKey;
      if (localEditState && withSystemModifier && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          redoLocalEditStroke();
        } else {
          undoLocalEditStroke();
        }
        return;
      }
      if (localEditState && withSystemModifier && key === 'y') {
        event.preventDefault();
        redoLocalEditStroke();
        return;
      }
      if (withSystemModifier && key === 'c') {
        event.preventDefault();
        void copySelectedItemsToClipboard();
        return;
      }
      if (withSystemModifier && key === 'v') {
        event.preventDefault();
        void pasteCopiedItems();
        return;
      }

      if ((event.key === 'Backspace' || event.key === 'Delete') && viewRef.current.selectedItemIds.length > 0) {
        event.preventDefault();
        handleDeleteSelectedItem();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cropState, editingTextItemId, localEditState, tool]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const currentInteraction = interactionRef.current;
      const canvas = canvasViewportRef.current;
      if (!currentInteraction || !canvas) return;

      if (currentInteraction.type === 'pan') {
        const nextX = currentInteraction.originX + (event.clientX - currentInteraction.startClientX);
        const nextY = currentInteraction.originY + (event.clientY - currentInteraction.startClientY);
        applyLiveViewUpdate((previous) => ({
          ...previous,
          x: nextX,
          y: nextY,
        }));
        return;
      }

      if (currentInteraction.type === 'marquee') {
        const rect = canvas.getBoundingClientRect();
        const point = getClientToWorldPoint(event.clientX, event.clientY, rect, viewRef.current);
        currentInteraction.currentClientX = event.clientX;
        currentInteraction.currentClientY = event.clientY;
        currentInteraction.currentPoint = point;
        setMarqueeRect(createMarqueeRect(currentInteraction.startPoint, point));
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

      if (currentInteraction.type === 'resize') {
        const deltaX = (event.clientX - currentInteraction.startClientX) / currentInteraction.scale;
        const deltaY = (event.clientY - currentInteraction.startClientY) / currentInteraction.scale;
        setItems((previous) =>
          previous.map((item) =>
            item.id === currentInteraction.itemId
              ? resizeItem(
                  {
                    ...item,
                    x: currentInteraction.originX,
                    y: currentInteraction.originY,
                    width: currentInteraction.originWidth,
                    height: currentInteraction.originHeight,
                  },
                  currentInteraction.handle,
                  deltaX,
                  deltaY
                )
              : item
          )
        );
        return;
      }

      if (currentInteraction.type === 'line-endpoint') {
        const deltaX = (event.clientX - currentInteraction.startClientX) / currentInteraction.scale;
        const deltaY = (event.clientY - currentInteraction.startClientY) / currentInteraction.scale;
        const startPoint = currentInteraction.startPoints[currentInteraction.endpointIndex];
        const nextPoint = {
          x: startPoint.x + deltaX,
          y: startPoint.y + deltaY,
        };
        setItems((previous) =>
          previous.map((item) =>
            item.id === currentInteraction.itemId ? updateLineEndpoint(item, currentInteraction.endpointIndex, nextPoint) : item
          )
        );
        return;
      }

      if (currentInteraction.type === 'crop-move') {
        const deltaX =
          (event.clientX - currentInteraction.startClientX) /
          (currentInteraction.itemWidth * currentInteraction.scale);
        const deltaY =
          (event.clientY - currentInteraction.startClientY) /
          (currentInteraction.itemHeight * currentInteraction.scale);
        setCropState((previous) =>
          previous && previous.itemId === currentInteraction.itemId
            ? {
                ...previous,
                rect: moveCropRect(currentInteraction.startRect, deltaX, deltaY),
              }
            : previous
        );
        return;
      }

      if (currentInteraction.type === 'crop-resize') {
        const deltaX =
          (event.clientX - currentInteraction.startClientX) /
          (currentInteraction.itemWidth * currentInteraction.scale);
        const deltaY =
          (event.clientY - currentInteraction.startClientY) /
          (currentInteraction.itemHeight * currentInteraction.scale);
        setCropState((previous) =>
          previous && previous.itemId === currentInteraction.itemId
            ? {
                ...previous,
                rect: resizeCropRect(
                  currentInteraction.startRect,
                  currentInteraction.handle,
                  deltaX,
                  deltaY,
                  currentInteraction.aspect
                ),
              }
            : previous
        );
        return;
      }

      if (currentInteraction.type === 'line-create') {
        const rect = canvas.getBoundingClientRect();
        const point = getClientToWorldPoint(event.clientX, event.clientY, rect, viewRef.current);
        currentInteraction.currentPoint = point;
        setLinePreviewItem(createLineItem(currentInteraction.startPoint, point));
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
          setSingleSelection(drawing.id);
        }
      }

      if (currentInteraction.type === 'marquee') {
        const nextMarquee = createMarqueeRect(
          currentInteraction.startPoint,
          currentInteraction.currentPoint
        );
        const movedDistance = Math.hypot(
          currentInteraction.currentClientX - currentInteraction.startClientX,
          currentInteraction.currentClientY - currentInteraction.startClientY
        );
        if (movedDistance >= 4) {
          const hitIds = itemsRef.current
            .filter((item) => isItemIntersectingMarquee(item, nextMarquee))
            .map((item) => item.id);
          setView((previous) => {
            if (currentInteraction.appendSelection) {
              const merged = new Set([...previous.selectedItemIds, ...hitIds]);
              return {
                ...previous,
                selectedItemIds: Array.from(merged),
              };
            }
            return {
              ...previous,
              selectedItemIds: hitIds,
            };
          });
        }
        setMarqueeRect(null);
      }

      if (currentInteraction.type === 'line-create') {
        const [startPoint, endPoint] = [currentInteraction.startPoint, currentInteraction.currentPoint];
        if (Math.hypot(endPoint.x - startPoint.x, endPoint.y - startPoint.y) > 4) {
          const lineItem = createLineItem(startPoint, endPoint);
          setItems((previous) => [...previous, { ...lineItem, strokeColor: DEFAULT_LINE_COLOR }]);
          setSingleSelection(lineItem.id);
          setTool('select');
        }
      }

      interactionRef.current = null;
      setMarqueeRect(null);
      setDrawPreviewPoints(null);
      setLinePreviewItem(null);
      if (currentInteraction.type === 'pan') {
        commitLiveViewToState();
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, []);

  return (
    <div
      className={`ai-vision-workspace flex h-screen w-screen overflow-hidden bg-[#090b11] text-slate-100 ${
        isCanvasGestureLocked ? 'ai-vision-gesture-lock' : ''
      }`}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className="flex items-center border-b border-white/[0.06] bg-[#0d1118]/95 px-4"
          style={{ height: WORKSPACE_HEADER_HEIGHT }}
        >
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
              onChange={(event) => {
                hasManualBoardNameEditRef.current = true;
                setBoardName(event.target.value);
              }}
              className="w-[240px] rounded-xl border border-transparent bg-transparent px-3 py-2 text-[14px] font-medium text-white outline-none transition focus:border-white/[0.08] focus:bg-white/[0.03]"
            />
          </div>
        </header>

        <CanvasStage
          items={items}
          tool={tool}
          setTool={setTool}
          view={view}
          marqueeRect={marqueeRect}
          drawPreviewPoints={drawPreviewPoints}
          linePreviewItem={linePreviewItem}
          selectedItemIds={view.selectedItemIds}
          selectedItemId={selectedItemId}
          selectedItem={selectedItem}
          selectedItemToolbarPosition={selectedItemToolbarPosition}
          actionPopover={actionPopover}
          setActionPopover={setActionPopover}
          cropState={cropState}
          localEditState={localEditState}
          editingTextItemId={editingTextItemId}
          editingTextValue={editingTextValue}
          canvasRootRef={canvasRootRef}
          canvasViewportRef={canvasViewportRef}
          canvasTransformRef={canvasTransformRef}
          imageInputRef={imageInputRef}
          videoInputRef={videoInputRef}
          isModelConfigured={isSelectedImageModelConfigured}
          onCanvasPointerEnter={() => {
            if (!cropState) setCanvasHover(true);
          }}
          onCanvasPointerLeave={() => {
            setCanvasHover(false);
          }}
          onCanvasPointerDown={handleCanvasPointerDown}
          onItemPointerDown={handleItemPointerDown}
          onItemDoubleClick={handleItemDoubleClick}
          onResizeHandlePointerDown={handleResizeHandlePointerDown}
          onLineEndpointPointerDown={handleLineEndpointPointerDown}
          onCropMovePointerDown={handleCropMovePointerDown}
          onCropHandlePointerDown={handleCropHandlePointerDown}
          onTextEditChange={setEditingTextValue}
          onTextEditBlur={finishTextEditing}
          onTextEditKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              finishTextEditing();
            }
          }}
          onStartTextEditing={startTextEditing}
          onUpdateSelectedItem={handleUpdateSelectedItem}
          onImportImageFiles={importImageFiles}
          onImportVideoFiles={importVideoFiles}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onFitCanvasView={handleFitCanvasView}
          onCopySelectedItem={handleCopySelectedItem}
          onDeleteSelectedItem={handleDeleteSelectedItem}
          onDownloadSelectedImage={handleDownloadSelectedImage}
          onOpenRegeneratePopover={openRegeneratePopover}
          onOpenReplaceImage={() => {
            if (!selectedImageItem) return;
            setReplaceTargetItemId(selectedImageItem.id);
            replaceImageInputRef.current?.click();
          }}
          onStartCrop={startCrop}
          onCancelCrop={cancelCrop}
          onConfirmCrop={confirmCrop}
          onSelectCropAspect={handleSelectCropAspect}
          onRegenerateSubmit={handleRegenerateSubmit}
          onMissingRegenerateConfig={() => setStatusNotice(selectedImageModelConfigurationMessage)}
          onStartLocalEdit={startLocalEdit}
          onEnhanceSelectedImage={() => {
            void handleEnhanceSelectedImage();
          }}
          onAddSelectedImageToChat={() => {
            void handleAddSelectedImagesToChat();
          }}
        />
      </div>

      <ChatSidebar
        projectTitle={boardName.trim() || DEFAULT_BOARD_NAME}
        currentSession={currentSession}
        sessions={sessions}
        currentSessionId={currentSessionId}
        currentScene={currentScene}
        chatInput={chatInput}
        chatInputImages={chatInputImages}
        brandTemplates={brandTemplates}
        selectedImageModel={effectiveSelectedImageModel}
        isChatLoading={isChatLoading}
        isCollapsed={isChatSidebarCollapsed}
        isHistoryMenuOpen={isHistoryMenuOpen}
        isBrandSpecMenuOpen={isBrandSpecMenuOpen}
        isBrandMenuOpen={isBrandMenuOpen}
        storageWarning={storageWarning}
        isModelConfigured={isSelectedImageModelConfigured}
        modelConfigurationMessage={selectedImageModelConfigurationMessage}
        headerHeight={WORKSPACE_HEADER_HEIGHT}
        historyMenuRef={historyMenuRef}
        brandSpecMenuRef={brandSpecMenuRef}
        brandMenuRef={brandMenuRef}
        chatUploadInputRef={chatUploadInputRef}
        brandTemplateInputRef={brandTemplateInputRef}
        brandSpecs={brandSpecs}
        activeBrandSpecId={activeBrandSpecId}
        activeBrandTemplateId={activeBrandTemplateId}
        onToggleCollapsed={() => setIsChatSidebarCollapsed((previous) => !previous)}
        onToggleHistoryMenu={() => setIsHistoryMenuOpen((previous) => !previous)}
        onToggleBrandSpecMenu={() => {
          setIsBrandMenuOpen(false);
          setIsBrandSpecMenuOpen((previous) => !previous);
        }}
        onToggleBrandMenu={() => {
          setIsBrandSpecMenuOpen(false);
          setIsBrandMenuOpen((previous) => !previous);
        }}
        onCreateSession={() => {
          void handleCreateSession();
        }}
        onSwitchSession={(sessionId) => {
          setCurrentSessionId(sessionId);
          setIsHistoryMenuOpen(false);
        }}
        onSelectScene={handleSelectScene}
        onSetChatInput={setChatInput}
        onRemoveChatImage={(imageId) =>
          setChatInputImages((previous) => previous.filter((item) => item.id !== imageId))
        }
        onSelectModel={setSelectedImageModel}
        onSelectBrandSpec={handleSelectBrandSpec}
        onSaveBrandSpec={handleSaveBrandSpec}
        onCreateBrandSpec={handleCreateBrandSpec}
        onDeleteBrandSpec={handleDeleteBrandSpec}
        onSelectBrandTemplate={handleSelectBrandTemplate}
        onUploadBrandTemplate={async (file) => {
          try {
            await handleUploadBrandTemplate(file);
          } catch (error) {
            setStatusNotice(getErrorMessage(error));
          }
        }}
        onUploadReferenceImage={handleUploadReferenceImage}
        onSendMessage={handleSendMessage}
        onAddAssistantImageToChat={(imageUrl) => {
          void addChatReferenceImage(imageUrl, 'AI生成图', 'local');
        }}
        sizeConfigMenuRef={sizeConfigMenuRef}
        activeSizeId={activeSizeId}
        isSizeConfigMenuOpen={isSizeConfigMenuOpen}
        onToggleSizeConfigMenu={() => {
          setIsBrandMenuOpen(false);
          setIsBrandSpecMenuOpen(false);
          setIsSizeConfigMenuOpen((previous) => !previous);
        }}
        onSelectSize={(sizeId) => {
          setActiveSizeId(sizeId);
          setIsSizeConfigMenuOpen(false);
        }}
      />

      {localEditState ? (
        <div
          className="fixed inset-0 z-[140] flex items-center justify-center bg-black/78 p-4 text-slate-100 backdrop-blur-sm"
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
        >
          <div className="flex h-full max-h-[920px] w-full max-w-[1440px] flex-col overflow-hidden rounded-[22px] border border-white/[0.09] bg-[#0d1118] shadow-[0_32px_110px_rgba(0,0,0,0.58)] lg:flex-row">
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex h-14 items-center justify-between border-b border-white/[0.07] px-4">
                <div className="min-w-0">
                  <h2 className="truncate text-[15px] font-semibold text-white">局部重绘新图</h2>
                  <p className="mt-0.5 truncate text-[11px] text-slate-400">
                    在大图上涂抹要修改的区域，生成结果会作为新图片添加到画布。
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!localEditState.isSubmitting) setLocalEditState(null);
                  }}
                  disabled={localEditState.isSubmitting}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-slate-200 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-45"
                  aria-label="关闭局部编辑"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="relative flex min-h-0 flex-1 items-center justify-center bg-[#05070b] p-4">
                {localEditState.isPreparing || !localEditState.baseImageDataUrl ? (
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.05] px-4 py-2 text-[13px] text-slate-200">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    正在准备图片...
                  </div>
                ) : (
                  <div
                    ref={localEditImageFrameRef}
                    className={`relative max-h-full max-w-full overflow-hidden bg-black shadow-[0_22px_80px_rgba(0,0,0,0.42)] ${
                      localEditState.isSubmitting ? 'cursor-wait' : 'cursor-crosshair'
                    }`}
                    style={{
                      aspectRatio: `${localEditState.baseImageWidth || 1} / ${
                        localEditState.baseImageHeight || 1
                      }`,
                      height: '100%',
                      maxWidth: '100%',
                      maxHeight: '100%',
                    }}
                    onPointerDown={handleLocalEditCanvasPointerDown}
                    onPointerMove={handleLocalEditCanvasPointerMove}
                    onPointerUp={handleLocalEditCanvasPointerEnd}
                    onPointerCancel={handleLocalEditCanvasPointerEnd}
                  >
                    <img
                      src={localEditState.baseImageDataUrl}
                      alt="局部编辑原图"
                      className="h-full w-full select-none object-contain"
                      draggable={false}
                    />
                    <svg
                      className="pointer-events-none absolute inset-0 h-full w-full"
                      viewBox="0 0 1 1"
                      preserveAspectRatio="none"
                    >
                      {localEditState.strokes.map((stroke) => {
                        if (!stroke.points.length) return null;
                        const strokeWidth = Math.max(0.006, stroke.brushSize / 900);
                        const color =
                          stroke.mode === 'erase'
                            ? 'rgba(15,23,42,0.72)'
                            : 'rgba(255,36,66,0.72)';
                        if (stroke.points.length === 1) {
                          const point = stroke.points[0];
                          return (
                            <circle
                              key={stroke.id}
                              cx={point.x}
                              cy={point.y}
                              r={strokeWidth / 2}
                              fill={color}
                            />
                          );
                        }
                        const path = stroke.points
                          .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
                          .join(' ');
                        return (
                          <path
                            key={stroke.id}
                            d={path}
                            fill="none"
                            stroke={color}
                            strokeWidth={strokeWidth}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        );
                      })}
                    </svg>
                    <div className="pointer-events-none absolute inset-0 border-2 border-[#ff385c]/70" />
                  </div>
                )}
              </div>
            </div>

            <aside className="flex w-full shrink-0 flex-col gap-4 border-t border-white/[0.07] bg-[#11151c] p-4 lg:w-[360px] lg:border-l lg:border-t-0">
              <div>
                <div className="text-[12px] font-medium text-slate-300">编辑工具</div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleLocalEditModeChange('paint')}
                    disabled={localEditState.isSubmitting || localEditState.isPreparing}
                    className={`inline-flex h-10 items-center gap-1.5 rounded-[12px] px-3 text-[12px] transition disabled:opacity-45 ${
                      localEditState.mode === 'paint'
                        ? 'bg-[#344967] text-white'
                        : 'bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]'
                    }`}
                  >
                    <Brush className="h-4 w-4" />
                    涂抹
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLocalEditModeChange('erase')}
                    disabled={localEditState.isSubmitting || localEditState.isPreparing}
                    className={`inline-flex h-10 items-center gap-1.5 rounded-[12px] px-3 text-[12px] transition disabled:opacity-45 ${
                      localEditState.mode === 'erase'
                        ? 'bg-[#344967] text-white'
                        : 'bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]'
                    }`}
                  >
                    <Eraser className="h-4 w-4" />
                    擦除
                  </button>
                  <button
                    type="button"
                    onClick={clearLocalEditMarks}
                    disabled={
                      localEditState.isSubmitting ||
                      localEditState.isPreparing ||
                      localEditState.strokes.length === 0
                    }
                    className="inline-flex h-10 items-center rounded-[12px] border border-white/[0.08] px-3 text-[12px] text-slate-200 transition hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    清空标记
                  </button>
                  <button
                    type="button"
                    onClick={undoLocalEditStroke}
                    disabled={
                      localEditState.isSubmitting ||
                      localEditState.isPreparing ||
                      localEditState.strokes.length === 0
                    }
                    className="inline-flex h-10 w-10 items-center justify-center rounded-[12px] border border-white/[0.08] text-slate-200 transition hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-45"
                    title="撤销"
                    aria-label="撤销"
                  >
                    <Undo2 className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={redoLocalEditStroke}
                    disabled={
                      localEditState.isSubmitting ||
                      localEditState.isPreparing ||
                      localEditState.redoStrokes.length === 0
                    }
                    className="inline-flex h-10 w-10 items-center justify-center rounded-[12px] border border-white/[0.08] text-slate-200 transition hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-45"
                    title="重做"
                    aria-label="重做"
                  >
                    <Redo2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <label className="block text-[12px] font-medium text-slate-300">
                笔刷大小
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="range"
                    min={8}
                    max={140}
                    value={localEditState.brushSize}
                    disabled={localEditState.isSubmitting || localEditState.isPreparing}
                    onChange={(event) => handleLocalEditBrushSizeChange(Number(event.target.value))}
                    className="min-w-0 flex-1 accent-[#6f86ab]"
                  />
                  <span className="w-9 text-right text-[12px] text-slate-400">
                    {localEditState.brushSize}
                  </span>
                </div>
              </label>

              <label className="block min-h-0 flex-1 text-[12px] font-medium text-slate-300">
                重绘提示词
                <textarea
                  value={localEditState.prompt}
                  onChange={(event) => handleLocalEditPromptChange(event.target.value)}
                  disabled={localEditState.isSubmitting || localEditState.isPreparing}
                  placeholder="描述这个局部要怎么改，例如：把这里换成蓝色包装"
                  rows={7}
                  className="mt-2 min-h-[142px] w-full resize-none rounded-[16px] border border-white/[0.08] bg-white/[0.03] px-3.5 py-3 text-[13px] leading-5 text-white outline-none placeholder:text-slate-500 focus:border-[#6f86ab] disabled:opacity-60"
                />
              </label>

              <div className="flex items-center justify-end gap-2 border-t border-white/[0.07] pt-4">
                <button
                  type="button"
                  onClick={cancelLocalEdit}
                  disabled={localEditState.isSubmitting}
                  className="rounded-[14px] border border-white/[0.08] px-3.5 py-2 text-[13px] text-slate-200 transition hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => void submitLocalEdit()}
                  disabled={
                    localEditState.isSubmitting ||
                    localEditState.isPreparing ||
                    !isSelectedImageModelConfigured ||
                    !localEditState.prompt.trim() ||
                    !localEditState.strokes.some((stroke) => stroke.mode === 'paint')
                  }
                  className="inline-flex items-center gap-1.5 rounded-[14px] bg-[#344967] px-4 py-2 text-[13px] font-medium text-white transition hover:bg-[#3d5578] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {localEditState.isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Brush className="h-4 w-4" />
                  )}
                  生成新图
                </button>
              </div>
            </aside>
          </div>
        </div>
      ) : null}

      <input
        ref={replaceImageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          await replaceSelectedImageFile(file);
        }}
      />

      {statusNotice ? (
        <div className="pointer-events-none absolute bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full border border-white/[0.08] bg-[#171b22]/95 px-4 py-2 text-sm text-slate-100 shadow-[0_18px_40px_rgba(0,0,0,0.28)]">
          {statusNotice}
        </div>
      ) : null}
    </div>
  );
}
