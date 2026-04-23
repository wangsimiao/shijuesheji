import React, { RefObject } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
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

const HIDDEN_SCROLLBAR =
  '[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden';

interface ChatSidebarProps {
  projectTitle: string;
  currentSession: ChatSession | null;
  sessions: ChatSession[];
  currentSessionId: string;
  currentScene: SceneTab;
  chatInput: string;
  chatInputImages: ChatInputImage[];
  brandTemplates: BrandTemplate[];
  selectedImageModel: string;
  isChatLoading: boolean;
  isCollapsed: boolean;
  isHistoryMenuOpen: boolean;
  isBrandMenuOpen: boolean;
  storageWarning: string | null;
  isModelConfigured: boolean;
  historyMenuRef: RefObject<HTMLDivElement | null>;
  brandMenuRef: RefObject<HTMLDivElement | null>;
  chatUploadInputRef: RefObject<HTMLInputElement | null>;
  brandTemplateInputRef: RefObject<HTMLInputElement | null>;
  onToggleCollapsed: () => void;
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

function MenuPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[22px] border border-white/[0.08] bg-[#26222b]/98 p-2.5 shadow-[0_28px_70px_rgba(0,0,0,0.42)] backdrop-blur-xl">
      {children}
    </div>
  );
}

function HistoryMenu({
  sessions,
  currentSessionId,
  onSwitchSession,
  onCreateSession,
}: Pick<ChatSidebarProps, 'sessions' | 'currentSessionId' | 'onSwitchSession' | 'onCreateSession'>) {
  return (
    <MenuPanel>
      <div className={`max-h-72 space-y-1 overflow-y-auto pr-1 ${HIDDEN_SCROLLBAR}`}>
        {sessions.map((session) => (
          <button
            key={session.id}
            type="button"
            onClick={() => onSwitchSession(session.id)}
            className={`w-full rounded-[18px] border px-3 py-2 text-left transition ${
              session.id === currentSessionId
                ? 'border-white/[0.12] bg-white/[0.09] text-white'
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
          className="inline-flex w-full items-center justify-center gap-2 rounded-[18px] border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[13px] text-white transition hover:bg-white/[0.08]"
        >
          <Plus className="h-4 w-4" />
          新建对话
        </button>
      </div>
    </MenuPanel>
  );
}

function BrandMenu({
  brandTemplates,
  brandTemplateInputRef,
  onSelectBrandTemplate,
}: Pick<ChatSidebarProps, 'brandTemplates' | 'brandTemplateInputRef' | 'onSelectBrandTemplate'>) {
  return (
    <MenuPanel>
      {brandTemplates.length > 0 ? (
        <div className={`max-h-64 space-y-2 overflow-y-auto pr-1 ${HIDDEN_SCROLLBAR}`}>
          {brandTemplates.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => {
                void onSelectBrandTemplate(template);
              }}
              className="flex w-full items-center gap-2.5 rounded-[18px] border border-transparent bg-white/[0.03] p-2 text-left transition hover:bg-white/[0.07]"
            >
              <img
                src={template.image}
                alt={template.name}
                className="h-11 w-11 rounded-[12px] border border-white/[0.08] object-cover"
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium text-white">{template.name}</div>
                <div className="mt-1 text-[11px] text-slate-400">点击附加到输入区</div>
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
          className="inline-flex w-full items-center justify-center gap-2 rounded-[18px] border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[13px] text-white transition hover:bg-white/[0.08]"
        >
          <ImagePlus className="h-4 w-4" />
          上传新模板
        </button>
      </div>
    </MenuPanel>
  );
}

export default function ChatSidebar({
  projectTitle,
  currentSession,
  sessions,
  currentSessionId,
  currentScene,
  chatInput,
  chatInputImages,
  brandTemplates,
  selectedImageModel,
  isChatLoading,
  isCollapsed,
  isHistoryMenuOpen,
  isBrandMenuOpen,
  storageWarning,
  isModelConfigured,
  historyMenuRef,
  brandMenuRef,
  chatUploadInputRef,
  brandTemplateInputRef,
  onToggleCollapsed,
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
    <aside
      className={`relative h-full shrink-0 bg-transparent transition-[width] duration-300 ease-out ${
        isCollapsed ? 'w-0 overflow-visible' : 'w-[420px] overflow-hidden'
      }`}
    >
      {isCollapsed ? (
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="absolute right-0 top-0 z-40 inline-flex h-[52px] w-[52px] items-center justify-center rounded-bl-[18px] border-b border-l border-white/[0.08] bg-[#2b2730]/96 text-white shadow-[0_18px_42px_rgba(0,0,0,0.32)] backdrop-blur-xl transition hover:bg-[#34303a]"
          aria-label="展开项目对话"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      ) : (
        <div className="flex h-full flex-col overflow-hidden rounded-l-[30px] border-b border-l border-t border-white/[0.08] bg-[#2d2932]/98 shadow-[-18px_0_64px_rgba(0,0,0,0.3)] backdrop-blur-xl">
          <div className="border-b border-white/[0.06] px-5 pb-4 pt-4">
            <div className="flex items-center justify-between gap-3">
              <div ref={historyMenuRef} className="relative flex min-w-0 items-center gap-2.5">
                <div className="min-w-0">
                  <div className="truncate text-[16px] font-semibold tracking-[0.01em] text-white">
                    {projectTitle}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onToggleHistoryMenu}
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 text-[11px] text-slate-100 transition hover:bg-white/[0.08]"
                >
                  <History className="h-3.5 w-3.5" />
                  历史对话
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition ${isHistoryMenuOpen ? 'rotate-180' : ''}`}
                  />
                </button>

                {isHistoryMenuOpen ? (
                  <div className="absolute left-0 top-full z-40 mt-2 w-[260px]">
                    <HistoryMenu
                      sessions={sessions}
                      currentSessionId={currentSessionId}
                      onSwitchSession={onSwitchSession}
                      onCreateSession={onCreateSession}
                    />
                  </div>
                ) : null}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onCreateSession}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-white transition hover:bg-white/[0.08]"
                  aria-label="新建对话"
                >
                  <Plus className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={onToggleCollapsed}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-white transition hover:bg-white/[0.08]"
                  aria-label="收起项目对话"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col px-4 pb-4 pt-3">
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-l-[24px] border border-white/[0.06] bg-[#27232c]/92">
              <div className={`min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-4 ${HIDDEN_SCROLLBAR}`}>
                {currentSession?.messages.length ? (
                  <div className="space-y-3.5">
                    {currentSession.messages.map((message) => {
                      const isUser = message.role === 'user';
                      return (
                        <div key={message.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                          <div
                            className={`max-w-[86%] overflow-hidden ${
                              isUser
                                ? 'rounded-[18px] rounded-br-[8px] border border-white/[0.06] bg-[#3c3843] px-4 py-3 text-[13px] leading-6 text-white shadow-[0_10px_24px_rgba(0,0,0,0.18)]'
                                : 'w-full rounded-[24px] border border-white/[0.06] bg-[#343039] px-4 py-4 text-[13px] leading-7 text-slate-100 shadow-[0_16px_36px_rgba(0,0,0,0.18)]'
                            }`}
                          >
                            <p className="whitespace-pre-wrap break-words">{message.content}</p>
                            {message.imageUrl ? (
                              <img
                                src={message.imageUrl}
                                alt="assistant result"
                                className="mt-3.5 w-full rounded-[18px] border border-white/[0.08] object-cover"
                              />
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center px-6 text-center">
                    <div className="max-w-[260px] rounded-[22px] border border-dashed border-white/[0.08] bg-white/[0.03] px-5 py-6">
                      <div className="text-[15px] font-medium text-white">从这里开始协作</div>
                      <div className="mt-2 text-[12px] leading-6 text-slate-400">
                        继续扩图、修改场景、加入参考图，或让 AI 帮你生成下一版视觉方向。
                      </div>
                    </div>
                  </div>
                )}

                {isChatLoading ? (
                  <div className="mt-3.5 flex justify-start">
                    <div className="inline-flex items-center gap-2 rounded-[18px] border border-white/[0.06] bg-[#35313b] px-4 py-3 text-[13px] text-slate-100">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      正在思考与编排画布结果...
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="border-t border-white/[0.06] px-3 pb-3 pt-3">
                <div className="flex flex-wrap gap-1.5 px-1">
                  {SCENE_TAB_OPTIONS.map((tab) => (
                    <button
                      key={tab.value}
                      type="button"
                      onClick={() => onSelectScene(tab.value)}
                      className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                        currentScene === tab.value
                          ? 'border-white/[0.16] bg-white/[0.12] text-white'
                          : 'border-white/[0.08] bg-white/[0.03] text-slate-300 hover:bg-white/[0.06]'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="-mt-px rounded-[24px] border border-white/[0.08] bg-[#221f27]/98 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                  <div className={`flex items-center gap-2 overflow-x-auto pb-1 pr-1 ${HIDDEN_SCROLLBAR}`}>
                    {chatInputImages.map((item) => (
                      <div key={item.id} className="group relative h-12 w-12 shrink-0">
                        <img
                          src={item.data}
                          alt={item.name || '参考图'}
                          className="h-full w-full rounded-full border border-white/[0.08] object-cover shadow-[0_10px_24px_rgba(0,0,0,0.24)]"
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
                      className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.05] text-slate-200 transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-45"
                      title="上传参考图"
                    >
                      <Plus className="h-5 w-5" />
                    </button>
                  </div>

                  {!isModelConfigured ? (
                    <div className="mt-2 rounded-[16px] border border-amber-300/18 bg-amber-500/10 px-3 py-2 text-[10px] leading-4.5 text-amber-100">
                      未配置 `VITE_DOUBAO_API_KEY`，对话和出图会失败。
                    </div>
                  ) : null}

                  {storageWarning ? (
                    <div className="mt-2 rounded-[16px] border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[10px] leading-4.5 text-slate-300">
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
                      placeholder="描述你所想象的场景..."
                      className="min-h-[118px] w-full resize-none rounded-[18px] border border-white/[0.08] bg-[#2a2630] px-3.5 py-3 text-[13px] leading-6 text-white outline-none placeholder:text-slate-500"
                    />
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <select
                      value={selectedImageModel}
                      onChange={(event) => onSelectModel(event.target.value)}
                      className="h-9 w-[98px] rounded-[12px] border border-white/[0.08] bg-[#17141d] px-3 text-[12px] text-white outline-none transition focus:border-white/[0.18]"
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
                        className="inline-flex h-9 items-center gap-1 rounded-[12px] border border-white/[0.08] bg-[#17141d] px-3 text-[12px] text-slate-200 transition hover:bg-white/[0.06]"
                      >
                        品牌模板
                        <ChevronDown
                          className={`h-3 w-3 transition ${isBrandMenuOpen ? 'rotate-180' : ''}`}
                        />
                      </button>

                      {isBrandMenuOpen ? (
                        <div className="absolute bottom-full left-0 z-40 mb-2 w-[260px]">
                          <BrandMenu
                            brandTemplates={brandTemplates}
                            brandTemplateInputRef={brandTemplateInputRef}
                            onSelectBrandTemplate={onSelectBrandTemplate}
                          />
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
                        className="inline-flex h-10 items-center gap-1.5 rounded-full bg-[#5f5a66] px-4 text-[13px] font-medium text-white transition hover:bg-[#716b79] disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        {isChatLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                        发送
                      </button>
                    </div>
                  </div>
                </div>
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
      )}
    </aside>
  );
}
