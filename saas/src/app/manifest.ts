import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DJ Civils Delivery Control",
    short_name: "DJ Civils",
    description: "DJ Civils construction delivery capture and verification",
    start_url: "/",
    display: "standalone",
    background_color: "#f8f8f8",
    theme_color: "#f8f8f8",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
