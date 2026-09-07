import React from "react";

export interface PageHeaderProps {
  title: React.ReactNode;
  subtitle?: string;
  actions?: React.ReactNode;
  breadcrumb?: React.ReactNode;
}

export function PageHeader({ title, subtitle, actions, breadcrumb }: PageHeaderProps) {
  return (
    <div className="space-y-2">
      {breadcrumb}
      <div className="page-header">
        <div className="min-w-0">
          {typeof title === "string" ? <h1 className="page-title">{title}</h1> : <div className="page-title">{title}</div>}
          {subtitle && <p className="page-subtitle">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2 sm:gap-3">{actions}</div>}
      </div>
    </div>
  );
}
