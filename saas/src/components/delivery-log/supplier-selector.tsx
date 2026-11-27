"use client";

import type { CatalogueItem } from "@/lib/types";
import { ItemSelector } from "./item-selector";

export function SupplierSelector({
  suppliers,
  value,
  selectedLabel,
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
  selectedLabel?: string;
  custom: boolean;
  name: string;
  disabled: boolean;
  service: boolean;
  onSelect: (id: string) => void;
  onCustom: (selected: boolean) => void;
  onName: (name: string) => void;
}) {
  const choice = service ? "supplier" : "supplier or driver";
  return (
    <ItemSelector
      captureField="supplier"
      items={suppliers}
      value={value}
      selectedLabel={selectedLabel}
      custom={custom}
      customName={name}
      usage={{}}
      disabled={disabled}
      label={service ? "Service provider" : "Supplier / Driver"}
      searchLabel={service ? "Search suppliers" : "Search suppliers or drivers"}
      placeholder={`Choose a ${choice}`}
      otherLabel={`Other — Enter new ${choice}`}
      customLabel={`New ${choice} name`}
      customPlaceholder={
        service
          ? "Enter the supplier or company name"
          : "Enter the supplier or driver name"
      }
      maxLength={200}
      plainNames
      onSelect={onSelect}
      onCustom={onCustom}
      onCustomName={onName}
    />
  );
}
