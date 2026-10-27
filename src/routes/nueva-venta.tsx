import { createFileRoute } from "@tanstack/react-router";
import { EmptyPage } from "@/components/empty-page";

export const Route = createFileRoute("/nueva-venta")({
  head: () => ({
    meta: [
      { title: "Nueva venta · Corralón" },
      { name: "description", content: "Nueva venta del corralón." },
      { property: "og:title", content: "Nueva venta · Corralón" },
      { property: "og:description", content: "Nueva venta del corralón." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <EmptyPage title="Nueva venta" />,
});
