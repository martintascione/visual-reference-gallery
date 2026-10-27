import { createFileRoute } from "@tanstack/react-router";
import { EmptyPage } from "@/components/empty-page";

export const Route = createFileRoute("/presupuestos")({
  head: () => ({
    meta: [
      { title: "Presupuestos · Corralón" },
      { name: "description", content: "Presupuestos del corralón." },
      { property: "og:title", content: "Presupuestos · Corralón" },
      { property: "og:description", content: "Presupuestos del corralón." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <EmptyPage title="Presupuestos" />,
});
