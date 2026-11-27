import type {
  ApprovalStatus,
  CatalogueItem,
  Delivery,
  EntryType,
} from "./types";

export const CATEGORIES = [
  "Aggregates / Sands",
  "Other Materials",
  "Services",
] as const;
export const CAPTURE_CATEGORIES = [
  CATEGORIES[0],
  "Concrete",
  CATEGORIES[1],
  CATEGORIES[2],
  "Hire",
] as const;
export const ENTRY_TYPES = ["Delivery", "Service visit"] as const;
export const PENDING_CATEGORY = "Pending classification";
export const PENDING_ENTRY_TYPE = "Pending review";
export const CAPTURE_MENU_VERSION = 1;
export const AGGREGATE_CAPTURE_ITEMS = [
  "6F5",
  "Type 1",
  "Sand",
  "10mm shingles",
  "20mm shingles",
] as const;
export const QUICK_ITEMS = AGGREGATE_CAPTURE_ITEMS;

type Definition = {
  name: string;
  category: string;
  entry_type: EntryType;
  synonyms: string[];
};
const groups: ReadonlyArray<readonly [string, readonly string[]]> = [
  [
    "Aggregates",
    [
      "6F5",
      "Type 1",
      "Type 2",
      "MOT Type 1",
      "Sand",
      "Building sand",
      "Sharp sand",
      "10mm shingles",
      "20mm shingles",
      "Gravel",
      "Crushed stone",
      "Hardcore",
      "Ballast",
    ],
  ],
  [
    "Concrete and cement",
    [
      "Ready-mix concrete",
      "Concrete",
      "Concrete blocks",
      "Precast concrete",
      "Cement",
      "Mortar",
    ],
  ],
  [
    "Timber",
    [
      "Timber",
      "Plywood",
      "Wooden boards",
      "Timber beams",
      "Wooden pallets",
      "Formwork timber",
    ],
  ],
  [
    "Fuel and related supplies",
    ["Diesel", "Petrol", "HVO fuel", "AdBlue", "Fuel delivery"],
  ],
  [
    "Plant and equipment",
    [
      "Excavator",
      "Dumper",
      "Roller",
      "Telehandler",
      "Generator",
      "Compressor",
      "Machinery delivery",
      "Tools",
      "Site equipment",
    ],
  ],
  [
    "Site facilities",
    [
      "Portable toilet",
      "Welfare cabin",
      "Water tank",
      "Storage container",
      "Site cabin",
      "Temporary fencing",
    ],
  ],
  [
    "Site services",
    [
      "Road sweeper",
      "Toilet servicing",
      "Toilet cleaning",
      "Plant maintenance",
      "Equipment servicing",
      "Site cleaning",
    ],
  ],
  [
    "Waste containers",
    ["Waste skip", "Waste bin", "Wheelie bin", "Empty skip delivery"],
  ],
  [
    "Drainage and utilities",
    [
      "Drainage pipes",
      "Manhole",
      "Ducting",
      "Drainage channels",
      "Pipe fittings",
      "Water pipes",
    ],
  ],
  [
    "Other construction supplies",
    [
      "Bricks",
      "Reinforcement steel",
      "Rebar",
      "Steel mesh",
      "Barriers",
      "Fencing",
      "PPE",
      "General building supplies",
    ],
  ],
  ["Other Materials", ["Pipes", "Cables"]],
  ["Services", ["Fuel", "Toilets", "Welfare"]],
];
const aliases: Record<string, string[]> = {
  "6F5": ["6 f5", "6f 5"],
  "Type 1": ["type1", "type one"],
  "Type 2": ["type2", "type two"],
  "MOT Type 1": ["mot type1", "mot1"],
  "10mm shingles": [
    "10 mm",
    "10mm",
    "10mm shingle",
    "10 mil shingle",
    "10 mill shingles",
  ],
  "20mm shingles": [
    "20 mm",
    "20mm",
    "20mm shingle",
    "20 mil shingle",
    "20 mill shingles",
  ],
  "Ready-mix concrete": ["readymix", "ready mixed concrete", "ready mix"],
  Timber: ["wood", "lumber"],
  Plywood: ["ply wood", "ply"],
  "Wooden pallets": ["wood pallets", "pallets"],
  Petrol: ["gasoline"],
  "HVO fuel": ["hvo"],
  AdBlue: ["ad blue"],
  Diesel: ["deisel", "desiel", "deseil"],
  Excavator: ["digger"],
  Telehandler: ["tele handler", "telescopic handler"],
  "Portable toilet": ["portaloo", "portable loo", "site toilet"],
  "Road sweeper": ["sweeper", "road sweeping"],
  "Toilet servicing": ["toilet service", "portaloo servicing", "toilet wash"],
  "Toilet cleaning": ["toilet clean", "portaloo cleaning"],
  "Waste skip": ["skip"],
  "Wheelie bin": ["wheeliebin", "wheeled bin"],
  "Reinforcement steel": ["reinforcing steel"],
  Rebar: ["re bar", "reinforcing bar"],
  PPE: ["personal protective equipment", "protective equipment"],
  Pipes: ["pipe"],
  Cables: ["cable", "electrical cable", "electrical cables"],
  Toilets: ["toilet"],
};

