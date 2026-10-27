import { createFileRoute } from "@tanstack/react-router";
import { EmptyPage } from "@/components/empty-page";

export const Route = createFileRoute("/stock")({
  head: () => ({
    meta: [
      { title: "Stock · Corralón" },
      { name: "description", content: "Stock del corralón." },
      { property: "og:title", content: "Stock · Corralón" },
      { property: "og:description", content: "Stock del corralón." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <EmptyPage title="Stock" />,
});
