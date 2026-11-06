"use client";

import { useEffect, useId, useState } from "react";
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
  const selectedName = items.find((item) => item.id === value)?.name || "";
  const matches = searchCatalogue(items, query, usage).slice(0, 12);
  useEffect(() => {
    if (value) setQuery(selectedName);
  }, [value, selectedName]);

  function select(item?: CatalogueItem) {
    if (item) {
      onSelect(item.id);
      onCustom(false);
      setQuery(item.name);
    } else {
      onSelect("");
      onCustom(true);
      if (query && query !== selectedName && query !== "Other — Enter new item")
        onCustomName(query);
      setQuery("Other — Enter new item");
    }
    setOpen(false);
  }

  return (
    <div
      className={styles.selector}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setOpen(false);
      }}
    >
      <label htmlFor={id}>Item / material / activity</label>
      <input
        id={id}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={`${id}-options`}
        aria-activedescendant={open ? `${id}-option-${active}` : undefined}
        autoComplete="off"
        placeholder="Search materials or services"
        value={query}
        disabled={disabled}
        onFocus={() => {
          setOpen(true);
          setActive(0);
          if (custom) {
            setQuery("");
            onCustom(false);
          }
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          onSelect("");
          onCustom(false);
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            setActive((index) =>
              event.key === "ArrowDown"
                ? Math.min(index + 1, matches.length)
                : Math.max(index - 1, 0),
            );
          } else if (event.key === "Enter" && open) {
            event.preventDefault();
            select(matches[active]);
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open && !disabled && (
        <div id={`${id}-options`} role="listbox" className={styles.options}>
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
            aria-selected={active === matches.length}
            className={styles.other}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => select()}
          >
            Other — Enter new item
          </button>
        </div>
      )}
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
