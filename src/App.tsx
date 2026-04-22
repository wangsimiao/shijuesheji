import React, { useMemo, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import AiVisionWorkspace from './components/AiVisionWorkspace';
import CanvasContainer from './components/CanvasContainer';
import ChatPanel from './components/ChatPanel';
import Dashboard from './components/Dashboard';
import OpenPencilLabWorkspace from './components/OpenPencilLabWorkspace';
import { chatWithAI, generateImageAI, isDoubaoConfigured } from './services/ai';
import { saveProject } from './store';
import {
  AppRoute,
  CanvasItem,
  ChatInputImage,
  ChatMessage,
  ChatSession,
  Project,
  ViewState,
} from './types';

function createEmptySession(): ChatSession {
  return {
    id: uuidv4(),
    title: '新对话',
    messages: [],
    createdAt: Date.now(),
  };
}

function normalizeView(view?: Partial<ViewState>): ViewState {
  return {
    x: typeof view?.x === 'number' ? view.x : 120,
    y: typeof view?.y === 'number' ? view.y : 120,
    scale: typeof view?.scale === 'number' ? view.scale : 1,
    selectedItemIds: Array.isArray(view?.selectedItemIds) ? view!.selectedItemIds! : [],
  };
}

function getCanvasCenterPosition(view: ViewState, width: number, height: number) {
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 720;
  return {
    x: (-view.x + viewportWidth / 2) / view.scale - width / 2,
    y: (-view.y + viewportHeight / 2) / view.scale - height / 2,
  };
}

function createAvoidOverlapPosition(items: CanvasItem[], view: ViewState, width: number, height: number) {
  const center = getCanvasCenterPosition(view, width, height);
  const step = 48;
  for (let i = 0; i < 100; i += 1) {
    const candidate = {
      x: center.x + i * step,
      y: center.y + i * step,
    };
    const hit = items.some((item) => {
      const overlapX = candidate.x < item.x + item.width + 20 && candidate.x + width + 20 > item.x;
      const overlapY = candidate.y < item.y + item.height + 20 && candidate.y + height + 20 > item.y;
      return overlapX && overlapY;
    });
    if (!hit) return candidate;
  }
  return center;
}

export default function App() {
  const [currentRoute, setCurrentRoute] = useState<AppRoute>('home');
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeProjectName, setActiveProjectName] = useState('AI 设计项目');
  const [activeProjectCreatorId, setActiveProjectCreatorId] = useState<string | undefined>();
  const [activeProjectCreatorName, setActiveProjectCreatorName] = useState<string | undefined>();

  const [items, setItems] = useState<CanvasItem[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>('');
  const [view, setView] = useState<ViewState>(normalizeView());
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [chatInputImages, setChatInputImages] = useState<ChatInputImage[]>([]);

  const currentSession = useMemo(
    () => sessions.find((session) => session.id === currentSessionId) || sessions[0] || null,
    [sessions, currentSessionId]
  );
  const messages = currentSession?.messages || [];

  const persistActiveProject = (
    nextItems: CanvasItem[],
    nextSessions: ChatSession[],
    nextView: ViewState
  ) => {
    if (!activeProjectId) return;
    saveProject({
      id: activeProjectId,
      name: activeProjectName,
      items: nextItems,
      sessions: nextSessions,
      view: nextView,
      updatedAt: Date.now(),
      creatorId: activeProjectCreatorId,
      creatorName: activeProjectCreatorName,
    });
  };

  const openProject = (project: Project) => {
    const normalizedSessions =
      project.sessions && project.sessions.length > 0 ? project.sessions : [createEmptySession()];
    const normalizedView = normalizeView(project.view);
    setItems(project.items || []);
    setSessions(normalizedSessions);
    setCurrentSessionId(normalizedSessions[0].id);
    setView(normalizedView);
    setActiveProjectId(project.id);
    setActiveProjectName(project.name);
    setActiveProjectCreatorId(project.creatorId);
    setActiveProjectCreatorName(project.creatorName);
    setChatInputImages([]);
    setCurrentRoute('canvas');
  };

  const updateSessionMessages = (
    sessionId: string,
    nextMessages: ChatMessage[],
    nextTitle?: string
  ) => {
    setSessions((previous) => {
      const next = previous.map((session) =>
        session.id === sessionId
          ? {
              ...session,
              messages: nextMessages,
              title: nextTitle || session.title,
            }
          : session
      );
      persistActiveProject(items, next, view);
      return next;
    });
  };

  const insertGeneratedImageToCanvas = (prompt: string, imageUrl: string) => {
    setItems((previous) => {
      const size = 512;
      const position = createAvoidOverlapPosition(previous, view, size, size);
      const next = [
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
      persistActiveProject(next, sessions, view);
      return next;
    });
  };

  const handleSendMessage = async (text: string, attachedImages: string[] = []) => {
    if (!currentSession) return;
    const userMessage: ChatMessage = {
      id: uuidv4(),
      role: 'user',
      content: text,
      attachedImages: attachedImages.length ? attachedImages : undefined,
    };
    const loadingMessageId = uuidv4();
    const loadingAssistant: ChatMessage = {
      id: loadingMessageId,
      role: 'assistant',
      content: '处理中...',
    };

    const nextMessages = [...messages, userMessage, loadingAssistant];
    updateSessionMessages(
      currentSession.id,
      nextMessages,
      messages.length === 0 ? text.slice(0, 20) || '新对话' : undefined
    );
    setIsChatLoading(true);

    try {
      const history = messages.map((message) => ({
        role: message.role,
        content: message.content,
      }));

      const response = await chatWithAI(history, text, attachedImages);
      let updatedMessages = nextMessages;

      if (response.text.trim()) {
        updatedMessages = updatedMessages.map((message) =>
          message.id === loadingMessageId
            ? {
                ...message,
                content: response.text.trim(),
              }
            : message
        );
      } else {
        updatedMessages = updatedMessages.filter((message) => message.id !== loadingMessageId);
      }

      updateSessionMessages(currentSession.id, updatedMessages);

      const calls = response.functionCalls || [];
      for (const call of calls) {
        if (call.name !== 'generateImage') continue;
        const prompt = call.args.prompt;
        const refs = call.args.referenceImages || attachedImages;
        const imageUrl = await generateImageAI(prompt, undefined, refs);
        insertGeneratedImageToCanvas(prompt, imageUrl);

        updatedMessages = [
          ...updatedMessages,
          {
            id: uuidv4(),
            role: 'assistant',
            content: `已生成图片：${prompt}`,
            imageUrl,
          },
        ];
        updateSessionMessages(currentSession.id, updatedMessages);
      }

      if (!response.text.trim() && calls.length === 0) {
        updatedMessages = [
          ...updatedMessages,
          {
            id: uuidv4(),
            role: 'assistant',
            content: '我收到了你的需求，可以再补充一点细节，我会给你更精准的结果。',
          },
        ];
        updateSessionMessages(currentSession.id, updatedMessages);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      updateSessionMessages(currentSession.id, [
        ...nextMessages.filter((messageItem) => messageItem.id !== loadingMessageId),
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

  const handleCanvasItemsChange = (updater: React.SetStateAction<CanvasItem[]>) => {
    setItems((previous) => {
      const next = typeof updater === 'function' ? (updater as (prev: CanvasItem[]) => CanvasItem[])(previous) : updater;
      persistActiveProject(next, sessions, view);
      return next;
    });
  };

  const handleCanvasViewChange = (updater: React.SetStateAction<ViewState>) => {
    setView((previous) => {
      const next = typeof updater === 'function' ? (updater as (prev: ViewState) => ViewState)(previous) : updater;
      persistActiveProject(items, sessions, next);
      return next;
    });
  };

  const handleNewChat = () => {
    const session = createEmptySession();
    setSessions((previous) => {
      const next = [session, ...previous];
      persistActiveProject(items, next, view);
      return next;
    });
    setCurrentSessionId(session.id);
  };

  if (currentRoute === 'openpencil_lab') {
    return <OpenPencilLabWorkspace onBack={() => setCurrentRoute('design')} />;
  }

  if (currentRoute === 'ai_visual') {
    return <AiVisionWorkspace onBack={() => setCurrentRoute('design')} />;
  }

  if (currentRoute !== 'canvas') {
    return (
      <Dashboard
        currentRoute={currentRoute}
        onNavigate={setCurrentRoute}
        onOpenProject={openProject}
      />
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0f1117] text-slate-100">
      <div className="absolute top-4 left-4 z-50">
        <button
          type="button"
          onClick={() => setCurrentRoute('design')}
          className="flex items-center gap-2 rounded-lg border border-white/20 bg-black/35 px-3 py-2 text-sm hover:bg-black/50"
        >
          <ChevronLeft className="h-4 w-4" />
          返回 AI 设计
        </button>
      </div>

      <CanvasContainer
        items={items}
        setItems={handleCanvasItemsChange}
        view={view}
        setView={handleCanvasViewChange}
        onAddToChat={(item) => {
          setChatInputImages((previous) => {
            if (previous.length >= 4) return previous;
            return [
              ...previous,
              {
                id: uuidv4(),
                data: item.content,
                source: 'canvas',
                name: '画布引用图',
              },
            ];
          });
        }}
      />

      <ChatPanel
        messages={messages}
        onSendMessage={handleSendMessage}
        isLoading={isChatLoading}
        isModelConfigured={isDoubaoConfigured()}
        sessions={sessions}
        currentSessionId={currentSessionId}
        onSwitchSession={setCurrentSessionId}
        onNewChat={handleNewChat}
        chatInputImages={chatInputImages}
        setChatInputImages={setChatInputImages}
      />
    </div>
  );
}
