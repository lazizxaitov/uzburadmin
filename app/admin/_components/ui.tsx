"use client";

import { ReactNode } from "react";

export function Card({
  children,
  className = "",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      {...props}
      className={`glass rounded-[28px] border border-[var(--stroke)] bg-[var(--surface)] p-5 shadow-[var(--shadow)] sm:p-6 ${className}`}
    >
      {children}
    </div>
  );
}

export function SectionTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-6">
      <h2 className="text-[1.75rem] leading-tight font-extrabold text-[var(--ink)] sm:text-2xl">
        {title}
      </h2>
      {subtitle ? (
        <p className="mt-2 max-w-2xl text-sm leading-6 font-medium text-[var(--muted)]">
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return (
    <span className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--muted)]">
      {children}
    </span>
  );
}

export function PrimaryButton({
  children,
  className = "",
  type = "button",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { className?: string }) {
  return (
    <button
      type={type}
      {...props}
      className={`rounded-2xl bg-[var(--brand-strong)] px-4 py-2.5 text-sm font-bold text-white shadow-[var(--shadow-soft)] transition hover:-translate-y-[1px] hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  className = "",
  type = "button",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { className?: string }) {
  return (
    <button
      type={type}
      {...props}
      className={`rounded-2xl border border-[var(--stroke)] bg-white/90 px-4 py-2.5 text-sm font-bold text-[var(--ink)] shadow-sm transition hover:-translate-y-[1px] hover:border-[var(--brand)] hover:bg-[var(--accent)] ${className}`}
    >
      {children}
    </button>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="glass relative z-10 w-full max-w-2xl rounded-[32px] border border-[var(--stroke)] bg-[var(--surface)] p-5 shadow-[var(--shadow)] sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h3 className="text-lg font-extrabold text-[var(--ink)]">{title}</h3>
          <GhostButton onClick={onClose}>Закрыть</GhostButton>
        </div>
        <div className="max-h-[70vh] overflow-y-auto pr-1">{children}</div>
        {footer ? <div className="mt-6">{footer}</div> : null}
      </div>
    </div>
  );
}
