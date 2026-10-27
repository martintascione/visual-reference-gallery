import { createFileRoute } from "@tanstack/react-router";
import { EmptyPage } from "@/components/empty-page";

export const Route = createFileRoute("/calendario")({
  head: () => ({
    meta: [
      { title: "Calendario · Corralón" },
      { name: "description", content: "Calendario del corralón." },
      { property: "og:title", content: "Calendario · Corralón" },
      { property: "og:description", content: "Calendario del corralón." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <EmptyPage title="Calendario" />,
});
