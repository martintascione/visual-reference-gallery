import { createFileRoute } from "@tanstack/react-router";
import { EmptyPage } from "@/components/empty-page";

export const Route = createFileRoute("/caja")({
  head: () => ({
    meta: [
      { title: "Caja y bancos · Corralón" },
      { name: "description", content: "Caja y bancos del corralón." },
      { property: "og:title", content: "Caja y bancos · Corralón" },
      { property: "og:description", content: "Caja y bancos del corralón." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <EmptyPage title="Caja y bancos" />,
});
