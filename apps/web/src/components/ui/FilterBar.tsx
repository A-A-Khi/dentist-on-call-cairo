import React from "react";

export interface FilterBarProps {
  children: React.ReactNode;
  className?: string;
  /** Optional trailing actions (density, clear filters, etc.) */
  end?: React.ReactNode;
}

export function FilterBar({ children, className = "", end }: FilterBarProps) {
  return (
    <div className={`filter-bar ${className}`}>
      <div className="filter-bar-fields">{children}</div>
      {end && <div className="filter-bar-end">{end}</div>}
    </div>
  );
}
