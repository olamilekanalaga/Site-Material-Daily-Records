"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { ChevronDown } from "lucide-react";
import type { CatalogueItem } from "@/lib/types";
import { searchCatalogue } from "@/lib/catalogue";
import styles from "./smart-entry.module.css";

export function ItemSelector({
  items,
  value,
  custom,
  customName,
  usage,
  disabled,
  onSelect,
  onCustom,
  onCustomName,
}: {
  items: CatalogueItem[];
  value: string;
  custom: boolean;
  customName: string;
  usage: Record<string, number>;
  disabled: boolean;
  onSelect: (id: string) => void;
  onCustom: (selected: boolean) => void;
  onCustomName: (name: string) => void;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const selectedName = items.find((item) => item.id === value)?.name || "";
  const matches = searchCatalogue(items, query, usage);
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
      onCustom(false);
    } else {
      onSelect("");
      onCustom(true);
      if (query) onCustomName(query);
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
            ? Math.min(active + 1, matches.length)
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
        Item / material / activity
      </label>
      <div className={styles.dropdown}>
        <button
          ref={trigger}
          id={id}
          type="button"
          role="combobox"
          aria-labelledby={`${id}-label`}
          aria-haspopup="listbox"
          aria-expanded={expanded}
          aria-controls={expanded ? `${id}-options` : undefined}
          aria-activedescendant={
            expanded ? `${id}-option-${active}` : undefined
          }
          disabled={disabled}
          className={styles.dropdownTrigger}
          onClick={() => (expanded ? setOpen(false) : openDropdown())}
          onKeyDown={keyboard}
        >
          <span>
            {custom
              ? "Other — Enter new item"
              : selectedName || "Choose an item"}
          </span>
          <ChevronDown size={20} aria-hidden="true" />
        </button>
        {expanded && (
          <div className={styles.dropdownPanel}>
            <label className={styles.dropdownSearch}>
              Search items
              <input
                type="search"
                autoComplete="off"
                placeholder="Search materials or services"
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
                  No matching item. You can record a new one below.
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
                  <small>{item.category}</small>
                </button>
              ))}
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
                Other — Enter new item
              </button>
            </div>
          </div>
        )}
      </div>
      {custom && (
        <label className={styles.customField}>
          New item name
          <input
            required
            maxLength={160}
            value={customName}
            disabled={disabled}
            placeholder="Enter the item or service name"
            onChange={(event) => onCustomName(event.target.value)}
          />
        </label>
      )}
    </div>
  );
}
