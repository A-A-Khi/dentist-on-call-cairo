import React from "react";
import Link from "next/link";

export type ButtonVariant = "primary" | "secondary" | "outline" | "danger" | "danger-soft" | "ghost" | "accent";
export type ButtonSize = "xs" | "sm" | "md" | "lg";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
}

const baseStyles =
  "relative inline-flex items-center justify-center font-medium rounded-xl transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-main)] disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]";

const sizeStyles: Record<ButtonSize, string> = {
  xs: "h-7 text-[11px] px-2.5 gap-1 rounded-lg leading-none",
  sm: "h-9 text-xs px-3 gap-1.5 leading-none",
  md: "h-10 text-sm px-4 gap-2 leading-none",
  lg: "h-12 text-base px-6 gap-2.5 leading-none",
};

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-gradient-to-r from-[#dfbf70] via-[#caa95a] to-[#a8842d] text-on-gold font-semibold hover:brightness-105 shadow-md shadow-[#caa95a]/20 focus-visible:ring-[#caa95a]",
  secondary: "glass text-primary hover:bg-white/80 focus-visible:ring-[#caa95a]",
  outline:
    "glass bg-transparent border border-[#caa95a]/40 text-gold hover:bg-[#caa95a]/10 focus-visible:ring-[#caa95a]",
  accent:
    "border border-[#caa95a]/35 bg-[#caa95a]/10 text-gold font-semibold hover:bg-[#caa95a]/18 focus-visible:ring-[#caa95a]",
  danger: "bg-rose-600 hover:bg-rose-700 text-white shadow-md shadow-rose-200/60 focus-visible:ring-rose-500",
  "danger-soft":
    "border border-rose-500/30 bg-rose-500/10 text-rose-700 font-semibold hover:bg-rose-500/15 focus-visible:ring-rose-400",
  ghost: "bg-transparent hover:bg-slate-100/80 text-secondary hover:text-primary focus-visible:ring-slate-300",
};

/** Shared class builder for Button and ButtonLink. */
export function buttonClassName({
  variant = "primary",
  size = "md",
  className = "",
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}): string {
  return `${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${className}`.trim();
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = "primary",
      size = "md",
      isLoading = false,
      disabled,
      className = "",
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={buttonClassName({ variant, size, className })}
        {...props}
      >
        {isLoading && (
          <svg
            className="animate-spin -ms-0.5 h-3.5 w-3.5 text-current shrink-0"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";

export interface ButtonLinkProps extends Omit<React.ComponentProps<typeof Link>, "className"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}

/** Next.js Link styled as a Button — same variants/sizes. */
export function ButtonLink({
  children,
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ButtonLinkProps) {
  return (
    <Link className={buttonClassName({ variant, size, className })} {...props}>
      {children}
    </Link>
  );
}
