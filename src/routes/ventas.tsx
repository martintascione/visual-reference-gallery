import { createFileRoute } from "@tanstack/react-router";
import { EmptyPage } from "@/components/empty-page";

export const Route = createFileRoute("/ventas")({
  head: () => ({
    meta: [
      { title: "Ventas · Corralón" },
      { name: "description", content: "Ventas del corralón." },
      { property: "og:title", content: "Ventas · Corralón" },
      { property: "og:description", content: "Ventas del corralón." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <EmptyPage title="Ventas" />,
});
