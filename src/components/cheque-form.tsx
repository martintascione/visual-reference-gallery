import { useState } from "react";
import { useStore } from "@/lib/store";
import { addDays, todayISO } from "@/lib/format";
import { Field, Input, Modal, NumberInput, Select, Toggle, btn } from "@/components/ui-bits";

/** Carga de un cheque recibido: queda en la cartera y en el historial de cheques. */
export function ChequeForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { db, addCheque } = useStore();
  const blank = () => ({
    number: "",
    bank: "",
    drawer: "",
    from: "",
    dueDate: addDays(todayISO(), 30),
    receivedDate: todayISO(),
    amount: 0,
    clientId: "",
    echeq: false,
  });
  const [c, setC] = useState(blank);
  const save = () => {
    const client = db.clients.find((x) => x.id === c.clientId);
    const from = client?.name ?? c.from.trim();
    addCheque({
      number: c.number,
      bank: c.bank,
      drawer: c.drawer.trim() || from,
      dueDate: c.dueDate,
      receivedDate: c.receivedDate || todayISO(),
      amount: c.amount,
      status: "cartera",
      clientId: client?.id,
      clientName: from || c.drawer.trim(),
      echeq: c.echeq,
    });
    setC(blank());
    onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title="Cargar cheque recibido">
      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Quién me lo dio"
          className={c.clientId ? "col-span-2" : ""}
          help="La persona o empresa que te entregó el cheque. Puede no ser el dueño original."
        >
          <Select value={c.clientId} onChange={(e) => setC({ ...c, clientId: e.target.value })}>
            <option value="">Otro (escribir el nombre)</option>
            {db.clients.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </Select>
        </Field>
        {!c.clientId && (
          <Field label="Nombre de quien lo dio">
            <Input value={c.from} onChange={(e) => setC({ ...c, from: e.target.value })} />
          </Field>
        )}
        <Field
          label="De quién es (librador)"
          help="El titular de la cuenta del cheque: quien lo firmó originalmente. Si lo dejás vacío se toma a quien te lo dio."
        >
          <Input value={c.drawer} onChange={(e) => setC({ ...c, drawer: e.target.value })} />
        </Field>
        <Field label="Banco emisor">
          <Input value={c.bank} onChange={(e) => setC({ ...c, bank: e.target.value })} />
        </Field>
        <Field label="N° de cheque">
          <Input value={c.number} onChange={(e) => setC({ ...c, number: e.target.value })} />
        </Field>
        <Field label="Monto">
          <NumberInput value={c.amount} onChange={(v) => setC({ ...c, amount: v })} prefix="$" />
        </Field>
        <Field label="Fecha de vencimiento (cobro)">
          <Input
            type="date"
            value={c.dueDate}
            onChange={(e) => setC({ ...c, dueDate: e.target.value })}
          />
        </Field>
        <Field label="Lo recibí el">
          <Input
            type="date"
            value={c.receivedDate}
            onChange={(e) => setC({ ...c, receivedDate: e.target.value })}
          />
        </Field>
        <div className="col-span-2">
          <Toggle checked={c.echeq} onChange={(v) => setC({ ...c, echeq: v })} label="Es e-cheq" />
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button className={btn.soft} onClick={onClose}>
          Cancelar
        </button>
        <button
          className={btn.primary}
          disabled={!c.number || !c.bank || c.amount <= 0}
          onClick={save}
        >
          Guardar en cartera
        </button>
      </div>
    </Modal>
  );
}
