/** Display names only: these sample profiles have no credentials or real accounts. */
export const demoProfiles = [
  { id: "b", name: "Bemigho Estano", initials: "BE" },
  { id: "olamilekan", name: "Olamilekan Alaga", initials: "OA" },
] as const;

export type DemoProfileId = (typeof demoProfiles)[number]["id"];
