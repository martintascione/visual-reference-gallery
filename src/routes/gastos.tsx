import { createFileRoute } from "@tanstack/react-router";
import { EmptyPage } from "@/components/empty-page";

export const Route = createFileRoute("/gastos")({
  head: () => ({
    meta: [
      { title: "Gastos · Corralón" },
      { name: "description", content: "Gastos del corralón." },
      { property: "og:title", content: "Gastos · Corralón" },
      { property: "og:description", content: "Gastos del corralón." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <EmptyPage title="Gastos" />,
});
