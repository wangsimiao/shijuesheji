import React, { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ImagePlus,
  Loader2,
  MessageSquarePlus,
  Plus,
  Send,
  Trash2,
  Type,
  Upload,
  X,
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { chatWithAI, generateImageAI, isDoubaoConfigured } from '../services/ai';
import { CanvasItem, ChatInputImage, ChatMessage, ChatSession, ViewState } from '../types';

interface AiVisionWorkspaceProps {
  onBack: () => void;
}

interface AiVisionPersistedState {
  boardName: string;
  items: CanvasItem[];
  sessions: ChatSession[];
  currentSessionId: string;
  view: ViewState;
}

type DragState =
  | { type: 'none' }
  | { type: 'pan'; startClientX: number; startClientY: number; startX: number; startY: number }
  | {
      type: 'item';
      itemId: string;
      startClientX: number;
      startClientY: number;
      originX: number;
      originY: number;
    };

const STORAGE_KEY = 'ai_visual_workspace_v1';
const MIN_SCALE = 0.2;
const MAX_SCALE = 4;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function createEmptySession(title = '新对话'): ChatSession {
  return {
    id: uuidv4(),
    title,
    messages: [],
    createdAt: Date.now(),
  };
}

function normalizeView(view?: Partial<ViewState>): ViewState {
  return {
    x: typeof view?.x === 'number' ? view.x : 140,
    y: typeof view?.y === 'number' ? view.y : 120,
    scale: typeof view?.scale === 'number' ? view.scale : 1,
    selectedItemIds: Array.isArray(view?.selectedItemIds) ? view.selectedItemIds.filter(Boolean) : [],
  };
}

function loadPersistedState(): AiVisionPersistedState {
  const fallbackSession = createEmptySession();
  const fallback: AiVisionPersistedState = {
    boardName: 'AI视觉画板',
    items: [],
    sessions: [fallbackSession],
    currentSessionId: fallbackSession.id,
    view: normalizeView(),
  };

  if (typeof window === 'undefined') {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;

    const parsed = JSON.parse(raw) as Partial<AiVisionPersistedState>;
    const sessions =
      Array.isArray(parsed.sessions) && parsed.sessions.length > 0
        ? parsed.sessions.map((session) => ({
            id: session.id || uuidv4(),
            title: session.title || '新对话',
            messages: Array.isArray(session.messages)
              ? session.messages.map((message) => ({
                  id: message.id || uuidv4(),
                  role:
                    message.role === 'assistant' || message.role === 'system' || message.role === 'user'
                      ? message.role
                      : 'assistant',
                  content: typeof message.content === 'string' ? message.content : '',
                  imageUrl: typeof message.imageUrl === 'string' ? message.imageUrl : undefined,
                  attachedImages: Array.isArray(message.attachedImages)
                    ? message.attachedImages.filter(
                        (item): item is string => typeof item === 'string' && Boolean(item.trim())
                      )
                    : undefined,
                }))
              : [],
            createdAt: Number(session.createdAt || Date.now()),
          }))
        : [fallbackSession];

    return {
      boardName:
        typeof parsed.boardName === 'string' && parsed.boardName.trim()
          ? parsed.boardName
          : fallback.boardName,
      items: Array.isArray(parsed.items)
        ? parsed.items.map((item) => ({
            id: item.id || uuidv4(),
            type: item.type === 'image' || item.type === 'text' || item.type === 'loading' ? item.type : 'text',
            x: typeof item.x === 'number' ? item.x : 0,
            y: typeof item.y === 'number' ? item.y : 0,
            width: typeof item.width === 'number' ? item.width : 320,
            height: typeof item.height === 'number' ? item.height : 180,
            content: typeof item.content === 'string' ? item.content : '',
            prompt: typeof item.prompt === 'string' ? item.prompt : undefined,
          }))
        : [],
      sessions,
      currentSessionId:
        sessions.find((session) => session.id === parsed.currentSessionId)?.id || sessions[0].id,
      view: normalizeView(parsed.view),
    };
  } catch {
    return fallback;
  }
}

function getCanvasCenterPosition(view: ViewState, width: number, height: number) {
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth - 420 : 1280;
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight - 120 : 720;
  return {
    x: (-view.x + viewportWidth / 2) / view.scale - width / 2,
    y: (-view.y + viewportHeight / 2) / view.scale - height / 2,
  };
}

function createAvoidOverlapPosition(items: CanvasItem[], view: ViewState, width: number, height: number) {
  const center = getCanvasCenterPosition(view, width, height);
  const step = 42;
  for (let index = 0; index < 120; index += 1) {
    const candidate = {
      x: center.x + index * step,
      y: center.y + index * step,
    };
    const hit = items.some((item) => {
      const overlapX = candidate.x < item.x + item.width + 24 && candidate.x + width + 24 > item.x;
      const overlapY = candidate.y < item.y + item.height + 24 && candidate.y + height + 24 > item.y;
      return overlapX && overlapY;
    });
    if (!hit) return candidate;
  }
  return center;
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('读取图片失败'));
    reader.readAsDataURL(file);
  });
}

