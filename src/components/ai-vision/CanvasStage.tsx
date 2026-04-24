import React, { Dispatch, RefObject, SetStateAction } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Copy,
  Crop,
  Download,
  ImagePlus,
  ImageUp,
  Loader2,
  MessageSquarePlus,
  Minus,
  MousePointer2,
  Pencil,
  PencilLine,
  Plus,
  RectangleHorizontal,
  RefreshCcw,
  Scan,
  Slash,
  Trash2,
  Type,
  Video,
} from 'lucide-react';
import type { CanvasItem, CanvasPoint, ViewState } from '../../types';
import { ToolbarButton } from './ui';
import {
  ActionPopoverState,
  CropAspect,
  CropState,
  DEFAULT_CROP_RECT,
  DEFAULT_LINE_COLOR,
  DEFAULT_SHAPE_FILL,
  DEFAULT_SHAPE_STROKE,
  DEFAULT_SHAPE_STROKE_WIDTH,
  DEFAULT_TEXT_ALIGN,
  DEFAULT_TEXT_COLOR,
  DEFAULT_TEXT_FONT_SIZE,
  DEFAULT_TEXT_FONT_WEIGHT,
  DRAW_STROKE_COLOR,
  DRAW_STROKE_WIDTH,
  ResizeHandle,
  ToolMode,
  buildDrawingFrame,
  getRenderedImageStyle,
  stopCanvasToolbarEvent,
  stopCanvasToolbarWheel,
} from './workspace-model';

interface CanvasStageProps {
  items: CanvasItem[];
  tool: ToolMode;
  setTool: (tool: ToolMode) => void;
  view: ViewState;
  drawPreviewPoints: CanvasPoint[] | null;
  linePreviewItem: CanvasItem | null;
  selectedItemId: string | null;
  selectedItem: CanvasItem | null;
  selectedItemToolbarPosition: { left: number; top: number } | null;
  actionPopover: ActionPopoverState | null;
  setActionPopover: Dispatch<SetStateAction<ActionPopoverState | null>>;
  cropState: CropState | null;
  editingTextItemId: string | null;
  editingTextValue: string;
  canvasRootRef: RefObject<HTMLDivElement | null>;
  canvasViewportRef: RefObject<HTMLDivElement | null>;
  imageInputRef: RefObject<HTMLInputElement>;
  videoInputRef: RefObject<HTMLInputElement>;
  isModelConfigured: boolean;
  onCanvasPointerEnter: () => void;
  onCanvasPointerLeave: () => void;
  onCanvasPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  onCanvasWheel: (event: React.WheelEvent<HTMLDivElement>) => void;
  onItemPointerDown: (event: React.PointerEvent<HTMLDivElement>, item: CanvasItem) => void;
  onItemDoubleClick: (item: CanvasItem) => void;
  onResizeHandlePointerDown: (
    event: React.PointerEvent<HTMLButtonElement>,
    item: CanvasItem,
    handle: ResizeHandle
  ) => void;
  onLineEndpointPointerDown: (
    event: React.PointerEvent<HTMLButtonElement>,
    item: CanvasItem,
    endpointIndex: 0 | 1
  ) => void;
  onCropMovePointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  onCropHandlePointerDown: (
    event: React.PointerEvent<HTMLButtonElement>,
    handle: ResizeHandle
  ) => void;
  onTextEditChange: (value: string) => void;
  onTextEditBlur: () => void;
  onTextEditKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onStartTextEditing: (item: CanvasItem) => void;
  onUpdateSelectedItem: (updates: Partial<CanvasItem>) => void;
  onImportImageFiles: (files: FileList | null) => Promise<void>;
  onImportVideoFiles: (files: FileList | null) => Promise<void>;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitCanvasView: () => void;
  onCopySelectedItem: () => void;
  onDeleteSelectedItem: () => void;
  onDownloadSelectedImage: () => Promise<void>;
  onOpenRegeneratePopover: () => void;
  onOpenReplaceImage: () => void;
  onStartCrop: () => void;
  onCancelCrop: () => void;
  onConfirmCrop: () => void;
  onSelectCropAspect: (aspect: CropAspect) => void;
  onRegenerateSubmit: () => Promise<void>;
  onMissingRegenerateConfig: () => void;
  onAddSelectedImageToChat: () => void;
}

