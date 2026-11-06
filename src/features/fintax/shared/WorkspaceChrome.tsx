import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  Banknote, Building2, CalendarDays, ChevronRight, ClipboardCheck, FileText, FileUp, LayoutDashboard,
  LogOut, Plus, Search, X, type LucideIcon,
} from 'lucide-react';
import type { DemoDocument } from './demoWorkflow';
import fintaxLogo from './fintax-logo.png';

export interface NavEntry<Id extends string = string> {
  id: Id;
  label: string;
  icon: LucideIcon;
  group: string;
}

export const PALETTE = [
  ['#7c3aed', '#3b82f6'],
  ['#3b82f6', '#06b6d4'],
  ['#d97706', '#db2777'],
  ['#059669', '#06b6d4'],
  ['#0891b2', '#2563eb'],
  ['#db2777', '#9333ea'],
] as const;

export function CountUp({ value }: { value: number }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(value);
  const previous = useRef(value);

  useEffect(() => {
    if (reduce) {
      setShown(value);
      previous.current = value;
      return;
    }

    const start = performance.now();
    const initial = previous.current;
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / 700);
      setShown(Math.round(initial + (value - initial) * (1 - (1 - progress) ** 3)));
      if (progress < 1) frame = requestAnimationFrame(tick);
      else previous.current = value;
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [reduce, value]);

  return <>{shown}</>;
}

