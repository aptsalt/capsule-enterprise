"use client";

import { useEffect, useRef } from "react";
import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  ReactNode,
} from "react";
import { useStore } from "@/lib/store";

/* ============================================================
   CAPSULE UI primitives — light-theme, ported 1:1 from
   factory.html. Tailwind v4 + the CSS custom-property palette
   declared in globals.css. Named exports only.
   ============================================================ */

/** Join truthy class fragments. No deps — keeps the bundle lean. */
export function cn(
  ...parts: Array<string | false | null | undefined>
): string {
  return parts.filter(Boolean).join(" ");
}

/* ---------- Pill ----------------------------------------------------------
   The toggleable rounded skill-selector pill (`.skpill`). Violet when active. */
type PillProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
};

export function Pill({ active, className, children, ...rest }: PillProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        "flex-none cursor-pointer whitespace-nowrap rounded-full border px-[11px] py-[5px] text-[11.5px] font-semibold transition-colors",
        active
          ? "border-[#cfe0fd] bg-[var(--activebg)] text-[var(--blue)] active:bg-[#dbe7fd]"
          : "border-[var(--line)] text-[var(--mut)] hover:border-[#cfe0fd] hover:bg-[var(--hover)] hover:text-[var(--ink)] active:bg-[var(--activebg)]",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ---------- ActionButton --------------------------------------------------
   The super-saiyan ACTION treatment shared by every action element (Capture,
   Use this session, Adopt, Pin, Versions, Graph, Details, Run, …). A clear
   light button wearing a 1.5px fluorescent green-yellow border with dark ink;
   hovering blooms the chartreuse glow, pressing sinks it. The calmer
   `secondary` variant keeps the same geometry but a neutral hairline border so
   non-primary actions don't all shout at once.

   Exported both as a component AND as className constants (BTN_ACTION /
   BTN_ACTION_SECONDARY) so existing raw <button> sites can opt in by class
   alone without restructuring. */
export const BTN_ACTION =
  "inline-flex items-center justify-center gap-[6px] rounded-[8px] border-[1.5px] border-[var(--ss)] bg-white px-[11px] py-[6px] text-[12px] font-semibold text-[var(--ink)] transition-[box-shadow,background-color,border-color] hover:bg-[var(--ss-tint)] hover:shadow-[0_0_10px_var(--ss-glow)] active:bg-[var(--ss-tint2)] active:shadow-[0_0_4px_var(--ss-glow)] disabled:opacity-50 disabled:shadow-none disabled:hover:bg-white";

export const BTN_ACTION_SECONDARY =
  "inline-flex items-center justify-center gap-[6px] rounded-[8px] border border-[var(--line)] bg-white px-[11px] py-[6px] text-[12px] font-semibold text-[var(--ink2)] transition-[box-shadow,background-color,border-color] hover:border-[var(--ss)] hover:bg-[var(--ss-tint)] active:bg-[var(--ss-tint2)] disabled:opacity-50";

type ActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "action" | "secondary";
};

