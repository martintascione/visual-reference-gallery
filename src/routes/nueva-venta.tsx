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
  // ?modo=presupuesto: entrar directo a armar un presupuesto (desde Presupuestos).
  validateSearch: (s: Record<string, unknown>): { modo?: "presupuesto" | "lista" | undefined } =>
    s["modo"] === "presupuesto" || s["modo"] === "lista" ? { modo: s["modo"] } : {},
  component: NuevaVenta,
});

function NuevaVenta() {
  const { db, pendingQuoteId, editQuoteId, setEditQuote, editSaleId, setEditSale } = useStore();
  // Al salir de la pantalla se descarta la edición pendiente.
  useEffect(
    () => () => {
      setEditQuote(undefined);
      setEditSale(undefined);
    },
    [setEditQuote, setEditSale],
  );
  const editSale = db.sales.find((x) => x.id === editSaleId);
  const fromQuote = db.quotes.find((q) => q.id === pendingQuoteId);
  const editQuote = db.quotes.find((q) => q.id === editQuoteId);
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  type Mode = "venta" | "presupuesto" | "lista";
  const [mode, setModeState] = useState<Mode>(search.modo ?? "venta");
  // Si se vuelve a entrar con otro modo (ej. desde Presupuestos), se respeta.
  useEffect(() => {
    setModeState(search.modo ?? "venta");
  }, [search.modo]);
  const setMode = (m: Mode) => {
    setModeState(m);
    void navigate({ search: m === "venta" ? {} : { modo: m }, replace: true });
  };

  if (editSale)
    return (
      <>
        <PageHeader
          title={`Editar venta #${editSale.number}`}
          subtitle={`${editSale.clientName} · al guardar se corrigen el stock, la caja y las cuotas`}
        />
        <SaleForm key={"edit-sale" + editSale.id} mode="venta" editSale={editSale} />
      </>
    );

  if (editQuote)
    return (
      <>
        <PageHeader
          title={`Editar ${editQuote.priceList ? "lista de precios" : "presupuesto"} #${editQuote.number}`}
          subtitle={`${editQuote.clientName || "Sin cliente"} · al guardar se actualiza el mismo presupuesto`}
        />
        <SaleForm
          key={"edit" + editQuote.id}
          mode={editQuote.priceList ? "lista" : "presupuesto"}
          editQuote={editQuote}
        />
      </>
    );

  return (
    <>
      <PageHeader
        title={
          mode === "venta"
            ? "Nueva venta"
            : mode === "lista"
              ? "Nueva lista de precios"
              : "Nuevo presupuesto"
        }
        subtitle={
          fromQuote
            ? `Convirtiendo el presupuesto #${fromQuote.number}`
            : mode === "lista"
              ? "Cada producto con su total, sin sumarlos: para que el cliente compare y elija"
              : mode === "presupuesto"
                ? "Se guarda en Presupuestos, no descuenta stock ni cobra"
                : "Mostrador: descuenta stock y registra el cobro"
        }
      >
        {!fromQuote && (
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: "venta", label: "Venta" },
              { value: "presupuesto", label: "Presupuesto" },
              { value: "lista", label: "Lista de precios" },
            ]}
          />
        )}
      </PageHeader>
      <SaleForm
        key={fromQuote?.id ?? "nueva"}
        mode={fromQuote ? "venta" : mode}
        fromQuote={fromQuote}
      />
    </>
  );
}
