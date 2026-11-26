import type { Bank, MethodConfig } from "@/lib/types";

/** Cuentas del negocio (las que entran en saldos, cierre y reportes). */
export const BUSINESS_BANKS: Bank[] = ["Caja", "BBVA", "Provincia"];

/** Cuenta aparte: Corralón El Tecla, CUIT responsable inscripto (Factura A). No se mezcla con el negocio. */
export const SEPARATE_BANK: Bank = "El Tecla";
export const SEPARATE_NAME = "Corralón El Tecla";

/** Cuenta corriente El Tecla ↔ Áridos: lo que los clientes le pagaron a Felix. Saldo + = El Tecla le debe a Áridos. */
export const FELIX_BANK: Bank = "Felix";
export const FELIX_NAME = "Cta. cte. Felix (El Tecla)";

/** Medio de cobro "Otra: Felix": el cliente le paga a Felix y queda en la cuenta corriente con El Tecla. */
export const FELIX_METHOD: MethodConfig = {
  id: "felix",
  label: "Otra: Felix (El Tecla)",
  method: "felix",
  bank: "Felix",
  feePct: 0,
  settleDays: 0,
  active: true,
};

export const bankLabel = (b: Bank) =>
  b === SEPARATE_BANK ? SEPARATE_NAME : b === FELIX_BANK ? FELIX_NAME : b;
