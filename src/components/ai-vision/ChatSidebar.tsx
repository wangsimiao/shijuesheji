import React, { RefObject, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  History,
  ImagePlus,
  Loader2,
  Plus,
  Ruler,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import type { BrandSpec, BrandTemplate, ChatInputImage, ChatSession } from '../../types';
import {
  CHAT_IMAGE_LIMIT,
  DOUBAO_5_IMAGE_MODEL,
  IMAGE_MODEL_OPTIONS,
  OPENROUTER_GEMINI_FLASH_IMAGE_MODEL,
  OPENROUTER_GPT_IMAGE_MODEL,
  SceneTab,
  WORKSPACE_HEADER_HEIGHT,
} from './workspace-model';

const HIDDEN_SCROLLBAR =
  '[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden';

export const IMAGE_SIZE_OPTIONS = [
  { label: '1:1', value: '1920x1920', pixels: '1920x1920' },
  { label: '9:16', value: '1440x2560', pixels: '1440x2560' },
];

interface ChatSidebarProps {
  projectTitle: string;
  currentSession: ChatSession | null;
  sessions: ChatSession[];
  currentSessionId: string;
  currentScene: SceneTab;
  chatInput: string;
  chatInputImages: ChatInputImage[];
  brandTemplates: BrandTemplate[];
  brandSpecs: BrandSpec[];
  activeBrandSpecId: string | null;
  activeBrandTemplateId: string | null;
  selectedImageModel: string;
  isChatLoading: boolean;
  isCollapsed: boolean;
  isHistoryMenuOpen: boolean;
  isBrandSpecMenuOpen: boolean;
  isBrandMenuOpen: boolean;
  storageWarning: string | null;
  isModelConfigured: boolean;
  modelConfigurationMessage: string | null;
  headerHeight?: number;
  historyMenuRef: RefObject<HTMLDivElement | null>;
  brandSpecMenuRef: RefObject<HTMLDivElement | null>;
  brandMenuRef: RefObject<HTMLDivElement | null>;
  sizeConfigMenuRef: RefObject<HTMLDivElement | null>;
  chatUploadInputRef: RefObject<HTMLInputElement | null>;
  brandTemplateInputRef: RefObject<HTMLInputElement | null>;
  activeSizeId: string | null;
  isSizeConfigMenuOpen: boolean;
  onToggleCollapsed: () => void;
  onToggleHistoryMenu: () => void;
  onToggleBrandSpecMenu: () => void;
  onToggleBrandMenu: () => void;
  onToggleSizeConfigMenu: () => void;
  onCreateSession: () => void;
  onSwitchSession: (sessionId: string) => void;
  onSelectScene: (scene: SceneTab) => void;
  onSetChatInput: (value: string) => void;
  onRemoveChatImage: (imageId: string) => void;
  onSelectModel: (modelId: string) => void;
  onSelectBrandSpec: (brandSpecId: string | null) => void;
  onSaveBrandSpec: (brandSpecId: string, specText: string) => Promise<void>;
  onCreateBrandSpec: (brandName: string) => Promise<void>;
  onDeleteBrandSpec: (brandSpecId: string) => Promise<void>;
  onSelectBrandTemplate: (templateId: string | null) => void;
  onUploadBrandTemplate: (file: File) => Promise<void>;
  onUploadReferenceImage: (file: File) => Promise<void>;
  onSendMessage: () => Promise<void>;
  onAddAssistantImageToChat: (imageUrl: string) => void;
  onSelectSize: (sizeId: string | null) => void;
}

function MenuPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[22px] border border-white/[0.05] bg-[#1b1e25]/98 p-2.5 shadow-[0_28px_70px_rgba(0,0,0,0.42)] backdrop-blur-xl">
      {children}
    </div>
  );
}

