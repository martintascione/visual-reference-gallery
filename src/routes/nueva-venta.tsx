import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader, Segmented } from "@/components/ui-bits";
import { SaleForm } from "@/components/sale-form";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/nueva-venta")({
  head: () => ({
    meta: [
      { title: "Nueva venta · Corralón" },
      { name: "description", content: "Cargar una venta o un presupuesto." },
    ],
  }),
  component: NuevaVenta,
});

function NuevaVenta() {
  const { db, pendingQuoteId } = useStore();
  const fromQuote = db.quotes.find((q) => q.id === pendingQuoteId);
  const [mode, setMode] = useState<"venta" | "presupuesto">("venta");

  return (
    <>
      <PageHeader
        title={mode === "venta" ? "Nueva venta" : "Nuevo presupuesto"}
        subtitle={fromQuote ? `Convirtiendo el presupuesto #${fromQuote.number}` : "Mostrador"}
      >
        {!fromQuote && (
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: "venta", label: "Venta" },
              { value: "presupuesto", label: "Presupuesto" },
            ]}
          />
        )}
      </PageHeader>
      <SaleForm
        key={(fromQuote?.id ?? "") + mode}
        mode={fromQuote ? "venta" : mode}
        fromQuote={fromQuote}
      />
    </>
  );
}
