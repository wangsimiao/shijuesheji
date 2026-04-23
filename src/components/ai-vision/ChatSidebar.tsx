import React, { RefObject } from 'react';
import {
  ChevronDown,
  History,
  ImagePlus,
  Loader2,
  Plus,
  Send,
  Trash2,
} from 'lucide-react';
import type { BrandTemplate, ChatInputImage, ChatSession } from '../../types';
import {
  CHAT_IMAGE_LIMIT,
  IMAGE_MODEL_OPTIONS,
  SCENE_TAB_OPTIONS,
  SceneTab,
} from './workspace-model';

interface ChatSidebarProps {
  currentSession: ChatSession | null;
  sessions: ChatSession[];
  currentSessionId: string;
  currentScene: SceneTab;
  chatInput: string;
  chatInputImages: ChatInputImage[];
  brandTemplates: BrandTemplate[];
  selectedImageModel: string;
  isChatLoading: boolean;
  isHistoryMenuOpen: boolean;
  isBrandMenuOpen: boolean;
  storageWarning: string | null;
  isModelConfigured: boolean;
  historyMenuRef: RefObject<HTMLDivElement>;
  brandMenuRef: RefObject<HTMLDivElement>;
  chatUploadInputRef: RefObject<HTMLInputElement>;
  brandTemplateInputRef: RefObject<HTMLInputElement>;
  onToggleHistoryMenu: () => void;
  onToggleBrandMenu: () => void;
  onCreateSession: () => void;
  onSwitchSession: (sessionId: string) => void;
  onSelectScene: (scene: SceneTab) => void;
  onSetChatInput: (value: string) => void;
  onRemoveChatImage: (imageId: string) => void;
  onSelectModel: (modelId: string) => void;
  onSelectBrandTemplate: (template: BrandTemplate) => Promise<void>;
  onUploadBrandTemplate: (file: File) => Promise<void>;
  onUploadReferenceImage: (file: File) => Promise<void>;
  onSendMessage: () => Promise<void>;
}

export default function ChatSidebar({
  currentSession,
  sessions,
  currentSessionId,
  currentScene,
  chatInput,
  chatInputImages,
  brandTemplates,
  selectedImageModel,
  isChatLoading,
  isHistoryMenuOpen,
  isBrandMenuOpen,
  storageWarning,
  isModelConfigured,
  historyMenuRef,
  brandMenuRef,
  chatUploadInputRef,
  brandTemplateInputRef,
  onToggleHistoryMenu,
  onToggleBrandMenu,
  onCreateSession,
  onSwitchSession,
  onSelectScene,
  onSetChatInput,
  onRemoveChatImage,
  onSelectModel,
  onSelectBrandTemplate,
  onUploadBrandTemplate,
  onUploadReferenceImage,
  onSendMessage,
}: ChatSidebarProps) {
  const canSend = !isChatLoading && (chatInput.trim().length > 0 || chatInputImages.length > 0);

  return (
    <aside className="flex h-full w-[380px] shrink-0 flex-col border-l border-white/[0.06] bg-[#0e1119]">
      <div className="border-b border-white/[0.06] px-4 py-3.5">
        <div className="flex items-center justify-between">
          <div ref={historyMenuRef} className="relative flex items-center gap-2.5">
            <h2 className="text-[13px] font-semibold text-white">AI 对话</h2>
            <button
              type="button"
              onClick={onToggleHistoryMenu}
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
                      onClick={() => onSwitchSession(session.id)}
                      className={`w-full rounded-[18px] border px-3 py-2 text-left transition ${
                        session.id === currentSessionId
                          ? 'border-[#8e81ff]/35 bg-[#2a2442] text-[#ece8ff]'
                          : 'border-transparent bg-white/[0.03] text-slate-200 hover:bg-white/[0.06]'
                      }`}
                    >
                      <div className="truncate text-[13px] font-medium">{session.title || '新对话'}</div>
                      <div className="mt-1 text-[10px] text-slate-500">
                        {new Date(session.createdAt).toLocaleString('zh-CN')}
                      </div>
                    </button>
                  ))}
                </div>

                <div className="mt-3 border-t border-white/[0.06] pt-3">
                  <button
                    type="button"
                    onClick={onCreateSession}
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
            onClick={onCreateSession}
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
              正在思考与编排画布结果...
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
              onClick={() => onSelectScene(tab.value)}
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
                  onClick={() => onRemoveChatImage(item.id)}
                  className="absolute -right-1 -top-1 inline-flex h-4.5 w-4.5 items-center justify-center rounded-full border border-white/[0.12] bg-black/75 text-white opacity-0 transition group-hover:opacity-100 hover:bg-black/90"
                  aria-label={`移除${item.name || '参考图'}`}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}

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

          {!isModelConfigured ? (
            <div className="mt-2.5 rounded-[18px] border border-amber-300/20 bg-amber-500/10 px-3 py-2 text-[10px] leading-4.5 text-amber-100">
              未配置 `VITE_DOUBAO_API_KEY`，对话和出图会失败。
            </div>
          ) : null}

          {storageWarning ? (
            <div className="mt-2.5 rounded-[18px] border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[10px] leading-4.5 text-slate-300">
              {storageWarning}
            </div>
          ) : null}

          <div className="mt-3">
            <textarea
              value={chatInput}
              onChange={(event) => onSetChatInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void onSendMessage();
                }
              }}
              rows={4}
              placeholder="告诉 AI 你想继续扩图、改风格、补场景还是生成一组新画面"
              className="min-h-[104px] w-full resize-none rounded-[18px] border border-white/[0.08] bg-[#0f131d] px-3 py-2.5 text-[13px] leading-5.5 text-white outline-none placeholder:text-slate-500"
            />
          </div>

          <div className="mt-2.5 flex items-center gap-2">
            <select
              value={selectedImageModel}
              onChange={(event) => onSelectModel(event.target.value)}
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
                onClick={onToggleBrandMenu}
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
                            void onSelectBrandTemplate(template);
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
                disabled={!canSend}
                onClick={() => {
                  void onSendMessage();
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
            await onUploadReferenceImage(file);
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
            await onUploadBrandTemplate(file);
          }}
        />
      </div>
    </aside>
  );
}