function getDisplayModelLabel(value: string, fallbackLabel: string) {
  if (value === OPENROUTER_GPT_IMAGE_MODEL) return 'gpt2';
  if (value === OPENROUTER_GEMINI_FLASH_IMAGE_MODEL) return 'Gemini 3.1';
  if (value === DOUBAO_5_IMAGE_MODEL) return '豆包 5.0';
  return fallbackLabel;
}

function HistoryMenu({
  sessions,
  currentSessionId,
  onSwitchSession,
}: Pick<ChatSidebarProps, 'sessions' | 'currentSessionId' | 'onSwitchSession'>) {
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
    </MenuPanel>
  );
}

function BrandMenu({
  brandTemplates,
  activeBrandTemplateId,
  brandTemplateInputRef,
  onSelectBrandTemplate,
}: Pick<
  ChatSidebarProps,
  'brandTemplates' | 'activeBrandTemplateId' | 'brandTemplateInputRef' | 'onSelectBrandTemplate'
>) {
  return (
    <MenuPanel>
      <button
        type="button"
        onClick={() => onSelectBrandTemplate(null)}
        className={`mb-2 flex w-full items-center justify-between rounded-[14px] px-3 py-2 text-left text-[12px] transition ${
          !activeBrandTemplateId
            ? 'bg-cyan-500/12 text-cyan-100'
            : 'bg-white/[0.03] text-slate-300 hover:bg-white/[0.07] hover:text-white'
        }`}
      >
        <span>不使用品牌模板</span>
      </button>
      {brandTemplates.length > 0 ? (
        <div className={`ai-vision-chat-menu-scroll max-h-64 space-y-2 overflow-y-auto pr-1 ${HIDDEN_SCROLLBAR}`}>
          {brandTemplates.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => onSelectBrandTemplate(template.id)}
              className={`flex w-full items-center gap-2.5 rounded-[18px] p-2 text-left transition ${
                activeBrandTemplateId === template.id
                  ? 'bg-cyan-500/12'
                  : 'bg-white/[0.03] hover:bg-white/[0.07]'
              }`}
            >
              <img
                src={template.image}
                alt={template.name}
                className="h-11 w-11 rounded-[12px] object-cover"
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium text-white">{template.name}</div>
                <div className="mt-1 text-[11px] text-slate-400">选中后作为系统约束</div>
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

function BrandSpecMenu({
  brandSpecs,
  activeBrandSpecId,
  onSelectBrandSpec,
  onSaveBrandSpec,
  onCreateBrandSpec,
  onDeleteBrandSpec,
}: Pick<
  ChatSidebarProps,
  | 'brandSpecs'
  | 'activeBrandSpecId'
  | 'onSelectBrandSpec'
  | 'onSaveBrandSpec'
  | 'onCreateBrandSpec'
  | 'onDeleteBrandSpec'
>) {
  const [selectedBrandSpecId, setSelectedBrandSpecId] = useState<string>(activeBrandSpecId || '');
  const [specTextDraft, setSpecTextDraft] = useState('');
  const [newBrandName, setNewBrandName] = useState('');

  useEffect(() => {
    if (!brandSpecs.length) {
      setSelectedBrandSpecId('');
      return;
    }
    const nextId = activeBrandSpecId && brandSpecs.some((item) => item.id === activeBrandSpecId)
      ? activeBrandSpecId
      : '';
    setSelectedBrandSpecId(nextId);
  }, [activeBrandSpecId, brandSpecs]);

  const selectedBrandSpec = useMemo(
    () => brandSpecs.find((item) => item.id === selectedBrandSpecId) || null,
    [brandSpecs, selectedBrandSpecId]
  );

  useEffect(() => {
    setSpecTextDraft(selectedBrandSpec?.specText || '');
  }, [selectedBrandSpec]);

  return (
    <div className="max-h-[70vh] overflow-y-auto pr-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <MenuPanel>
      <div className="space-y-2">
        <select
          value={selectedBrandSpecId}
          onChange={(event) => {
            const nextId = event.target.value;
            setSelectedBrandSpecId(nextId);
            onSelectBrandSpec(nextId || null);
          }}
          className="h-9 w-full rounded-[12px] border border-white/[0.06] bg-[#151920] px-3 text-[12px] text-white outline-none"
        >
          <option value="">不使用品牌规范</option>
          {brandSpecs.map((spec) => (
            <option key={spec.id} value={spec.id}>
              {spec.brandName}
            </option>
          ))}
        </select>

        <textarea
          value={specTextDraft}
          onChange={(event) => setSpecTextDraft(event.target.value)}
          rows={8}
          placeholder="维护当前品牌规范..."
          className="w-full resize-none rounded-[12px] border border-white/[0.06] bg-[#151920] px-3 py-2 text-[12px] leading-5 text-white outline-none placeholder:text-slate-500"
        />

        <button
          type="button"
          disabled={!selectedBrandSpec}
          onClick={() => {
            if (!selectedBrandSpec) return;
            void onSaveBrandSpec(selectedBrandSpec.id, specTextDraft);
          }}
          className="inline-flex h-9 w-full items-center justify-center rounded-[12px] bg-white/[0.08] text-[12px] text-white transition hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-45"
        >
          保存规范
        </button>
      </div>

      <div className="mt-2.5 flex items-center gap-2">
        <input
          value={newBrandName}
          onChange={(event) => setNewBrandName(event.target.value)}
          placeholder="新增品牌名"
          className="h-9 flex-1 rounded-[12px] border border-white/[0.06] bg-[#151920] px-3 text-[12px] text-white outline-none placeholder:text-slate-500"
        />
        <button
          type="button"
          onClick={() => {
            const nextName = newBrandName.trim();
            if (!nextName) return;
            void onCreateBrandSpec(nextName);
            setNewBrandName('');
          }}
          className="inline-flex h-9 items-center justify-center rounded-[12px] bg-white/[0.08] px-3 text-[12px] text-white transition hover:bg-white/[0.12]"
        >
          新增
        </button>
      </div>
      {selectedBrandSpec ? (
        <button
          type="button"
          onClick={() => {
            void onDeleteBrandSpec(selectedBrandSpec.id);
          }}
          className="mt-2 inline-flex h-9 w-full items-center justify-center rounded-[12px] border border-rose-300/30 bg-rose-500/10 text-[12px] text-rose-100 transition hover:bg-rose-500/15"
        >
          删除当前品牌规范
        </button>
      ) : null}
      </MenuPanel>
    </div>
  );
}

function SizeConfigMenu({
  activeSizeId,
  onSelectSize,
}: {
  activeSizeId: string | null;
  onSelectSize: (sizeId: string | null) => void;
}) {
  const customSizeMatch = activeSizeId?.match(/^(\d{2,5})x(\d{2,5})$/i);
  const [customWidth, setCustomWidth] = useState(customSizeMatch?.[1] || '');
  const [customHeight, setCustomHeight] = useState(customSizeMatch?.[2] || '');
  const customSizeValue =
    customWidth.trim() && customHeight.trim() ? `${customWidth.trim()}x${customHeight.trim()}` : '';
  const canApplyCustomSize = /^\d{2,5}x\d{2,5}$/i.test(customSizeValue);

  return (
    <MenuPanel>
      <div className="mb-2 flex items-center gap-2 border-b border-white/[0.06] pb-2">
        <Ruler className="h-4 w-4 text-cyan-300" />
        <span className="text-[12px] font-medium text-white">生图尺寸</span>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {IMAGE_SIZE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onSelectSize(option.value)}
            className={`flex flex-col items-center rounded-[10px] px-2 py-1.5 text-[11px] transition ${
              activeSizeId === option.value
                ? 'bg-cyan-500/15 text-cyan-100'
                : 'bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] hover:text-white'
            }`}
          >
            <span className="font-medium">{option.label}</span>
            <span className="text-[9px] text-slate-500">{option.pixels}</span>
          </button>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-1.5">
        <input
          value={customWidth}
          onChange={(event) => setCustomWidth(event.target.value.replace(/[^\d]/g, '').slice(0, 5))}
          inputMode="numeric"
          placeholder="宽"
          className="h-9 min-w-0 rounded-[10px] border border-white/[0.06] bg-[#151920] px-2 text-center text-[12px] text-white outline-none placeholder:text-slate-500"
        />
        <span className="text-[11px] text-slate-500">x</span>
        <input
          value={customHeight}
          onChange={(event) => setCustomHeight(event.target.value.replace(/[^\d]/g, '').slice(0, 5))}
          inputMode="numeric"
          placeholder="高"
          className="h-9 min-w-0 rounded-[10px] border border-white/[0.06] bg-[#151920] px-2 text-center text-[12px] text-white outline-none placeholder:text-slate-500"
        />
      </div>
      <button
        type="button"
        disabled={!canApplyCustomSize}
        onClick={() => onSelectSize(customSizeValue)}
        className={`mt-1.5 w-full rounded-[10px] px-3 py-1.5 text-[11px] transition ${
          activeSizeId === customSizeValue && customSizeValue
            ? 'bg-cyan-500/15 text-cyan-100'
            : 'bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] hover:text-white'
        } disabled:cursor-not-allowed disabled:opacity-45`}
      >
        使用自定义尺寸
      </button>
      <button
        type="button"
        onClick={() => onSelectSize(null)}
        className={`mt-2 w-full rounded-[10px] px-3 py-1.5 text-[11px] transition ${
          !activeSizeId
            ? 'bg-cyan-500/15 text-cyan-100'
            : 'bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] hover:text-white'
        }`}
      >
        不指定尺寸
      </button>
    </MenuPanel>
  );
}

function ChatSidebar({
  projectTitle,
  currentSession,
  sessions,
  currentSessionId,
  chatInput,
  chatInputImages,
  brandTemplates,
  brandSpecs,
  activeBrandSpecId,
  activeBrandTemplateId,
  selectedImageModel,
  isChatLoading,
  isCollapsed,
  isHistoryMenuOpen,
  isBrandSpecMenuOpen,
  isBrandMenuOpen,
  storageWarning,
  isModelConfigured,
  modelConfigurationMessage,
  headerHeight = WORKSPACE_HEADER_HEIGHT,
  historyMenuRef,
  brandSpecMenuRef,
  brandMenuRef,
  sizeConfigMenuRef,
  chatUploadInputRef,
  brandTemplateInputRef,
  activeSizeId,
  isSizeConfigMenuOpen,
  onToggleCollapsed,
  onToggleHistoryMenu,
  onToggleBrandSpecMenu,
  onToggleBrandMenu,
  onToggleSizeConfigMenu,
  onCreateSession,
  onSwitchSession,
  onSetChatInput,
  onRemoveChatImage,
  onSelectModel,
  onSelectBrandSpec,
  onSaveBrandSpec,
  onCreateBrandSpec,
  onDeleteBrandSpec,
  onSelectBrandTemplate,
  onUploadBrandTemplate,
  onUploadReferenceImage,
  onSendMessage,
  onAddAssistantImageToChat,
  onSelectSize,
}: ChatSidebarProps) {
  const canSend = !isChatLoading && (chatInput.trim().length > 0 || chatInputImages.length > 0);
  const hasImageLoadingMessage = Boolean(
    currentSession?.messages.some((message) => message.role === 'assistant' && message.isImageLoading)
  );
  const title = projectTitle.trim() || '未命名项目';
  const activeBrandName =
    brandSpecs.find((item) => item.id === activeBrandSpecId)?.brandName || '未选择';
  const activeBrandTemplateName =
    brandTemplates.find((item) => item.id === activeBrandTemplateId)?.name || '未选择';
  const displaySizeLabel =
    IMAGE_SIZE_OPTIONS.find((item) => item.value === activeSizeId)?.label || '尺寸';
  const resolvedDisplaySizeLabel =
    IMAGE_SIZE_OPTIONS.find((item) => item.value === activeSizeId)?.label || activeSizeId || '尺寸';
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const modelMenuRef = useRef<HTMLDivElement | null>(null);
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const messageCount = currentSession?.messages.length ?? 0;
  const latestMessageKey = currentSession?.messages[messageCount - 1]?.id ?? '';
  const selectedModelLabel = getDisplayModelLabel(
    selectedImageModel,
    IMAGE_MODEL_OPTIONS.find((option) => option.value === selectedImageModel)?.label || selectedImageModel
  );

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [currentSessionId, messageCount, latestMessageKey, isChatLoading]);

  useEffect(() => {
    if (!isModelMenuOpen) return undefined;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target instanceof Node ? event.target : null;
      if (modelMenuRef.current && target && !modelMenuRef.current.contains(target)) {
        setIsModelMenuOpen(false);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    return () => window.removeEventListener('mousedown', handlePointerDown);
  }, [isModelMenuOpen]);

  return (
    <aside
      className={`ai-vision-chat-sidebar relative z-50 h-full shrink-0 bg-transparent transition-[width] duration-300 ease-out ${
        isCollapsed ? 'w-0 overflow-visible' : 'w-[420px] overflow-visible'
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
        <div className="flex h-full flex-col overflow-visible rounded-l-[30px] border-l border-white/[0.05] bg-[#14171d] shadow-[-20px_0_64px_rgba(0,0,0,0.36)]">
          <div className="border-b border-white/[0.05] px-5" style={{ minHeight: headerHeight }}>
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
                  <div className="truncate text-[14px] font-medium text-white">
                    {title}
                  </div>
                </div>

                {isHistoryMenuOpen ? (
                  <div className="absolute left-0 top-full z-40 mt-3 w-[260px]">
                    <HistoryMenu
                      sessions={sessions}
                      currentSessionId={currentSessionId}
                      onSwitchSession={onSwitchSession}
                    />
                  </div>
                ) : null}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onCreateSession}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-[16px] bg-white/[0.05] text-white transition hover:bg-white/[0.08]"
                  aria-label="新建对话"
                >
                  <Plus className="h-4 w-4" />
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
            <div className="flex min-h-0 flex-1 flex-col overflow-visible">
              <div
                ref={messagesContainerRef}
                className={`ai-vision-chat-scroll min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-4 ${HIDDEN_SCROLLBAR}`}
              >
                {currentSession?.messages.length ? (
                  <div className="space-y-5">
                    {currentSession.messages.map((message) => {
                      const isUser = message.role === 'user';
                      const messageText = typeof message.content === 'string' ? message.content : '';
                      const hasUserText = messageText.trim().length > 0;
                      const attachedImages = Array.isArray(message.attachedImages)
                        ? message.attachedImages.filter(
                            (item): item is string => typeof item === 'string' && item.trim().length > 0
                          )
                        : [];
                      const assistantImageUrls = Array.isArray(message.imageUrls)
                        ? message.imageUrls.filter(
                            (item): item is string => typeof item === 'string' && item.trim().length > 0
                          )
                        : [];
                      const legacyImageUrl =
                        typeof message.imageUrl === 'string' && message.imageUrl.trim().length > 0
                          ? message.imageUrl
                          : null;
                      if (!assistantImageUrls.length && legacyImageUrl) {
                        assistantImageUrls.push(legacyImageUrl);
                      }
                      const loadingPlaceholderCount = Math.max(
                        1,
                        Array.isArray(message.imageUrls) ? message.imageUrls.length : 0
                      );
                      return (
                        <div key={message.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                          {isUser ? (
                            <div className="flex max-w-[84%] flex-col items-end gap-2">
                              {hasUserText ? (
                                <div className="overflow-hidden rounded-[20px] rounded-br-[10px] bg-[#2a2f39] px-4 py-3 text-[13px] leading-6 text-slate-50">
                                  <p className="whitespace-pre-wrap break-words">{messageText}</p>
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
                              <p className="whitespace-pre-wrap break-words">{messageText}</p>
                              {message.isImageLoading ? (
                                <div
                                  className={`mt-3 grid w-full max-w-[50%] gap-2 ${
                                    loadingPlaceholderCount > 1 ? 'grid-cols-2' : 'grid-cols-1'
                                  }`}
                                >
                                  {Array.from({ length: loadingPlaceholderCount }).map((_, index) => (
                                    <div
                                      key={`${message.id}-loading-${index}`}
                                      className="overflow-hidden rounded-[18px] border border-white/[0.08] bg-[#222833]"
                                    >
                                      <div className="aspect-square w-full animate-pulse bg-[linear-gradient(110deg,#2a3040_8%,#3a4254_18%,#2a3040_33%)] [background-size:200%_100%]" />
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                              {assistantImageUrls.length ? (
                                <div
                                  className={`mt-3 grid w-full max-w-[50%] gap-2 ${
                                    assistantImageUrls.length > 1 ? 'grid-cols-2' : 'grid-cols-1'
                                  }`}
                                >
                                  {assistantImageUrls.map((imageUrl, index) => (
                                    <div key={`${message.id}-result-${index}`} className="relative">
                                      <img
                                        src={imageUrl}
                                        alt={`assistant result ${index + 1}`}
                                        className="block w-full rounded-[18px] object-cover shadow-[0_14px_30px_rgba(0,0,0,0.22)]"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => onAddAssistantImageToChat(imageUrl)}
                                        className="absolute right-1.5 top-1.5 inline-flex h-7 items-center justify-center rounded-[10px] border border-white/20 bg-black/55 px-2 text-[11px] text-white transition hover:bg-black/70"
                                      >
                                        添加到对话
                                      </button>
                                    </div>
                                  ))}
                                </div>
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

                {isChatLoading && !hasImageLoadingMessage ? (
                  <div className="mt-3.5 flex justify-start">
                    <div className="w-full text-[0px] leading-none">
                      <div className="block w-full max-w-[50%] overflow-hidden rounded-[18px] border border-white/[0.08] bg-[#222833]">
                        <div className="aspect-square w-full animate-pulse bg-[linear-gradient(110deg,#2a3040_8%,#3a4254_18%,#2a3040_33%)] [background-size:200%_100%]" />
                      </div>
                      <div className="mt-2 inline-flex items-center gap-2 text-[13px] text-slate-400">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        正在生成图片...
                      </div>
                      正在思考与整理画布结果...
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="px-2.5 pb-2.5">
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
                    onPaste={(event) => {
                      const clipboardData = event.clipboardData;
                      if (!clipboardData) return;
                      
                      const items = clipboardData.items;
                      if (!items) return;
                      
                      for (let i = 0; i < items.length; i++) {
                        const item = items[i];
                        if (item.kind === 'file' && item.type.indexOf('image') === 0) {
                          const file = item.getAsFile();
                          if (file) {
                            event.preventDefault();
                            void onUploadReferenceImage(file);
                          }
                        }
                      }
                    }}
                    rows={3}
                    placeholder="描述你想继续推进的画面..."
                    className="mt-1 min-h-[82px] w-full resize-none bg-transparent px-1.5 py-1 text-[13px] leading-5 text-white outline-none placeholder:text-slate-500"
                  />

                  {!isModelConfigured && modelConfigurationMessage ? (
                    <div className="mt-1.5 rounded-[14px] bg-amber-500/10 px-2.5 py-2 text-[10px] leading-4.5 text-amber-100">
                      {modelConfigurationMessage}
                    </div>
                  ) : null}

                  {storageWarning ? (
                    <div className="mt-1.5 rounded-[14px] bg-white/[0.04] px-2.5 py-2 text-[10px] leading-4.5 text-slate-300">
                      {storageWarning}
                    </div>
                  ) : null}

                  <div className="mt-2 flex items-center gap-1.5 px-0.5">
                    <div ref={modelMenuRef} className="relative">
                      <button
                        type="button"
                        onClick={() => setIsModelMenuOpen((previous) => !previous)}
                        className="inline-flex h-9 w-[92px] items-center justify-between gap-1 rounded-[12px] border border-white/[0.04] bg-[#151920] px-2.5 text-[12px] text-white transition hover:bg-[#1a1f28]"
                        aria-label="选择模型"
                      >
                        <span className="min-w-0 truncate">{selectedModelLabel}</span>
                        <ChevronDown
                          className={`h-3 w-3 shrink-0 transition ${isModelMenuOpen ? 'rotate-180' : ''}`}
                        />
                      </button>

                      {isModelMenuOpen ? (
                        <div className="absolute bottom-full left-0 z-50 mb-3 w-[180px]">
                          <MenuPanel>
                            <div className="space-y-1">
                              {IMAGE_MODEL_OPTIONS.map((option) => {
                                const label = getDisplayModelLabel(option.value, option.label);
                                const isSelected = option.value === selectedImageModel;
                                return (
                                  <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => {
                                      onSelectModel(option.value);
                                      setIsModelMenuOpen(false);
                                    }}
                                    className={`flex h-9 w-full items-center rounded-[10px] px-2.5 text-left text-[12px] transition ${
                                      isSelected
                                        ? 'bg-cyan-500/15 text-cyan-100'
                                        : 'text-slate-300 hover:bg-white/[0.06] hover:text-white'
                                    }`}
                                  >
                                    <span className="truncate">{label}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </MenuPanel>
                        </div>
                      ) : null}
                    </div>

                    <div ref={brandSpecMenuRef} className="relative">
                      <button
                        type="button"
                        onClick={onToggleBrandSpecMenu}
                        className={`inline-flex h-9 items-center gap-1 rounded-[12px] border px-3 text-[12px] transition ${
                          activeBrandSpecId
                            ? 'border-cyan-300/45 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/15'
                            : 'border-white/[0.04] bg-[#151920] text-slate-200 hover:bg-[#1a1f28]'
                        }`}
                      >
                        {activeBrandName}规范
                        <ChevronDown
                          className={`h-3 w-3 transition ${isBrandSpecMenuOpen ? 'rotate-180' : ''}`}
                        />
                      </button>

                      {isBrandSpecMenuOpen ? (
                        <div className="absolute bottom-full right-0 z-40 mb-3 w-[min(340px,calc(100vw-32px))]">
                          <BrandSpecMenu
                            brandSpecs={brandSpecs}
                            activeBrandSpecId={activeBrandSpecId}
                            onSelectBrandSpec={onSelectBrandSpec}
                            onSaveBrandSpec={onSaveBrandSpec}
                            onCreateBrandSpec={onCreateBrandSpec}
                            onDeleteBrandSpec={onDeleteBrandSpec}
                          />
                        </div>
                      ) : null}
                    </div>

                    <div ref={sizeConfigMenuRef} className="relative">
                      <button
                        type="button"
                        onClick={onToggleSizeConfigMenu}
                        className={`inline-flex h-9 items-center gap-1 rounded-[12px] border px-3 text-[12px] transition ${
                          activeSizeId
                            ? 'border-cyan-300/45 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/15'
                            : 'border-white/[0.04] bg-[#151920] text-slate-200 hover:bg-[#1a1f28]'
                        }`}
                      >
                        <Ruler className="h-3.5 w-3.5" />
                        {resolvedDisplaySizeLabel}
                        <ChevronDown
                          className={`h-3 w-3 transition ${isSizeConfigMenuOpen ? 'rotate-180' : ''}`}
                        />
                      </button>

                      {isSizeConfigMenuOpen ? (
                        <div className="absolute bottom-full right-0 z-40 mb-3 w-[min(240px,calc(100vw-32px))]">
                          <SizeConfigMenu
                            activeSizeId={activeSizeId}
                            onSelectSize={onSelectSize}
                          />
                        </div>
                      ) : null}
                    </div>

                    {false ? (
                      <div ref={brandMenuRef} className="relative">
                        <button
                          type="button"
                          onClick={onToggleBrandMenu}
                          className="inline-flex h-9 items-center gap-1 rounded-[12px] border border-white/[0.04] bg-[#151920] px-3 text-[12px] text-slate-200 transition hover:bg-[#1a1f28]"
                        >
                          {activeBrandTemplateName}+模板
                          <ChevronDown
                            className={`h-3 w-3 transition ${isBrandMenuOpen ? 'rotate-180' : ''}`}
                          />
                        </button>

                        {isBrandMenuOpen ? (
                          <div className="absolute bottom-full left-0 z-40 mb-3 w-[260px]">
                            <BrandMenu
                              brandTemplates={brandTemplates}
                              activeBrandTemplateId={activeBrandTemplateId}
                              brandTemplateInputRef={brandTemplateInputRef}
                              onSelectBrandTemplate={onSelectBrandTemplate}
                            />
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="ml-auto flex items-center gap-2">
                      <button
                        type="button"
                        disabled={!canSend}
                        onClick={() => {
                          void onSendMessage();
                        }}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-[14px] bg-[#33435f] text-white transition hover:bg-[#3b4d6d] disabled:cursor-not-allowed disabled:opacity-45"
                        aria-label="发送"
                      >
                        {isChatLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
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

function areChatSidebarPropsEqual(previous: ChatSidebarProps, next: ChatSidebarProps) {
  return (
    previous.projectTitle === next.projectTitle &&
    previous.currentSession === next.currentSession &&
    previous.sessions === next.sessions &&
    previous.currentSessionId === next.currentSessionId &&
    previous.currentScene === next.currentScene &&
    previous.chatInput === next.chatInput &&
    previous.chatInputImages === next.chatInputImages &&
    previous.brandTemplates === next.brandTemplates &&
    previous.brandSpecs === next.brandSpecs &&
    previous.activeBrandSpecId === next.activeBrandSpecId &&
    previous.activeBrandTemplateId === next.activeBrandTemplateId &&
    previous.selectedImageModel === next.selectedImageModel &&
    previous.isChatLoading === next.isChatLoading &&
    previous.isCollapsed === next.isCollapsed &&
    previous.isHistoryMenuOpen === next.isHistoryMenuOpen &&
    previous.isBrandSpecMenuOpen === next.isBrandSpecMenuOpen &&
    previous.isBrandMenuOpen === next.isBrandMenuOpen &&
    previous.storageWarning === next.storageWarning &&
    previous.isModelConfigured === next.isModelConfigured &&
    previous.modelConfigurationMessage === next.modelConfigurationMessage &&
    previous.headerHeight === next.headerHeight &&
    previous.historyMenuRef === next.historyMenuRef &&
    previous.brandSpecMenuRef === next.brandSpecMenuRef &&
    previous.brandMenuRef === next.brandMenuRef &&
    previous.sizeConfigMenuRef === next.sizeConfigMenuRef &&
    previous.chatUploadInputRef === next.chatUploadInputRef &&
    previous.brandTemplateInputRef === next.brandTemplateInputRef &&
    previous.activeSizeId === next.activeSizeId &&
    previous.isSizeConfigMenuOpen === next.isSizeConfigMenuOpen
  );
}

export default React.memo(ChatSidebar, areChatSidebarPropsEqual);
