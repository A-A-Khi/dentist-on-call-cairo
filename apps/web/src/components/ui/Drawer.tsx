"use client";

import React, { useEffect } from "react";

export interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  side?: "right" | "left" | "bottom";
  size?: "sm" | "md" | "lg";
}

export function Drawer({
  isOpen,
  onClose,
  title,
  description,
  children,
  side = "right",
  size = "md",
}: DrawerProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.body.style.overflow = "unset";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sideStyles = {
    right: "inset-y-0 end-0 h-full border-s",
    left: "inset-y-0 start-0 h-full border-e",
    bottom: "inset-x-0 bottom-0 max-h-[85vh] border-t rounded-t-2xl",
  };

  const widthStyles = {
    sm: side === "bottom" ? "w-full" : "w-full max-w-sm",
    md: side === "bottom" ? "w-full" : "w-full max-w-md",
    lg: side === "bottom" ? "w-full" : "w-full max-w-xl",
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Sheet Content */}
      <div
        className={`glass-popover fixed z-10 flex flex-col p-6 transition-transform ${sideStyles[side]} ${widthStyles[size]}`}
      >
        <div className="flex items-center justify-between pb-4 border-b glass-divider">
          <div>
            {title && <h3 className="text-base font-semibold text-primary">{title}</h3>}
            {description && <p className="text-xs text-secondary mt-0.5">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted glass-hover hover:text-primary transition-colors"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto pt-4">{children}</div>
      </div>
    </div>
  );
}
