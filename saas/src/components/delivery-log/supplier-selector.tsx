"use client";

import type { CatalogueItem } from "@/lib/types";
import { ItemSelector } from "./item-selector";

export function SupplierSelector({
  suppliers,
  value,
  custom,
  name,
  disabled,
  service,
  onSelect,
  onCustom,
  onName,
}: {
  suppliers: CatalogueItem[];
  value: string;
  custom: boolean;
  name: string;
  disabled: boolean;
  service: boolean;
  onSelect: (id: string) => void;
  onCustom: (selected: boolean) => void;
  onName: (name: string) => void;
}) {
  return (
    <ItemSelector
      items={suppliers}
      value={value}
      custom={custom}
      customName={name}
      usage={{}}
      disabled={disabled}
      label={service ? "Service provider" : "Supplier / Company name"}
      searchLabel="Search suppliers"
      placeholder="Choose a supplier"
      otherLabel="Other — Enter new supplier"
      customLabel="New supplier name"
      customPlaceholder="Enter the supplier or company name"
      maxLength={200}
      plainNames
      onSelect={onSelect}
      onCustom={onCustom}
      onCustomName={onName}
    />
  );
}
