import React, { RefObject } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  History,
  ImagePlus,
  Loader2,
  Plus,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import type { BrandTemplate, ChatInputImage, ChatSession } from '../../types';
import {
  CHAT_IMAGE_LIMIT,
  IMAGE_MODEL_OPTIONS,
  SCENE_TAB_OPTIONS,
  SceneTab,
  WORKSPACE_HEADER_HEIGHT,
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
  headerHeight?: number;
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
    <div className="rounded-[22px] border border-white/[0.05] bg-[#1b1e25]/98 p-2.5 shadow-[0_28px_70px_rgba(0,0,0,0.42)] backdrop-blur-xl">
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
      <div className={`ai-vision-chat-menu-scroll max-h-72 space-y-1 overflow-y-auto pr-1 ${HIDDEN_SCROLLBAR}`}>
        {sessions.map((session) => (
          <button
            key={session.id}
            type="button"
            onClick={() => onSwitchSession(session.id)}
            className={`w-full rounded-[18px] px-3 py-2.5 text-left transition ${
              session.id === currentSessionId
                ? 'bg-white/[0.08] text-white'
                : 'text-slate-300 hover:bg-white/[0.05] hover:text-white'
            }`}
          >
            <div className="truncate text-[13px] font-medium">{session.title || '新对话'}</div>
            <div className="mt-1 text-[10px] text-slate-500">
              {new Date(session.createdAt).toLocaleString('zh-CN')}
            </div>
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={onCreateSession}
        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-[18px] bg-white/[0.06] px-3 py-2 text-[13px] text-white transition hover:bg-white/[0.1]"
      >
        <Plus className="h-4 w-4" />
        新建对话
      </button>
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
        <div className={`ai-vision-chat-menu-scroll max-h-64 space-y-2 overflow-y-auto pr-1 ${HIDDEN_SCROLLBAR}`}>
          {brandTemplates.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => {
                void onSelectBrandTemplate(template);
              }}
              className="flex w-full items-center gap-2.5 rounded-[18px] bg-white/[0.03] p-2 text-left transition hover:bg-white/[0.07]"
            >
              <img
                src={template.image}
                alt={template.name}
                className="h-11 w-11 rounded-[12px] object-cover"
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium text-white">{template.name}</div>
                <div className="mt-1 text-[11px] text-slate-400">点击附加到输入区</div>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="rounded-[18px] bg-white/[0.03] px-3 py-3.5 text-center text-[11px] leading-5 text-slate-400">
          暂无品牌模板，先上传一个吧。
        </div>
      )}

      <button
        type="button"
        onClick={() => brandTemplateInputRef.current?.click()}
        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-[18px] bg-white/[0.06] px-3 py-2 text-[13px] text-white transition hover:bg-white/[0.1]"
      >
        <ImagePlus className="h-4 w-4" />
        上传新模板
      </button>
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
  headerHeight = WORKSPACE_HEADER_HEIGHT,
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
  const title = projectTitle.trim() || '未命名项目';

  return (
    <aside
      className={`ai-vision-chat-sidebar relative h-full shrink-0 bg-transparent transition-[width] duration-300 ease-out ${
        isCollapsed ? 'w-0 overflow-visible' : 'w-[420px] overflow-hidden'
      }`}
    >
      {isCollapsed ? (
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="absolute right-0 top-0 z-40 inline-flex w-[54px] items-center justify-center rounded-bl-[18px] bg-[#171a21]/98 text-slate-100 shadow-[0_20px_42px_rgba(0,0,0,0.36)] transition hover:bg-[#1d2129]"
          style={{ height: headerHeight }}
          aria-label="展开项目对话"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      ) : (
        <div className="flex h-full flex-col overflow-hidden rounded-l-[30px] border-l border-white/[0.05] bg-[#14171d] shadow-[-20px_0_64px_rgba(0,0,0,0.36)]">
          <div
            className="border-b border-white/[0.05] px-5"
            style={{ minHeight: headerHeight }}
          >
            <div className="flex h-full items-center justify-between gap-3">
              <div ref={historyMenuRef} className="relative flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  onClick={onToggleHistoryMenu}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[16px] bg-white/[0.05] text-slate-100 transition hover:bg-white/[0.08]"
                  aria-label="历史对话"
                >
                  <History className="h-4 w-4" />
                </button>

                <div className="min-w-0">
                  <div className="truncate text-[17px] font-semibold tracking-[0.01em] text-white">
                    {title}
                  </div>
                </div>

                {isHistoryMenuOpen ? (
                  <div className="absolute left-0 top-full z-40 mt-3 w-[260px]">
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
                  className="inline-flex h-10 items-center justify-center rounded-[16px] bg-white/[0.05] px-4 text-[13px] font-medium text-white transition hover:bg-white/[0.08]"
                  aria-label="新建对话"
                >
                  新建对话
                </button>
                <button
                  type="button"
                  onClick={onToggleCollapsed}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-[16px] bg-white/[0.05] text-white transition hover:bg-white/[0.08]"
                  aria-label="收起项目对话"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col px-4 pb-4 pt-4">
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] bg-[#191c23] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
              <div className={`ai-vision-chat-scroll min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-4 ${HIDDEN_SCROLLBAR}`}>
                {currentSession?.messages.length ? (
                  <div className="space-y-5">
                    {currentSession.messages.map((message) => {
                      const isUser = message.role === 'user';
                      const hasUserText = message.content.trim().length > 0;
                      const attachedImages = message.attachedImages || [];
                      return (
                        <div key={message.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                          {isUser ? (
                            <div className="flex max-w-[84%] flex-col items-end gap-2">
                              {hasUserText ? (
                                <div className="overflow-hidden rounded-[20px] rounded-br-[10px] bg-[#2a2f39] px-4 py-3 text-[13px] leading-6 text-slate-50">
                                  <p className="whitespace-pre-wrap break-words">{message.content}</p>
                                </div>
                              ) : null}

                              {attachedImages.length ? (
                                <div
                                  className={`grid gap-2 ${
                                    attachedImages.length === 1 ? 'w-[168px] grid-cols-1' : 'w-[236px] grid-cols-2'
                                  }`}
                                >
                                  {attachedImages.map((imageSrc, index) => (
                                    <img
                                      key={`${message.id}-attachment-${index}`}
                                      src={imageSrc}
                                      alt={`user attachment ${index + 1}`}
                                      className="block aspect-square w-full rounded-[14px] object-cover shadow-[0_12px_24px_rgba(0,0,0,0.2)]"
                                    />
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          ) : (
                            <div className="w-full text-[13px] leading-7 text-slate-100">
                              <p className="whitespace-pre-wrap break-words">{message.content}</p>
                              {message.imageUrl ? (
                                <img
                                  src={message.imageUrl}
                                  alt="assistant result"
                                  className="mt-3 block w-full max-w-[50%] rounded-[18px] object-cover shadow-[0_14px_30px_rgba(0,0,0,0.22)]"
                                />
                              ) : null}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center px-6 text-center">
                    <div className="max-w-[280px]">
                      <div className="text-[15px] font-medium text-white">从这里继续你的项目创作</div>
                      <div className="mt-2 text-[12px] leading-6 text-slate-400">
                        继续扩图、修改场景、加入参考图，或让 AI 帮你生成下一版视觉方向。
                      </div>
                    </div>
                  </div>
                )}

                {isChatLoading ? (
                  <div className="mt-3.5 flex justify-start">
                    <div className="inline-flex items-center gap-2 text-[13px] text-slate-400">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      正在思考与整理画布结果...
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="px-2.5 pb-2.5">
                <div className="flex flex-wrap gap-1 px-1 pb-0">
                  {SCENE_TAB_OPTIONS.map((tab) => (
                    <button
                      key={tab.value}
                      type="button"
                      onClick={() => onSelectScene(tab.value)}
                      className={`rounded-[16px] px-3 py-1.5 text-[11px] transition ${
                        currentScene === tab.value
                          ? 'bg-[#2e3b53] text-white'
                          : 'bg-[#1d2129] text-slate-300 hover:bg-[#232832]'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="mt-0 rounded-[24px] bg-[#1d2129] px-2.5 pb-2.5 pt-2">
                  <div className={`flex items-center gap-1.5 overflow-x-auto px-0.5 pb-1 ${HIDDEN_SCROLLBAR}`}>
                    {chatInputImages.map((item) => (
                      <div key={item.id} className="group relative h-11 w-11 shrink-0">
                        <img
                          src={item.data}
                          alt={item.name || '参考图'}
                          className="h-full w-full rounded-[12px] object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => onRemoveChatImage(item.id)}
                          className="absolute -right-1 -top-1 inline-flex h-4.5 w-4.5 items-center justify-center rounded-full bg-black/75 text-white opacity-0 transition group-hover:opacity-100 hover:bg-black/90"
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
                      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-white/[0.06] text-slate-200 transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-45"
                      title="上传参考图"
                    >
                      <Plus className="h-4.5 w-4.5" />
                    </button>
                  </div>

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
                    placeholder="描述你想继续推进的画面..."
                    className="mt-1 min-h-[112px] w-full resize-none bg-transparent px-1.5 py-1.5 text-[13px] leading-6 text-white outline-none placeholder:text-slate-500"
                  />

                  {!isModelConfigured ? (
                    <div className="mt-1.5 rounded-[14px] bg-amber-500/10 px-2.5 py-2 text-[10px] leading-4.5 text-amber-100">
                      未配置 `VITE_DOUBAO_API_KEY`，对话和出图会失败。
                    </div>
                  ) : null}

                  {storageWarning ? (
                    <div className="mt-1.5 rounded-[14px] bg-white/[0.04] px-2.5 py-2 text-[10px] leading-4.5 text-slate-300">
                      {storageWarning}
                    </div>
                  ) : null}

                  <div className="mt-2 flex items-center gap-1.5 px-0.5">
                    <select
                      value={selectedImageModel}
                      onChange={(event) => onSelectModel(event.target.value)}
                      className="h-9 w-[112px] rounded-[12px] border border-white/[0.04] bg-[#151920] px-3 text-[12px] text-white outline-none"
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
                        className="inline-flex h-9 items-center gap-1 rounded-[12px] border border-white/[0.04] bg-[#151920] px-3 text-[12px] text-slate-200 transition hover:bg-[#1a1f28]"
                      >
                        品牌模板
                        <ChevronDown
                          className={`h-3 w-3 transition ${isBrandMenuOpen ? 'rotate-180' : ''}`}
                        />
                      </button>

                      {isBrandMenuOpen ? (
                        <div className="absolute bottom-full left-0 z-40 mb-3 w-[260px]">
                          <BrandMenu
                            brandTemplates={brandTemplates}
                            brandTemplateInputRef={brandTemplateInputRef}
                            onSelectBrandTemplate={onSelectBrandTemplate}
                          />
                        </div>
                      ) : null}
                    </div>

                    <div className="ml-auto flex items-center gap-2">
                      <button
                        type="button"
                        disabled={!canSend}
                        onClick={() => {
                          void onSendMessage();
                        }}
                        className="inline-flex h-10 items-center gap-1.5 rounded-[14px] bg-[#33435f] px-4 text-[13px] font-medium text-white transition hover:bg-[#3b4d6d] disabled:cursor-not-allowed disabled:opacity-45"
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
