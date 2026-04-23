import React, { Dispatch, RefObject, SetStateAction } from 'react';
import {
  Clapperboard,
  Copy,
  Crop,
  Download,
  ImagePlus,
  Loader2,
  MessageSquarePlus,
  Minus,
  MousePointer2,
  Pencil,
  Plus,
  RectangleHorizontal,
  RefreshCcw,
  Scan,
  Sparkles,
  Trash2,
  Type,
  Video,
} from 'lucide-react';
import { CanvasItem, CanvasPoint, ViewState } from '../../types';
import { ContextButton, ToolbarButton } from './ui';
import {
  ActionPopoverState,
  CropAspect,
  CropState,
  DRAW_STROKE_COLOR,
  DRAW_STROKE_WIDTH,
  ToolMode,
  VIDEO_DISABLED_REASON,
  buildDrawingFrame,
  stopCanvasToolbarEvent,
  stopCanvasToolbarWheel,
} from './workspace-model';

interface CanvasStageProps {
  items: CanvasItem[];
  tool: ToolMode;
  setTool: (tool: ToolMode) => void;
  view: ViewState;
  drawPreviewPoints: CanvasPoint[] | null;
  selectedItemId: string | null;
  selectedImageItem: CanvasItem | null;
  selectedImageToolbarPosition: { left: number; top: number } | null;
  actionPopover: ActionPopoverState | null;
  setActionPopover: Dispatch<SetStateAction<ActionPopoverState | null>>;
  cropState: CropState | null;
  setCropState: Dispatch<SetStateAction<CropState | null>>;
  cropTargetItem: CanvasItem | null;
  cropPreviewFrame:
    | {
        left: string;
        top: string;
        width: string;
        height: string;
      }
    | null;
  cropPanelRef: RefObject<HTMLDivElement>;
  canvasViewportRef: RefObject<HTMLDivElement>;
  imageInputRef: RefObject<HTMLInputElement>;
  videoInputRef: RefObject<HTMLInputElement>;
  isModelConfigured: boolean;
  onCanvasPointerEnter: () => void;
  onCanvasPointerLeave: () => void;
  onCanvasPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  onCanvasWheel: (event: React.WheelEvent<HTMLDivElement>) => void;
  onItemPointerDown: (event: React.PointerEvent<HTMLDivElement>, item: CanvasItem) => void;
  onItemDoubleClick: (item: CanvasItem) => void;
  onImportImageFiles: (files: FileList | null) => Promise<void>;
  onImportVideoFiles: (files: FileList | null) => Promise<void>;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitCanvasView: () => void;
  onCopySelectedImage: () => void;
  onDownloadSelectedImage: () => Promise<void>;
  onOpenRegeneratePopover: () => void;
  onOpenVideoPopover: () => void;
  onOpenCropModal: () => void;
  onRegenerateSubmit: () => Promise<void>;
  onVideoSubmit: () => Promise<void>;
  onCropConfirm: () => Promise<void>;
  onMissingRegenerateConfig: () => void;
  onAddSelectedImageToChat: () => void;
}

