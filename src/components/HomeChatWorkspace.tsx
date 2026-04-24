import React, { FormEvent, useMemo, useState } from 'react';
import { History, Plus, Send } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { chatWithAI } from '../services/ai';
import { AppRoute } from '../types';

type HomeScene = 'consult' | 'product' | 'operations' | 'design';

type HomeMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

type HomeSession = {
  id: string;
  title: string;
  messages: HomeMessage[];
  createdAt: number;
};

interface HomeChatWorkspaceProps {
  onNavigate?: (route: AppRoute) => void;
}

const SCENE_OPTIONS: Array<{ value: HomeScene; label: string }> = [
  { value: 'consult', label: '咨询场景' },
  { value: 'product', label: '产品场景' },
  { value: 'operations', label: '运营场景' },
  { value: 'design', label: '设计场景' },
];

const KNOWLEDGE_OPTIONS = ['通用知识库', '黑胡桃家具知识库', '电商运营知识库'];

const CHAT_MODEL_OPTIONS = [
  { value: '', label: '默认模型' },
  { value: 'doubao-seed-1-8-251228', label: '豆包 1.8' },
];

function createSession(): HomeSession {
  return {
    id: uuidv4(),
    title: '新对话',
    messages: [],
    createdAt: Date.now(),
  };
}

