import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DJ Civils",
    short_name: "DJ Civils",
    description: "DJ Civils construction delivery capture and verification",
    start_url: "/",
    display: "standalone",
    background_color: "#f8f8f8",
    theme_color: "#f8f8f8",
    icons: [
      {
        src: "/dj-civils-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/dj-civils-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/dj-civils-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
