import { createFileRoute } from "@tanstack/react-router";
import { EmptyPage } from "@/components/empty-page";

export const Route = createFileRoute("/reportes")({
  head: () => ({
    meta: [
      { title: "Reportes · Corralón" },
      { name: "description", content: "Reportes del corralón." },
      { property: "og:title", content: "Reportes · Corralón" },
      { property: "og:description", content: "Reportes del corralón." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <EmptyPage title="Reportes" />,
});
