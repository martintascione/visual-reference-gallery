import { createFileRoute } from "@tanstack/react-router";
import { EmptyPage } from "@/components/empty-page";

export const Route = createFileRoute("/notificaciones")({
  head: () => ({
    meta: [
      { title: "Notificaciones · Corralón" },
      { name: "description", content: "Notificaciones del corralón." },
      { property: "og:title", content: "Notificaciones · Corralón" },
      { property: "og:description", content: "Notificaciones del corralón." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <EmptyPage title="Notificaciones" />,
});