/** Legacy category labels are interpreted for display, without rewriting events. */
function currentCategory(category: string | undefined, name = "") {
  if ((CAPTURE_CATEGORIES as readonly string[]).includes(category || ""))
    return category;
  if (category === "Aggregates" || category === "Concrete and cement")
    return "Aggregates / Sands";
  if (
    category === "Fuel and related supplies" ||
    category === "Site services" ||
    (category === "Site facilities" &&
      ["Portable toilet", "Welfare cabin"].includes(name))
  )
    return "Services";
  if (
    [
      "Timber",
      "Plant and equipment",
      "Site facilities",
      "Waste containers",
      "Drainage and utilities",
      "Other construction supplies",
    ].includes(category || "")
  )
    return "Other Materials";
  return undefined;
}

const definitions: Definition[] = groups.flatMap(([category, names]) =>
  names.map((name) => ({
    name,
    category: currentCategory(category, name)!,
    entry_type: category === "Site services" ? "Service visit" : "Delivery",
    synonyms: aliases[name] || [],
  })),
);

const concreteNames = new Set(
  (groups.find(([category]) => category === "Concrete and cement")?.[1] ?? [])
    .flatMap((name) => [name, ...(aliases[name] ?? [])])
    .map(normaliseItemName),
);

export function captureCategory(category: string | undefined, name: string) {
  if (category === "Hire") return "Hire";
  if (
    category === "Concrete" ||
    category === "Concrete and cement" ||
    concreteNames.has(normaliseItemName(name))
  )
    return "Concrete";
  return currentCategory(category, name) ?? category;
}

export function captureCategoryLabel(category: string) {
  if (category === "Aggregates / Sands") return "Aggregate";
  if (category === "Services") return "Service";
  if (category === "Other Materials" || category === "Material")
    return "Materials";
  return category;
}

function hiddenByDefault(definition: Definition | undefined) {
  return Boolean(
    definition &&
    ![
      ...AGGREGATE_CAPTURE_ITEMS,
      "Pipes",
      "Cables",
      "Fuel",
      "Toilets",
      "Welfare",
    ].includes(definition.name),
  );
}

/** Apply once per saved workspace. Later manual reactivation must be retained. */
export function compactAggregateCaptureMenu(
  items: CatalogueItem[],
  companyId: string,
): CatalogueItem[] {
  const retired = new Set(
    definitions
      .filter(
        (definition) =>
          definition.category === "Aggregates / Sands" &&
          hiddenByDefault(definition),
      )
      .map((definition) => normaliseItemName(definition.name)),
  );
  return items.map((item) =>
    item.company_id === companyId &&
    item.approval_status === "Approved" &&
    retired.has(normaliseItemName(item.name))
      ? { ...item, capture_hidden: true }
      : item,
  );
}

/** Matching only: the original display/entered text is never replaced by this key. */
export function normaliseItemName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("en-GB")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function definitionFor(name: string) {
  const normalised = normaliseItemName(name);
  return (
    definitions.find((item) => normaliseItemName(item.name) === normalised) ||
    definitions.find((item) =>
      item.synonyms.some((alias) => normaliseItemName(alias) === normalised),
    )
  );
}

function metadata(item: CatalogueItem): CatalogueItem {
  const definition = definitionFor(item.name);
  // Pending is an explicit review state; an upgrade must never auto-approve it.
  const category = currentCategory(
    item.category || definition?.category,
    definition?.name || item.name,
  );
  const entryType = item.entry_type || definition?.entry_type;
  const approved =
    item.approval_status !== "Pending" &&
    CAPTURE_CATEGORIES.some((candidate) => candidate === category) &&
    ENTRY_TYPES.some((candidate) => candidate === entryType);
  return {
    ...item,
    normalised_name: normaliseItemName(item.name),
    category: category || PENDING_CATEGORY,
    entry_type: approved ? entryType : PENDING_ENTRY_TYPE,
    approval_status: approved ? "Approved" : "Pending",
    // Retain legacy options for reports/aliases while keeping initial capture compact.
    capture_hidden: item.capture_hidden ?? hiddenByDefault(definition),
    synonyms: [
      ...new Set([...(definition?.synonyms || []), ...(item.synonyms || [])]),
    ],
  };
}

