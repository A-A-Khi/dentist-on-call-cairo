"use client";

import React from "react";

export interface TabItem {
  id: string;
  label: string;
  count?: number;
  icon?: React.ReactNode;
}

export interface TabsProps {
  items: TabItem[];
  activeTab: string;
  onChange: (tabId: string) => void;
  className?: string;
}

export function Tabs({ items, activeTab, onChange, className = "" }: TabsProps) {
  return (
    <div className={`flex items-center gap-1 border-b border-[#24314c] overflow-x-auto no-scrollbar ${className}`}>
      {items.map((item) => {
        const isActive = activeTab === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={`relative flex shrink-0 items-center gap-2 px-4 py-3 text-xs font-medium transition-all ${
              isActive
                ? "text-[#caa95a] font-semibold"
                : "text-[#94a3b8] hover:text-[#f8fafc]"
            }`}
          >
            {item.icon && <span className={isActive ? "text-[#caa95a]" : "text-[#64748b]"}>{item.icon}</span>}
            <span>{item.label}</span>
            {item.count !== undefined && (
              <span
                className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                  isActive
                    ? "bg-[#caa95a]/20 text-[#caa95a]"
                    : "bg-[#1c263b] text-[#94a3b8]"
                }`}
              >
                {item.count}
              </span>
            )}
            {isActive && (
              <span className="absolute bottom-0 inset-x-0 h-0.5 bg-gradient-to-r from-[#dfbf70] via-[#caa95a] to-[#99782a]" />
            )}
          </button>
        );
      })}
    </div>
  );
}
