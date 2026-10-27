import { createFileRoute } from "@tanstack/react-router";
import { EmptyPage } from "@/components/empty-page";

export const Route = createFileRoute("/clientes")({
  head: () => ({
    meta: [
      { title: "Clientes y cuentas corrientes · Corralón" },
      { name: "description", content: "Clientes y cuentas corrientes del corralón." },
      { property: "og:title", content: "Clientes y cuentas corrientes · Corralón" },
      { property: "og:description", content: "Clientes y cuentas corrientes del corralón." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <EmptyPage title="Clientes y cuentas corrientes" />,
});
