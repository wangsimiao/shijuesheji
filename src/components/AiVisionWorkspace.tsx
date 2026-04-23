import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { addBrandTemplateHydrated, getBrandTemplatesHydrated, saveProject } from '../store';
import { chatWithAI, generateImageAI, isDoubaoConfigured } from '../services/ai';
import type {
  BrandTemplate,
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
  CropState,
  DEFAULT_BOARD_NAME,
  DEFAULT_IMAGE_MODEL_OPTION,
  DEFAULT_SCENE_TAB,
  DEFAULT_VIEW,
  DEFAULT_VIEWPORT,
  DRAW_STROKE_WIDTH,
  FIT_VIEW_PADDING,
  InteractionState,
  MAX_SCALE,
  MIN_SCALE,
  MediaDimensions,
  SceneTab,
  ViewportSize,
  buildProjectFromWorkspace,
  buildSceneAwarePrompt,
  buildDrawingFrame,
  clamp,
  createAvoidOverlapPosition,
  createEmptySession,
  createWorkspaceSnapshotFromProject,
  cropImageSource,
  downloadAsset,
  fitIntoBounds,
  getClientToWorldPoint,
  getCropRect,
  getDefaultSceneBySessionId,
  getDisplayFilename,
  getErrorMessage,
  isEditableTarget,
  loadImageDimensions,
  loadVideoDimensions,
  readFileAsDataUrl,
} from './ai-vision/workspace-model';

