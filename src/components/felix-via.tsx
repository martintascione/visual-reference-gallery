import { Field, Input, Select } from "@/components/ui-bits";

/** Cómo le pagó el cliente a Felix (El Tecla): queda escrito en la cuenta corriente con Felix. */
export const FELIX_HOWS = ["Efectivo", "Transferencia", "Cheque", "e-cheq", "Otro"] as const;

export type FelixVia = { how: string; detail: string };

export const viaText = (v: FelixVia) => `${v.how}${v.detail.trim() ? " · " + v.detail.trim() : ""}`;

export const viaParse = (t?: string): FelixVia => {
  const [how, ...rest] = (t ?? "").split(" · ");
  return { how: how || "Efectivo", detail: rest.join(" · ") };
};

export function FelixViaFields({
  value,
  onChange,
}: {
  value: FelixVia;
  onChange: (v: FelixVia) => void;
}) {
  const isCheque = value.how === "Cheque" || value.how === "e-cheq";
  return (
    <div className="grid grid-cols-2 gap-2">
      <Field label="Cómo le pagó a Felix">
        <Select value={value.how} onChange={(e) => onChange({ ...value, how: e.target.value })}>
          {FELIX_HOWS.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={isCheque ? "N°, banco y vencimiento" : "Detalle (opcional)"}>
        <Input
          value={value.detail}
          onChange={(e) => onChange({ ...value, detail: e.target.value })}
          placeholder={isCheque ? "N° 1234 · Galicia · vence 10/12" : "Cuenta, comprobante…"}
        />
      </Field>
    </div>
  );
}
