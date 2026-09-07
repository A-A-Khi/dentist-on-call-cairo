import React from "react";
import Link from "next/link";
import { Button } from "./Button";

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
  className = "",
}: EmptyStateProps) {
  const showAction = Boolean(actionLabel && (actionHref || onAction));

  return (
    <div
      className={`flex flex-col items-center justify-center glass-card rounded-2xl border-dashed p-12 text-center ${className}`}
    >
      <div className="glass flex h-12 w-12 items-center justify-center rounded-2xl text-gold mb-4">
        {icon || (
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
        )}
      </div>
      <h4 className="text-base font-semibold text-primary">{title}</h4>
      <p className="mt-1 text-xs text-secondary max-w-sm leading-relaxed">{description}</p>
      {showAction && (
        <div className="mt-5">
          {actionHref ? (
            <Link href={actionHref} className="btn-gold">
              {actionLabel}
            </Link>
          ) : (
            <Button variant="primary" size="sm" onClick={onAction}>
              {actionLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
