import { itemDetails } from "./catalogue";
import { periodDeliveries, type DateRange } from "./delivery-records";
import { siteClock } from "./site-time";
import type { Bootstrap, CatalogueItem, Delivery } from "./types";

export type SupervisorFilters = {
  marshalId?: string;
  materialId?: string;
  category?: string;
  entryType?: string;
  classification?: string;
};

export type SupervisorRow = {
  record: Delivery;
  item: ReturnType<typeof itemDetails>;
  marshalId: string;
  marshalName: string;
  timestamp: string;
  hasRecordedTime: boolean;
};

export type CountedItem = { id: string; name: string; total: number };

export type MarshalActivity = {
  id: string;
  name: string;
  total: number;
  materials: CountedItem[];
  days: { date: string; total: number }[];
  rows: SupervisorRow[];
};

export type PendingClassification = {
  item: CatalogueItem;
  count: number;
  originalNames: string[];
};

export type SupervisorView = {
  periodRecords: Delivery[];
  records: Delivery[];
  rows: SupervisorRow[];
  marshalOptions: { id: string; name: string }[];
  stats: { arrivals: number; marshals: number; toClassify: number };
  workload: MarshalActivity[];
  pendingItems: PendingClassification[];
  /** Historical arrivals remain visible even if their catalogue row is absent. */
  unavailablePendingItems: {
    id: string;
    name: string;
    count: number;
    originalNames: string[];
  }[];
  breakdowns: {
    materials: CountedItem[];
    categories: CountedItem[];
    services: CountedItem[];
  };
};

function countItems(items: { id: string; name: string }[]): CountedItem[] {
  const counts = new Map<string, CountedItem>();
  for (const item of items) {
    const previous = counts.get(item.id);
    counts.set(item.id, {
      ...item,
      total: (previous?.total || 0) + 1,
    });
  }
  return [...counts.values()].sort(
    (a, b) =>
      b.total - a.total ||
      a.name.localeCompare(b.name, "en-GB") ||
      a.id.localeCompare(b.id),
  );
}

/**
 * Derive all workspace tabs from one filtered set of submitted arrivals.
 * This reads existing demo values only: no storage writes, schema migration,
 * classification guesses, physical acceptance or employee-performance score.
 */
export function buildSupervisorView(
  data: Bootstrap,
  siteId: string,
  range: DateRange,
  filters: SupervisorFilters = {},
): SupervisorView {
  const companyId = data.actor.company_id;
  const site = data.sites.find(
    (item) => item.id === siteId && item.company_id === companyId,
  );
  const timezone = site?.timezone || "Europe/London";
  const materials = data.materials.filter(
    (item) => item.company_id === companyId,
  );
  const catalogue = new Map(materials.map((item) => [item.id, item]));
  const marshals = new Map(
    (data.marshals || [])
      .filter(
        (item) => item.site_id === siteId && item.company_id === companyId,
      )
      .map((item) => [item.id, item]),
  );
  const periodRecords = site
    ? periodDeliveries(
        data.deliveries.filter((record) => record.company_id === companyId),
        siteId,
        timezone,
        range,
      )
    : [];
  const periodRows = periodRecords.map((record): SupervisorRow => {
    const marshalId = record.marshal_id || record.created_by;
    const hasRecordedTime = Boolean(
      record.recorded_at && Number.isFinite(Date.parse(record.recorded_at)),
    );
    return {
      record,
      item: itemDetails(record, materials),
      marshalId,
      marshalName:
        marshals.get(marshalId)?.name ||
        record.marshal_name ||
        record.creator_name ||
        "Unknown marshal",
      timestamp: hasRecordedTime ? record.recorded_at! : record.arrival_at,
      hasRecordedTime,
    };
  });
  const marshalOptions = [
    ...new Map(periodRows.map((row) => [row.marshalId, row.marshalName])),
  ]
    .map(([id, name]) => ({ id, name }))
    .sort(
      (a, b) =>
        a.name.localeCompare(b.name, "en-GB") || a.id.localeCompare(b.id),
    );
  const rows = periodRows
    .filter(
      (row) =>
        (!filters.marshalId || row.marshalId === filters.marshalId) &&
        (!filters.materialId ||
          row.record.material_id === filters.materialId) &&
        (!filters.category || row.item.category === filters.category) &&
        (!filters.entryType || row.item.entry_type === filters.entryType) &&
        (!filters.classification ||
          row.item.approval_status === filters.classification),
    )
    .sort(
      (a, b) =>
        Date.parse(b.timestamp) - Date.parse(a.timestamp) ||
        b.record.id.localeCompare(a.record.id),
    );
  const materialKey = (row: SupervisorRow) => ({
    id: row.record.material_id,
    name: catalogue.get(row.record.material_id)?.name || row.item.name,
  });
  const groups = new Map<string, SupervisorRow[]>();
  for (const row of rows) {
    const group = groups.get(row.marshalId) || [];
    group.push(row);
    groups.set(row.marshalId, group);
  }
  const workload = [...groups].map(([id, activityRows]): MarshalActivity => {
    const days = new Map<string, number>();
    for (const row of activityRows) {
      // Use the same arrival-day convention as the selected period. A late
      // recording timestamp must not move a day's arrivals into another day.
      const date = siteClock(new Date(row.record.arrival_at), timezone).date;
      days.set(date, (days.get(date) || 0) + 1);
    }
    return {
      id,
      name: activityRows[0].marshalName,
      total: activityRows.length,
      materials: countItems(activityRows.map(materialKey)),
      days: [...days]
        .map(([date, total]) => ({ date, total }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      rows: activityRows,
    };
  });
  workload.sort(
    (a, b) =>
      b.total - a.total ||
      a.name.localeCompare(b.name, "en-GB") ||
      a.id.localeCompare(b.id),
  );

  const pending = new Map<
    string,
    { count: number; originalNames: Set<string> }
  >();
  for (const row of rows) {
    if (row.item.approval_status !== "Pending") continue;
    const group = pending.get(row.record.material_id) || {
      count: 0,
      originalNames: new Set<string>(),
    };
    group.count++;
    group.originalNames.add(row.record.item_name ?? row.item.name);
    pending.set(row.record.material_id, group);
  }
  const pendingItems: PendingClassification[] = [];
  const unavailablePendingItems: SupervisorView["unavailablePendingItems"] = [];
  for (const [id, group] of pending) {
    const item = catalogue.get(id);
    const values = {
      count: group.count,
      originalNames: [...group.originalNames],
    };
    if (item) pendingItems.push({ item, ...values });
    else
      unavailablePendingItems.push({
        id,
        name: values.originalNames[0],
        ...values,
      });
  }
  pendingItems.sort(
    (a, b) =>
      b.count - a.count ||
      a.item.name.localeCompare(b.item.name, "en-GB") ||
      a.item.id.localeCompare(b.item.id),
  );

  return {
    periodRecords,
    records: rows.map((row) => row.record),
    rows,
    marshalOptions,
    stats: {
      arrivals: rows.length,
      marshals: groups.size,
      // Distinct pending catalogue IDs with at least one included arrival.
      // Missing historical references are reported separately, not fabricated
      // into catalogue items that the existing approval endpoint cannot find.
      toClassify: pendingItems.length,
    },
    workload,
    pendingItems,
    unavailablePendingItems,
    breakdowns: {
      materials: countItems(rows.map(materialKey)),
      categories: countItems(
        rows.map((row) => ({ id: row.item.category, name: row.item.category })),
      ),
      services: countItems(
        rows
          .filter((row) => row.item.entry_type === "Service visit")
          .map(materialKey),
      ),
    },
  };
}
