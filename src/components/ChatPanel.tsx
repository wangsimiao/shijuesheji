import React, { FormEvent, useMemo, useRef, useState } from 'react';
import { ImagePlus, Loader2, Plus, Send, Trash2 } from 'lucide-react';
import { ChatInputImage, ChatMessage, ChatSession } from '../types';

interface ChatPanelProps {
  messages: ChatMessage[];
  onSendMessage: (text: string, attachedImages?: string[]) => void;
  isLoading: boolean;
  isModelConfigured: boolean;
  sessions: ChatSession[];
  currentSessionId: string;
  onSwitchSession: (sessionId: string) => void;
  onNewChat: () => void;
  chatInputImages: ChatInputImage[];
  setChatInputImages: React.Dispatch<React.SetStateAction<ChatInputImage[]>>;
}

export default function ChatPanel({
  messages,
  onSendMessage,
  isLoading,
  isModelConfigured,
  sessions,
  currentSessionId,
  onSwitchSession,
  onNewChat,
  chatInputImages,
  setChatInputImages,
}: ChatPanelProps) {
  const [input, setInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const currentSession = useMemo(
    () => sessions.find((session) => session.id === currentSessionId) || sessions[0],
    [sessions, currentSessionId]
  );

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const value = input.trim();
    if (!value || isLoading) return;
    onSendMessage(
      value,
      chatInputImages.map((item) => item.data)
    );
    setInput('');
  };

  const handleUploadImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (chatInputImages.length >= 4) {
      alert('最多添加 4 张参考图。');
      return;
    }

    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('读取图片失败'));
      reader.readAsDataURL(file);
    });

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

  return (
    <aside className="flex h-full w-[380px] shrink-0 flex-col border-l border-white/10 bg-[#0b1220]">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-white">AI 对话</h2>
          <p className="mt-1 text-xs text-slate-400">{currentSession?.title || '新对话'}</p>
        </div>
        <button
          type="button"
          onClick={onNewChat}
          className="rounded-md border border-white/20 px-2 py-1 text-xs text-slate-200 hover:bg-white/10"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="border-b border-white/10 px-3 py-2">
        <div className="flex gap-2 overflow-x-auto">
          {sessions.map((session) => (
            <button
              key={session.id}
              type="button"
              onClick={() => onSwitchSession(session.id)}
              className={`shrink-0 rounded-md px-2 py-1 text-xs transition ${
                session.id === currentSessionId
                  ? 'bg-sky-500/30 text-sky-200'
                  : 'bg-white/5 text-slate-300 hover:bg-white/10'
              }`}
            >
              {session.title || '新对话'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="space-y-3">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`rounded-xl px-3 py-2 text-sm leading-6 ${
                message.role === 'user'
                  ? 'ml-8 bg-sky-500/20 text-sky-100'
                  : 'mr-8 bg-white/8 text-slate-100'
              }`}
            >
              <p className="whitespace-pre-wrap break-words">{message.content}</p>
              {message.imageUrl ? (
                <img
                  src={message.imageUrl}
                  alt="生成结果"
                  className="mt-2 w-full rounded-lg border border-white/10 object-cover"
                />
              ) : null}
            </div>
          ))}
          {isLoading ? (
            <div className="mr-8 flex items-center gap-2 rounded-xl bg-white/8 px-3 py-2 text-sm text-slate-200">
              <Loader2 className="h-4 w-4 animate-spin" />
              AI 正在处理中...
            </div>
          ) : null}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="border-t border-white/10 p-3">
        {!isModelConfigured ? (
          <div className="mb-2 rounded-md border border-amber-300/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
            未配置豆包 API Key，发送会失败。
          </div>
        ) : null}

        {chatInputImages.length > 0 ? (
          <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
            {chatInputImages.map((item) => (
              <div key={item.id} className="relative h-14 w-20 shrink-0 overflow-hidden rounded-md border border-white/20">
                <img src={item.data} alt={item.name || '参考图'} className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() =>
                    setChatInputImages((previous) =>
                      previous.filter((image) => image.id !== item.id)
                    )
                  }
                  className="absolute top-0.5 right-0.5 rounded bg-black/60 p-1 text-white hover:bg-black/80"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="shrink-0 rounded-md border border-white/20 p-2 text-slate-200 hover:bg-white/10"
            title="上传参考图"
          >
            <ImagePlus className="h-4 w-4" />
          </button>

          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="输入你的需求..."
            rows={3}
            className="min-h-[74px] flex-1 resize-none rounded-md border border-white/15 bg-black/20 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-sky-400"
          />

          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="shrink-0 rounded-md bg-sky-500 p-2 text-white disabled:cursor-not-allowed disabled:opacity-40"
            title="发送"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleUploadImage}
        />
      </form>
    </aside>
  );
}
