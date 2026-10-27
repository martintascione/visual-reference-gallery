import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { fmtDate } from "@/lib/format";
import {
  Building2,
  CircleHelp,
  CreditCard,
  Lightbulb,
  Plus,
  Receipt,
  RotateCcw,
  Settings2,
  Trash2,
  Truck,
} from "lucide-react";
import type { Bank, FixedExpense, MethodConfig, PaymentMethod, Zone } from "@/lib/types";
import { useStore } from "@/lib/store";
import { ars, uid } from "@/lib/format";
import {
  Card,
  Field,
  Input,
  NumberInput,
  PageHeader,
  Select,
  Toggle,
  btn,
  tr,
  Table,
} from "@/components/ui-bits";

export const Route = createFileRoute("/configuracion")({
  head: () => ({
    meta: [
      { title: "Configuración · Corralón" },
      { name: "description", content: "Bancos, pasarelas, comisiones, fletes y gastos fijos." },
    ],
  }),
  component: Configuracion,
});

const banks: Bank[] = ["Caja", "BBVA", "Provincia"];
const methodNames: Record<PaymentMethod, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  debito: "Débito",
  credito: "Crédito",
  cheque: "Cheque",
  cta_cte: "Cuenta corriente",
};

function Configuracion() {
  const { db, updateSettings, resetDemo } = useStore();
  const s = db.settings;

  const setMethods = (methods: MethodConfig[]) => updateSettings({ methods });
  const updM = (id: string, patch: Partial<MethodConfig>) =>
    setMethods(s.methods.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  const addM = () =>
    setMethods([
      ...s.methods,
      {
        id: uid(),
        label: "Nuevo medio",
        method: "debito",
        bank: "BBVA",
        gateway: "Payway",
        feePct: 0,
        settleDays: 0,
        active: true,
      },
    ]);
  const delM = (id: string) => setMethods(s.methods.filter((m) => m.id !== id));

  const setZones = (zones: Zone[]) => updateSettings({ zones });
  const setFixed = (fixedExpenses: FixedExpense[]) => updateSettings({ fixedExpenses });

  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <>
      <PageHeader
        title="Configuración"
        subtitle="Valores que usan la calculadora, las ventas y el cierre del día"
      >
        {confirmReset ? (
          <>
            <span className="text-xs text-muted-foreground">
              ¿Borrar todas las ventas, productos y clientes? No se puede deshacer.
            </span>
            <button
              className={btn.danger}
              onClick={() => {
                resetDemo();
                setConfirmReset(false);
              }}
            >
              Sí, borrar todo
            </button>
            <button className={btn.soft} onClick={() => setConfirmReset(false)}>
              No
            </button>
          </>
        ) : (
          <>
            <button
              className={btn.soft}
              onClick={() => window.dispatchEvent(new Event("abrir-tour"))}
            >
              <CircleHelp className="h-3.5 w-3.5" /> Recorrido guiado
            </button>
            <button className={btn.ghost} onClick={() => setConfirmReset(true)}>
              <RotateCcw className="h-3.5 w-3.5" /> Borrar todos los datos
            </button>
          </>
        )}
      </PageHeader>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Negocio y valores por defecto" icon={Settings2}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="Nombre del negocio" className="col-span-2 sm:col-span-3">
              <Input
                value={s.businessName}
                onChange={(e) => updateSettings({ businessName: e.target.value })}
              />
            </Field>
            <Field label="WhatsApp" hint="Va al pie de presupuestos">
              <Input
                value={s.phone ?? ""}
                onChange={(e) => updateSettings({ phone: e.target.value })}
              />
            </Field>
            <Field label="Instagram">
              <Input
                value={s.instagram ?? ""}
                onChange={(e) => updateSettings({ instagram: e.target.value })}
              />
            </Field>
            <Field label="Dirección">
              <Input
                value={s.address ?? ""}
                onChange={(e) => updateSettings({ address: e.target.value })}
              />
            </Field>
            <Field label="Localidad">
              <Input
                value={s.city ?? ""}
                onChange={(e) => updateSettings({ city: e.target.value })}
              />
            </Field>
            <Field label="Saludo del presupuesto" className="col-span-2">
              <Input
                value={s.quoteFooter ?? ""}
                onChange={(e) => updateSettings({ quoteFooter: e.target.value })}
              />
            </Field>
            <Field label="Kg por bolsón">
              <NumberInput
                value={s.bagKg}
                onChange={(v) => updateSettings({ bagKg: v })}
                suffix="kg"
              />
            </Field>
            <Field label="Embalaje por bolsón">
              <NumberInput
                value={s.packagingPerBag}
                onChange={(v) => updateSettings({ packagingPerBag: v })}
                prefix="$"
              />
            </Field>
            <Field label="Descarga por tonelada">
              <NumberInput
                value={s.unloadPerTon}
                onChange={(v) => updateSettings({ unloadPerTon: v })}
                prefix="$"
                suffix="/ t"
              />
            </Field>
            <Field
              label="Flete de compra por tonelada"
              hint="Lo que te cobra el camión que trae la piedra"
            >
              <NumberInput
                value={s.freightPerTon ?? 0}
                onChange={(v) => updateSettings({ freightPerTon: v })}
                prefix="$"
                suffix="/ t"
              />
            </Field>
            <Field label="Margen de ganancia habitual" hint="Se propone en cada producto nuevo">
              <NumberInput
                value={s.defaultMarginPct ?? 40}
                onChange={(v) => updateSettings({ defaultMarginPct: v })}
                suffix="%"
              />
            </Field>
            <Field label="IVA por defecto">
              <NumberInput
                value={s.ivaPct}
                onChange={(v) => updateSettings({ ivaPct: v })}
                suffix="%"
              />
            </Field>
            <Field label="Margen mínimo (avisa en rojo)">
              <NumberInput
                value={s.minMarginPct}
                onChange={(v) => updateSettings({ minMarginPct: v })}
                suffix="%"
              />
            </Field>
            <Field label="Validez de presupuestos">
              <NumberInput
                value={s.quoteValidDays}
                onChange={(v) => updateSettings({ quoteValidDays: v })}
                suffix="días"
              />
            </Field>
            <Field label="Recordar seguimiento a los">
              <NumberInput
                value={s.followUpDays}
                onChange={(v) => updateSettings({ followUpDays: v })}
                suffix="días"
              />
            </Field>
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Los valores por defecto se proponen al crear un producto nuevo; cada producto puede
            cambiarlos.
          </p>
        </Card>

        <Card title="Cuentas" icon={Building2}>
          <div className="grid gap-3 sm:grid-cols-3">
            {banks.map((b) => (
              <div key={b} className="rounded-3xl bg-surface p-4">
                <p className="text-xs text-muted-foreground">
                  {b === "Caja" ? "Efectivo en el local" : "Cuenta bancaria"}
                </p>
                <p className="mt-1 text-lg font-bold">{b}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Cada venta, cobro, gasto y débito se asigna a una de estas cuentas. En Caja y bancos se
            ve el saldo de cada una.
          </p>
        </Card>

        <Card
          title="Medios de cobro, pasarelas y comisiones"
          icon={CreditCard}
          className="xl:col-span-2"
          action={
            <button className={btn.ghost} onClick={addM}>
              <Plus className="h-3.5 w-3.5" /> Agregar medio
            </button>
          }
        >
          <p className="mb-3 text-xs text-muted-foreground">
            Acá se define con qué banco liquida cada producto de Payway, qué comisión cobra y en
            cuántos días acredita. Las comisiones cargadas son de ejemplo: hay que reemplazarlas por
            las reales del contrato con Payway y cada banco.
          </p>
          <Table
            head={[
              "Nombre",
              "Tipo",
              "Pasarela",
              "Banco",
              { label: "Comisión", right: true },
              { label: "Días", right: true },
              "Activo",
              "",
            ]}
            min={820}
          >
            {s.methods.map((m) => (
              <tr key={m.id} className={tr}>
                <td>
                  <Input
                    value={m.label}
                    onChange={(e) => updM(m.id, { label: e.target.value })}
                    className="min-w-44"
                  />
                </td>
                <td>
                  <Select
                    value={m.method}
                    onChange={(e) => updM(m.id, { method: e.target.value as PaymentMethod })}
                    className="min-w-36"
                  >
                    {(Object.keys(methodNames) as PaymentMethod[]).map((k) => (
                      <option key={k} value={k}>
                        {methodNames[k]}
                      </option>
                    ))}
                  </Select>
                </td>
                <td>
                  <Select
                    value={m.gateway ?? ""}
                    onChange={(e) => updM(m.id, { gateway: e.target.value ? "Payway" : undefined })}
                    className="min-w-28"
                  >
                    <option value="">Ninguna</option>
                    <option value="Payway">Payway</option>
                  </Select>
                </td>
                <td>
                  <Select
                    value={m.bank}
                    onChange={(e) => updM(m.id, { bank: e.target.value as Bank })}
                    className="min-w-28"
                  >
                    {banks.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </Select>
                </td>
                <td>
                  <NumberInput
                    value={m.feePct}
                    onChange={(v) => updM(m.id, { feePct: v })}
                    step="0.1"
                    suffix="%"
                    className="w-24"
                  />
                </td>
                <td>
                  <NumberInput
                    value={m.settleDays}
                    onChange={(v) => updM(m.id, { settleDays: v })}
                    className="w-20"
                  />
                </td>
                <td>
                  <Toggle checked={m.active} onChange={(v) => updM(m.id, { active: v })} />
                </td>
                <td className="text-right">
                  <button className={btn.icon} onClick={() => delM(m.id)} aria-label="Quitar">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </Table>
        </Card>

        <Card
          title="Zonas de flete"
          icon={Truck}
          action={
            <button
              className={btn.ghost}
              onClick={() =>
                setZones([...s.zones, { id: uid(), name: "Nueva zona", price: 0, cost: 0 }])
              }
            >
              <Plus className="h-3.5 w-3.5" /> Agregar zona
            </button>
          }
        >
          <Table
            head={[
              "Zona",
              { label: "Cobra al cliente", right: true },
              { label: "Costo del viaje", right: true },
              { label: "Gana", right: true },
              "",
            ]}
            min={460}
          >
            {s.zones.map((z) => (
              <tr key={z.id} className={tr}>
                <td>
                  <Input
                    value={z.name}
                    onChange={(e) =>
                      setZones(
                        s.zones.map((x) => (x.id === z.id ? { ...x, name: e.target.value } : x)),
                      )
                    }
                  />
                </td>
                <td>
                  <NumberInput
                    value={z.price}
                    onChange={(v) =>
                      setZones(s.zones.map((x) => (x.id === z.id ? { ...x, price: v } : x)))
                    }
                    prefix="$"
                    className="w-32"
                  />
                </td>
                <td>
                  <NumberInput
                    value={z.cost}
                    onChange={(v) =>
                      setZones(s.zones.map((x) => (x.id === z.id ? { ...x, cost: v } : x)))
                    }
                    prefix="$"
                    className="w-32"
                  />
                </td>
                <td
                  className={`text-right tabular-nums ${z.price - z.cost < 0 ? "text-danger-soft-foreground" : ""}`}
                >
                  {ars(z.price - z.cost)}
                </td>
                <td className="text-right">
                  <button
                    className={btn.icon}
                    onClick={() => setZones(s.zones.filter((x) => x.id !== z.id))}
                    aria-label="Quitar"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </Table>
          <p className="mt-3 text-[11px] text-muted-foreground">
            El costo del viaje (gasoil, chofer, peajes) se descuenta de la ganancia de la venta. Si
            una zona da pérdida aparece en rojo.
          </p>
        </Card>

        <Card
          title="Gastos fijos mensuales"
          icon={Receipt}
          action={
            <button
              className={btn.ghost}
              onClick={() =>
                setFixed([
                  ...s.fixedExpenses,
                  { id: uid(), concept: "Nuevo gasto", amount: 0, account: "BBVA", day: 10 },
                ])
              }
            >
              <Plus className="h-3.5 w-3.5" /> Agregar
            </button>
          }
        >
          <Table
            head={[
              "Concepto",
              { label: "Monto", right: true },
              "Cuenta",
              { label: "Día", right: true },
              "",
            ]}
            min={460}
          >
            {s.fixedExpenses.map((f) => (
              <tr key={f.id} className={tr}>
                <td>
                  <Input
                    value={f.concept}
                    onChange={(e) =>
                      setFixed(
                        s.fixedExpenses.map((x) =>
                          x.id === f.id ? { ...x, concept: e.target.value } : x,
                        ),
                      )
                    }
                  />
                </td>
                <td>
                  <NumberInput
                    value={f.amount}
                    onChange={(v) =>
                      setFixed(
                        s.fixedExpenses.map((x) => (x.id === f.id ? { ...x, amount: v } : x)),
                      )
                    }
                    prefix="$"
                    className="w-36"
                  />
                </td>
                <td>
                  <Select
                    value={f.account}
                    onChange={(e) =>
                      setFixed(
                        s.fixedExpenses.map((x) =>
                          x.id === f.id ? { ...x, account: e.target.value as Bank } : x,
                        ),
                      )
                    }
                    className="w-28"
                  >
                    {banks.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </Select>
                </td>
                <td>
                  <NumberInput
                    value={f.day}
                    onChange={(v) =>
                      setFixed(s.fixedExpenses.map((x) => (x.id === f.id ? { ...x, day: v } : x)))
                    }
                    className="w-20"
                  />
                </td>
                <td className="text-right">
                  <button
                    className={btn.icon}
                    onClick={() => setFixed(s.fixedExpenses.filter((x) => x.id !== f.id))}
                    aria-label="Quitar"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </Table>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Total {ars(s.fixedExpenses.reduce((a, f) => a + f.amount, 0))} por mes ·{" "}
            {ars(Math.round(s.fixedExpenses.reduce((a, f) => a + f.amount, 0) / 30))} por día se
            prorratea en cada cierre.
          </p>
        </Card>
        <FeatureRequests />
      </div>
    </>
  );
}

type FeatureRequest = {
  id: string;
  created_at: string;
  titulo: string;
  descripcion: string;
  flujo: string | null;
  datos: string | null;
  prioridad: string;
  estado: string;
};

/** Mejoras pedidas desde el asistente, para que el programador las vea. */
function FeatureRequests() {
  const [list, setList] = useState<FeatureRequest[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const load = () =>
    supabase
      .from("feature_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) setErr(error.message);
        else setList((data ?? []) as FeatureRequest[]);
      });
  useEffect(() => {
    void load();
  }, []);
  const setEstado = async (id: string, estado: string) => {
    await supabase.from("feature_requests").update({ estado }).eq("id", id);
    void load();
  };
  return (
    <Card title="Mejoras pedidas desde el asistente" icon={Lightbulb} className="xl:col-span-2">
      {err && (
        <p className="text-xs text-danger-soft-foreground">
          No se pudo leer la lista: {err}. ¿Se corrió el SQL de mejoras.sql?
        </p>
      )}
      {!err && list.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Todavía no hay pedidos. Cuando alguien le pide al asistente algo que el sistema no hace,
          queda anotado acá con el flujo y los datos que necesita.
        </p>
      )}
      <div className="flex flex-col gap-2">
        {list.map((f) => (
          <div key={f.id} className="rounded-2xl bg-surface p-3 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold">{f.titulo}</p>
                <p className="text-[11px] text-muted-foreground">
                  {fmtDate(f.created_at)} · prioridad {f.prioridad}
                </p>
              </div>
              <Select
                value={f.estado}
                onChange={(e) => void setEstado(f.id, e.target.value)}
                className="h-8 w-40 text-xs"
              >
                <option value="pendiente">Pendiente</option>
                <option value="en_desarrollo">En desarrollo</option>
                <option value="listo">Listo</option>
                <option value="descartado">Descartado</option>
              </Select>
            </div>
            <p className="mt-2 text-xs">{f.descripcion}</p>
            {f.flujo && <p className="mt-1 text-xs text-muted-foreground">Flujo: {f.flujo}</p>}
            {f.datos && <p className="mt-1 text-xs text-muted-foreground">Datos: {f.datos}</p>}
          </div>
        ))}
      </div>
    </Card>
  );
}
