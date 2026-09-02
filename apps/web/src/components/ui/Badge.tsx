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
    gold: "bg-[#caa95a]/15 text-[#f5e8c7] border border-[#caa95a]/30",
    emerald: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30",
    green: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30",
    blue: "bg-sky-500/15 text-sky-300 border border-sky-500/30",
    amber: "bg-amber-500/15 text-amber-300 border border-amber-500/30",
    rose: "bg-rose-500/15 text-rose-300 border border-rose-500/30",
    neutral: "bg-[#1c263b] text-[#94a3b8] border border-[#24314c]",
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
