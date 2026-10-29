"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "solid" | "soft" | "ghost" | "outline"; size?: "sm" | "md"; icon?: ReactNode };

export const Button = forwardRef<HTMLButtonElement, BtnProps>(function Button(
  { variant = "soft", size = "md", icon, className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      {...rest}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-full font-medium transition-[background,color,box-shadow,transform] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45",
        size === "sm" ? "h-8 px-3 text-[12.5px]" : "h-10 px-4 text-sm",
        variant === "solid" && "bg-aubergine text-ivory hover:bg-plum shadow-[0_6px_16px_-8px_rgba(48,38,56,0.6)]",
        variant === "soft" && "bg-peach/70 text-aubergine hover:bg-peach",
        variant === "ghost" && "text-ink-soft hover:bg-aubergine/[0.05] hover:text-aubergine",
        variant === "outline" && "border border-line-strong text-aubergine hover:bg-white/60",
        className,
      )}
    >
      {icon}
      {children}
    </button>
  );
});

export function IconButton({ label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      {...rest}
      className={cx(
        "grid h-9 w-9 place-items-center rounded-full text-ink-soft transition-colors hover:bg-aubergine/[0.06] hover:text-aubergine disabled:opacity-40",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Chip({ children, tone = "neutral", className }: { children: ReactNode; tone?: "neutral" | "good" | "warn" | "muted" | "taste" | "demo"; className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full px-2 py-[3px] text-[11.5px] font-medium leading-none",
        tone === "neutral" && "bg-aubergine/[0.05] text-plum",
        tone === "good" && "bg-sage/40 text-[#4E6446]",
        tone === "warn" && "bg-apricot/35 text-[#8A4E2C]",
        tone === "muted" && "bg-transparent text-ink-faint ring-1 ring-line",
        tone === "taste" && "bg-lavender/70 text-[#5A4791]",
        tone === "demo" && "bg-butter/70 text-[#7A6320] ring-1 ring-[#E8D27A]/60",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  size = "md",
}: {
  value: T;
  options: { value: T; label: ReactNode; disabled?: boolean; hint?: string }[];
  onChange: (v: T) => void;
  label: string;
  size?: "sm" | "md";
}) {
  return (
    <div role="radiogroup" aria-label={label} className="relative inline-flex shrink-0 rounded-full bg-aubergine/[0.06] p-[3px]">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={active}
            disabled={o.disabled}
            title={o.hint}
            onClick={() => onChange(o.value)}
            className={cx(
              "relative z-10 inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-medium transition-all duration-200 disabled:opacity-45",
              size === "sm" ? "h-7 px-3 text-[12px]" : "h-8 px-3.5 text-[13px]",
              active ? "bg-ivory text-aubergine shadow-[0_1px_2px_rgba(48,38,56,0.08),0_4px_10px_-4px_rgba(89,52,82,0.25)]" : "text-ink-soft hover:text-aubergine",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
