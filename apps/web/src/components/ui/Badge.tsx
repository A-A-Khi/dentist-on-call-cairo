import React from "react";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "gold" | "emerald" | "green" | "blue" | "amber" | "rose" | "neutral";
  size?: "sm" | "md";
}

export function Badge({
  children,
  variant = "neutral",
  size = "sm",
  className = "",
  ...props
}: BadgeProps) {
  const sizeStyles = {
    sm: "text-[11px] px-2.5 py-0.5",
    md: "text-xs px-3 py-1",
  };

  const variantStyles = {
    gold: "bg-amber-50 text-amber-800 border border-amber-200",
    emerald: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    green: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    blue: "bg-sky-50 text-sky-700 border border-sky-200",
    amber: "bg-amber-50 text-amber-700 border border-amber-200",
    rose: "bg-rose-50 text-rose-700 border border-rose-200",
    neutral: "bg-slate-50 text-secondary border border-slate-200",
  };

  return (
    <span
      className={`inline-flex items-center font-medium rounded-full ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}
