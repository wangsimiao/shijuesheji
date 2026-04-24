import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
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
  MAX_SCALE,
  MIN_SCALE,
  OPENROUTER_GPT_IMAGE_MODEL,
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
  createLineItem,
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
}

function normalizeProjectName(value: string) {
  return value.replace(/\s+/g, '').trim();
}

function shouldAutoRenameProject(name: string) {
  const normalized = normalizeProjectName(name);
  return (
    normalized.length === 0 ||
    normalized === normalizeProjectName(DEFAULT_BOARD_NAME) ||
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
  let width = rect.width;
  let height = rect.height;

  if (width / Math.max(height, 0.0001) > ratio) {
    width = height * ratio;
  } else {
    height = width / ratio;
  }

  const boundedWidth = Math.min(width, centerX * 2, (1 - centerX) * 2);
  const boundedHeight = Math.min(height, centerY * 2, (1 - centerY) * 2);
  let nextWidth = boundedWidth;
  let nextHeight = boundedWidth / ratio;

  if (nextHeight > boundedHeight) {
    nextHeight = boundedHeight;
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

export default function AiVisionWorkspace({
  project,
  onBack,
  onOpenProject,
}: AiVisionWorkspaceProps) {
  const initialSnapshot = useMemo(() => createWorkspaceSnapshotFromProject(project), [project]);

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
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const replaceImageInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const chatUploadInputRef = useRef<HTMLInputElement | null>(null);
  const brandTemplateInputRef = useRef<HTMLInputElement | null>(null);
  const historyMenuRef = useRef<HTMLDivElement | null>(null);
  const brandSpecMenuRef = useRef<HTMLDivElement | null>(null);
  const brandMenuRef = useRef<HTMLDivElement | null>(null);
  const sizeConfigMenuRef = useRef<HTMLDivElement | null>(null);
  const hasManualBoardNameEditRef = useRef(false);
  const wheelLockTimerRef = useRef<number | null>(null);
  const interactionRef = useRef<InteractionState>(null);
  const activeTouchGestureRef = useRef(false);
  const gestureStartedInCanvasRef = useRef(false);
  const activeTouchIdsRef = useRef<Set<number>>(new Set());
  const activeTouchPointerIdsRef = useRef<Set<number>>(new Set());
  const touchPointerPositionsRef = useRef<Map<number, PointerClientPoint>>(new Map());
  const nativeGestureDriverRef = useRef<NativeGestureDriver>(null);
  const lastPinchDistanceRef = useRef<number | null>(null);
  const lastPinchCenterRef = useRef<CanvasPoint | null>(null);

  const itemsRef = useRef(items);
  const sessionsRef = useRef(sessions);
  const viewRef = useRef(view);
  const viewportSizeRef = useRef(viewportSize);

  function clearTouchGestureState() {
    activeTouchGestureRef.current = false;
    gestureStartedInCanvasRef.current = false;
    activeTouchIdsRef.current.clear();
    activeTouchPointerIdsRef.current.clear();
    touchPointerPositionsRef.current.clear();
    nativeGestureDriverRef.current = null;
    lastPinchDistanceRef.current = null;
    lastPinchCenterRef.current = null;
    setIsCanvasGestureLocked(false);
    setCanvasHover(false);
    setCanvasWheelLock(false);
    if (wheelLockTimerRef.current) {
      window.clearTimeout(wheelLockTimerRef.current);
      wheelLockTimerRef.current = null;
    }
  }

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

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

      preventCapturedGesture(event);

      setView((previous) => {
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
      });

      lastPinchDistanceRef.current = nextDistance;
      lastPinchCenterRef.current = nextCenter;
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

      setView((previous) => {
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
      });

      lastPinchDistanceRef.current = nextDistance;
      lastPinchCenterRef.current = nextCenter;
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
    const deltaX = getWheelDeltaInPixels(event.deltaX, event.deltaMode);
    const deltaY = getWheelDeltaInPixels(event.deltaY, event.deltaMode);

    setView((previous) => ({
      ...previous,
      x: previous.x - deltaX,
      y: previous.y - deltaY,
    }));
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
    const start = createAvoidOverlapPosition(
      itemsRef.current,
      viewRef.current,
      viewportSizeRef.current,
      width,
      height
    );

    const loadingItems: CanvasItem[] = Array.from({ length: safeCount }).map((_, index) => {
      const row = Math.floor(index / columns);
      const column = index % columns;
      return {
        id: uuidv4(),
        type: 'loading',
        x: start.x + column * (width + gap),
        y: start.y + row * (height + gap),
        width,
        height,
        content: prompt || '正在生成...',
        prompt,
      };
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

    setSingleSelection(null);
    setActionPopover(null);
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
    if (event.pointerType === 'touch' && gestureStartedInCanvasRef.current) return;
    if (cropState) return;
    if (editingTextItemId && editingTextItemId !== item.id) finishTextEditing();

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
      updateScaleFromViewportPoint(
        viewRef.current.scale * (event.deltaY < 0 ? 1.08 : 0.92),
        originX,
        originY
      );
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

  function handleCopySelectedItem() {
    if (!selectedItem) return;
    if (editingTextItemId) finishTextEditing();

    const nextItem: CanvasItem = {
      ...selectedItem,
      id: uuidv4(),
      x: selectedItem.x + 32,
      y: selectedItem.y + 32,
    };
    setItems((previous) => [...previous, nextItem]);
    setSingleSelection(nextItem.id);
    setStatusNotice('元素已复制。');
  }

  function handleDeleteSelectedItem() {
    if (!selectedItemId) return;
    setItems((previous) => previous.filter((item) => item.id !== selectedItemId));
    setSingleSelection(null);
    if (editingTextItemId === selectedItemId) {
      setEditingTextItemId(null);
      setEditingTextValue('');
    }
    if (cropState?.itemId === selectedItemId) {
      setCropState(null);
    }
    setActionPopover(null);
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

  async function handleSendMessage() {
    if (isChatLoading || !currentSession) return;

    const text = chatInput.trim();
    const attachedImages = chatInputImages.map((item) => item.data);
    const requestReferenceImages = Array.from(new Set([...attachedImages, ...hiddenTemplateReferences]));
    if (!text && attachedImages.length === 0) return;

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
        systemPrompt: activeBrandSystemPrompt,
        forceImageGeneration:
          (selectedImageModel || '').trim() === OPENROUTER_GPT_IMAGE_MODEL ||
          (selectedImageModel || '').trim().toLowerCase() === 'gpt2',
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
            const effectiveSizeHint = activeSizeId || call.args.sizeHint;
            const referenceImages = call.args.referenceImages || attachedImages;

            const imageResult = await generateImageAI(
              prompt,
              selectedImageModel,
              [...referenceImages, ...hiddenTemplateReferences],
              {
                systemPrompt: activeBrandSystemPrompt,
                outputCount: expectedOutputCount,
                sizeHint: effectiveSizeHint,
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
                const fitted = fitIntoBounds(imageSize.width, imageSize.height, 520, 520);
                return { imageUrl, fitted };
              })
            );

            setItems((previous) =>
              previous.flatMap((item) => {
                const slotIndex = loadingItemIds.indexOf(item.id);
                if (slotIndex < 0) return [item];
                const nextImage = preparedImages[slotIndex];
                if (!nextImage) return [];
                return [
                  {
                    ...item,
                    type: 'image',
                    width: nextImage.fitted.width,
                    height: nextImage.fitted.height,
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
        if (editingTextItemId) {
          finishTextEditing();
          return;
        }
        if (tool !== 'select') setTool('select');
        return;
      }

      if (isEditableTarget(event.target)) return;

      if ((event.key === 'Backspace' || event.key === 'Delete') && selectedItemId) {
        event.preventDefault();
        handleDeleteSelectedItem();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cropState, editingTextItemId, selectedItemId, tool]);

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
      setDrawPreviewPoints(null);
      setLinePreviewItem(null);
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
          drawPreviewPoints={drawPreviewPoints}
          linePreviewItem={linePreviewItem}
          selectedItemId={selectedItemId}
          selectedItem={selectedItem}
          selectedItemToolbarPosition={selectedItemToolbarPosition}
          actionPopover={actionPopover}
          setActionPopover={setActionPopover}
          cropState={cropState}
          editingTextItemId={editingTextItemId}
          editingTextValue={editingTextValue}
          canvasRootRef={canvasRootRef}
          canvasViewportRef={canvasViewportRef}
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
          onAddSelectedImageToChat={() => {
            if (!selectedImageItem) return;
            void exportImageSource(selectedImageItem).then((data) =>
              addChatReferenceImage(data, selectedImageItem.prompt || '画布图片')
            );
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
