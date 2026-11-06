/** Display names only: these sample profiles have no credentials or real accounts. */
export const demoProfiles = [
  { id: "b", name: "B Traffic Marshal", initials: "B" },
  { id: "olamilekan", name: "Olamilekan Alaga", initials: "OA" },
] as const;

export type DemoProfileId = (typeof demoProfiles)[number]["id"];
