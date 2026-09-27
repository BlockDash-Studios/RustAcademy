import { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "RustAcademy",
    short_name: "RustAcademy",
    description: "Learn Rust, earn XLM, build Web3 on Stellar",
    lang: "en",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    prefer_related_applications: false,
    categories: ["education", "productivity", "developer"],
    screenshots: [
      {
        src: "/screenshots/narrow-1.png",
        sizes: "540x720",
        type: "image/png",
        form_factor: "narrow",
      },
      {
        src: "/screenshots/wide-1.png",
        sizes: "1280x720",
        type: "image/png",
        form_factor: "wide",
      },
    ],
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Generate Link",
        short_name: "Generate",
        description: "Generate a new payment link",
        url: "/generator",
        icons: [
          {
            src: "/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
        ],
      },
      {
        name: "Dashboard",
        short_name: "Dashboard",
        description: "View your dashboard",
        url: "/dashboard",
        icons: [
          {
            src: "/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
        ],
      },
    ],
  };
}
