import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface ToolbarButtonProps {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export function ToolbarButton({
  icon: Icon,
  label,
  active,
  disabled,
  onClick,
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={`inline-flex h-10 w-10 items-center justify-center rounded-[16px] transition ${
        active
          ? 'bg-white/[0.12] text-white'
          : 'text-slate-200 hover:bg-white/[0.08] hover:text-white'
      } ${disabled ? 'cursor-not-allowed opacity-40' : ''}`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

interface ContextButtonProps {
  icon: LucideIcon;
  label: string;
  textOnly?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export function ContextButton({
  icon: Icon,
  label,
  textOnly,
  disabled,
  onClick,
}: ContextButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-10 items-center gap-1.5 rounded-[11px] px-2.5 text-[13px] font-medium text-slate-100 transition ${
        textOnly ? 'min-w-[124px] justify-center' : 'justify-center'
      } ${disabled ? 'cursor-not-allowed opacity-40' : 'hover:bg-white/[0.08]'}`}
    >
      <Icon className="h-4 w-4" />
      {textOnly ? <span>{label}</span> : null}
    </button>
  );
}