export function NavDrawer<Id extends string>({
  open, onClose, items, screen, onSelect, counts, userName, roleLabel, onSignOut,
}: {
  open: boolean;
  onClose: () => void;
  items: NavEntry<Id>[];
  screen: Id;
  onSelect: (id: Id) => void;
  counts: Record<string, number>;
  userName: string;
  roleLabel: string;
  onSignOut: () => void;
}) {
  const reduce = useReducedMotion();
  const drawerRef = useRef<HTMLElement>(null);
  const slideOffset = typeof document !== 'undefined'
    && (document.documentElement.dir === 'rtl' || document.body.dir === 'rtl') ? 20 : -20;
  const [moreOpen, setMoreOpen] = useState(false);
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLowerCase();
  const primaryItems = items.filter((item) =>
    (item.group === 'workspace' && !(roleLabel === 'Staff' && item.id === 'clients'))
    || (roleLabel === 'Staff' && item.id === 'tasks'));
  const additionalItems = items.filter((item) =>
    item.group !== 'workspace'
    && !(roleLabel === 'Staff' && item.id === 'tasks'));
  const matches = (item: NavEntry<Id>) => !normalizedQuery || item.label.toLowerCase().includes(normalizedQuery);
  const filteredPrimaryItems = primaryItems.filter(matches);
  const filteredAdditionalItems = additionalItems.filter(matches);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const drawer = drawerRef.current;
    document.body.style.overflow = 'hidden';
    const focusFrame = window.requestAnimationFrame(() => {
      drawer?.querySelector<HTMLElement>('[data-drawer-close]')?.focus();
    });
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab' || !drawer) return;
      const focusable = [...drawer.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, a[href], [tabindex]:not([tabindex="-1"])',
      )].filter((element) => element.getAttribute('aria-hidden') !== 'true');
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !drawer.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !drawer.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', closeOnEscape);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [onClose, open]);

  return (
    <AnimatePresence>
      {open && <>
        <motion.button
          type="button"
          aria-label="Close navigation"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.18 }}
          className="fixed inset-0 z-40 cursor-default bg-black/50 backdrop-blur-[2px] lg:hidden"
        />
        <motion.aside
          ref={drawerRef}
          id="demo-mobile-navigation"
          role="dialog"
          aria-modal="true"
          aria-label="Workspace navigation"
          initial={reduce ? false : { x: slideOffset, opacity: 0, scale: 0.99 }}
          animate={{ x: 0, opacity: 1, scale: 1 }}
          exit={reduce ? { opacity: 0 } : { x: slideOffset, opacity: 0, scale: 0.99 }}
          transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 34, mass: 0.75 }}
          className="fixed inset-y-0 start-0 z-50 flex w-[min(21rem,90vw)] origin-left flex-col border-e hairline bg-bg2 p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[20px_0_60px_-24px_rgba(15,23,42,.35)] lg:hidden"
        >
          <div className="flex items-center gap-3 border-b hairline pb-4">
            <img src={fintaxLogo} alt="FinTax Consulting" className="brand-logo h-auto w-28 shrink-0 object-contain" />
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-cyan/10 text-xs font-bold text-cyan">
                {userName.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{userName}</p>
                <p className="text-[11px] text-muted">{roleLabel} workspace</p>
              </div>
            </div>
            <button type="button" data-drawer-close aria-label="Close navigation" onClick={onClose} className="grid size-11 shrink-0 place-items-center rounded-xl border hairline text-muted transition hover:bg-ink/5 hover:text-ink">
              <X className="size-4" />
            </button>
          </div>
          <label className="mt-4 flex min-h-11 shrink-0 items-center gap-2.5 rounded-xl border hairline bg-bg px-3 text-muted transition focus-within:border-cyan/50 focus-within:ring-2 focus-within:ring-cyan/10">
            <Search className="size-4 shrink-0" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a page"
              aria-label="Search workspace pages"
              className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted"
            />
            {query && <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="rounded-md px-2 py-1 text-xs font-medium text-cyan hover:bg-cyan/10">Clear</button>}
          </label>
          <nav className="mt-4 min-h-0 flex-1 overflow-y-auto overscroll-contain pe-1" aria-label="Workspace">
            {filteredPrimaryItems.length > 0 && <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[.14em] text-muted">Workspace</p>}
            <div className="space-y-1">
            {filteredPrimaryItems.map((item, index) => (
              <motion.button
                key={item.id}
                type="button"
                onClick={() => onSelect(item.id)}
                aria-current={screen === item.id ? 'page' : undefined}
                initial={reduce ? false : { opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.04 * index }}
                className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-start text-sm transition-[background-color,color,transform] duration-150 active:scale-[.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan ${screen === item.id ? 'bg-cyan/10 font-semibold text-ink ring-1 ring-cyan/20' : 'text-muted hover:bg-ink/5 hover:text-ink'}`}
              >
                <item.icon className={`size-4 shrink-0 ${screen === item.id ? 'text-cyan' : ''}`} />
                <span className="flex-1 truncate">{item.label}</span>
                {counts[item.id] ? <span className={`grid min-w-6 place-items-center rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${screen === item.id ? 'bg-cyan/15 text-cyan' : 'bg-warn/15 text-warn'}`}>{counts[item.id]}</span> : null}
              </motion.button>
            ))}
            </div>
            {filteredAdditionalItems.length > 0 && <details open={moreOpen || Boolean(normalizedQuery) || filteredAdditionalItems.some((item) => item.id === screen)} onToggle={(event) => setMoreOpen(event.currentTarget.open)} className="group mt-4 border-t hairline pt-3">
              <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 rounded-xl px-3 text-sm font-medium text-muted transition hover:bg-ink/5 hover:text-ink focus-visible:outline-2 focus-visible:outline-cyan [&::-webkit-details-marker]:hidden">
                <Plus className="size-4 shrink-0" /><span className="flex-1">More tools</span>
                <ChevronRight className="size-4 transition-transform group-open:rotate-90" />
              </summary>
              <div className="mt-1 space-y-1 border-s hairline ps-2">
                {filteredAdditionalItems.map((item, index) => (
                  <motion.button
                    key={item.id}
                    type="button"
                    onClick={() => onSelect(item.id)}
                    aria-current={screen === item.id ? 'page' : undefined}
                    initial={reduce ? false : { opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.04 * (primaryItems.length + index) }}
                    className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-start text-sm transition-[background-color,color,transform] duration-150 active:scale-[.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan ${screen === item.id ? 'bg-cyan/10 font-semibold text-ink ring-1 ring-cyan/20' : 'text-muted hover:bg-ink/5 hover:text-ink'}`}
                  >
                    <item.icon className={`size-4 shrink-0 ${screen === item.id ? 'text-cyan' : ''}`} />
                    <span className="flex-1 truncate">{item.label}</span>
                    {counts[item.id] ? <span className={`grid min-w-6 place-items-center rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${screen === item.id ? 'bg-cyan/15 text-cyan' : 'bg-warn/15 text-warn'}`}>{counts[item.id]}</span> : null}
                  </motion.button>
                ))}
              </div>
            </details>}
            {normalizedQuery && filteredPrimaryItems.length === 0 && filteredAdditionalItems.length === 0 && (
              <p className="rounded-xl bg-bg px-3 py-4 text-sm text-muted">No pages match “{query}”.</p>
            )}
          </nav>
          <button type="button" onClick={onSignOut} className="mt-3 flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl border hairline bg-bg text-sm font-medium text-muted transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan">
            <LogOut className="size-4" />Sign out
          </button>
        </motion.aside>
      </>}
    </AnimatePresence>
  );
}

const STAFF_PRIMARY_TABS = [
  ['overview', 'Overview', LayoutDashboard],
  ['uploads', 'Inbox', FileUp],
  ['review', 'Review', ClipboardCheck],
  ['tasks', 'Tasks', CalendarDays],
] as const;

