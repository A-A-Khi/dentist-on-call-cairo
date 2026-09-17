import React from "react";

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-xl bg-slate-200/70 ${className}`}
      aria-hidden
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="glass-card rounded-2xl p-5 space-y-3">
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  );
}

export function SkeletonMetricHero() {
  return (
    <div className="glass-card rounded-2xl p-6 sm:p-8 space-y-4">
      <Skeleton className="h-3 w-40" />
      <Skeleton className="h-12 w-56" />
      <Skeleton className="h-3 w-64 max-w-full" />
    </div>
  );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="glass-card rounded-2xl overflow-hidden" role="status" aria-label="Loading">
      <div className="border-b border-[var(--border-subtle)] px-5 py-3.5 flex items-center justify-between">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-7 w-20 rounded-lg" />
      </div>
      <div className="divide-y divide-slate-100/80 px-5">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 py-3.5">
            <Skeleton className="h-3 w-12" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-2/5" />
              <Skeleton className="h-2.5 w-1/4" />
            </div>
            <Skeleton className="h-3 w-16 hidden sm:block" />
            <Skeleton className="h-5 w-14 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonFilterBar() {
  return (
    <div className="filter-bar">
      <Skeleton className="h-9 flex-1 w-full rounded-lg" />
      <Skeleton className="h-9 w-full sm:w-36 rounded-lg" />
    </div>
  );
}
