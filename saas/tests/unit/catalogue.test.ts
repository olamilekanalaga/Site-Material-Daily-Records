import { test } from "node:test";
import assert from "node:assert/strict";
import type { CatalogueItem } from "../../src/lib/types";
import {
  CATEGORIES,
  PENDING_CATEGORY,
  PENDING_ENTRY_TYPE,
  QUICK_ITEMS,
  findExactCatalogueItem,
  itemDetails,
  normaliseItemName,
  searchCatalogue,
  upgradeCatalogue,
} from "../../src/lib/catalogue";

const company = "company";
const legacy = (id: string, name: string): CatalogueItem => ({
  id,
  name,
  company_id: company,
  active: true,
});

test("the complete initial arrival catalogue classifies deliveries and service visits without adding records", () => {
  const catalogue = upgradeCatalogue([], company);
  assert.equal(catalogue.length, 69);
  assert.equal(new Set(catalogue.map((item) => item.normalised_name)).size, 69);
  assert.deepEqual(
    new Set(catalogue.map((item) => item.category)),
    new Set(CATEGORIES),
  );
  for (const item of catalogue) {
    assert.match(
      item.id,
      /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-8[\da-f]{3}-[\da-f]{12}$/,
    );
    assert.equal(item.approval_status, "Approved");
    assert.equal(
      item.entry_type,
      item.category === "Site services" ? "Service visit" : "Delivery",
    );
    assert(!/muckaway|collection|departure/i.test(item.name));
  }
  for (const [name, category, type] of [
    ["6F5", "Aggregates", "Delivery"],
    ["Timber", "Timber", "Delivery"],
    ["Road sweeper", "Site services", "Service visit"],
    ["Toilet servicing", "Site services", "Service visit"],
    ["Waste skip", "Waste containers", "Delivery"],
  ]) {
    const item = catalogue.find((candidate) => candidate.name === name)!;
    assert.equal(item.category, category);
    assert.equal(item.entry_type, type);
  }
  for (const name of QUICK_ITEMS)
    assert(catalogue.some((item) => item.name === name));
});

test("catalogue upgrades preserve historical IDs, names, pending decisions and company boundaries", () => {
  const existing = [
    legacy("sixf5", "6F5"),
    legacy("g1", "G1"),
    legacy("six-i", "6I"),
    legacy("old-other", "Other"),
    legacy("typed", "  TYPE   1  "),
    {
      ...legacy("manual", "Special delivery"),
      approval_status: "Pending" as const,
    },
    { ...legacy("foreign", "Foreign item"), company_id: "another-company" },
  ];
  const before = structuredClone(existing);
  const first = upgradeCatalogue(existing, company);
  const second = upgradeCatalogue(first, company);
  assert.deepEqual(existing, before);
  assert.deepEqual(second, first);
  for (const item of existing) {
    const preserved = first.find((candidate) => candidate.id === item.id)!;
    assert.equal(preserved.name, item.name);
    assert.equal(preserved.company_id, item.company_id);
  }
  for (const id of ["g1", "six-i", "old-other", "manual"]) {
    const item = first.find((candidate) => candidate.id === id)!;
    assert.equal(item.category, PENDING_CATEGORY);
    assert.equal(item.entry_type, PENDING_ENTRY_TYPE);
    assert.equal(item.approval_status, "Pending");
  }
  assert.equal(
    first.filter((item) => normaliseItemName(item.name) === "type1").length,
    1,
  );
  assert.deepEqual(
    first.find((item) => item.id === "foreign"),
    existing.at(-1),
  );
  const anotherCompany = upgradeCatalogue([], "another-company");
  assert.notEqual(anotherCompany[0].id, upgradeCatalogue([], company)[0].id);
});