export default function HomeChatWorkspace({ onNavigate }: HomeChatWorkspaceProps) {
  const [sessions, setSessions] = useState<HomeSession[]>([createSession()]);
  const [currentSessionId, setCurrentSessionId] = useState<string>(() => sessions[0].id);
  const [scene, setScene] = useState<HomeScene>('consult');
  const [knowledgeBase, setKnowledgeBase] = useState(KNOWLEDGE_OPTIONS[0]);
  const [model, setModel] = useState('');
  const [customModel, setCustomModel] = useState('');
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const currentSession = useMemo(
    () => sessions.find((session) => session.id === currentSessionId) || sessions[0],
    [sessions, currentSessionId]
  );

  const messages = currentSession?.messages || [];

  const updateCurrentSession = (nextMessages: HomeMessage[], nextTitle?: string) => {
    setSessions((previous) =>
      previous.map((session) =>
        session.id === currentSessionId
          ? {
              ...session,
              messages: nextMessages,
              title: nextTitle || session.title,
            }
          : session
      )
    );
  };

  const buildAssistantReplyForScene = async (text: string) => {
    if (scene === 'consult') {
      const response = await chatWithAI(
        messages.map((message) => ({ role: message.role, content: message.content })),
        `【知识库:${knowledgeBase}】${text}`,
        [],
        {
          model: model === 'custom' ? customModel.trim() : model || undefined,
        }
      );
      return response.text || '我已经收到你的咨询，请再补充一点上下文。';
    }

    if (scene === 'product') {
      return '已进入产品场景：可以继续输入需求，我会给出智能开品建议。';
    }
    if (scene === 'operations') {
      return '已进入运营场景：可以继续选择产品定位、主图策划、详情策划、买家秀策划或标题策划。';
    }
    onNavigate?.('design');
    return '正在进入 AI设计 项目页。';
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const text = input.trim();
    if (!text || loading) return;
    setInput('');

    const userMessage: HomeMessage = {
      id: uuidv4(),
      role: 'user',
      content: text,
    };
    const loadingMessage: HomeMessage = {
      id: uuidv4(),
      role: 'assistant',
      content: '处理中...',
    };

    const next = [...messages, userMessage, loadingMessage];
    updateCurrentSession(next, messages.length === 0 ? text.slice(0, 20) : undefined);
    setLoading(true);

    try {
      const assistantText = await buildAssistantReplyForScene(text);
      const updated = next.map((message) =>
        message.id === loadingMessage.id ? { ...message, content: assistantText } : message
      );
      updateCurrentSession(updated);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      updateCurrentSession([
        ...next.filter((item) => item.id !== loadingMessage.id),
        {
          id: uuidv4(),
          role: 'assistant',
          content: `请求失败：${message}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#0f172a] text-slate-100">
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div>
          <h2 className="text-base font-semibold">首页 AI 对话</h2>
          <p className="mt-1 text-xs text-slate-400">咨询 / 产品 / 运营 / 设计 场景统一入口</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowHistory((value) => !value)}
            className="rounded-md border border-white/15 p-2 hover:bg-white/10"
            title="历史记录"
          >
            <History className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              const session = createSession();
              setSessions((previous) => [session, ...previous]);
              setCurrentSessionId(session.id);
            }}
            className="rounded-md border border-white/15 p-2 hover:bg-white/10"
            title="新建对话"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        <section className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <div className="mx-auto flex w-full max-w-4xl flex-col gap-3">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`rounded-2xl px-4 py-3 text-sm leading-6 ${
                    message.role === 'user'
                      ? 'ml-20 bg-sky-500/20 text-sky-100'
                      : 'mr-20 bg-white/8 text-slate-100'
                  }`}
                >
                  {message.content}
                </div>
              ))}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="relative isolate overflow-hidden border-t border-white/10 px-4 py-4">
            <div className="relative z-10 mx-auto w-full max-w-4xl">
              <div className="mb-3 flex flex-wrap gap-2">
                {SCENE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setScene(option.value)}
                    className={`rounded-full px-3 py-1.5 text-sm ${
                      scene === option.value
                        ? 'bg-sky-500 text-white'
                        : 'bg-white/10 text-slate-200 hover:bg-white/15'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <div className="rounded-2xl border border-white/15 bg-black/80 p-3 shadow-[0_18px_52px_rgba(2,6,23,0.44)] backdrop-blur-xl">
                {scene === 'consult' ? (
                  <div className="mb-2 grid gap-2 sm:grid-cols-2">
                    <select
                      value={knowledgeBase}
                      onChange={(event) => setKnowledgeBase(event.target.value)}
                      className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none"
                    >
                      {KNOWLEDGE_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>

                    <div className="grid gap-2 sm:grid-cols-[minmax(0,160px)_1fr]">
                      <select
                        value={model}
                        onChange={(event) => setModel(event.target.value)}
                        className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none"
                      >
                        {CHAT_MODEL_OPTIONS.map((option) => (
                          <option key={option.value || 'default'} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                        <option value="custom">自定义模型</option>
                      </select>
                      {model === 'custom' ? (
                        <input
                          value={customModel}
                          onChange={(event) => setCustomModel(event.target.value)}
                          placeholder="输入自定义模型 ID"
                          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500"
                        />
                      ) : null}
                    </div>
                  </div>
                ) : null}

                <div className="flex gap-3">
                  <textarea
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    placeholder="输入你的问题或任务..."
                    rows={4}
                    className="min-h-[120px] flex-1 resize-none rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-white outline-none placeholder:text-slate-500"
                  />
                  <button
                    type="submit"
                    disabled={loading || !input.trim()}
                    className="inline-flex h-fit items-center gap-2 rounded-xl bg-sky-500 px-4 py-3 text-sm font-medium text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Send className="h-4 w-4" />
                    发送
                  </button>
                </div>
              </div>
            </div>
          </form>
        </section>

        {showHistory ? (
          <aside className="w-[280px] shrink-0 border-l border-white/10 bg-[#111827] p-4">
            <h3 className="text-sm font-semibold text-white">历史对话</h3>
            <div className="mt-3 space-y-2">
              {sessions.map((session) => (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => setCurrentSessionId(session.id)}
                  className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition ${
                    session.id === currentSessionId
                      ? 'border-sky-400/40 bg-sky-500/10 text-sky-100'
                      : 'border-white/10 bg-white/5 text-slate-200 hover:bg-white/10'
                  }`}
                >
                  <div className="truncate font-medium">{session.title || '新对话'}</div>
                  <div className="mt-1 text-xs text-slate-400">
                    {new Date(session.createdAt).toLocaleString('zh-CN')}
                  </div>
                </button>
              ))}
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
