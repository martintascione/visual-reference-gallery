import type { Cheque, ChequeStatus } from "./types";

export const chequeLabel: Record<ChequeStatus, string> = {
  cartera: "En cartera",
  depositado: "Depositado",
  acreditado: "Acreditado",
  endosado: "Entregado a proveedor",
  rechazado: "Rechazado",
  emitido: "Propio · emitido",
};

/** Quién le dio el cheque al corralón. */
export const chequeFrom = (c: Cheque) => (c.own ? "Chequera propia" : c.clientName || c.drawer);
