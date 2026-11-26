"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { ChevronDown } from "lucide-react";
import type { CatalogueItem } from "@/lib/types";
import { normaliseItemName, searchCatalogue } from "@/lib/catalogue";
import styles from "./smart-entry.module.css";

export function ItemSelector({
  items,
  value,
  custom = false,
  customName = "",
  usage = {},
  disabled = false,
  captureField,
  placeholder = "Choose an item",
  selectedLabel,
  label = "Item / material / activity",
  searchLabel = "Search items",
  otherLabel = "Other — Enter new item",
  customLabel = "New item name",
  customPlaceholder = "Enter the item or service name",
  maxLength = 160,
  includePending = false,
  plainNames = false,
  clearLabel,
  onSelect,
  onCustom,
  onCustomName,
}: {
  items: CatalogueItem[];
  value: string;
  custom?: boolean;
  customName?: string;
  usage?: Record<string, number>;
  disabled?: boolean;
  captureField?: "material" | "supplier";
  placeholder?: string;
  selectedLabel?: string;
  label?: string;
  searchLabel?: string;
  otherLabel?: string;
  customLabel?: string;
  customPlaceholder?: string;
  maxLength?: number;
  includePending?: boolean;
  plainNames?: boolean;
  clearLabel?: string;
  onSelect: (id: string) => void;
  onCustom?: (selected: boolean) => void;
  onCustomName?: (name: string) => void;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const selectedName =
    items.find((item) => item.id === value)?.name || selectedLabel || "";
  const searchKey = normaliseItemName(query);
  const matches = plainNames
    ? items
        .filter((item) => item.active || clearLabel !== undefined)
        .filter(
          (item) =>
            !searchKey || normaliseItemName(item.name).startsWith(searchKey),
        )
        .sort(
          (a, b) =>
            (usage[b.id] || 0) - (usage[a.id] || 0) ||
            a.name.localeCompare(b.name, "en-GB"),
        )
    : searchCatalogue(items, query, usage, {
        includePending,
        prefixOnly: true,
      });
  const extraOption = clearLabel || (onCustom ? otherLabel : "");
  const optionCount = matches.length + Number(Boolean(extraOption));
  const expanded = open && !disabled;

  useEffect(() => {
    if (!expanded) return;
    function closeOutside(event: PointerEvent) {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [expanded]);

  function openDropdown() {
    setQuery("");
    setActive(0);
    setOpen(true);
  }

  function select(item?: CatalogueItem) {
    if (item) {
      onSelect(item.id);
      onCustom?.(false);
    } else if (extraOption) {
      onSelect("");
      onCustom?.(true);
      if (query) onCustomName?.(query);
    }
    setOpen(false);
    trigger.current?.focus();
  }

  function keyboard(event: KeyboardEvent<HTMLElement>) {
    if (disabled) return;
    if (event.key === "Escape" && expanded) {
      event.preventDefault();
      setOpen(false);
      trigger.current?.focus();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!expanded) openDropdown();
      else {
        const next =
          event.key === "ArrowDown"
            ? Math.min(active + 1, Math.max(0, optionCount - 1))
            : Math.max(active - 1, 0);
        setActive(next);
        document
          .getElementById(`${id}-option-${next}`)
          ?.scrollIntoView({ block: "nearest" });
      }
    } else if (event.key === "Enter" && expanded) {
      event.preventDefault();
      select(matches[active]);
    }
  }

  return (
    <div
      ref={container}
      className={styles.selector}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setOpen(false);
      }}
    >
      <label id={`${id}-label`} htmlFor={id}>
        <span>
          {label}
          {captureField && (
            <span className="simple-required" aria-hidden="true" />
          )}
        </span>
      </label>
      <div className={styles.dropdown}>
        <button
          ref={trigger}
          id={id}
          type="button"
          role="combobox"
          data-capture-field={captureField}
          aria-required={captureField ? true : undefined}
          aria-labelledby={`${id}-label`}
          aria-haspopup="listbox"
          aria-expanded={expanded}
          aria-controls={expanded ? `${id}-options` : undefined}
          aria-activedescendant={
            expanded && optionCount ? `${id}-option-${active}` : undefined
          }
          disabled={disabled}
          className={styles.dropdownTrigger}
          onClick={() => (expanded ? setOpen(false) : openDropdown())}
          onKeyDown={keyboard}
        >
          <span>{custom ? otherLabel : selectedName || placeholder}</span>
          <ChevronDown size={20} aria-hidden="true" />
        </button>
        {expanded && (
          <div className={styles.dropdownPanel}>
            <label className={styles.dropdownSearch}>
              {searchLabel}
              <input
                type="search"
                autoFocus
                autoComplete="off"
                placeholder={
                  searchLabel === "Search items"
                    ? "Search materials or services"
                    : searchLabel
                }
                value={query}
                aria-controls={`${id}-options`}
                onKeyDown={keyboard}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActive(0);
                }}
              />
            </label>
            <div
              id={`${id}-options`}
              role="listbox"
              aria-labelledby={`${id}-label`}
              className={styles.options}
            >
              {!matches.length && (
                <p className={styles.noMatches}>
                  {onCustom
                    ? "No matching item. You can record a new one below."
                    : "No matching names."}
                </p>
              )}
              {matches.map((item, index) => (
                <button
                  key={item.id}
                  id={`${id}-option-${index}`}
                  type="button"
                  role="option"
                  tabIndex={-1}
                  aria-selected={active === index}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => select(item)}
                >
                  <span>{item.name}</span>
                  {includePending && item.approval_status === "Pending" && (
                    <small> · Pending classification</small>
                  )}
                </button>
              ))}
              {extraOption && (
                <button
                  id={`${id}-option-${matches.length}`}
                  type="button"
                  role="option"
                  tabIndex={-1}
                  aria-selected={active === matches.length}
                  className={styles.other}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => select()}
                >
                  {extraOption}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
      {custom && (
        <label className={styles.customField}>
          <span>
            {customLabel}
            {captureField && (
              <span className="simple-required" aria-hidden="true" />
            )}
          </span>
          <input
            data-capture-field={captureField && `${captureField}-name`}
            required
            maxLength={maxLength}
            value={customName}
            disabled={disabled}
            placeholder={customPlaceholder}
            onChange={(event) => onCustomName?.(event.target.value)}
          />
        </label>
      )}
    </div>
  );
}