function assignElementRef<T>(ref: RefObject<T | null>, value: T | null) {
  (ref as React.MutableRefObject<T | null>).current = value;
}

const RESIZE_HANDLES: Array<{ handle: ResizeHandle; style: React.CSSProperties }> = [
  { handle: 'nw', style: { left: -6, top: -6 } },
  { handle: 'n', style: { left: '50%', top: -6, transform: 'translateX(-50%)' } },
  { handle: 'ne', style: { right: -6, top: -6 } },
  { handle: 'e', style: { right: -6, top: '50%', transform: 'translateY(-50%)' } },
  { handle: 'se', style: { right: -6, bottom: -6 } },
  { handle: 's', style: { left: '50%', bottom: -6, transform: 'translateX(-50%)' } },
  { handle: 'sw', style: { left: -6, bottom: -6 } },
  { handle: 'w', style: { left: -6, top: '50%', transform: 'translateY(-50%)' } },
];
const CORNER_RESIZE_HANDLES = RESIZE_HANDLES.filter(({ handle }) => handle.length === 2);

const CROP_ASPECT_OPTIONS: CropAspect[] = ['freeform', '1:1', '4:3', '16:9'];

function FloatingToolbar({ children }: { children: React.ReactNode }) {
  return (
    <div
      onPointerDown={stopCanvasToolbarEvent}
      onMouseDown={stopCanvasToolbarEvent}
      onClick={stopCanvasToolbarEvent}
      onWheel={stopCanvasToolbarWheel}
      className="inline-flex items-center gap-1 rounded-[20px] border border-white/[0.07] bg-[#171b22]/96 px-2 py-1.5 shadow-[0_20px_42px_rgba(0,0,0,0.34)] backdrop-blur-xl"
    >
      {children}
    </div>
  );
}

function ToolbarAction({
  label,
  onClick,
  icon: Icon,
  disabled,
  iconOnly = false,
}: {
  label: string;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
  iconOnly?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`inline-flex h-10 items-center rounded-[12px] text-[12px] font-medium text-slate-100 transition hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-40 ${
        iconOnly ? 'w-10 justify-center' : 'gap-1.5 px-2.5'
      }`}
    >
      <Icon className="h-4 w-4" />
      {!iconOnly ? <span>{label}</span> : null}
    </button>
  );
}

function Divider() {
  return <div className="mx-0.5 h-6 w-px bg-white/[0.08]" />;
}

function ColorControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex h-10 items-center gap-2 rounded-[12px] px-2 text-[12px] text-slate-200 transition hover:bg-white/[0.06]">
      <span>{label}</span>
      <input
        type="color"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-6 w-6 cursor-pointer rounded border-none bg-transparent p-0"
      />
    </label>
  );
}