interface AiVisionWorkspaceProps {
  project: Project;
  onBack: () => void;
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

export default function AiVisionWorkspace({ project, onBack }: AiVisionWorkspaceProps) {
  const initialSnapshot = useMemo(() => createWorkspaceSnapshotFromProject(project), [project]);

  const [boardName, setBoardName] = useState(initialSnapshot.boardName);
  const [items, setItems] = useState<CanvasItem[]>(initialSnapshot.items);
  const [sessions, setSessions] = useState<ChatSession[]>(initialSnapshot.sessions);
  const [currentSessionId, setCurrentSessionId] = useState(initialSnapshot.currentSessionId);
  const [view, setView] = useState<ViewState>(initialSnapshot.view);
  const [tool, setTool] = useState<'select' | 'draw' | 'text' | 'shape'>('select');
  const [chatInput, setChatInput] = useState('');
  const [chatInputImages, setChatInputImages] = useState<ChatInputImage[]>([]);
  const [brandTemplates, setBrandTemplates] = useState<BrandTemplate[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [sceneBySessionId, setSceneBySessionId] = useState<Record<string, SceneTab>>(
    initialSnapshot.sceneBySessionId
  );
  const [actionPopover, setActionPopover] = useState<ActionPopoverState | null>(null);
  const [cropState, setCropState] = useState<CropState | null>(null);
  const [cropPreviewSize, setCropPreviewSize] = useState<MediaDimensions | null>(null);
  const [drawPreviewPoints, setDrawPreviewPoints] = useState<CanvasPoint[] | null>(null);
  const [selectedImageModel, setSelectedImageModel] = useState(initialSnapshot.selectedImageModel);
  const [isHistoryMenuOpen, setIsHistoryMenuOpen] = useState(false);
  const [isBrandMenuOpen, setIsBrandMenuOpen] = useState(false);
  const [isChatSidebarCollapsed, setIsChatSidebarCollapsed] = useState(false);
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
  const hasManualBoardNameEditRef = useRef(false);
  const wheelLockTimerRef = useRef<number | null>(null);
  const interactionRef = useRef<InteractionState>(null);

  const itemsRef = useRef(items);
  const sessionsRef = useRef(sessions);
  const viewRef = useRef(view);
  const viewportSizeRef = useRef(viewportSize);

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
    let cancelled = false;

    void saveProject(
      buildProjectFromWorkspace(project, {
        boardName,
        items,
        sessions,
        currentSessionId,
        view,
        selectedImageModel,
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
    const exists = items.some((item) => item.id === actionPopover.itemId && item.type === 'image');
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

  function getWheelDeltaInPixels(delta: number, deltaMode: number) {
    if (deltaMode === 1) return delta * 16;
    if (deltaMode === 2) return delta * viewportSizeRef.current.height;
    return delta;
  }

  function applyCanvasPanFromWheel(event: React.WheelEvent<HTMLDivElement>) {
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
      content: prompt || '正在生成...',
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
    setStatusNotice('缺少视频模型 ID，待补充后启用。');
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

    setActionPopover((previous) => (previous ? { ...previous, isSubmitting: true } : previous));

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
      setActionPopover((previous) => (previous ? { ...previous, isSubmitting: false } : previous));
      setStatusNotice(getErrorMessage(error));
    }
  }

  async function handleVideoSubmit() {
    setStatusNotice('缺少视频模型 ID，待补充后启用。');
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
          const loadingItemId = createLoadingItem(prompt || '正在生成图片...');

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
              onChange={(event) => {
                hasManualBoardNameEditRef.current = true;
                setBoardName(event.target.value);
              }}
              className="w-[210px] rounded-xl border border-transparent bg-transparent px-3 py-2 text-base font-semibold text-white outline-none transition focus:border-white/[0.08] focus:bg-white/[0.03]"
            />
          </div>
        </header>

        <CanvasStage
          items={items}
          tool={tool}
          setTool={setTool}
          view={view}
          drawPreviewPoints={drawPreviewPoints}
          selectedItemId={selectedItemId}
          selectedImageItem={selectedImageItem}
          selectedImageToolbarPosition={selectedImageToolbarPosition}
          actionPopover={actionPopover}
          setActionPopover={setActionPopover}
          cropState={cropState}
          setCropState={setCropState}
          cropTargetItem={cropTargetItem}
          cropPreviewFrame={cropPreviewFrame}
          cropPanelRef={cropPanelRef}
          canvasViewportRef={canvasViewportRef}
          imageInputRef={imageInputRef}
          videoInputRef={videoInputRef}
          isModelConfigured={isDoubaoConfigured()}
          onCanvasPointerEnter={() => {
            if (!cropState) setCanvasHover(true);
          }}
          onCanvasPointerLeave={() => {
            setCanvasHover(false);
          }}
          onCanvasPointerDown={handleCanvasPointerDown}
          onCanvasWheel={handleCanvasWheel}
          onItemPointerDown={handleItemPointerDown}
          onItemDoubleClick={handleItemDoubleClick}
          onImportImageFiles={importImageFiles}
          onImportVideoFiles={importVideoFiles}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onFitCanvasView={handleFitCanvasView}
          onCopySelectedImage={handleCopySelectedImage}
          onDownloadSelectedImage={handleDownloadSelectedImage}
          onOpenRegeneratePopover={openRegeneratePopover}
          onOpenVideoPopover={openVideoPopover}
          onOpenCropModal={openCropModal}
          onRegenerateSubmit={handleRegenerateSubmit}
          onVideoSubmit={handleVideoSubmit}
          onCropConfirm={handleCropConfirm}
          onMissingRegenerateConfig={() =>
            setStatusNotice('未配置 VITE_DOUBAO_API_KEY，暂时无法重新生成。')
          }
          onAddSelectedImageToChat={() => {
            if (!selectedImageItem) return;
            void addChatReferenceImage(selectedImageItem.content, selectedImageItem.prompt || '画布图片');
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
        selectedImageModel={selectedImageModel || DEFAULT_IMAGE_MODEL_OPTION.value}
        isChatLoading={isChatLoading}
        isCollapsed={isChatSidebarCollapsed}
        isHistoryMenuOpen={isHistoryMenuOpen}
        isBrandMenuOpen={isBrandMenuOpen}
        storageWarning={storageWarning}
        isModelConfigured={isDoubaoConfigured()}
        historyMenuRef={historyMenuRef}
        brandMenuRef={brandMenuRef}
        chatUploadInputRef={chatUploadInputRef}
        brandTemplateInputRef={brandTemplateInputRef}
        onToggleCollapsed={() => setIsChatSidebarCollapsed((previous) => !previous)}
        onToggleHistoryMenu={() => setIsHistoryMenuOpen((previous) => !previous)}
        onToggleBrandMenu={() => setIsBrandMenuOpen((previous) => !previous)}
        onCreateSession={handleCreateSession}
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
      />

      {statusNotice ? (
        <div className="pointer-events-none absolute bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full border border-white/[0.08] bg-[#171b27]/95 px-4 py-2 text-sm text-slate-100 shadow-[0_18px_40px_rgba(0,0,0,0.28)]">
          {statusNotice}
        </div>
      ) : null}
    </div>
  );
}
