import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

/** Shared building blocks for the "Meta AI" design. Colours come only from theme tokens (globals.css). */

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

const base = 'inline-flex items-center justify-center gap-1.5 rounded-full font-semibold transition duration-150 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer';
const variants: Record<Variant, string> = {
  primary: 'bg-grad text-white shadow-sm hover:brightness-110',
  secondary: 'border border-border bg-surface text-fg shadow-card hover:bg-surface-2',
  ghost: 'text-muted hover:bg-surface-2 hover:text-fg',
  danger: 'border border-danger/40 text-danger hover:bg-danger-soft',
};
const sizes: Record<Size, string> = { sm: 'min-h-9 px-3 text-sm', md: 'min-h-11 px-4 text-sm' };

export const btn = (variant: Variant = 'primary', size: Size = 'md', extra?: string) => cx(base, variants[variant], sizes[size], extra);

export function Button({ variant, size, className, ...p }: ComponentProps<'button'> & { variant?: Variant; size?: Size }) {
  return <button className={btn(variant, size, className)} {...p} />;
}

export function ButtonLink({ variant, size, className, ...p }: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={btn(variant, size, className)} {...p} />;
}

const field = 'w-full border border-border-strong bg-surface px-4 py-2 text-sm text-fg placeholder:text-subtle ' +
  'transition focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent-soft disabled:opacity-60';

export const Input = ({ className, ...p }: ComponentProps<'input'>) => <input className={cx(field, 'min-h-11 rounded-full file:mr-3', className)} {...p} />;
export const Textarea = ({ className, ...p }: ComponentProps<'textarea'>) => <textarea className={cx(field, 'rounded-2xl', className)} {...p} />;
export const Select = ({ className, ...p }: ComponentProps<'select'>) => <select className={cx(field, 'min-h-11 w-auto rounded-full pr-8', className)} {...p} />;

/** Visible label above a control, with optional hint/error under it. */
export function Field({ label, hint, error, children, className }: { label: string; hint?: string; error?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block space-y-1.5', className)}>
      <span className="caps text-subtle">{label}</span>
      {children}
      {error ? <span role="alert" className="block text-sm text-danger">{error}</span>
        : hint ? <span className="block text-xs text-subtle">{hint}</span> : null}
    </label>
  );
}

export const Card = ({ className, ...p }: ComponentProps<'div'>) =>
  <div className={cx('rounded-2xl border border-border/70 bg-surface p-4 shadow-card', className)} {...p} />;

type Tone = 'neutral' | 'ok' | 'warn' | 'danger';
const tones: Record<Tone, string> = {
  neutral: 'border-border-strong text-muted',
  ok: 'border-accent-line bg-accent-soft text-accent',
  warn: 'border-warn/40 bg-warn-soft text-warn',
  danger: 'border-danger/40 bg-danger-soft text-danger',
};
export const Badge = ({ tone = 'neutral', className, ...p }: ComponentProps<'span'> & { tone?: Tone }) =>
  <span className={cx('inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold leading-4', tones[tone], className)} {...p} />;

/** Badge tone for a document status. */
export const statusTone = (s: string): Tone =>
  s === 'live' ? 'ok' : s === 'failed' ? 'danger' : s === 'review' ? 'warn' : 'neutral';

/** Small semibold caption label above a section. */
export const Label = ({ className, ...p }: ComponentProps<'p'>) =>
  <p className={cx('caps text-subtle', className)} {...p} />;

export function PageHeader({ title, description, actions, eyebrow }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end gap-3">
      <div className="mr-auto min-w-0">
        {eyebrow && <Label className="mb-1">{eyebrow}</Label>}
        <h1 className="text-2xl font-semibold tracking-tight text-fg">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Brand mark: a Meta-AI-style gradient ring. */
export const Logo = ({ className = 'size-6' }: { className?: string }) => (
  <span aria-hidden className={cx('inline-block shrink-0 rounded-full bg-grad p-[3px]', className)}>
    <span className="block size-full rounded-full bg-bg" />
  </span>
);

export const Empty = ({ children }: { children: ReactNode }) =>
  <p className="rounded-2xl border border-dashed border-border-strong p-8 text-center text-sm text-muted">{children}</p>;

export const Notice = ({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) => (
  <p role={tone === 'danger' ? 'alert' : 'status'} className={cx('rounded-2xl border px-4 py-2.5 text-sm', tones[tone])}>{children}</p>
);

/** Inline Lucide-style icons (24px grid, stroke). Decorative: hidden from screen readers. */
const paths = {
  chat: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  book: 'M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2zM22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5',
  flag: 'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7',
  layers: 'M12 2 2 7l10 5 10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42',
  moon: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z',
  monitor: 'M2 3h20v14H2zM8 21h8M12 17v4',
  plus: 'M12 5v14M5 12h14',
  check: 'M20 6 9 17l-5-5',
  x: 'M18 6 6 18M6 6l12 12',
  menu: 'M3 6h18M3 12h18M3 18h18',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  external: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3',
  arrowLeft: 'M19 12H5M12 19l-7-7 7-7',
  arrowRight: 'M5 12h14M12 5l7 7-7 7',
  send: 'M22 2 11 13M22 2l-7 20-4-9-9-4z',
  trash: 'M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6',
  play: 'M5 3l14 9-14 9z',
  copy: 'M9 9h13v13H9zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1',
  refresh: 'M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15',
  sparkles: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z',
} as const;
export type IconName = keyof typeof paths;

export function Icon({ name, className = 'size-4' }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={cx('shrink-0', className)}>
      <path d={paths[name]} />
    </svg>
  );
}
