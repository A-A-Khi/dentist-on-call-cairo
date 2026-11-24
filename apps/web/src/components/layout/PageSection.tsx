import React from "react";

export interface PageSectionProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  /** When false, renders a plain section without the glass card chrome. */
  card?: boolean;
}

export function PageSection({
  title,
  description,
  actions,
  children,
  className = "",
  bodyClassName = "",
  card = true,
}: PageSectionProps) {
  const hasHeader = Boolean(title || description || actions);

  const inner = (
    <>
      {hasHeader && (
        <div className="section-header">
          <div className="min-w-0 space-y-0.5">
            {title &&
              (typeof title === "string" ? (
                <h2 className="section-title">{title}</h2>
              ) : (
                <div className="section-title">{title}</div>
              ))}
            {description &&
              (typeof description === "string" ? (
                <p className="section-desc">{description}</p>
              ) : (
                <div className="section-desc">{description}</div>
              ))}
          </div>
          {actions && (
            <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
          )}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </>
  );

  if (!card) {
    return <section className={`page-section ${className}`}>{inner}</section>;
  }

  return (
    <section className={`page-section glass-card rounded-2xl p-4 sm:p-5 ${className}`}>
      {inner}
    </section>
  );
}