export default function AiVisionWorkspace({ onBack }: AiVisionWorkspaceProps) {
  const initialStateRef = useRef<AiVisionPersistedState | null>(null);
  if (!initialStateRef.current) {
    initialStateRef.current = loadPersistedState();
  }

  const [boardName, setBoardName] = useState(initialStateRef.current.boardName);
  const [items, setItems] = useState<CanvasItem[]>(initialStateRef.current.items);
  const [sessions, setSessions] = useState<ChatSession[]>(initialStateRef.current.sessions);
  const [currentSessionId, setCurrentSessionId] = useState(initialStateRef.current.currentSessionId);
  const [view, setView] = useState<ViewState>(initialStateRef.current.view);
  const [chatInputImages, setChatInputImages] = useState<ChatInputImage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [dragState, setDragState] = useState<DragState>({ type: 'none' });

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const canvasUploadInputRef = useRef<HTMLInputElement | null>(null);
  const chatUploadInputRef = useRef<HTMLInputElement | null>(null);

  const currentSession = useMemo(
    () => sessions.find((session) => session.id === currentSessionId) || sessions[0] || null,
    [sessions, currentSessionId]
  );

  const selectedItemId = view.selectedItemIds[0];
  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedItemId) || null,
    [items, selectedItemId]
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const payload: AiVisionPersistedState = {
      boardName,
      items,
      sessions,
      currentSessionId,
      view,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [boardName, items, sessions, currentSessionId, view]);

  const zoomAt = (clientX: number, clientY: number, nextScale: number) => {
    const container = canvasRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    const scale = clamp(nextScale, MIN_SCALE, MAX_SCALE);
    setView((previous) => {
      const worldX = (localX - previous.x) / previous.scale;
      const worldY = (localY - previous.y) / previous.scale;
      return {
        ...previous,
        x: localX - worldX * scale,
        y: localY - worldY * scale,
        scale,
      };
    });
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      const nextScale = view.scale * (event.deltaY > 0 ? 0.92 : 1.08);
      zoomAt(event.clientX, event.clientY, nextScale);
      return;
    }

    setView((previous) => ({
      ...previous,
      x: previous.x - event.deltaX,
      y: previous.y - event.deltaY,
    }));
  };

  const handleCanvasPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest('[data-vision-item="true"]')) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    setDragState({
      type: 'pan',
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: view.x,
      startY: view.y,
    });
    setView((previous) => ({ ...previous, selectedItemIds: [] }));
  };

  const handleItemPointerDown = (event: React.PointerEvent<HTMLDivElement>, item: CanvasItem) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setView((previous) => ({ ...previous, selectedItemIds: [item.id] }));
    setDragState({
      type: 'item',
      itemId: item.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      originX: item.x,
      originY: item.y,
    });
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragState.type === 'none') return;
    if (dragState.type === 'pan') {
      const deltaX = event.clientX - dragState.startClientX;
      const deltaY = event.clientY - dragState.startClientY;
      setView((previous) => ({
        ...previous,
        x: dragState.startX + deltaX,
        y: dragState.startY + deltaY,
      }));
      return;
    }

    const deltaX = (event.clientX - dragState.startClientX) / view.scale;
    const deltaY = (event.clientY - dragState.startClientY) / view.scale;
    setItems((previous) =>
      previous.map((item) =>
        item.id === dragState.itemId
          ? {
              ...item,
              x: dragState.originX + deltaX,
              y: dragState.originY + deltaY,
            }
          : item
      )
    );
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragState.type === 'none') return;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // noop
    }
    setDragState({ type: 'none' });
  };

  const updateSessionMessages = (sessionId: string, nextMessages: ChatMessage[], nextTitle?: string) => {
    setSessions((previous) =>
      previous.map((session) =>
        session.id === sessionId
          ? {
              ...session,
              title: nextTitle || session.title,
              messages: nextMessages,
            }
          : session
      )
    );
  };

  const insertGeneratedImageToCanvas = (prompt: string, imageUrl: string, replaceId?: string) => {
    setItems((previous) => {
      if (replaceId) {
        return previous.map((item) =>
          item.id === replaceId
            ? {
                ...item,
                type: 'image',
                content: imageUrl,
                prompt,
              }
            : item
        );
      }

      const size = 520;
      const position = createAvoidOverlapPosition(previous, view, size, size);
      return [
        ...previous,
        {
          id: uuidv4(),
          type: 'image',
          x: position.x,
          y: position.y,
          width: size,
          height: size,
          content: imageUrl,
          prompt,
        },
      ];
    });
  };

  const addTextCard = () => {
    const width = 360;
    const height = 180;
    const position = createAvoidOverlapPosition(items, view, width, height);
    const item: CanvasItem = {
      id: uuidv4(),
      type: 'text',
      x: position.x,
      y: position.y,
      width,
      height,
      content: '双击这里编辑文案，或者在右侧选中后修改内容。',
    };
    setItems((previous) => [...previous, item]);
    setView((previous) => ({ ...previous, selectedItemIds: [item.id] }));
  };

  const addCanvasImage = async (file: File) => {
    const dataUrl = await readFileAsDataUrl(file);
    const width = 420;
    const height = 420;
    const position = createAvoidOverlapPosition(items, view, width, height);
    const item: CanvasItem = {
      id: uuidv4(),
      type: 'image',
      x: position.x,
      y: position.y,
      width,
      height,
      content: dataUrl,
      prompt: file.name,
    };
    setItems((previous) => [...previous, item]);
    setView((previous) => ({ ...previous, selectedItemIds: [item.id] }));
  };

  const handleCanvasUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    await addCanvasImage(file);
  };

  const handleChatReferenceUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (chatInputImages.length >= 4) {
      window.alert('最多添加 4 张参考图。');
      return;
    }

    const data = await readFileAsDataUrl(file);
    setChatInputImages((previous) => [
      ...previous,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        data,
        source: 'local',
        name: file.name,
      },
    ]);
  };

  const handleNewChat = () => {
    const session = createEmptySession();
    setSessions((previous) => [session, ...previous]);
    setCurrentSessionId(session.id);
  };

  const handleSendMessage = async (event: FormEvent) => {
    event.preventDefault();
    if (!currentSession || isChatLoading) return;

    const text = chatInput.trim();
    if (!text) return;

    const attachedImages = chatInputImages.map((item) => item.data);
    const history = currentSession.messages.map((message) => ({
      role: message.role,
      content: message.content,
    }));

    const userMessage: ChatMessage = {
      id: uuidv4(),
      role: 'user',
      content: text,
      attachedImages: attachedImages.length ? attachedImages : undefined,
    };
    const loadingId = uuidv4();
    const loadingMessage: ChatMessage = {
      id: loadingId,
      role: 'assistant',
      content: '正在思考...',
    };

    const nextMessages = [...currentSession.messages, userMessage, loadingMessage];
    updateSessionMessages(
      currentSession.id,
      nextMessages,
      currentSession.messages.length === 0 ? text.slice(0, 24) || '新对话' : undefined
    );
    setChatInput('');
    setIsChatLoading(true);

    try {
      const response = await chatWithAI(history, text, attachedImages);
      let updatedMessages = nextMessages;

      if (response.text.trim()) {
        updatedMessages = updatedMessages.map((message) =>
          message.id === loadingId
            ? {
                ...message,
                content: response.text.trim(),
              }
            : message
        );
      } else {
        updatedMessages = updatedMessages.filter((message) => message.id !== loadingId);
      }

      updateSessionMessages(currentSession.id, updatedMessages);

      for (const call of response.functionCalls || []) {
        if (call.name !== 'generateImage') continue;
        const loadingCanvasId = uuidv4();
        const size = 520;
        const position = createAvoidOverlapPosition(items, view, size, size);
        setItems((previous) => [
          ...previous,
          {
            id: loadingCanvasId,
            type: 'loading',
            x: position.x,
            y: position.y,
            width: size,
            height: size,
            content: '',
            prompt: call.args.prompt,
          },
        ]);

        const imageUrl = await generateImageAI(
          call.args.prompt,
          undefined,
          call.args.referenceImages || attachedImages
        );

        insertGeneratedImageToCanvas(call.args.prompt, imageUrl, loadingCanvasId);
        updatedMessages = [
          ...updatedMessages,
          {
            id: uuidv4(),
            role: 'assistant',
            content: `已为你生成画面：${call.args.prompt}`,
            imageUrl,
          },
        ];
        updateSessionMessages(currentSession.id, updatedMessages);
      }

      if (!response.text.trim() && (response.functionCalls || []).length === 0) {
        updatedMessages = [
          ...updatedMessages,
          {
            id: uuidv4(),
            role: 'assistant',
            content: '我已经收到你的需求，可以再补充一点风格、主体和使用场景，我会给你更贴合的结果。',
          },
        ];
        updateSessionMessages(currentSession.id, updatedMessages);
      }

      setChatInputImages([]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      updateSessionMessages(currentSession.id, [
        ...nextMessages.filter((messageItem) => messageItem.id !== loadingId),
        {
          id: uuidv4(),
          role: 'assistant',
          content: `请求失败：${message}`,
        },
      ]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const clearCanvas = () => {
    if (!window.confirm('确认清空当前画布吗？')) return;
    setItems([]);
    setView(normalizeView());
  };

  const resetWorkspace = () => {
    if (!window.confirm('确认重置 AI视觉 工作台吗？这会清空画布和对话历史。')) return;
    const session = createEmptySession();
    setBoardName('AI视觉画板');
    setItems([]);
    setSessions([session]);
    setCurrentSessionId(session.id);
    setView(normalizeView());
    setChatInput('');
    setChatInputImages([]);
  };

  const addSelectedImageToChat = () => {
    if (!selectedItem || selectedItem.type !== 'image') return;
    setChatInputImages((previous) => {
      if (previous.some((image) => image.data === selectedItem.content) || previous.length >= 4) {
        return previous;
      }

      return [
        ...previous,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          data: selectedItem.content,
          source: 'canvas',
          name: selectedItem.prompt || '画布图片',
        },
      ];
    });
  };

  const deleteSelectedItem = () => {
    if (!selectedItemId) return;
    setItems((previous) => previous.filter((item) => item.id !== selectedItemId));
    setView((previous) => ({ ...previous, selectedItemIds: [] }));
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#eef3f8] text-slate-900">
      <input
        ref={canvasUploadInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleCanvasUpload}
      />
      <input
        ref={chatUploadInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleChatReferenceUpload}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-slate-200 bg-white/88 px-5 py-4 backdrop-blur">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-700 transition hover:bg-slate-100"
              title="返回"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <div className="min-w-0">
              <div className="text-xs font-medium uppercase tracking-[0.24em] text-sky-600">AI Vision</div>
              <input
                value={boardName}
                onChange={(event) => setBoardName(event.target.value)}
                className="mt-1 w-[320px] max-w-full rounded-xl border border-transparent bg-transparent px-2 py-1 text-xl font-semibold text-slate-900 outline-none transition hover:border-slate-200 focus:border-sky-300"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={addTextCard}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <Type className="h-4 w-4" />
              文本卡片
            </button>
            <button
              type="button"
              onClick={() => canvasUploadInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <Upload className="h-4 w-4" />
              上传图片
            </button>
            <button
              type="button"
              onClick={clearCanvas}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <Trash2 className="h-4 w-4" />
              清空画布
            </button>
            <button
              type="button"
              onClick={resetWorkspace}
              className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
            >
              <Plus className="h-4 w-4" />
              新画板
            </button>
          </div>
        </header>

        <div className="relative min-h-0 flex-1 overflow-hidden">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.12),_transparent_34%),radial-gradient(circle_at_bottom_right,_rgba(14,165,233,0.10),_transparent_28%)]" />

          <div className="absolute left-5 top-5 z-20 flex items-center gap-2 rounded-2xl border border-white/60 bg-white/85 px-3 py-2 text-xs text-slate-600 shadow-sm backdrop-blur">
            <span>缩放 {Math.round(view.scale * 100)}%</span>
            <span className="text-slate-300">|</span>
            <span>拖动画布空白处平移，滚轮缩放</span>
          </div>

          <div className="absolute right-5 top-5 z-20 flex items-center gap-2 rounded-2xl border border-white/60 bg-white/85 px-2 py-2 shadow-sm backdrop-blur">
            <button
              type="button"
              onClick={() => {
                const rect = canvasRef.current?.getBoundingClientRect();
                const clientX = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
                const clientY = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
                zoomAt(clientX, clientY, view.scale * 0.9);
              }}
              className="rounded-xl px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
            >
              缩小
            </button>
            <button
              type="button"
              onClick={() => {
                const rect = canvasRef.current?.getBoundingClientRect();
                const clientX = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
                const clientY = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
                zoomAt(clientX, clientY, view.scale * 1.1);
              }}
              className="rounded-xl px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
            >
              放大
            </button>
            {selectedItem?.type === 'image' ? (
              <button
                type="button"
                onClick={addSelectedImageToChat}
                className="rounded-xl bg-sky-500 px-3 py-2 text-xs font-medium text-white transition hover:bg-sky-400"
              >
                引用到对话
              </button>
            ) : null}
            {selectedItem ? (
              <button
                type="button"
                onClick={deleteSelectedItem}
                className="rounded-xl px-3 py-2 text-xs font-medium text-rose-500 transition hover:bg-rose-50"
              >
                删除
              </button>
            ) : null}
          </div>

          <div
            ref={canvasRef}
            className="relative h-full w-full overscroll-none"
            onWheel={handleWheel}
            onPointerDown={handleCanvasPointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            <div
              className="absolute inset-0"
              style={{
                backgroundSize: `${32 * view.scale}px ${32 * view.scale}px`,
                backgroundImage:
                  'linear-gradient(rgba(148,163,184,0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.14) 1px, transparent 1px)',
                backgroundPosition: `${view.x}px ${view.y}px`,
              }}
            />

            <div
              className="absolute left-0 top-0 origin-top-left"
              style={{
                transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
              }}
            >
              {items.map((item) => (
                <div
                  key={item.id}
                  data-vision-item="true"
                  onPointerDown={(event) => handleItemPointerDown(event, item)}
                  onDoubleClick={() => {
                    if (item.type !== 'text') return;
                    const nextContent = window.prompt('编辑文本卡片', item.content);
                    if (nextContent === null) return;
                    setItems((previous) =>
                      previous.map((current) =>
                        current.id === item.id
                          ? {
                              ...current,
                              content: nextContent,
                            }
                          : current
                      )
                    );
                  }}
                  className={`absolute overflow-hidden transition ${
                    selectedItemId === item.id
                      ? 'ring-4 ring-sky-300 ring-offset-4 ring-offset-[#eef3f8]'
                      : 'hover:ring-2 hover:ring-slate-200 hover:ring-offset-2 hover:ring-offset-[#eef3f8]'
                  }`}
                  style={{
                    left: item.x,
                    top: item.y,
                    width: item.width,
                    height: item.height,
                    borderRadius: item.type === 'text' ? 28 : 30,
                    boxShadow:
                      item.type === 'text'
                        ? '0 18px 40px rgba(253, 224, 71, 0.22)'
                        : '0 24px 55px rgba(15, 23, 42, 0.12)',
                    background:
                      item.type === 'loading'
                        ? 'rgba(15,23,42,0.9)'
                        : item.type === 'text'
                          ? 'linear-gradient(135deg, #fff8cf 0%, #fff0a8 100%)'
                          : '#ffffff',
                    border: item.type === 'image' ? '1px solid rgba(226, 232, 240, 0.9)' : 'none',
                  }}
                >
                  {item.type === 'image' ? (
                    <img
                      src={item.content}
                      alt={item.prompt || '画布图片'}
                      className="h-full w-full object-cover"
                      draggable={false}
                    />
                  ) : null}

                  {item.type === 'text' ? (
                    <div className="flex h-full w-full flex-col p-5">
                      <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-amber-700/70">
                        Note
                      </div>
                      <div className="mt-3 whitespace-pre-wrap text-[15px] leading-7 text-slate-800">
                        {item.content}
                      </div>
                    </div>
                  ) : null}

                  {item.type === 'loading' ? (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-white">
                      <Loader2 className="h-7 w-7 animate-spin" />
                      <div className="text-sm font-medium">AI 正在生成画面</div>
                      <div className="max-w-[70%] text-center text-xs text-white/60">{item.prompt}</div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>

            {items.length === 0 ? (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="rounded-[32px] border border-white/80 bg-white/85 px-10 py-8 text-center shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
                  <div className="text-sm uppercase tracking-[0.24em] text-sky-500">AI视觉</div>
                  <h2 className="mt-3 text-2xl font-semibold text-slate-900">左侧无限画布，右侧 AI 对话</h2>
                  <p className="mt-3 max-w-lg text-sm leading-7 text-slate-500">
                    先把灵感丢进画布，再让 AI 帮你继续扩图、改风格、补文案。你也可以选中画布里的图片，直接作为对话参考图。
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <aside className="flex h-full w-[400px] shrink-0 flex-col border-l border-slate-200 bg-white/94 backdrop-blur">
        <div className="border-b border-slate-200 px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-900">AI 对话</div>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                参考图、生成结果和画布素材都在这里汇合。
              </p>
            </div>
            <button
              type="button"
              onClick={handleNewChat}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
            >
              <MessageSquarePlus className="h-4 w-4" />
              新对话
            </button>
          </div>

          {!isDoubaoConfigured() ? (
            <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs leading-6 text-amber-700">
              当前还没有配置 `VITE_DOUBAO_API_KEY`，对话和生图会失败。
            </div>
          ) : null}

          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {sessions.map((session) => (
              <button
                key={session.id}
                type="button"
                onClick={() => setCurrentSessionId(session.id)}
                className={`shrink-0 rounded-2xl border px-3 py-2 text-left text-xs transition ${
                  session.id === currentSessionId
                    ? 'border-sky-200 bg-sky-50 text-sky-700'
                    : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                }`}
              >
                <div className="max-w-[112px] truncate font-medium">{session.title}</div>
              </button>
            ))}
          </div>
        </div>

        {selectedItem ? (
          <div className="border-b border-slate-200 px-4 py-4">
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">选中元素</div>
            {selectedItem.type === 'image' ? (
              <div className="mt-3 rounded-3xl border border-slate-200 bg-slate-50 p-3">
                <img src={selectedItem.content} alt="选中图片" className="h-40 w-full rounded-2xl object-cover" />
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={addSelectedImageToChat}
                    className="inline-flex items-center gap-2 rounded-2xl bg-sky-500 px-3 py-2 text-xs font-medium text-white transition hover:bg-sky-400"
                  >
                    <ImagePlus className="h-3.5 w-3.5" />
                    用作参考图
                  </button>
                  <button
                    type="button"
                    onClick={deleteSelectedItem}
                    className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    删除
                  </button>
                </div>
              </div>
            ) : null}

            {selectedItem.type === 'text' ? (
              <div className="mt-3 rounded-3xl border border-slate-200 bg-slate-50 p-3">
                <textarea
                  value={selectedItem.content}
                  onChange={(event) =>
                    setItems((previous) =>
                      previous.map((item) =>
                        item.id === selectedItem.id
                          ? {
                              ...item,
                              content: event.target.value,
                            }
                          : item
                      )
                    )
                  }
                  rows={6}
                  className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm leading-6 text-slate-800 outline-none focus:border-sky-300"
                />
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <div className="space-y-3">
            {(currentSession?.messages || []).map((message) => (
              <article
                key={message.id}
                className={`rounded-3xl px-4 py-3 text-sm leading-7 ${
                  message.role === 'user'
                    ? 'ml-8 bg-slate-900 text-white'
                    : 'mr-8 border border-slate-200 bg-slate-50 text-slate-700'
                }`}
              >
                <div className="whitespace-pre-wrap break-words">{message.content}</div>
                {message.imageUrl ? (
                  <img
                    src={message.imageUrl}
                    alt="生成结果"
                    className="mt-3 w-full rounded-2xl border border-slate-200 object-cover"
                  />
                ) : null}
              </article>
            ))}
          </div>

          {!currentSession?.messages.length ? (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm leading-7 text-slate-500">
              可以直接说“帮我生成一张冷淡风家居主图”，也可以先把图片拖进画布，再选中它引用到对话里。
            </div>
          ) : null}
        </div>

        <form onSubmit={handleSendMessage} className="border-t border-slate-200 px-4 py-4">
          {chatInputImages.length > 0 ? (
            <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
              {chatInputImages.map((item) => (
                <div key={item.id} className="relative h-16 w-20 shrink-0 overflow-hidden rounded-2xl border border-slate-200">
                  <img src={item.data} alt={item.name || '参考图'} className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() =>
                      setChatInputImages((previous) => previous.filter((image) => image.id !== item.id))
                    }
                    className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black/75"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-3">
            <textarea
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              rows={4}
              placeholder="描述你想要的画面、风格、尺寸或修改方向..."
              className="w-full resize-none bg-transparent text-sm leading-7 text-slate-800 outline-none placeholder:text-slate-400"
            />

            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => chatUploadInputRef.current?.click()}
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
                >
                  <Upload className="h-3.5 w-3.5" />
                  上传参考图
                </button>
                {selectedItem?.type === 'image' ? (
                  <button
                    type="button"
                    onClick={addSelectedImageToChat}
                    className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
                  >
                    <ImagePlus className="h-3.5 w-3.5" />
                    引用选中图
                  </button>
                ) : null}
              </div>

              <button
                type="submit"
                disabled={!chatInput.trim() || isChatLoading}
                className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isChatLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                发送
              </button>
            </div>
          </div>
        </form>
      </aside>
    </div>
  );
}
