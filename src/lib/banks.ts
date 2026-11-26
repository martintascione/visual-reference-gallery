import type { Bank, MethodConfig } from "@/lib/types";

/** Cuentas del negocio (las que entran en saldos, cierre y reportes). */
export const BUSINESS_BANKS: Bank[] = ["Caja", "BBVA", "BBVA CA", "Provincia"];

/** Felix y Corralón El Tecla son lo mismo (CUIT responsable inscripto, Factura A): una sola cuenta,
 *  aparte del negocio. Todo lo que entra ahí es plata de Áridos que tiene Felix. */
export const SEPARATE_BANK: Bank = "Felix";
export const SEPARATE_NAME = "Felix (Corralón El Tecla)";

/** Cuenta corriente El Tecla ↔ Áridos: lo que los clientes le pagaron a Felix. Saldo + = El Tecla le debe a Áridos. */
export const FELIX_BANK: Bank = "Felix";
export const FELIX_NAME = "Felix (Corralón El Tecla)";

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
  b === FELIX_BANK || b === "El Tecla"
    ? FELIX_NAME
    : b === "BBVA"
      ? "BBVA cta. cte."
      : b === "BBVA CA"
        ? "BBVA caja de ahorro"
        : b;
