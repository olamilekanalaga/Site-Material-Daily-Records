import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DJ Civils Delivery Control",
    short_name: "DJ Civils",
    description: "DJ Civils construction delivery capture and verification",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f6f2",
    theme_color: "#111111",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
