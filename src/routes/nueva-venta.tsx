import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
  const { db, pendingQuoteId, editQuoteId, setEditQuote } = useStore();
  // Al salir de la pantalla se descarta la edición pendiente.
  useEffect(() => () => setEditQuote(undefined), [setEditQuote]);
  const fromQuote = db.quotes.find((q) => q.id === pendingQuoteId);
  const editQuote = db.quotes.find((q) => q.id === editQuoteId);
  const [mode, setMode] = useState<"venta" | "presupuesto">("venta");

  if (editQuote)
    return (
      <>
        <PageHeader
          title={`Editar presupuesto #${editQuote.number}`}
          subtitle={`${editQuote.clientName || "Sin cliente"} · al guardar se actualiza el mismo presupuesto`}
        />
        <SaleForm key={"edit" + editQuote.id} mode="presupuesto" editQuote={editQuote} />
      </>
    );

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
