import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Sổ Tài Sản",
    short_name: "Sổ Tài Sản",
    description: "Theo dõi sổ tiết kiệm và tổng tài sản",
    start_url: "/",
    display: "standalone",
    background_color: "#f3f5f3",
    theme_color: "#0d6b5f",
    lang: "vi",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
