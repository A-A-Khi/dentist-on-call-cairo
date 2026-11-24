import React from "react";

export interface StatCardProps {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "default" | "gold" | "emerald" | "rose" | "amber";
  className?: string;
  children?: React.ReactNode;
}

const toneValue: Record<NonNullable<StatCardProps["tone"]>, string> = {
  default: "text-primary",
  gold: "text-gold",
  emerald: "text-emerald-700",
  rose: "text-rose-600",
  amber: "text-amber-700",
};

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
  className = "",
  children,
}: StatCardProps) {
  return (
    <div className={`stat-card ${className}`}>
      <p className="stat-label">{label}</p>
      <p className={`stat-value ${toneValue[tone]}`}>{value}</p>
      {hint && <p className="stat-hint">{hint}</p>}
      {children}
    </div>
  );
}
