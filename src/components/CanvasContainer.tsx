import React, { useMemo, useRef, useState } from 'react';
import { ImagePlus, Trash2, ZoomIn, ZoomOut } from 'lucide-react';
import { CanvasItem, ViewState } from '../types';

interface CanvasContainerProps {
  items: CanvasItem[];
  setItems: React.Dispatch<React.SetStateAction<CanvasItem[]>>;
  view: ViewState;
  setView: React.Dispatch<React.SetStateAction<ViewState>>;
  onAddToChat: (item: CanvasItem) => void;
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

const MIN_SCALE = 0.2;
const MAX_SCALE = 4;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export default function CanvasContainer({
  items,
  setItems,
  view,
  setView,
  onAddToChat,
}: CanvasContainerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dragState, setDragState] = useState<DragState>({ type: 'none' });

  const selectedItemId = view.selectedItemIds[0];
  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedItemId) || null,
    [items, selectedItemId]
  );

  const zoomAt = (clientX: number, clientY: number, nextScale: number) => {
    const container = containerRef.current;
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
    if (target.closest('[data-canvas-item="true"]')) return;

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

  const deleteSelected = () => {
    if (!selectedItemId) return;
    setItems((previous) => previous.filter((item) => item.id !== selectedItemId));
    setView((previous) => ({ ...previous, selectedItemIds: [] }));
  };

  return (
    <section className="relative flex h-full flex-1 overflow-hidden bg-[#090d16]">
      <div className="pointer-events-none absolute top-4 left-4 z-20 rounded-lg border border-white/15 bg-black/35 p-2 text-xs text-slate-200 backdrop-blur">
        缩放: {Math.round(view.scale * 100)}%
      </div>

      <div className="absolute right-4 top-4 z-20 flex items-center gap-2 rounded-lg border border-white/15 bg-black/35 p-2 backdrop-blur">
        <button
          type="button"
          onClick={() => {
            const rect = containerRef.current?.getBoundingClientRect();
            const clientX = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
            const clientY = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
            zoomAt(clientX, clientY, view.scale * 0.9);
          }}
          className="rounded bg-white/10 p-1.5 text-slate-100 hover:bg-white/20"
          title="缩小"
        >
          <ZoomOut className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={() => {
            const rect = containerRef.current?.getBoundingClientRect();
            const clientX = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
            const clientY = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
            zoomAt(clientX, clientY, view.scale * 1.1);
          }}
          className="rounded bg-white/10 p-1.5 text-slate-100 hover:bg-white/20"
          title="放大"
        >
          <ZoomIn className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={() => selectedItem && onAddToChat(selectedItem)}
          disabled={!selectedItem || selectedItem.type !== 'image'}
          className="rounded bg-white/10 p-1.5 text-slate-100 hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
          title="引用到对话"
        >
          <ImagePlus className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={deleteSelected}
          disabled={!selectedItem}
          className="rounded bg-white/10 p-1.5 text-slate-100 hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
          title="删除"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div
        ref={containerRef}
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
            backgroundSize: `${24 * view.scale}px ${24 * view.scale}px`,
            backgroundImage:
              'linear-gradient(rgba(148,163,184,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.12) 1px, transparent 1px)',
            backgroundPosition: `${view.x}px ${view.y}px`,
          }}
        />

        <div
          className="absolute top-0 left-0 origin-top-left"
          style={{
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
          }}
        >
          {items.map((item) => (
            <div
              key={item.id}
              data-canvas-item="true"
              onPointerDown={(event) => handleItemPointerDown(event, item)}
              className={`absolute overflow-hidden rounded-xl border ${
                selectedItemId === item.id
                  ? 'border-sky-400 shadow-[0_0_0_1px_rgba(56,189,248,0.5)]'
                  : 'border-white/10'
              }`}
              style={{
                left: item.x,
                top: item.y,
                width: item.width,
                height: item.height,
                background:
                  item.type === 'loading'
                    ? 'rgba(15,23,42,0.85)'
                    : item.type === 'text'
                      ? 'rgba(15,23,42,0.6)'
                      : '#0f172a',
              }}
            >
              {item.type === 'image' ? (
                <img src={item.content} alt={item.prompt || 'canvas image'} className="h-full w-full object-cover" />
              ) : null}
              {item.type === 'text' ? (
                <div className="h-full w-full p-3 text-sm leading-6 text-slate-100">{item.content}</div>
              ) : null}
              {item.type === 'loading' ? (
                <div className="flex h-full w-full items-center justify-center text-sm text-slate-300">
                  正在生成...
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
