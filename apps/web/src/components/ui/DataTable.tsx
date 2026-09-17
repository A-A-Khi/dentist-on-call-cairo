"use client";

import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { Button, ButtonLink, type ButtonVariant } from "./Button";
import { Drawer } from "./Drawer";

export type TableDensity = "compact" | "default" | "comfortable";
export type SortDir = "asc" | "desc";
export type SortState = { id: string; dir: SortDir } | null;

/** Rank for narrow cards. Identity / value / state stay; ID leaves first. */
export type CardRole = "identity" | "value" | "state" | "meta" | "id" | "detail" | "actions";

const DENSITY_STORAGE_KEY = "doc.table.density";
/** Six columns need ~700px. Breakpoint belongs to the table container. */
export const TABLE_CARD_BREAKPOINT = 700;

export function useTableDensity(initial: TableDensity = "default"): [TableDensity, (d: TableDensity) => void] {
  const [density, setDensity] = useState<TableDensity>(initial);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(DENSITY_STORAGE_KEY) as TableDensity | null;
      if (stored === "compact" || stored === "default" || stored === "comfortable") {
        setDensity(stored);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const update = (next: TableDensity) => {
    setDensity(next);
    try {
      localStorage.setItem(DENSITY_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  };

  return [density, update];
}

/** Empty / missing / loading-unknown → em dash. Zero is a real value. */
export function dash(value: unknown): React.ReactNode {
  if (value === null || value === undefined) return "–";
  if (typeof value === "string" && value.trim() === "") return "–";
  return value as React.ReactNode;
}

export function TableText({
  children,
  title,
  className = "",
}: {
  children: React.ReactNode;
  title?: string;
  className?: string;
}) {
  const tip =
    title ??
    (typeof children === "string" || typeof children === "number" ? String(children) : undefined);

  return (
    <span className={`data-table-truncate ${className}`} title={tip || undefined}>
      {children == null || children === "" ? "–" : children}
    </span>
  );
}

export function TableAmount({
  value,
  currency,
  signed,
  className = "",
}: {
  value: number | null | undefined;
  currency?: string;
  signed?: "credit" | "debit" | "auto";
  className?: string;
}) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return <span className={`data-table-num ${className}`}>–</span>;
  }

  const abs = Math.abs(value);
  const formatted = abs.toLocaleString(undefined, { maximumFractionDigits: 0 });
  let prefix = "";
  let tone = "";
  if (signed === "credit" || (signed === "auto" && value > 0)) {
    prefix = "+";
    tone = "text-emerald-700";
  } else if (signed === "debit" || (signed === "auto" && value < 0)) {
    prefix = "−";
    tone = "text-rose-700";
  } else if (value < 0) {
    prefix = "−";
  }

  return (
    <span className={`data-table-num whitespace-nowrap ${tone} ${className}`}>
      {prefix}
      {formatted}
      {currency ? ` ${currency}` : ""}
    </span>
  );
}

export type TableActionItem = {
  id: string;
  label: string;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  tone?: "default" | "accent" | "danger";
};

/** Equal height, single-line chips — width stays compact so rows stay tidy. */
const actionChipClass =
  "h-8 shrink-0 justify-center whitespace-nowrap !px-3 text-[11px] leading-none";

export function TableActions({
  items,
  alwaysVisible = false,
}: {
  items: TableActionItem[];
  alwaysVisible?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (items.length === 0) return <span className="text-muted">–</span>;

  const toneToVariant = (tone?: TableActionItem["tone"]): ButtonVariant => {
    if (tone === "accent") return "accent";
    if (tone === "danger") return "danger-soft";
    return "secondary";
  };

  const renderItem = (item: TableActionItem, mode: "chip" | "menu") => {
    const variant = toneToVariant(item.tone);
    const className =
      mode === "chip"
        ? actionChipClass
        : "h-9 w-full justify-start whitespace-nowrap rounded-lg";

    if (item.href) {
      return (
        <ButtonLink
          key={item.id}
          href={item.href}
          variant={variant}
          size="xs"
          className={className}
          onClick={() => setOpen(false)}
        >
          {item.label}
        </ButtonLink>
      );
    }
    return (
      <Button
        key={item.id}
        type="button"
        variant={variant}
        size="xs"
        disabled={item.disabled}
        className={className}
        onClick={() => {
          item.onClick?.();
          setOpen(false);
        }}
      >
        {item.label}
      </Button>
    );
  };

  return (
    <div
      className={`data-table-actions relative flex justify-end ${alwaysVisible ? "data-table-actions-solid" : ""}`}
      ref={menuRef}
    >
      <div className="data-table-actions-inline inline-flex flex-nowrap items-center justify-end gap-1.5">
        {items.map((item) => renderItem(item, "chip"))}
      </div>

      <div className="data-table-actions-kebab">
        <Button
          type="button"
          variant="secondary"
          size="xs"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={menuId}
          className="!h-8 !w-8 !min-w-0 !px-0"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
        >
          <span className="sr-only">Actions</span>
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <circle cx="12" cy="5" r="1.75" />
            <circle cx="12" cy="12" r="1.75" />
            <circle cx="12" cy="19" r="1.75" />
          </svg>
        </Button>
        {open && (
          <div
            id={menuId}
            role="menu"
            className="absolute end-0 top-full z-40 mt-1 min-w-[10rem] space-y-1 rounded-xl glass-popover p-1.5 shadow-[var(--glass-shadow-lg)]"
          >
            {items.map((item) => renderItem(item, "menu"))}
          </div>
        )}
      </div>
    </div>
  );
}

export function DensityToggle({
  value,
  onChange,
  labels,
}: {
  value: TableDensity;
  onChange: (d: TableDensity) => void;
  labels?: { compact?: string; default?: string; comfortable?: string };
}) {
  const options: { id: TableDensity; label: string }[] = [
    { id: "compact", label: labels?.compact ?? "Compact" },
    { id: "default", label: labels?.default ?? "Default" },
    { id: "comfortable", label: labels?.comfortable ?? "Comfortable" },
  ];

  return (
    <div
      className="inline-flex items-center rounded-md border border-[var(--border-subtle)] bg-white p-0.5"
      role="group"
      aria-label="Row density"
    >
      {options.map((opt) => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={`rounded px-2 py-1 text-[10px] font-medium transition-colors ${
              active ? "bg-[var(--gold-primary)] text-on-gold" : "text-secondary hover:text-primary"
            }`}
            aria-pressed={active}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export interface DataColumn<T> {
  id: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  /** Text start (default). Numbers / amounts end. */
  align?: "start" | "end";
  sortable?: boolean;
  /** Pin identity column so horizontal scroll keeps the row name. */
  pin?: boolean;
  /** Truncate long text with native tooltip. Never set on numeric columns. */
  truncate?: boolean;
  /** Forces end alignment + tabular figures; never truncates. */
  numeric?: boolean;
  /** Reveal-on-hover action column (kebab on touch). */
  actions?: boolean;
  /**
   * Narrow-card rank. identity + value + state stay on the face.
   * id leaves first. meta is labeled. detail + actions live in the sheet.
   */
  cardRole?: CardRole;
  /** Prefix for ambiguous card fields ("Due", "Last visit"). Amounts need none. */
  cardLabel?: string | ((row: T) => string | undefined);
  /** Optional card-only render; falls back to cell(). */
  cardCell?: (row: T) => React.ReactNode;
  /** Present for card/sheet roles only — omitted from the wide table. */
  cardOnly?: boolean;
  className?: string;
  headerClassName?: string;
  minWidth?: number;
}

export interface DataTableProps<T> {
  columns: DataColumn<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  density?: TableDensity;
  onDensityChange?: (d: TableDensity) => void;
  showDensityToggle?: boolean;
  densityLabels?: { compact?: string; default?: string; comfortable?: string };
  sort?: SortState;
  onSortChange?: (next: SortState) => void;
  sortControlLabel?: string;
  /** Zebra only earns its place on wide tables (≥ 8 columns). */
  zebra?: boolean;
  loading?: boolean;
  loadingMessage?: string;
  emptyMessage?: string;
  toolbar?: React.ReactNode;
  className?: string;
  maxHeight?: string | number;
  /** Sheet title from the open row. */
  sheetTitle?: (row: T) => string;
  sheetDescription?: (row: T) => string | undefined;
}

function SortMark({ active, dir }: { active: boolean; dir?: SortDir }) {
  if (!active) return null;
  return (
    <span className="ms-1 inline-block text-[10px] text-[var(--gold-primary)]" aria-hidden>
      {dir === "desc" ? "↓" : "↑"}
    </span>
  );
}

function headerText(header: React.ReactNode): string {
  if (typeof header === "string" || typeof header === "number") return String(header);
  return "";
}

function resolveLabel<T>(col: DataColumn<T>, row: T): string | undefined {
  if (typeof col.cardLabel === "function") return col.cardLabel(row);
  return col.cardLabel;
}

function renderCardSlot<T>(col: DataColumn<T> | undefined, row: T): React.ReactNode {
  if (!col) return null;
  return col.cardCell ? col.cardCell(row) : col.cell(row);
}

function LabeledMeta({ label, children }: { label?: string; children: React.ReactNode }) {
  if (children == null || children === "" || children === "–") {
    return <span className="text-muted">–</span>;
  }
  if (!label) return <>{children}</>;
  return (
    <span className="text-secondary">
      <span className="text-muted">{label} </span>
      {children}
    </span>
  );
}

export function DataTable<T>({
  columns,
  rows,
  getRowId,
  density = "default",
  onDensityChange,
  showDensityToggle = true,
  densityLabels,
  sort = null,
  onSortChange,
  sortControlLabel = "Sort",
  zebra,
  loading,
  loadingMessage,
  emptyMessage = "No records found.",
  toolbar,
  className = "",
  maxHeight = "70vh",
  sheetTitle,
  sheetDescription,
}: DataTableProps<T>) {
  const tableColumns = useMemo(() => columns.filter((c) => !c.cardOnly), [columns]);
  const useZebra = zebra ?? tableColumns.length >= 8;
  const pinnedIds = useMemo(() => new Set(tableColumns.filter((c) => c.pin).map((c) => c.id)), [tableColumns]);
  const [openId, setOpenId] = useState<string | null>(null);

  const byRole = useMemo(() => {
    const map: Partial<Record<CardRole, DataColumn<T>>> = {};
    const details: DataColumn<T>[] = [];
    for (const col of columns) {
      if (!col.cardRole) continue;
      if (col.cardRole === "detail") details.push(col);
      else if (!map[col.cardRole]) map[col.cardRole] = col;
    }
    return { map, details };
  }, [columns]);

  const sortableColumns = useMemo(() => columns.filter((c) => c.sortable), [columns]);
  const openRow = openId ? rows.find((r) => getRowId(r) === openId) ?? null : null;
  const hasCardLayout = Boolean(byRole.map.identity || byRole.map.value || byRole.map.state);

  const handleSort = (col: DataColumn<T>) => {
    if (!col.sortable || !onSortChange) return;
    if (!sort || sort.id !== col.id) {
      onSortChange({ id: col.id, dir: "asc" });
      return;
    }
    if (sort.dir === "asc") {
      onSortChange({ id: col.id, dir: "desc" });
      return;
    }
    onSortChange(null);
  };

  const handleSortControl = (value: string) => {
    if (!onSortChange) return;
    if (!value) {
      onSortChange(null);
      return;
    }
    const [id, dir] = value.split(":");
    if (!id || (dir !== "asc" && dir !== "desc")) return;
    onSortChange({ id, dir });
  };

  const sortControlValue = sort ? `${sort.id}:${sort.dir}` : "";

  const sheetFields = (row: T) => {
    const fields: { key: string; label: React.ReactNode; body: React.ReactNode }[] = [];
    const idCol = byRole.map.id;
    if (idCol) {
      fields.push({
        key: idCol.id,
        label: resolveLabel(idCol, row) || idCol.header,
        body: renderCardSlot(idCol, row),
      });
    }
    for (const col of byRole.details) {
      fields.push({
        key: col.id,
        label: resolveLabel(col, row) || col.header,
        body: renderCardSlot(col, row),
      });
    }
    // Any column without a cardRole still belongs in the glance sheet if labeled detail-like
    return fields;
  };

  return (
    <div
      className={`data-table-shell rounded-xl border border-[var(--border-subtle)] bg-white ${className}`}
      style={{ ["--table-card-bp" as string]: `${TABLE_CARD_BREAKPOINT}px` }}
    >
      {(showDensityToggle && onDensityChange) || toolbar || (hasCardLayout && sortableColumns.length > 0) ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] px-3 py-2">
          <div className="min-w-0 flex-1">{toolbar}</div>
          <div className="flex flex-wrap items-center gap-2">
            {hasCardLayout && onSortChange && sortableColumns.length > 0 ? (
              <label className="data-table-sort-control inline-flex items-center gap-1.5 text-[10px] text-muted">
                <span className="sr-only sm:not-sr-only">{sortControlLabel}</span>
                <select
                  value={sortControlValue}
                  onChange={(e) => handleSortControl(e.target.value)}
                  className="rounded-md border border-[var(--border-subtle)] bg-white px-2 py-1 text-[11px] text-primary"
                >
                  <option value="">{sortControlLabel}</option>
                  {sortableColumns.map((col) => {
                    const label = headerText(col.header) || col.id;
                    return (
                      <React.Fragment key={col.id}>
                        <option value={`${col.id}:asc`}>{label} ↑</option>
                        <option value={`${col.id}:desc`}>{label} ↓</option>
                      </React.Fragment>
                    );
                  })}
                </select>
              </label>
            ) : null}
            {showDensityToggle && onDensityChange ? (
              <span className="data-table-density-control">
                <DensityToggle value={density} onChange={onDensityChange} labels={densityLabels} />
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Wide: table */}
      <div className="data-table-view-table">
        <div className="data-table-scroll" style={{ maxHeight }}>
          <table className="data-table w-full" data-density={density} data-zebra={useZebra ? "true" : "false"}>
            <thead>
              <tr>
                {tableColumns.map((col) => {
                  const alignEnd = col.numeric || col.align === "end" || col.actions;
                  const isActiveSort = sort?.id === col.id;
                  const pin = pinnedIds.has(col.id);
                  const headerInner = (
                    <>
                      {col.header}
                      {col.sortable ? <SortMark active={!!isActiveSort} dir={sort?.dir} /> : null}
                    </>
                  );

                  return (
                    <th
                      key={col.id}
                      scope="col"
                      className={`data-table-th ${pin ? "data-table-pin" : ""} ${alignEnd ? "text-end" : "text-start"} ${col.headerClassName || ""}`}
                      style={col.minWidth ? { minWidth: col.minWidth } : undefined}
                      aria-sort={
                        col.sortable
                          ? isActiveSort
                            ? sort?.dir === "asc"
                              ? "ascending"
                              : "descending"
                            : "none"
                          : undefined
                      }
                    >
                      {col.sortable && onSortChange ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-0.5 font-medium text-secondary hover:text-primary"
                          onClick={() => handleSort(col)}
                        >
                          {headerInner}
                        </button>
                      ) : (
                        <span className="font-medium text-secondary">{headerInner}</span>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={tableColumns.length} className="data-table-empty">
                    {loadingMessage ?? "–"}
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={tableColumns.length} className="data-table-empty">
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={getRowId(row)} className="data-table-row group">
                    {tableColumns.map((col) => {
                      const alignEnd = col.numeric || col.align === "end" || col.actions;
                      const pin = pinnedIds.has(col.id);
                      const content = col.cell(row);
                      const shouldTruncate =
                        !col.actions &&
                        !col.numeric &&
                        col.truncate !== false &&
                        (content == null || typeof content === "string" || typeof content === "number");
                      const wrapped = shouldTruncate ? <TableText>{content}</TableText> : content;

                      return (
                        <td
                          key={col.id}
                          className={`data-table-td ${pin ? "data-table-pin" : ""} ${alignEnd ? "text-end" : "text-start"} ${
                            col.numeric ? "data-table-num" : ""
                          } ${col.actions ? "data-table-td-actions" : ""} ${col.className || ""}`}
                          style={col.minWidth ? { minWidth: col.minWidth } : undefined}
                        >
                          {wrapped}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Narrow: stacked cards — identity / value / state */}
      <div className="data-table-view-cards">
        {loading ? (
          <div className="data-table-empty px-4">{loadingMessage ?? "–"}</div>
        ) : rows.length === 0 ? (
          <div className="data-table-empty px-4">{emptyMessage}</div>
        ) : (
          <ul className="data-table-card-list">
            {rows.map((row) => {
              const id = getRowId(row);
              const identity = renderCardSlot(byRole.map.identity, row);
              const value = renderCardSlot(byRole.map.value, row);
              const state = renderCardSlot(byRole.map.state, row);
              const metaCol = byRole.map.meta;
              const meta = renderCardSlot(metaCol, row);
              const metaLabel = metaCol ? resolveLabel(metaCol, row) : undefined;

              return (
                <li key={id}>
                  <button
                    type="button"
                    className="data-table-card"
                    onClick={() => setOpenId(id)}
                  >
                    <div className="data-table-card-line1">
                      <div className="data-table-card-identity min-w-0">{identity ?? "–"}</div>
                      <div className="data-table-card-value data-table-num shrink-0">{value ?? null}</div>
                    </div>
                    <div className="data-table-card-line2">
                      <div className="data-table-card-state min-w-0">{state ?? null}</div>
                      {metaCol ? (
                        <div className="data-table-card-meta min-w-0 truncate">
                          <LabeledMeta label={metaLabel}>{meta}</LabeledMeta>
                        </div>
                      ) : null}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Drawer
        isOpen={Boolean(openRow)}
        onClose={() => setOpenId(null)}
        side="bottom"
        size="md"
        title={openRow ? sheetTitle?.(openRow) || headerText(byRole.map.identity?.header) || "Record" : undefined}
        description={openRow ? sheetDescription?.(openRow) : undefined}
      >
        {openRow ? (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 text-sm font-semibold text-primary">
                {renderCardSlot(byRole.map.identity, openRow)}
              </div>
              <div className="data-table-num shrink-0 text-sm font-semibold">
                {renderCardSlot(byRole.map.value, openRow)}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              {renderCardSlot(byRole.map.state, openRow)}
              {byRole.map.meta ? (
                <LabeledMeta label={resolveLabel(byRole.map.meta, openRow)}>
                  {renderCardSlot(byRole.map.meta, openRow)}
                </LabeledMeta>
              ) : null}
            </div>

            <dl className="space-y-3 border-t border-[var(--border-subtle)] pt-3">
              {sheetFields(openRow).map((field) => (
                <div key={field.key}>
                  <dt className="text-[10px] font-medium uppercase tracking-wide text-muted">{field.label}</dt>
                  <dd className="mt-0.5 text-xs text-primary break-words">{field.body}</dd>
                </div>
              ))}
            </dl>

            {byRole.map.actions ? (
              <div className="data-table-sheet-actions border-t border-[var(--border-subtle)] pt-3">
                {byRole.map.actions.cell(openRow)}
              </div>
            ) : null}
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