/** Browser-safe stable UUID; names cannot collide with another company catalogue. */
function stableId(companyId: string, key: string) {
  const input = `${companyId}:arrival-catalogue:${key}`;
  const words = [2166136261, 3335557771, 1987654321, 1234567891].map((seed) => {
    let hash = seed;
    for (let index = 0; index < input.length; index++)
      hash = Math.imul(hash ^ input.charCodeAt(index), 16777619);
    return (hash >>> 0).toString(16).padStart(8, "0");
  });
  const hex = words.join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** Enrich/add options in place by identity, without deleting or renaming history. */
export function upgradeCatalogue(
  existing: CatalogueItem[],
  companyId: string,
): CatalogueItem[] {
  const result = existing.map((item) =>
    item.company_id === companyId ? metadata(item) : { ...item },
  );
  const keys = new Set(
    result
      .filter((item) => item.company_id === companyId)
      .map((item) => normaliseItemName(item.name)),
  );
  const ids = new Set(result.map((item) => item.id));
  for (const definition of definitions) {
    const key = normaliseItemName(definition.name);
    if (keys.has(key)) continue;
    let suffix = "";
    let id = stableId(companyId, key);
    while (ids.has(id)) {
      suffix += ":";
      id = stableId(companyId, key + suffix);
    }
    result.push({
      id,
      company_id: companyId,
      active: true,
      name: definition.name,
      normalised_name: key,
      category: definition.category,
      entry_type: definition.entry_type,
      approval_status: "Approved",
      capture_hidden: hiddenByDefault(definition),
      synonyms: [...definition.synonyms],
    });
    keys.add(key);
    ids.add(id);
  }
  return result;
}

/** Exact normalisation/aliases only. Fuzzy suggestions are never classifications. */
export function findExactCatalogueItem(
  items: CatalogueItem[],
  text: string,
): CatalogueItem | undefined {
  const query = normaliseItemName(text);
  if (!query) return undefined;
  const named = items.find((item) => normaliseItemName(item.name) === query);
  if (named) return named;
  return items.find((item) => {
    const enriched = metadata(item);
    return (
      enriched.approval_status === "Approved" &&
      enriched.synonyms?.some((alias) => normaliseItemName(alias) === query)
    );
  });
}

function editDistance(first: string, second: string): number {
  const row = Array.from({ length: second.length + 1 }, (_, index) => index);
  for (let i = 0; i < first.length; i++) {
    let diagonal = row[0];
    row[0] = i + 1;
    for (let j = 1; j <= second.length; j++) {
      const previous = row[j];
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        diagonal + (first[i] === second[j - 1] ? 0 : 1),
      );
      diagonal = previous;
    }
  }
  return row[second.length];
}

function matchScore(item: CatalogueItem, query: string): number {
  if (!query) return 1;
  const name = normaliseItemName(item.name);
  const synonyms = (item.synonyms || []).map(normaliseItemName);
  if (name === query) return 1000;
  if (synonyms.includes(query)) return 950;
  if (name.startsWith(query)) return 850;
  if (synonyms.some((alias) => alias.startsWith(query))) return 800;
  if (name.includes(query)) return 700;
  if (synonyms.some((alias) => alias.includes(query))) return 650;
  if (query.length < 4) return 0;
  const distance = Math.min(
    ...[name, ...synonyms].map((candidate) => editDistance(candidate, query)),
  );
  return distance <= (query.length > 7 ? 2 : 1) ? 500 - distance : 0;
}

/** Suggestions require an explicit selection; no external model or API is used. */
export function searchCatalogue(
  items: CatalogueItem[],
  query: string,
  usage: Record<string, number> = {},
  options: { includePending?: boolean; prefixOnly?: boolean } = {},
): CatalogueItem[] {
  const normalised = normaliseItemName(query);
  const seen = new Set<string>();
  return items
    .map(metadata)
    .filter(
      (item) =>
        item.active &&
        (item.approval_status === "Approved" || options.includePending),
    )
    .filter(
      (item) =>
        !options.prefixOnly ||
        normaliseItemName(item.name).startsWith(normalised),
    )
    .map((item) => ({ item, score: matchScore(item, normalised) }))
    .filter(({ score }) => score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        (usage[b.item.id] || 0) - (usage[a.item.id] || 0) ||
        quickRank(a.item.name) - quickRank(b.item.name) ||
        a.item.name.localeCompare(b.item.name, "en-GB"),
    )
    .filter(({ item }) => {
      const key = normaliseItemName(item.name);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(({ item }) => item);
}

function quickRank(name: string) {
  const rank = QUICK_ITEMS.findIndex(
    (item) => normaliseItemName(item) === normaliseItemName(name),
  );
  return rank < 0 ? QUICK_ITEMS.length : rank;
}

export type ItemDetails = {
  name: string;
  category: string;
  entry_type: EntryType;
  approval_status: ApprovalStatus;
};
export function itemDetails(
  delivery: Pick<
    Delivery,
    | "material_id"
    | "item_name"
    | "category"
    | "entry_type"
    | "catalogue_status"
    | "selected_category"
  >,
  materials: CatalogueItem[],
): ItemDetails {
  const item = materials.find(
    (candidate) => candidate.id === delivery.material_id,
  );
  const current = item ? metadata(item) : undefined;
  const approved =
    current?.approval_status === "Approved" &&
    current.category !== PENDING_CATEGORY &&
    current.entry_type !== PENDING_ENTRY_TYPE;
  return {
    name: delivery.item_name ?? current?.name ?? "Historical item",
    category: approved
      ? current.category!
      : currentCategory(
          delivery.selected_category || delivery.category || current?.category,
        ) || PENDING_CATEGORY,
    entry_type: approved ? current.entry_type! : PENDING_ENTRY_TYPE,
    approval_status: approved ? "Approved" : "Pending",
  };
}