test("search matches aliases, spacing, case and deterministic spelling suggestions", () => {
  const catalogue = upgradeCatalogue([], company);
  for (const [query, name] of [
    ["type1", "Type 1"],
    [" TYPE  1 ", "Type 1"],
    ["Wood", "Timber"],
    ["sweeper", "Road sweeper"],
    ["10 mm", "10mm shingles"],
    ["timbr", "Timber"],
    ["deisel", "Diesel"],
    ["portaloo", "Portable toilet"],
  ])
    assert.equal(searchCatalogue(catalogue, query)[0]?.name, name, query);
  assert.equal(
    searchCatalogue(catalogue, "something entirely unknown").length,
    0,
  );
  const used = catalogue.find((item) => item.name === "Dumper")!;
  assert.equal(
    searchCatalogue(catalogue, "", { [used.id]: 15 })[0].id,
    used.id,
  );
  const duplicate = { ...catalogue[0], id: "duplicate", name: "  6 f5 " };
  assert.equal(
    searchCatalogue([...catalogue, duplicate], "6F5").filter(
      (item) => normaliseItemName(item.name) === "6f5",
    ).length,
    1,
  );
});

test("pending and inactive items stay out of normal suggestions and exact matching never guesses", () => {
  const catalogue = upgradeCatalogue([], company);
  const pending: CatalogueItem = {
    ...legacy("unknown", "  Bespoke  Panel "),
    category: PENDING_CATEGORY,
    entry_type: PENDING_ENTRY_TYPE,
    approval_status: "Pending" as const,
  };
  const inactive = { ...catalogue[0], active: false };
  assert.equal(searchCatalogue([pending, inactive], "").length, 0);
  assert.equal(
    findExactCatalogueItem([...catalogue, pending], "bespoke panel")?.id,
    pending.id,
  );
  assert.equal(findExactCatalogueItem(catalogue, "Timbr"), undefined);
  assert.equal(
    findExactCatalogueItem(catalogue, "roadSWEEPER")?.name,
    "Road sweeper",
  );
  assert.equal(findExactCatalogueItem(catalogue, "wood")?.name, "Timber");
  assert.equal(findExactCatalogueItem(catalogue, "TYPE 1")?.name, "Type 1");
  assert.equal(findExactCatalogueItem(catalogue, "6I"), undefined);
  assert.equal(normaliseItemName("  TYPE-  1 "), normaliseItemName("type1"));
});

test("classification approval changes current reporting while preserving exact recorded item text", () => {
  const original = "   Bespoke   crane mat ";
  const record: Parameters<typeof itemDetails>[0] = {
    material_id: "pending",
    item_name: original,
    category: PENDING_CATEGORY,
    entry_type: PENDING_ENTRY_TYPE,
  };
  const pending: CatalogueItem = {
    ...legacy("pending", "Bespoke crane mat"),
    category: PENDING_CATEGORY,
    entry_type: PENDING_ENTRY_TYPE,
    approval_status: "Pending",
  };
  const before = structuredClone(record);
  assert.deepEqual(itemDetails(record, [pending]), {
    name: original,
    category: PENDING_CATEGORY,
    entry_type: PENDING_ENTRY_TYPE,
    approval_status: "Pending",
  });
  const approved: CatalogueItem = {
    ...pending,
    category: "Plant and equipment",
    entry_type: "Delivery",
    approval_status: "Approved",
  };
  assert.deepEqual(itemDetails(record, [approved]), {
    name: original,
    category: "Plant and equipment",
    entry_type: "Delivery",
    approval_status: "Approved",
  });
  assert.deepEqual(record, before);
  assert.equal(searchCatalogue([approved], "crane")[0].id, approved.id);
  const stillPending = upgradeCatalogue(
    [{ ...pending, name: "Concrete" }],
    company,
  ).find((item) => item.id === pending.id)!;
  assert.equal(
    stillPending.approval_status,
    "Pending",
    "Explicit review state must never auto-approve on refresh",
  );
  assert.equal(
    itemDetails({ material_id: "missing" }, []).category,
    PENDING_CATEGORY,
  );
});
