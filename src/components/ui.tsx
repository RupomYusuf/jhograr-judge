"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Button({
  variant = "primary",
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "quiet" | "danger";
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-[15px] font-medium transition-all duration-200 disabled:opacity-40 disabled:pointer-events-none";
  const styles = {
    primary: "bg-terra text-white hover:bg-terra-deep shadow-[0_2px_10px_rgba(192,91,59,0.25)]",
    ghost: "border border-line bg-card text-ink hover:border-terra/50 hover:text-terra-deep",
    quiet: "text-ink-soft hover:text-ink",
    danger: "text-terra-deep hover:bg-terra/10",
  }[variant];
  return (
    <button className={`${base} ${styles} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function Card({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={style}
      className={`rounded-3xl border border-line bg-card p-6 shadow-[0_1px_3px_rgba(43,37,33,0.05)] ${className}`}
    >
      {children}
    </div>
  );
}

export function Chip({
  children,
  onClick,
  selected,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  selected?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full border px-4 py-2 text-sm transition-all duration-150 ${
        selected
          ? "border-terra bg-terra text-white"
          : "border-line bg-card text-ink hover:border-terra/60 hover:text-terra-deep"
      } disabled:opacity-40`}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline,
  autoFocus,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <label className="block">
      {label ? <span className="mb-1.5 block text-sm font-medium text-ink-soft">{label}</span> : null}
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          rows={4}
          className="w-full rounded-2xl border border-line bg-card px-4 py-3 text-[15px] leading-relaxed placeholder:text-ink-soft/50 focus:border-terra"
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className="w-full rounded-full border border-line bg-card px-4 py-2.5 text-[15px] placeholder:text-ink-soft/50 focus:border-terra"
        />
      )}
    </label>
  );
}

export function JudgeMark({ thinking }: { thinking?: boolean }) {
  return (
    <span className="relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line bg-card font-display text-[15px] text-terra-deep">
      J
      {thinking ? (
        <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 animate-breathe rounded-full bg-terra" />
      ) : null}
    </span>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-ink-soft">
      <span className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 animate-breathe rounded-full bg-terra"
            style={{ animationDelay: `${i * 0.25}s` }}
          />
        ))}
      </span>
      {label}
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-soft">{children}</p>
  );
}