export function BottomBar({
  screen, role, onSelect, reviewCount, uploadCount, taskCount, onMore, moreActive = false, moreExpanded = false,
}: {
  screen: string;
  role: 'admin' | 'staff';
  onSelect: (id: 'overview' | 'documents' | 'uploads' | 'review' | 'banking' | 'clients' | 'tasks') => void;
  reviewCount: number;
  uploadCount: number;
  taskCount: number;
  onMore: () => void;
  moreActive?: boolean;
  moreExpanded?: boolean;
}) {
  const primaryTabs = role === 'admin'
    ? [
        ['overview', 'Overview', LayoutDashboard],
        ['uploads', 'Uploads', FileUp],
        ['review', 'Review', ClipboardCheck],
        ['clients', 'Clients', Building2],
      ] as const
    : STAFF_PRIMARY_TABS;

  return (
    <nav aria-label="Primary workspace navigation" className="workspace-bottom-nav fixed inset-x-0 bottom-0 z-30 px-3 pb-[calc(env(safe-area-inset-bottom)+10px)] pt-2 lg:hidden">
      <ul className="workspace-bottom-dock mx-auto grid max-w-xl grid-cols-5">
        {primaryTabs.flatMap(([id, label, Icon], index) => {
          const active = screen === id;
          const count = id === 'review' ? reviewCount : id === 'uploads' ? uploadCount : id === 'tasks' ? taskCount : 0;
          const tab = (
            <li key={id}>
              <button type="button" onClick={() => onSelect(id)} aria-current={active ? 'page' : undefined} className={`workspace-bottom-tab ${active ? 'is-active' : ''}`}>
                <span className="workspace-bottom-icon">
                  <Icon className="size-[19px]" strokeWidth={active ? 2.2 : 1.9} />
                  {count > 0 && <span className="absolute -end-2 -top-1.5 grid min-w-4 place-items-center rounded-full bg-warn px-1 text-[9px] font-semibold text-bg">{count}</span>}
                </span>
                <span className="workspace-bottom-label">{label}</span>
              </button>
            </li>
          );
          return index === 2
            ? [
                <li key="more">
                  <button type="button" onClick={onMore} aria-label="More workspace options" aria-expanded={moreExpanded} className={`workspace-bottom-tab workspace-bottom-tab--featured ${moreActive ? 'is-active' : ''}`}>
                    <span className="workspace-bottom-icon"><Plus className="size-6" strokeWidth={2} /></span>
                    <span className="workspace-bottom-label">More</span>
                  </button>
                </li>,
                tab,
              ]
            : [tab];
        })}
      </ul>
    </nav>
  );
}

export function DocCards({
  documents, onSelect, labelFor, formatBytes, renderStatus,
}: {
  documents: DemoDocument[];
  onSelect?: (document: DemoDocument) => void;
  labelFor: (category: DemoDocument['category']) => string;
  formatBytes: (bytes: number) => string;
  renderStatus: (document: DemoDocument) => ReactNode;
}) {
  const reduce = useReducedMotion();

  return (
    <ul className="divide-y divide-line/10">
      {documents.map((item, index) => (
        <motion.li key={item.id} layout={!reduce} initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index, 8) * 0.04 }}>
          <button type="button" onClick={() => onSelect?.(item)} className="flex min-h-20 w-full items-center gap-3 px-4 py-3.5 text-start active:bg-ink/5">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-violet/10 text-violet"><FileText className="size-4" /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{item.name}</span>
              <span className="mt-0.5 block truncate text-[11px] text-muted">{labelFor(item.category)} · {formatBytes(item.sizeBytes)} · {new Date(item.createdAt).toLocaleDateString()}</span>
              <span className="mt-1.5 flex flex-wrap items-center gap-2">
                {renderStatus(item)}
                {item.confidence > 0 && <span className="text-[11px] text-muted">{Math.round(item.confidence * 100)}%</span>}
                {item.processingProgress != null && item.status === 'processing' && <span className="text-[11px] text-muted">{item.processingProgress}%</span>}
              </span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted rtl:rotate-180" />
          </button>
        </motion.li>
      ))}
    </ul>
  );
}

export function Stepper({ steps }: { steps: [string, string, string][] }) {
  const reduce = useReducedMotion();
  return (
    <ol className="grid gap-5 p-5 sm:grid-cols-5 sm:gap-2">
      {steps.map(([number, title, detail], index) => (
        <li key={number} className="relative flex gap-3 sm:flex-col sm:gap-2">
          <motion.span
            initial={reduce ? false : { scale: 0 }}
            whileInView={{ scale: 1 }}
            viewport={{ once: true }}
            transition={{ type: 'spring', stiffness: 380, damping: 18, delay: index * 0.12 }}
            className="relative z-10 grid size-10 shrink-0 place-items-center rounded-full bg-cyan/10 font-mono text-xs text-cyan ring-1 ring-cyan/30"
          >{number}</motion.span>
          <span className="min-w-0">
            <span className="block text-xs font-semibold">{title}</span>
            <span className="mt-1 block text-[11px] leading-4 text-muted">{detail}</span>
          </span>
          {index < steps.length - 1 && (
            <motion.span
              aria-hidden="true"
              initial={reduce ? false : { opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.2 + index * 0.12 }}
              className="absolute -bottom-3 start-5 top-11 w-px bg-cyan/30 sm:bottom-auto sm:start-12 sm:top-5 sm:h-px sm:w-[calc(100%-2.5rem)]"
            />
          )}
        </li>
      ))}
    </ol>
  );
}