function MiniSelect({
  value,
  onChange,
  options,
  widthClass = 'w-[82px]',
}: {
  value: string | number;
  onChange: (value: string) => void;
  options: Array<{ value: string | number; label: string }>;
  widthClass?: string;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={`h-9 rounded-[12px] border border-white/[0.06] bg-[#0f1319] px-2 text-[12px] text-white outline-none ${widthClass}`}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function renderTextBlock(item: CanvasItem) {
  return (
    <div
      className="h-full w-full whitespace-pre-wrap break-words"
      style={{
        color: item.color || DEFAULT_TEXT_COLOR,
        fontSize: item.fontSize || DEFAULT_TEXT_FONT_SIZE,
        fontWeight: item.fontWeight || DEFAULT_TEXT_FONT_WEIGHT,
        textAlign: item.textAlign || DEFAULT_TEXT_ALIGN,
        lineHeight: 1.45,
      }}
    >
      {item.content}
    </div>
  );
}

function CropOverlay({
  cropState,
  onMovePointerDown,
  onHandlePointerDown,
}: {
  cropState: CropState;
  onMovePointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  onHandlePointerDown: (event: React.PointerEvent<HTMLButtonElement>, handle: ResizeHandle) => void;
}) {
  const rect = cropState.rect || DEFAULT_CROP_RECT;

  return (
    <div className="absolute inset-0 z-20 overflow-hidden">
      <div className="absolute inset-0 bg-black/40" />
      <div
        onPointerDown={onMovePointerDown}
        className="absolute cursor-move border border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.42)]"
        style={{
          left: `${rect.x * 100}%`,
          top: `${rect.y * 100}%`,
          width: `${rect.width * 100}%`,
          height: `${rect.height * 100}%`,
        }}
      >
        <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
          {Array.from({ length: 9 }).map((_, index) => (
            <div key={index} className="border border-white/15" />
          ))}
        </div>

        {RESIZE_HANDLES.map(({ handle, style }) => (
          <button
            key={handle}
            type="button"
            onPointerDown={(event) => onHandlePointerDown(event, handle)}
            className="absolute h-3.5 w-3.5 rounded-[3px] border border-[#c8d2e8] bg-[#f8fbff]"
            style={style}
          />
        ))}
      </div>
    </div>
  );
}

export default function CanvasStage({
  items,
  tool,
  setTool,
  view,
  drawPreviewPoints,
  linePreviewItem,
  selectedItemId,
  selectedItem,
  selectedItemToolbarPosition,
  actionPopover,
  setActionPopover,
  cropState,
  editingTextItemId,
  editingTextValue,
  canvasRootRef,
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
  onResizeHandlePointerDown,
  onLineEndpointPointerDown,
  onCropMovePointerDown,
  onCropHandlePointerDown,
  onTextEditChange,
  onTextEditBlur,
  onTextEditKeyDown,
  onStartTextEditing,
  onUpdateSelectedItem,
  onImportImageFiles,
  onImportVideoFiles,
  onZoomIn,
  onZoomOut,
  onFitCanvasView,
  onCopySelectedItem,
  onDeleteSelectedItem,
  onDownloadSelectedImage,
  onOpenRegeneratePopover,
  onOpenReplaceImage,
  onStartCrop,
  onCancelCrop,
  onConfirmCrop,
  onSelectCropAspect,
  onRegenerateSubmit,
  onMissingRegenerateConfig,
  onAddSelectedImageToChat,
}: CanvasStageProps) {
  const selectedImageItem = selectedItem?.type === 'image' ? selectedItem : null;
  const selectedTextItem = selectedItem?.type === 'text' ? selectedItem : null;
  const selectedShapeItem = selectedItem?.type === 'shape' ? selectedItem : null;
  const selectedLineItem = selectedItem?.type === 'line' ? selectedItem : null;
  const selectedDrawingItem = selectedItem?.type === 'drawing' ? selectedItem : null;

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={(node) => {
          assignElementRef(canvasViewportRef, node);
          assignElementRef(canvasRootRef, node);
        }}
        onPointerEnter={onCanvasPointerEnter}
        onPointerLeave={onCanvasPointerLeave}
        onPointerDown={onCanvasPointerDown}
        onWheel={onCanvasWheel}
        className="ai-vision-canvas-viewport relative h-full overflow-hidden bg-[#090c13]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.08) 1px, transparent 0)',
          backgroundSize: '18px 18px',
          backgroundPosition: 'center center',
          touchAction: 'none',
          overscrollBehavior: 'none',
        }}
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(circle at top left, rgba(52, 77, 116, 0.18), transparent 34%), radial-gradient(circle at bottom right, rgba(90, 98, 112, 0.12), transparent 30%)',
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
            const isTextEditing = editingTextItemId === item.id;
            const imageStyle = item.type === 'image' ? getRenderedImageStyle(item.crop) : null;
            const usesRoundedFrame = item.type !== 'text' && item.type !== 'image';
            const resizeHandles =
              item.type === 'image' || item.type === 'video'
                ? CORNER_RESIZE_HANDLES
                : RESIZE_HANDLES;

            return (
              <div
                key={item.id}
                onPointerDown={(event) => onItemPointerDown(event, item)}
                onDoubleClick={() => onItemDoubleClick(item)}
                className={`absolute overflow-visible transition ${
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
                  className={`relative h-full w-full overflow-visible ${usesRoundedFrame ? 'rounded-[22px]' : ''}`}
                >
                  {item.type === 'image' ? (
                    <div className="relative h-full w-full overflow-hidden bg-[#0f1319]">
                      <img
                        src={item.content}
                        alt={item.prompt || 'canvas item'}
                        className="absolute select-none object-cover"
                        style={imageStyle || undefined}
                        draggable={false}
                      />
                      {cropState?.itemId === item.id ? (
                        <CropOverlay
                          cropState={cropState}
                          onMovePointerDown={onCropMovePointerDown}
                          onHandlePointerDown={onCropHandlePointerDown}
                        />
                      ) : null}
                    </div>
                  ) : null}

                  {item.type === 'video' ? (
                    <div className="relative h-full w-full overflow-hidden rounded-[22px] bg-[#0f1319]">
                      <video
                        src={item.content}
                        className="h-full w-full select-none object-cover"
                        muted
                        loop
                        autoPlay
                        playsInline
                      />
                    </div>
                  ) : null}

                  {item.type === 'text' ? (
                    isTextEditing ? (
                      <textarea
                        value={editingTextValue}
                        onChange={(event) => onTextEditChange(event.target.value)}
                        onBlur={onTextEditBlur}
                        onKeyDown={onTextEditKeyDown}
                        autoFocus
                        className="h-full w-full resize-none rounded-[12px] border border-[#7a8aa5] bg-[#0e1218]/88 px-3 py-2 outline-none"
                        style={{
                          color: item.color || DEFAULT_TEXT_COLOR,
                          fontSize: item.fontSize || DEFAULT_TEXT_FONT_SIZE,
                          fontWeight: item.fontWeight || DEFAULT_TEXT_FONT_WEIGHT,
                          textAlign: item.textAlign || DEFAULT_TEXT_ALIGN,
                          lineHeight: 1.45,
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        onDoubleClick={() => onStartTextEditing(item)}
                        className="block h-full w-full bg-transparent px-2 py-1 text-left"
                      >
                        {renderTextBlock(item)}
                      </button>
                    )
                  ) : null}

                  {item.type === 'shape' ? (
                    <div
                      className="h-full w-full rounded-[22px]"
                      style={{
                        background: item.fillColor || DEFAULT_SHAPE_FILL,
                        borderColor: item.strokeColor || DEFAULT_SHAPE_STROKE,
                        borderWidth: item.strokeWidth || DEFAULT_SHAPE_STROKE_WIDTH,
                        borderStyle: 'solid',
                      }}
                    />
                  ) : null}

                  {item.type === 'line' ? (
                    <svg className="h-full w-full overflow-visible" viewBox={`0 0 ${item.width} ${item.height}`}>
                      <line
                        x1={item.points?.[0]?.x ?? 0}
                        y1={item.points?.[0]?.y ?? 0}
                        x2={item.points?.[1]?.x ?? item.width}
                        y2={item.points?.[1]?.y ?? item.height}
                        stroke={item.strokeColor || DEFAULT_LINE_COLOR}
                        strokeWidth={item.strokeWidth || DRAW_STROKE_WIDTH}
                        strokeLinecap="round"
                      />
                    </svg>
                  ) : null}

                  {item.type === 'loading' ? (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-4 rounded-[22px] bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] px-6 text-center">
                      <Loader2 className="h-8 w-8 animate-spin text-slate-200" />
                      <div className="space-y-2">
                        <div className="text-[13px] font-medium text-slate-100">
                          {item.prompt || 'AI 正在处理中'}
                        </div>
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

                  {isSelected && item.type !== 'line' ? (
                    <>
                      <div
                        className={`pointer-events-none absolute inset-0 border ${
                          item.type === 'image' || item.type === 'text' ? '' : 'rounded-[22px]'
                        } ${
                          item.type === 'text'
                            ? 'border-[#8ea4c7]/80'
                            : 'border-[#7b90b3] shadow-[0_0_0_1px_rgba(123,144,179,0.3)]'
                        }`}
                      />

                      {!cropState && !isTextEditing
                        ? resizeHandles.map(({ handle, style }) => (
                            <button
                              key={handle}
                              type="button"
                              onPointerDown={(event) => onResizeHandlePointerDown(event, item, handle)}
                              className="absolute h-3 w-3 rounded-[3px] border border-[#c8d2e8] bg-[#f8fbff] shadow-[0_0_0_1px_rgba(123,144,179,0.25)]"
                              style={style}
                            />
                          ))
                        : null}
                    </>
                  ) : null}

                  {isSelected && item.type === 'line'
                    ? (item.points || []).slice(0, 2).map((point, index) => (
                        <button
                          key={index}
                          type="button"
                          onPointerDown={(event) =>
                            onLineEndpointPointerDown(event, item, index === 0 ? 0 : 1)
                          }
                          className="absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#c8d2e8] bg-[#f8fbff]"
                          style={{
                            left: point?.x ?? 0,
                            top: point?.y ?? 0,
                          }}
                        />
                      ))
                    : null}
                </div>
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

          {linePreviewItem ? (
            <div
              className="absolute pointer-events-none"
              style={{
                left: linePreviewItem.x,
                top: linePreviewItem.y,
                width: linePreviewItem.width,
                height: linePreviewItem.height,
              }}
            >
              <svg className="h-full w-full" viewBox={`0 0 ${linePreviewItem.width} ${linePreviewItem.height}`}>
                <line
                  x1={linePreviewItem.points?.[0]?.x ?? 0}
                  y1={linePreviewItem.points?.[0]?.y ?? 0}
                  x2={linePreviewItem.points?.[1]?.x ?? linePreviewItem.width}
                  y2={linePreviewItem.points?.[1]?.y ?? linePreviewItem.height}
                  stroke={linePreviewItem.strokeColor || DEFAULT_LINE_COLOR}
                  strokeWidth={linePreviewItem.strokeWidth || DRAW_STROKE_WIDTH}
                  strokeLinecap="round"
                />
              </svg>
            </div>
          ) : null}
        </div>

        <div className="absolute left-5 top-1/2 z-20 -translate-y-1/2 rounded-[26px] border border-white/[0.08] bg-[#171b22]/95 p-2.5 shadow-[0_20px_60px_rgba(0,0,0,0.32)] backdrop-blur-xl">
          <div className="flex flex-col items-center gap-1.5">
            <ToolbarButton icon={MousePointer2} label="选择" active={tool === 'select'} onClick={() => setTool('select')} />
            <ToolbarButton icon={ImagePlus} label="导入图片" onClick={() => imageInputRef.current?.click()} />
            {false ? (
              <ToolbarButton icon={Video} label="导入视频" onClick={() => videoInputRef.current?.click()} />
            ) : null}
            <div className="my-1 h-px w-6 bg-white/[0.1]" />
            <ToolbarButton icon={Pencil} label="画笔" active={tool === 'draw'} onClick={() => setTool('draw')} />
            <ToolbarButton icon={Slash} label="线段" active={tool === 'line'} onClick={() => setTool('line')} />
            <ToolbarButton icon={Type} label="文字" active={tool === 'text'} onClick={() => setTool('text')} />
            <ToolbarButton icon={RectangleHorizontal} label="矩形" active={tool === 'shape'} onClick={() => setTool('shape')} />
          </div>
        </div>

        {!cropState ? (
          <div className="absolute bottom-5 left-1/2 z-20 -translate-x-1/2">
            <div className="inline-flex items-center rounded-full border border-white/[0.08] bg-[#171b22]/95 px-2 py-1 shadow-[0_20px_50px_rgba(0,0,0,0.32)] backdrop-blur-xl">
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

        {cropState && selectedImageItem && selectedItemToolbarPosition ? (
          <div
            className="absolute z-30"
            style={{
              left: selectedItemToolbarPosition.left,
              top: selectedItemToolbarPosition.top,
              transform: 'translate(-50%, -100%)',
            }}
          >
            <FloatingToolbar>
              {CROP_ASPECT_OPTIONS.map((aspect) => (
                <button
                  key={aspect}
                  type="button"
                  onClick={() => onSelectCropAspect(aspect)}
                  className={`rounded-[12px] px-2.5 py-2 text-[12px] transition ${
                    cropState.aspect === aspect
                      ? 'bg-[#344967] text-white'
                      : 'text-slate-200 hover:bg-white/[0.07]'
                  }`}
                >
                  {aspect}
                </button>
              ))}
              <Divider />
              <ToolbarAction label="取消" icon={Trash2} onClick={onCancelCrop} />
              <ToolbarAction label="完成" icon={Crop} onClick={onConfirmCrop} />
            </FloatingToolbar>
          </div>
        ) : null}

        {!cropState && false && selectedImageItem && selectedItemToolbarPosition ? (
          <div
            className="absolute z-30"
            style={{
              left: selectedItemToolbarPosition.left,
              top: selectedItemToolbarPosition.top,
              transform: 'translate(-50%, -100%)',
            }}
          >
            <FloatingToolbar>
              <ToolbarAction
                label="重绘"
                icon={RefreshCcw}
                disabled={!isModelConfigured}
                iconOnly
                onClick={() => {
                  if (!isModelConfigured) {
                    onMissingRegenerateConfig();
                    return;
                  }
                  onOpenRegeneratePopover();
                }}
              />
              <ToolbarAction label="替换" icon={ImageUp} onClick={onOpenReplaceImage} />
              <ToolbarAction label="裁剪" icon={Crop} onClick={onStartCrop} />
              <Divider />
              <ToolbarAction label="复制" icon={Copy} onClick={onCopySelectedItem} />
              <ToolbarAction label="下载" icon={Download} onClick={() => void onDownloadSelectedImage()} />
              <ToolbarAction label="对话" icon={MessageSquarePlus} onClick={onAddSelectedImageToChat} />
              <ToolbarAction label="删除" icon={Trash2} onClick={onDeleteSelectedItem} />
            </FloatingToolbar>
          </div>
        ) : null}

        {!cropState && selectedImageItem && selectedItemToolbarPosition ? (
          <div
            className="absolute z-30"
            style={{
              left: selectedItemToolbarPosition.left,
              top: selectedItemToolbarPosition.top,
              transform: 'translate(-50%, -100%)',
            }}
          >
            <FloatingToolbar>
              <ToolbarAction
                label="重绘"
                icon={RefreshCcw}
                disabled={!isModelConfigured}
                iconOnly
                onClick={() => {
                  if (!isModelConfigured) {
                    onMissingRegenerateConfig();
                    return;
                  }
                  onOpenRegeneratePopover();
                }}
              />
              <ToolbarAction label="替换" icon={ImageUp} iconOnly onClick={onOpenReplaceImage} />
              <ToolbarAction label="裁剪" icon={Crop} iconOnly onClick={onStartCrop} />
              <Divider />
              <ToolbarAction label="复制" icon={Copy} iconOnly onClick={onCopySelectedItem} />
              <ToolbarAction
                label="下载"
                icon={Download}
                iconOnly
                onClick={() => void onDownloadSelectedImage()}
              />
              <ToolbarAction
                label="对话"
                icon={MessageSquarePlus}
                iconOnly
                onClick={onAddSelectedImageToChat}
              />
              <ToolbarAction label="删除" icon={Trash2} iconOnly onClick={onDeleteSelectedItem} />
            </FloatingToolbar>
          </div>
        ) : null}

        {!cropState && selectedTextItem && selectedItemToolbarPosition ? (
          <div
            className="absolute z-30"
            style={{
              left: selectedItemToolbarPosition.left,
              top: selectedItemToolbarPosition.top,
              transform: 'translate(-50%, -100%)',
            }}
          >
            <FloatingToolbar>
              <ToolbarAction label="编辑" icon={PencilLine} onClick={() => onStartTextEditing(selectedTextItem)} />
              <MiniSelect
                value={selectedTextItem.fontSize || DEFAULT_TEXT_FONT_SIZE}
                onChange={(value) => onUpdateSelectedItem({ fontSize: Number(value) })}
                options={[16, 20, 24, 28, 32, 40, 48].map((size) => ({
                  value: size,
                  label: `${size}px`,
                }))}
              />
              <MiniSelect
                value={selectedTextItem.fontWeight || DEFAULT_TEXT_FONT_WEIGHT}
                onChange={(value) => onUpdateSelectedItem({ fontWeight: Number(value) })}
                options={[
                  { value: 400, label: '常规' },
                  { value: 500, label: '中等' },
                  { value: 600, label: '加粗' },
                  { value: 700, label: '粗黑' },
                ]}
              />
              <ColorControl
                label="字色"
                value={selectedTextItem.color || DEFAULT_TEXT_COLOR}
                onChange={(value) => onUpdateSelectedItem({ color: value })}
              />
              <Divider />
              <button
                type="button"
                onClick={() => onUpdateSelectedItem({ textAlign: 'left' })}
                className={`inline-flex h-10 w-10 items-center justify-center rounded-[12px] transition ${
                  (selectedTextItem.textAlign || DEFAULT_TEXT_ALIGN) === 'left'
                    ? 'bg-[#344967] text-white'
                    : 'text-slate-200 hover:bg-white/[0.07]'
                }`}
              >
                <AlignLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onUpdateSelectedItem({ textAlign: 'center' })}
                className={`inline-flex h-10 w-10 items-center justify-center rounded-[12px] transition ${
                  (selectedTextItem.textAlign || DEFAULT_TEXT_ALIGN) === 'center'
                    ? 'bg-[#344967] text-white'
                    : 'text-slate-200 hover:bg-white/[0.07]'
                }`}
              >
                <AlignCenter className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onUpdateSelectedItem({ textAlign: 'right' })}
                className={`inline-flex h-10 w-10 items-center justify-center rounded-[12px] transition ${
                  (selectedTextItem.textAlign || DEFAULT_TEXT_ALIGN) === 'right'
                    ? 'bg-[#344967] text-white'
                    : 'text-slate-200 hover:bg-white/[0.07]'
                }`}
              >
                <AlignRight className="h-4 w-4" />
              </button>
              <Divider />
              <ToolbarAction label="复制" icon={Copy} onClick={onCopySelectedItem} />
              <ToolbarAction label="删除" icon={Trash2} onClick={onDeleteSelectedItem} />
            </FloatingToolbar>
          </div>
        ) : null}

        {!cropState && selectedLineItem && selectedItemToolbarPosition ? (
          <div
            className="absolute z-30"
            style={{
              left: selectedItemToolbarPosition.left,
              top: selectedItemToolbarPosition.top,
              transform: 'translate(-50%, -100%)',
            }}
          >
            <FloatingToolbar>
              <ColorControl
                label="颜色"
                value={selectedLineItem.strokeColor || DEFAULT_LINE_COLOR}
                onChange={(value) => onUpdateSelectedItem({ strokeColor: value })}
              />
              <MiniSelect
                value={selectedLineItem.strokeWidth || DRAW_STROKE_WIDTH}
                onChange={(value) => onUpdateSelectedItem({ strokeWidth: Number(value) })}
                options={[2, 4, 6, 8, 10, 12].map((size) => ({
                  value: size,
                  label: `${size}px`,
                }))}
              />
              <Divider />
              <ToolbarAction label="复制" icon={Copy} onClick={onCopySelectedItem} />
              <ToolbarAction label="删除" icon={Trash2} onClick={onDeleteSelectedItem} />
            </FloatingToolbar>
          </div>
        ) : null}

        {!cropState && selectedShapeItem && selectedItemToolbarPosition ? (
          <div
            className="absolute z-30"
            style={{
              left: selectedItemToolbarPosition.left,
              top: selectedItemToolbarPosition.top,
              transform: 'translate(-50%, -100%)',
            }}
          >
            <FloatingToolbar>
              <ColorControl
                label="填充"
                value={selectedShapeItem.fillColor || DEFAULT_SHAPE_FILL}
                onChange={(value) => onUpdateSelectedItem({ fillColor: value })}
              />
              <ColorControl
                label="描边"
                value={selectedShapeItem.strokeColor || DEFAULT_SHAPE_STROKE}
                onChange={(value) => onUpdateSelectedItem({ strokeColor: value })}
              />
              <MiniSelect
                value={selectedShapeItem.strokeWidth || DEFAULT_SHAPE_STROKE_WIDTH}
                onChange={(value) => onUpdateSelectedItem({ strokeWidth: Number(value) })}
                options={[1, 2, 3, 4, 6, 8].map((size) => ({
                  value: size,
                  label: `${size}px`,
                }))}
              />
              <Divider />
              <ToolbarAction label="复制" icon={Copy} onClick={onCopySelectedItem} />
              <ToolbarAction label="删除" icon={Trash2} onClick={onDeleteSelectedItem} />
            </FloatingToolbar>
          </div>
        ) : null}

        {!cropState && selectedDrawingItem && selectedItemToolbarPosition ? (
          <div
            className="absolute z-30"
            style={{
              left: selectedItemToolbarPosition.left,
              top: selectedItemToolbarPosition.top,
              transform: 'translate(-50%, -100%)',
            }}
          >
            <FloatingToolbar>
              <ToolbarAction label="复制" icon={Copy} onClick={onCopySelectedItem} />
              <ToolbarAction label="删除" icon={Trash2} onClick={onDeleteSelectedItem} />
            </FloatingToolbar>
          </div>
        ) : null}

        {actionPopover && selectedItemToolbarPosition ? (
          <div
            className="absolute z-40 w-[360px]"
            style={{
              left: selectedItemToolbarPosition.left,
              top: Math.max(20, selectedItemToolbarPosition.top - 12),
              transform: 'translate(-50%, -100%)',
            }}
          >
            <div
              onPointerDown={stopCanvasToolbarEvent}
              onMouseDown={stopCanvasToolbarEvent}
              onClick={stopCanvasToolbarEvent}
              onWheel={stopCanvasToolbarWheel}
              className="rounded-[24px] border border-white/[0.08] bg-[#11151c]/97 p-3.5 shadow-[0_24px_60px_rgba(0,0,0,0.38)] backdrop-blur-xl"
            >
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-[13px] font-semibold text-white">重绘当前图片</h3>
                  <p className="mt-1 text-[11px] text-slate-400">
                    将当前图片作为参考图，生成后直接替换当前元素。
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
                placeholder="描述你想保留或变化的内容"
                rows={4}
                className="w-full resize-none rounded-[18px] border border-white/[0.08] bg-white/[0.03] px-3.5 py-2.5 text-[13px] text-white outline-none placeholder:text-slate-500 focus:border-[#6f86ab]"
              />

              {!isModelConfigured ? (
                <div className="mt-3 rounded-[18px] border border-amber-300/20 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100">
                  当前所选模型未配置，请先前往模型设置页完成配置。
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
                  disabled={actionPopover.isSubmitting || !isModelConfigured}
                  onClick={() => void onRegenerateSubmit()}
                  className="inline-flex items-center gap-1.5 rounded-[18px] bg-[#344967] px-3.5 py-2 text-[13px] font-medium text-white transition hover:bg-[#3d5578] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {actionPopover.isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCcw className="h-4 w-4" />
                  )}
                  开始重绘
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
    </div>
  );
}
