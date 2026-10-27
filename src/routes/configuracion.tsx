import { createFileRoute } from "@tanstack/react-router";
import { EmptyPage } from "@/components/empty-page";

export const Route = createFileRoute("/configuracion")({
  head: () => ({
    meta: [
      { title: "Configuración · Corralón" },
      { name: "description", content: "Configuración del corralón." },
      { property: "og:title", content: "Configuración · Corralón" },
      { property: "og:description", content: "Configuración del corralón." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <EmptyPage title="Configuración" />,
});