export function ActionButton({
  variant = "action",
  className,
  children,
  type,
  ...rest
}: ActionButtonProps) {
  return (
    <button
      type={type ?? "button"}
      className={cn(
        variant === "action" ? BTN_ACTION : BTN_ACTION_SECONDARY,
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ---------- Toggle --------------------------------------------------------
   THE shared on/off pill — the single source of truth for the Capsule toggle
   and the Agentic toggle so the two always match exactly. ON state is the
   fluorescent green-yellow fill with the soft glow and a dark inner track +
   white knob; OFF is a calm neutral pill. Geometry is ported 1:1 from the
   original Capsule toggle (16×28 track, 12px knob). */
type ToggleProps = {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: ReactNode;
  title?: string;
  disabled?: boolean;
  className?: string;
};

export function Toggle({
  checked,
  onChange,
  label,
  title,
  disabled,
  className,
}: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-pressed={checked}
      title={title}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={cn(
        "flex shrink-0 items-center gap-[6px] rounded-[8px] border px-[8px] py-1 text-[11px] font-semibold transition-[background-color,border-color,box-shadow] disabled:opacity-50",
        checked
          ? "border-[var(--ss)] bg-[var(--ss)] text-[var(--ss-ink)] shadow-[0_0_10px_var(--ss-glow)]"
          : "border-[var(--line)] text-[var(--mut)] hover:bg-[var(--hover)]",
        className,
      )}
    >
      <span
        className={cn(
          "relative h-[16px] w-[28px] flex-none rounded-full transition-colors",
          checked ? "bg-[var(--ss-ink)]" : "bg-[#d4d7dc]",
        )}
      >
        <span
          className={cn(
            "absolute top-[2px] h-[12px] w-[12px] rounded-full bg-white transition-[left] duration-200 ease-out",
            checked ? "left-[14px]" : "left-[2px]",
          )}
        />
      </span>
      {label}
    </button>
  );
}

/* ---------- Chip ----------------------------------------------------------
   Mono metric chip (`.chip`). Tones: default · save · fed · uc. */
type ChipTone = "default" | "save" | "fed" | "uc";
const CHIP_TONES: Record<ChipTone, string> = {
  default: "bg-[var(--side2)] text-[var(--ink2)]",
  save: "bg-[var(--green-bg)] text-[var(--green)]",
  fed: "bg-[#e9f6fd] text-[#0369a1]",
  uc: "border border-[var(--line)] bg-white text-[var(--mut)]",
};

type ChipProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: ChipTone;
};

export function Chip({ tone = "default", className, children, ...rest }: ChipProps) {
  return (
    <span
      className={cn(
        "mono inline-flex items-center gap-[5px] rounded-[6px] px-[7px] py-[3px] text-[10.5px] font-semibold",
        CHIP_TONES[tone],
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}

/* ---------- Card ----------------------------------------------------------
   White surface with hairline border (`.ac` / `.skill-card`). */
type CardProps = HTMLAttributes<HTMLDivElement> & {
  hover?: boolean;
  selected?: boolean;
};

export function Card({ hover, selected, className, children, ...rest }: CardProps) {
  // A card is interactive when it opts into hover lift OR carries a click
  // handler — only those get the clickable affordances (cursor + press).
  const interactive = hover || typeof rest.onClick === "function";
  return (
    <div
      className={cn(
        "rounded-[11px] border bg-white p-3 transition-[box-shadow,border-color]",
        selected
          ? "border-[#bcd2fb] shadow-[0_0_0_1px_#bcd2fb_inset]"
          : "border-[var(--line)]",
        interactive &&
          "cursor-pointer hover:border-[#cfe0fd] hover:shadow-[0_4px_18px_#0000000a] active:border-[#bcd2fb] active:shadow-[0_0_0_1px_#bcd2fb_inset]",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

/* ---------- Switch --------------------------------------------------------
   The shared toggle (`.sw`). 38×22 track, 18px knob. The ON track color is
   driven by an INLINE style so it can never be lost to Tailwind class ordering
   or a default `bg-*` winning the cascade — the blue ON state must be
   unmistakable. */
type SwitchTone = "violet" | "green" | "blue";
const SWITCH_ON_COLOR: Record<SwitchTone, string> = {
  violet: "var(--violet)",
  green: "var(--green)",
  blue: "#2b6cf0",
};

type SwitchProps = {
  checked: boolean;
  onChange: (next: boolean) => void;
  tone?: SwitchTone;
  disabled?: boolean;
  "aria-label"?: string;
  className?: string;
};

export function Switch({
  checked,
  onChange,
  tone = "blue",
  disabled,
  className,
  ...rest
}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      // Inline backgroundColor guarantees the solid ON fill applies; the OFF
      // grey comes from the class below (no inline style → class wins).
      style={checked ? { backgroundColor: SWITCH_ON_COLOR[tone] } : undefined}
      className={cn(
        "relative h-[22px] w-[38px] flex-none rounded-full transition-[background-color,box-shadow] duration-200 ease-out disabled:opacity-50",
        checked
          ? "shadow-[inset_0_0_0_1px_#1f5bd6]"
          : "bg-[#d4d7dc]",
        className,
      )}
      {...rest}
    >
      <span
        className={cn(
          "absolute top-[2px] h-[18px] w-[18px] rounded-full bg-white transition-all duration-200 ease-out",
          checked
            ? "left-[18px] shadow-[0_1px_4px_#0000004d,0_0_1px_#0000002e]"
            : "left-[2px] shadow-[0_1px_3px_#0003]",
        )}
      />
    </button>
  );
}

/* ---------- IconButton ----------------------------------------------------
   Square 30×30 icon affordance (`.iconbtn` / `.tool-ic`). */
type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
};

export function IconButton({
  active,
  className,
  children,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        "grid h-[30px] w-[30px] cursor-pointer place-items-center rounded-[7px] border transition-colors",
        active
          ? "border-[#cfe0fd] bg-[var(--activebg)] text-[var(--blue)] active:bg-[#dbe7fd]"
          : "border-transparent text-[var(--mut)] hover:border-[#cfe0fd] hover:bg-[var(--hover)] hover:text-[var(--ink)] active:bg-[var(--activebg)] active:text-[var(--blue)]",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ---------- Badge ---------------------------------------------------------
   Tiny mono status badge (`.lbadge` / `.pbadge` / `.st`). */
type BadgeTone = "latest" | "blue" | "amber" | "green" | "violet" | "muted";
const BADGE_TONES: Record<BadgeTone, string> = {
  latest: "bg-[var(--blue)] text-white",
  blue: "bg-[var(--blue)] text-white",
  amber: "bg-[var(--amber-bg)] text-[var(--amber)]",
  green: "bg-[var(--green-bg)] text-[var(--green)]",
  violet: "bg-[#f1e9fe] text-[var(--violet)]",
  muted: "bg-[var(--side2)] text-[var(--mut)]",
};

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
};

export function Badge({ tone = "muted", className, children, ...rest }: BadgeProps) {
  // Badges are status markers by default; only a click-handler'd badge becomes
  // an affordance, getting cursor + a subtle press dim so it reads as tappable.
  const interactive = typeof rest.onClick === "function";
  return (
    <span
      className={cn(
        "mono inline-block rounded-[6px] px-[7px] py-[2px] text-[9.5px] font-bold uppercase tracking-[.04em]",
        BADGE_TONES[tone],
        interactive &&
          "cursor-pointer transition-[filter] hover:brightness-95 active:brightness-90",
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}

/* ---------- Bump ----------------------------------------------------------
   Semver bump pill (`.bump.major/.minor/.patch`). */
export type BumpKind = "major" | "minor" | "patch";
const BUMP_TONES: Record<BumpKind, string> = {
  major: "bg-[#fdecef] text-[var(--rose)]",
  minor: "bg-[#e9f6fd] text-[#0369a1]",
  patch: "bg-[#f1e9fe] text-[var(--violet)]",
};

type BumpProps = HTMLAttributes<HTMLSpanElement> & {
  kind: BumpKind;
};

export function Bump({ kind, className, children, ...rest }: BumpProps) {
  return (
    <span
      className={cn(
        "mono rounded-[6px] px-[7px] py-[2px] text-[9.5px] font-bold uppercase tracking-[.04em]",
        BUMP_TONES[kind],
        className,
      )}
      {...rest}
    >
      {children ?? kind}
    </span>
  );
}

/* ---------- SidePanel -----------------------------------------------------
   The slide-in column inner (`.sp-inner`): shared chrome of an icon-less
   title, an optional context action, and a close ✕. The outer grid-column
   animation lives in the page layout; this renders the 360px panel body. */
type SidePanelProps = {
  title: ReactNode;
  onClose: () => void;
  action?: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  /** Optional tabs / tool-row rendered between the head and the scroll area. */
  toolbar?: ReactNode;
  className?: string;
};

export function SidePanel({
  title,
  onClose,
  action,
  icon,
  toolbar,
  children,
  className,
}: SidePanelProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Move focus into the panel on open (focus-follows-panel for keyboard/AT).
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div
      className={cn(
        // w-full + min-w-0 so the inner content fills the resizable column's
        // full store.panelWidth — dragging the seam wider expands the body
        // instead of leaving an empty gutter beside a fixed 360px box.
        "flex h-full min-h-0 w-full min-w-0 flex-col border-l border-[var(--line)] bg-white",
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b border-[var(--line)] px-[13px] pb-[11px] pt-3">
        {icon && (
          <div className="grid h-6 w-6 flex-none place-items-center rounded-[7px]">
            {icon}
          </div>
        )}
        <h3
          ref={headingRef}
          tabIndex={-1}
          className="m-0 flex-1 text-[14px] font-bold outline-none"
        >
          {title}
        </h3>
        {action}
        <button
          type="button"
          aria-label="Close panel"
          onClick={onClose}
          className="grid h-[26px] w-[26px] flex-none place-items-center rounded-[7px] text-[var(--mut)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--ink)]"
        >
          ✕
        </button>
      </div>
      {toolbar}
      <div className="min-h-0 flex-1 overflow-y-auto px-[13px] pb-[18px] pt-3">
        {children}
      </div>
    </div>
  );
}

/* ---------- Toast ---------------------------------------------------------
   Fixed bottom-center confirmation, driven by store.toast. Auto-dismisses
   after a short delay; mirrors the factory's global `.toast` on each action. */
export function Toast() {
  const toast = useStore((s) => s.toast);
  const dismissToast = useStore((s) => s.dismissToast);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => dismissToast(), 2600);
    return () => clearTimeout(t);
  }, [toast, dismissToast]);

  if (!toast) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-[10px] bg-[var(--ink)] px-[14px] py-[9px] text-[12.5px] font-semibold text-white shadow-[0_6px_24px_#0000002e]"
    >
      {toast}
    </div>
  );
}

/* ---------- VTabs ---------------------------------------------------------
   Horizontal sub-tab strip (`.sp-tabs` / `.sp-tab`), e.g. All / Named. */
export type VTabItem<T extends string = string> = {
  id: T;
  label: ReactNode;
};

type VTabsProps<T extends string> = {
  items: ReadonlyArray<VTabItem<T>>;
  value: T;
  onChange: (id: T) => void;
  className?: string;
};

export function VTabs<T extends string>({
  items,
  value,
  onChange,
  className,
}: VTabsProps<T>) {
  return (
    <div
      role="tablist"
      className={cn("flex gap-[3px] px-3 pb-1 pt-2", className)}
    >
      {items.map((t) => {
        const on = t.id === value;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(t.id)}
            className={cn(
              "rounded-[7px] px-[11px] py-[5px] text-[12px] font-semibold transition-colors",
              on
                ? "bg-[var(--side2)] text-[var(--ink)]"
                : "text-[var(--mut)] hover:bg-[var(--hover)]",
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