export default function CanvasStage({
  items,
  tool,
  setTool,
  view,
  drawPreviewPoints,
  selectedItemId,
  selectedImageItem,
  selectedImageToolbarPosition,
  actionPopover,
  setActionPopover,
  cropState,
  setCropState,
  cropTargetItem,
  cropPreviewFrame,
  cropPanelRef,
  canvasViewportRef,
  imageInputRef,
  videoInputRef,
  isModelConfigured,
  onCanvasPointerEnter,
  onCanvasPointerLeave,
  onCanvasPointerDown,
  onCanvasWheel,
  onItemPointerDown,
  onItemDoubleClick,
  onImportImageFiles,
  onImportVideoFiles,
  onZoomIn,
  onZoomOut,
  onFitCanvasView,
  onCopySelectedImage,
  onDownloadSelectedImage,
  onOpenRegeneratePopover,
  onOpenVideoPopover,
  onOpenCropModal,
  onRegenerateSubmit,
  onVideoSubmit,
  onCropConfirm,
  onMissingRegenerateConfig,
  onAddSelectedImageToChat,
}: CanvasStageProps) {
  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={canvasViewportRef}
        onPointerEnter={onCanvasPointerEnter}
        onPointerLeave={onCanvasPointerLeave}
        onPointerDown={onCanvasPointerDown}
        onWheel={onCanvasWheel}
        className="relative h-full overflow-hidden bg-[#0b0d14]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.08) 1px, transparent 0)',
          backgroundSize: '18px 18px',
          backgroundPosition: 'center center',
        }}
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(circle at top left, rgba(74, 64, 120, 0.28), transparent 38%), radial-gradient(circle at bottom right, rgba(34, 69, 110, 0.22), transparent 34%)',
          }}
        />

        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
            transformOrigin: '0 0',
          }}
        >
          {items.map((item) => {
            const isSelected = selectedItemId === item.id;
            return (
              <div
                key={item.id}
                onPointerDown={(event) => onItemPointerDown(event, item)}
                onDoubleClick={() => onItemDoubleClick(item)}
                className={`absolute overflow-visible rounded-[26px] transition ${
                  tool === 'select' ? 'cursor-move' : 'cursor-default'
                }`}
                style={{
                  left: item.x,
                  top: item.y,
                  width: item.width,
                  height: item.height,
                }}
              >
                <div
                  className={`relative h-full w-full overflow-hidden rounded-[22px] border ${
                    isSelected
                      ? 'border-[#8e81ff] shadow-[0_0_0_1px_rgba(142,129,255,0.3)]'
                      : 'border-white/[0.06]'
                  } ${
                    item.type === 'shape'
                      ? 'bg-white/[0.06]'
                      : item.type === 'text'
                        ? 'bg-[#f5f1e8] text-[#1f2230]'
                        : 'bg-[#11151f]'
                  }`}
                >
                  {item.type === 'image' ? (
                    <img
                      src={item.content}
                      alt={item.prompt || 'canvas item'}
                      className="h-full w-full select-none object-cover"
                      draggable={false}
                    />
                  ) : null}

                  {item.type === 'video' ? (
                    <video
                      src={item.content}
                      className="h-full w-full select-none object-cover"
                      muted
                      loop
                      autoPlay
                      playsInline
                    />
                  ) : null}

                  {item.type === 'text' ? (
                    <div className="flex h-full w-full items-center justify-center px-5 text-center text-[18px] font-medium leading-snug">
                      {item.content}
                    </div>
                  ) : null}

                  {item.type === 'shape' ? (
                    <div className="h-full w-full rounded-[22px] border border-white/[0.12] bg-[linear-gradient(135deg,rgba(255,255,255,0.12),rgba(255,255,255,0.02))]" />
                  ) : null}

                  {item.type === 'loading' ? (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] px-6 text-center">
                      <Loader2 className="h-8 w-8 animate-spin text-[#8e81ff]" />
                      <div className="space-y-2">
                        <div className="text-[13px] font-medium text-slate-100">{item.prompt || 'AI 正在处理中'}</div>
                        <div className="text-xs leading-5 text-slate-400">{item.content}</div>
                      </div>
                    </div>
                  ) : null}

                  {item.type === 'drawing' ? (
                    <svg
                      className="h-full w-full"
                      viewBox={`0 0 ${item.width} ${item.height}`}
                      preserveAspectRatio="none"
                    >
                      <polyline
                        points={(item.points || []).map((point) => `${point.x},${point.y}`).join(' ')}
                        fill="none"
                        stroke={item.strokeColor || DRAW_STROKE_COLOR}
                        strokeWidth={item.strokeWidth || DRAW_STROKE_WIDTH}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : null}
                </div>

                {isSelected ? (
                  <>
                    {[
                      { left: -5, top: -5 },
                      { right: -5, top: -5 },
                      { left: -5, bottom: -5 },
                      { right: -5, bottom: -5 },
                    ].map((handleStyle, index) => (
                      <span
                        key={index}
                        className="pointer-events-none absolute h-3 w-3 rounded-[2px] border border-[#8e81ff] bg-white shadow-[0_0_0_1px_rgba(142,129,255,0.25)]"
                        style={handleStyle}
                      />
                    ))}
                  </>
                ) : null}
              </div>
            );
          })}

          {drawPreviewPoints && drawPreviewPoints.length > 1 ? (
            (() => {
              const previewItem = buildDrawingFrame(drawPreviewPoints, DRAW_STROKE_WIDTH);
              if (!previewItem) return null;
              return (
                <div
                  className="absolute pointer-events-none"
                  style={{
                    left: previewItem.x,
                    top: previewItem.y,
                    width: previewItem.width,
                    height: previewItem.height,
                  }}
                >
                  <svg
                    className="h-full w-full"
                    viewBox={`0 0 ${previewItem.width} ${previewItem.height}`}
                    preserveAspectRatio="none"
                  >
                    <polyline
                      points={(previewItem.points || []).map((point) => `${point.x},${point.y}`).join(' ')}
                      fill="none"
                      stroke={DRAW_STROKE_COLOR}
                      strokeWidth={DRAW_STROKE_WIDTH}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              );
            })()
          ) : null}
        </div>

        <div className="absolute left-5 top-1/2 z-20 -translate-y-1/2 rounded-[26px] border border-white/[0.08] bg-[#1d202b]/95 p-2.5 shadow-[0_20px_60px_rgba(0,0,0,0.28)] backdrop-blur-xl">
          <div className="flex flex-col items-center gap-1.5">
            <ToolbarButton icon={MousePointer2} label="选择" active={tool === 'select'} onClick={() => setTool('select')} />
            <ToolbarButton icon={ImagePlus} label="导入图片" onClick={() => imageInputRef.current?.click()} />
            <ToolbarButton icon={Video} label="导入视频" onClick={() => videoInputRef.current?.click()} />
            <div className="my-1 h-px w-6 bg-white/[0.1]" />
            <ToolbarButton icon={Pencil} label="画笔" active={tool === 'draw'} onClick={() => setTool('draw')} />
            <ToolbarButton icon={Type} label="文字" active={tool === 'text'} onClick={() => setTool('text')} />
            <ToolbarButton icon={RectangleHorizontal} label="矩形" active={tool === 'shape'} onClick={() => setTool('shape')} />
          </div>
        </div>

        {!cropState ? (
          <div className="absolute bottom-5 left-1/2 z-20 -translate-x-1/2">
            <div className="inline-flex items-center rounded-full border border-white/[0.08] bg-[#232632]/95 px-2 py-1 shadow-[0_20px_50px_rgba(0,0,0,0.32)] backdrop-blur-xl">
              <button
                type="button"
                onClick={onFitCanvasView}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-100 transition hover:bg-white/[0.08]"
                title="适应画布"
              >
                <Scan className="h-4 w-4" />
              </button>
              <div className="mx-1.5 h-5 w-px bg-white/[0.08]" />
              <button
                type="button"
                onClick={onZoomOut}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-100 transition hover:bg-white/[0.08]"
                title="缩小"
              >
                <Minus className="h-4 w-4" />
              </button>
              <div className="min-w-[68px] text-center text-[13px] font-semibold tracking-[0.02em] text-white">
                {Math.round(view.scale * 100)} %
              </div>
              <button
                type="button"
                onClick={onZoomIn}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-100 transition hover:bg-white/[0.08]"
                title="放大"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : null}

        {selectedImageItem && selectedImageToolbarPosition ? (
          <div
            className="absolute z-30"
            style={{
              left: selectedImageToolbarPosition.left,
              top: selectedImageToolbarPosition.top,
              transform: 'translate(-50%, -100%)',
            }}
          >
            <div
              onPointerDown={stopCanvasToolbarEvent}
              onMouseDown={stopCanvasToolbarEvent}
              onClick={stopCanvasToolbarEvent}
              onWheel={stopCanvasToolbarWheel}
              className="inline-flex items-center gap-1 rounded-[20px] border border-white/[0.08] bg-[#1e212d]/95 px-2.5 py-1.5 shadow-[0_18px_40px_rgba(0,0,0,0.3)] backdrop-blur-xl"
            >
              <ContextButton
                icon={RefreshCcw}
                label="重新生成"
                disabled={!isModelConfigured}
                onClick={() => {
                  if (!isModelConfigured) {
                    onMissingRegenerateConfig();
                    return;
                  }
                  onOpenRegeneratePopover();
                }}
              />
              <ContextButton icon={Clapperboard} label="生成视频" disabled={false} onClick={onOpenVideoPopover} />
              <div className="mx-1 h-6 w-px bg-white/[0.08]" />
              <ContextButton icon={Copy} label="复制" onClick={onCopySelectedImage} />
              <ContextButton icon={Crop} label="裁剪" onClick={onOpenCropModal} />
              <div className="mx-1 h-6 w-px bg-white/[0.08]" />
              <ContextButton icon={Download} label="下载" onClick={() => void onDownloadSelectedImage()} />
              <ContextButton icon={MessageSquarePlus} label="添加到对话" textOnly onClick={onAddSelectedImageToChat} />
            </div>
          </div>
        ) : null}

        {actionPopover && selectedImageToolbarPosition ? (
          <div
            className="absolute z-40 w-[360px]"
            style={{
              left: selectedImageToolbarPosition.left,
              top: Math.max(20, selectedImageToolbarPosition.top - 12),
              transform: 'translate(-50%, -100%)',
            }}
          >
            <div
              onPointerDown={stopCanvasToolbarEvent}
              onMouseDown={stopCanvasToolbarEvent}
              onClick={stopCanvasToolbarEvent}
              onWheel={stopCanvasToolbarWheel}
              className="rounded-[24px] border border-white/[0.08] bg-[#161925]/97 p-3.5 shadow-[0_24px_60px_rgba(0,0,0,0.38)] backdrop-blur-xl"
            >
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-[13px] font-semibold text-white">
                    {actionPopover.type === 'regenerate' ? '重新生成图片' : '从图片生成视频'}
                  </h3>
                  <p className="mt-1 text-[11px] text-slate-400">
                    {actionPopover.type === 'regenerate'
                      ? '将当前图片作为参考图，生成后直接替换'
                      : '将当前图片作为参考图，生成后在右侧新增视频卡片'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActionPopover(null)}
                  className="rounded-full p-1.5 text-slate-400 transition hover:bg-white/[0.06] hover:text-white"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              <textarea
                value={actionPopover.prompt}
                onChange={(event) =>
                  setActionPopover((previous) =>
                    previous ? { ...previous, prompt: event.target.value } : previous
                  )
                }
                placeholder="描述你想要保留或变化的内容"
                rows={4}
                className="w-full resize-none rounded-[18px] border border-white/[0.08] bg-white/[0.03] px-3.5 py-2.5 text-[13px] text-white outline-none placeholder:text-slate-500 focus:border-[#8e81ff]/50"
              />

              {!isModelConfigured && actionPopover.type === 'regenerate' ? (
                <div className="mt-3 rounded-[18px] border border-amber-300/20 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100">
                  未配置 `VITE_DOUBAO_API_KEY`，这个按钮不会真正发起生成。
                </div>
              ) : null}

              {actionPopover.type === 'video' ? (
                <div className="mt-3 rounded-[18px] border border-amber-300/20 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100">
                  {VIDEO_DISABLED_REASON}
                </div>
              ) : null}

              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setActionPopover(null)}
                  className="rounded-[18px] border border-white/[0.08] px-3.5 py-2 text-[13px] text-slate-200 transition hover:bg-white/[0.05]"
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={actionPopover.isSubmitting || (actionPopover.type === 'regenerate' ? !isModelConfigured : true)}
                  onClick={actionPopover.type === 'regenerate' ? () => void onRegenerateSubmit() : () => void onVideoSubmit()}
                  className="inline-flex items-center gap-1.5 rounded-[18px] bg-[#7c6df7] px-3.5 py-2 text-[13px] font-medium text-white transition hover:bg-[#8a7cfa] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {actionPopover.isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {actionPopover.type === 'regenerate' ? '开始重绘' : '开始生成'}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          multiple
          onChange={(event) => {
            void onImportImageFiles(event.target.files);
            event.target.value = '';
          }}
        />
        <input
          ref={videoInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          multiple
          onChange={(event) => {
            void onImportVideoFiles(event.target.files);
            event.target.value = '';
          }}
        />
      </div>

      {cropState && cropTargetItem && cropPreviewFrame ? (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/65 px-6 py-8 backdrop-blur-sm">
          <div className="flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-[32px] border border-white/[0.08] bg-[#111522] shadow-[0_32px_90px_rgba(0,0,0,0.45)]">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold text-white">裁剪图片</h3>
                <p className="mt-1 text-sm text-slate-400">支持 freeform / 1:1 / 4:3 / 16:9</p>
              </div>
              <button
                type="button"
                onClick={() => setCropState(null)}
                className="rounded-2xl border border-white/[0.08] px-4 py-2 text-sm text-slate-200 transition hover:bg-white/[0.05]"
              >
                关闭
              </button>
            </div>

            <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[1.3fr_0.7fr]">
              <div className="relative flex min-h-[420px] items-center justify-center bg-[#0c1018] p-6">
                <div className="relative max-h-full w-full max-w-3xl overflow-hidden rounded-[28px] border border-white/[0.06] bg-black/20">
                  <img
                    src={cropTargetItem.content}
                    alt="crop preview"
                    className="h-full max-h-[64vh] w-full object-contain"
                  />
                  <div className="pointer-events-none absolute inset-0">
                    <div className="absolute inset-0 bg-black/35" />
                    <div
                      className="absolute border-2 border-[#8e81ff] shadow-[0_0_0_9999px_rgba(0,0,0,0.42)]"
                      style={cropPreviewFrame}
                    />
                  </div>
                </div>
              </div>

              <div
                ref={cropPanelRef}
                className="flex flex-col gap-5 overflow-y-auto border-l border-white/[0.06] bg-[#121723] px-6 py-6"
              >
                <div>
                  <div className="mb-3 text-sm font-medium text-white">比例</div>
                  <div className="flex flex-wrap gap-2">
                    {(['freeform', '1:1', '4:3', '16:9'] as CropAspect[]).map((aspect) => (
                      <button
                        key={aspect}
                        type="button"
                        onClick={() =>
                          setCropState((previous) =>
                            previous
                              ? {
                                  ...previous,
                                  aspect,
                                  freeWidth: aspect === 'freeform' ? previous.freeWidth : 82,
                                  freeHeight: aspect === 'freeform' ? previous.freeHeight : 82,
                                }
                              : previous
                          )
                        }
                        className={`rounded-full border px-3 py-1.5 text-xs transition ${
                          cropState.aspect === aspect
                            ? 'border-[#8e81ff]/40 bg-[#2b2443] text-[#ece8ff]'
                            : 'border-white/[0.08] bg-white/[0.03] text-slate-300 hover:bg-white/[0.06]'
                        }`}
                      >
                        {aspect}
                      </button>
                    ))}
                  </div>
                </div>

                {cropState.aspect === 'freeform' ? (
                  <>
                    <label className="space-y-2">
                      <div className="flex items-center justify-between text-sm text-slate-200">
                        <span>裁剪宽度</span>
                        <span>{Math.round(cropState.freeWidth)}%</span>
                      </div>
                      <input
                        type="range"
                        min={10}
                        max={100}
                        value={cropState.freeWidth}
                        onChange={(event) =>
                          setCropState((previous) =>
                            previous ? { ...previous, freeWidth: Number(event.target.value) } : previous
                          )
                        }
                        className="w-full accent-[#8e81ff]"
                      />
                    </label>

                    <label className="space-y-2">
                      <div className="flex items-center justify-between text-sm text-slate-200">
                        <span>裁剪高度</span>
                        <span>{Math.round(cropState.freeHeight)}%</span>
                      </div>
                      <input
                        type="range"
                        min={10}
                        max={100}
                        value={cropState.freeHeight}
                        onChange={(event) =>
                          setCropState((previous) =>
                            previous ? { ...previous, freeHeight: Number(event.target.value) } : previous
                          )
                        }
                        className="w-full accent-[#8e81ff]"
                      />
                    </label>
                  </>
                ) : (
                  <label className="space-y-2">
                    <div className="flex items-center justify-between text-sm text-slate-200">
                      <span>裁剪尺寸</span>
                      <span>{Math.round(cropState.uniformSize)}%</span>
                    </div>
                    <input
                      type="range"
                      min={12}
                      max={100}
                      value={cropState.uniformSize}
                      onChange={(event) =>
                        setCropState((previous) =>
                          previous ? { ...previous, uniformSize: Number(event.target.value) } : previous
                        )
                      }
                      className="w-full accent-[#8e81ff]"
                    />
                  </label>
                )}

                <label className="space-y-2">
                  <div className="flex items-center justify-between text-sm text-slate-200">
                    <span>水平位置</span>
                    <span>{Math.round(cropState.offsetX)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={cropState.offsetX}
                    onChange={(event) =>
                      setCropState((previous) =>
                        previous ? { ...previous, offsetX: Number(event.target.value) } : previous
                      )
                    }
                    className="w-full accent-[#8e81ff]"
                  />
                </label>

                <label className="space-y-2">
                  <div className="flex items-center justify-between text-sm text-slate-200">
                    <span>垂直位置</span>
                    <span>{Math.round(cropState.offsetY)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={cropState.offsetY}
                    onChange={(event) =>
                      setCropState((previous) =>
                        previous ? { ...previous, offsetY: Number(event.target.value) } : previous
                      )
                    }
                    className="w-full accent-[#8e81ff]"
                  />
                </label>

                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-xs leading-6 text-slate-300">
                  裁剪确认后会直接替换当前图片，不保留版本回退。
                </div>

                <div className="mt-auto flex items-center justify-end gap-2 pt-4">
                  <button
                    type="button"
                    onClick={() => setCropState(null)}
                    className="rounded-2xl border border-white/[0.08] px-4 py-2 text-sm text-slate-200 transition hover:bg-white/[0.05]"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    disabled={cropState.isSubmitting}
                    onClick={() => void onCropConfirm()}
                    className="inline-flex items-center gap-2 rounded-2xl bg-[#7c6df7] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#8a7cfa] disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {cropState.isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crop className="h-4 w-4" />}
                    确认裁剪
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
