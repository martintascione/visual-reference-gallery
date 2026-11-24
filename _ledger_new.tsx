export function Ledger({ account, onClose }: { account: Account | null; onClose: () => void }) {
  const { db, addSupplierPayment, removeSupplierPayment, setSupplierReminder } = useStore();
  const [v, setV] = useState<PayNow>(payBlank);
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState(todayISO());
  const [view, setView] = useState<string>("todo");
  const accKey = account ? account.kind + account.party : "";
  useEffect(() => setView("todo"), [accKey]);
  if (!account) return null;
  const mine = (party: string | undefined) =>
    !!party && party.trim().toLowerCase() === account.party.toLowerCase();

  // Deudas cargadas a mano: cada una con sus cuotas, separadas de las descargas.
  const groups = [...new Set(account.entries.filter((e) => e.group).map((e) => e.group!))].map(
    (g) => {
      const cuotas = account.entries
        .filter((e) => e.group === g)
        .sort((a, b) => (a.due ?? a.date).localeCompare(b.due ?? b.date));
      const first = cuotas[0]!;
      const detail = (first.note ?? "").replace(/^Cuota \d+\/\d+( · )?/, "").trim();
      return {
        id: g,
        cuotas,
        label: detail || `Deuda del ${fmtDay(first.date)}`,
        total: cuotas.reduce((a, c) => a + c.amount, 0),
        rest: cuotas.reduce((a, c) => a + c.rest, 0),
        paidCount: cuotas.filter((c) => c.rest <= 0.5).length,
      };
    },
  );
  const groupOfPurchase = new Map(
    account.entries.filter((e) => e.group).map((e) => [e.purchaseId, e.group!]),
  );
  const hasOther = account.entries.some((e) => !e.group);

  const rows = [
    ...db.purchases.flatMap((p) => {
      if (p.debtOnly) return [];
      const row = (id: string, detail: string, debe: number) => ({
        id,
        date: p.date,
        detail,
        debe,
        haber: 0,
        payId: "",
      });
      if (account.kind === "cantera")
        return mine(p.supplier)
          ? [
              row(
                p.id,
                `${p.items.map((i) => `${i.name} ${num(i.tons, 2)}`).join(", ")}${p.remito ? ` · Rto ${p.remito}` : ""}`,
                p.items.reduce((a, i) => a + i.total, 0),
              ),
            ]
          : [];
      return [
        ...(mine(p.carrier) && p.freightTotal > 0
          ? [
              row(
                p.id,
                `Flete ${p.supplier}${p.freightTons ? ` · ${num(p.freightTons, 2)} t` : ""}`,
                p.freightTotal,
              ),
            ]
          : []),
        ...(mine(p.unloadBy) && p.unloadCost > 0
          ? [row(p.id + "-d", `Descarga ${p.supplier}`, p.unloadCost)]
          : []),
      ];
    }),
    ...db.supplierPayments
      .filter(
        (p) =>
          p.kind === account.kind &&
          mine(p.party) &&
          !(p.purchaseId && groupOfPurchase.has(p.purchaseId)),
      )
      .map((p) => ({
        id: p.id,
        date: p.date,
        detail: `${methodName[p.method]}${p.detail ? " · " + p.detail : ""}${p.liters ? ` · ${num(p.liters)} L` : ""}${p.method === "cheque" && p.dueDate ? ` · cobra el ${fmtDate(p.dueDate)}` : ""}${p.account ? ` · ${p.account}` : ""}`,
        debe: 0,
        haber: p.amount,
        payId: p.id,
      })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  let run = 0;
  const withSaldo = rows.map((r) => ({ ...r, saldo: (run += r.debe - r.haber) }));
  const otherSaldo = account.entries.filter((e) => !e.group).reduce((a, e) => a + e.rest, 0);

  const pay = () => {
    addSupplierPayment(
      {
        date: date === todayISO() ? new Date().toISOString() : date + "T12:00:00.000Z",
        party: account.party,
        kind: account.kind,
        amount,
        method: v.method,
        account:
          v.method === "gasoil"
            ? undefined
            : v.method === "efectivo"
              ? "Caja"
              : v.account === "Caja"
                ? "BBVA"
                : v.account,
        detail: v.method === "cheque" && v.detail ? `Cheque ${v.detail}` : undefined,
        dueDate: v.method === "cheque" ? v.dueDate : undefined,
        liters: v.method === "gasoil" ? v.liters || undefined : undefined,
      },
      chequeOf(v),
    );
    setAmount(0);
    setV(payBlank());
  };

  const shown = view === "todo" ? groups : groups.filter((g) => g.id === view);
  const showOther = view === "todo" || view === "otros";

  return (
    <Modal
      open
      onClose={onClose}
      title={account.party}
      subtitle={`${account.kind === "cantera" ? "Cantera / proveedor" : "Transporte o descarga"} · ${account.saldo > 0 ? `se le debe ${ars(account.saldo)}` : account.saldo < 0 ? `saldo a favor del corralón ${ars(-account.saldo)}` : "al día"}`}
      wide
    >
      <div className="flex flex-col gap-4">
        {groups.length > 0 && (groups.length > 1 || hasOther) && (
          <div className="flex flex-wrap gap-1.5">
            <button
              className={view === "todo" ? btn.soft : btn.ghost}
              onClick={() => setView("todo")}
            >
              Todo
            </button>
            {groups.map((g, k) => (
              <button
                key={g.id}
                className={view === g.id ? btn.soft : btn.ghost}
                onClick={() => setView(g.id)}
              >
                Deuda {k + 1}: {g.label.length > 28 ? g.label.slice(0, 28) + "…" : g.label}
              </button>
            ))}
            {hasOther && (
              <button
                className={view === "otros" ? btn.soft : btn.ghost}
                onClick={() => setView("otros")}
              >
                Descargas y fletes
              </button>
            )}
          </div>
        )}

        {shown.map((g) => (
          <DebtCard
            key={g.id}
            group={g}
            account={account}
            index={groups.indexOf(g) + 1}
            open={view !== "todo" || groups.length === 1}
            onOpen={() => setView(g.id)}
          />
        ))}

        {showOther && (hasOther || groups.length === 0 || rows.length > 0) && (
          <>
            {groups.length > 0 && (
              <p className="-mb-2 text-xs font-semibold">
                Descargas, fletes y pagos sueltos
                {otherSaldo > 0.5 ? ` · se debe ${ars(otherSaldo)}` : ""}
              </p>
            )}
            <Table
              head={[
                "Fecha",
                "Detalle",
                { label: "Debe", right: true },
                { label: "Pagado", right: true },
                { label: "Saldo", right: true },
                "",
              ]}
              min={560}
            >
              {withSaldo.map((r) => (
                <tr key={r.id} className={tr}>
                  <td className="whitespace-nowrap">{fmtDate(r.date)}</td>
                  <td className="text-xs">{r.detail}</td>
                  <td className="text-right tabular-nums">{r.debe ? ars(r.debe) : ""}</td>
                  <td className="text-right tabular-nums text-success-foreground">
                    {r.haber ? ars(r.haber) : ""}
                  </td>
                  <td
                    className={`text-right font-semibold tabular-nums ${r.saldo > 0 ? "text-danger-soft-foreground" : ""}`}
                  >
                    {ars(r.saldo)}
                  </td>
                  <td className="text-right">
                    {r.payId && (
                      <button
                        className={btn.icon}
                        onClick={() => removeSupplierPayment(r.payId)}
                        aria-label="Borrar pago"
                        title="Borrar este pago"
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.6} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </Table>

            {account.saldo > 0 && groups.length === 0 && (
              <div className="on-surface flex flex-wrap items-center gap-2 rounded-3xl bg-surface p-4 text-xs">
                <span className="font-semibold">Avisarme para pagar el saldo el</span>
                <span className="w-40">
                  <Input
                    type="date"
                    value={account.remind ?? ""}
                    onChange={(e) =>
                      setSupplierReminder(account.kind, account.party, e.target.value || undefined)
                    }
                  />
                </span>
                {[7, 15, 30, 60].map((d) => (
                  <button
                    key={d}
                    type="button"
                    className={btn.ghost}
                    onClick={() =>
                      setSupplierReminder(account.kind, account.party, addDays(todayISO(), d))
                    }
                  >
                    {d} d
                  </button>
                ))}
                {account.remind ? (
                  <button
                    type="button"
                    className={btn.ghost}
                    onClick={() => setSupplierReminder(account.kind, account.party)}
                  >
                    Quitar aviso
                  </button>
                ) : (
                  <span className="text-muted-foreground">Sin aviso cargado</span>
                )}
              </div>
            )}

            <div className="on-surface rounded-3xl bg-surface p-4">
              <p className="mb-3 text-xs font-semibold">
                Registrar un pago{groups.length ? " suelto (se descuenta de lo que vence antes)" : ""}
              </p>
              <div className="mb-3 grid grid-cols-2 gap-x-3">
                <Field label="Monto">
                  <NumberInput value={amount} onChange={setAmount} prefix="$" />
                </Field>
                <Field label="Fecha">
                  <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </Field>
              </div>
              <PayFields
                v={v}
                set={(p) => setV((x) => ({ ...x, ...p }))}
                allowGasoil={account.kind === "transporte"}
                onAmount={setAmount}
              />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                {account.saldo > 0 ? (
                  <button className={btn.ghost} onClick={() => setAmount(account.saldo)}>
                    Pagar todo el saldo ({ars(account.saldo)})
                  </button>
                ) : (
                  <span />
                )}
                <button className={btn.primary} disabled={amount <= 0} onClick={pay}>
                  Registrar pago {amount > 0 ? ars(amount) : ""}
                </button>
              </div>
              {v.method === "gasoil" && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  El gasoil descuenta la deuda con el transporte, pero no saca plata de caja ni de
                  los bancos: queda en la cuenta de la estación de servicio.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

type DebtGroup = {
  id: string;
  cuotas: Account["entries"];
  label: string;
  total: number;
  rest: number;
  paidCount: number;
};

/** Una deuda cargada a mano con sus cuotas: marcar pagada, editar o eliminar desde la lista. */
function DebtCard({
  group,
  account,
  index,
  open,
  onOpen,
}: {
  group: DebtGroup;
  account: Account;
  index: number;
  open: boolean;
  onOpen: () => void;
}) {
  const { db, addSupplierPayment, removeSupplierPayment, updatePurchase, removePurchase } =
    useStore();
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [payFor, setPayFor] = useState<string | null>(null);
  const [payAmt, setPayAmt] = useState(0);
  const [payDate, setPayDate] = useState(todayISO());
  const [payHow, setPayHow] = useState<"transferencia|BBVA" | "transferencia|Provincia" | "efectivo|Caja">(
    "transferencia|BBVA",
  );
  const [label, setLabel] = useState(group.label);
  useEffect(() => setLabel(group.label), [group.label]);
  const today = todayISO();
  const n = group.cuotas.length;
  const next = group.cuotas.find((c) => c.rest > 0.5);
  const purchaseOf = (id: string) => db.purchases.find((p) => p.id === id);

  // Guarda un cambio de una cuota (importe, vencimiento o detalle) sin tocar el resto.
  const saveCuota = (
    id: string,
    patch: { amount?: number; due?: string; note?: string | undefined },
  ) => {
    const p = purchaseOf(id);
    if (!p) return;
    const { id: _id, ...base } = p;
    const amount = patch.amount;
    updatePurchase(
      id,
      {
        ...base,
        ...(patch.note !== undefined ? { note: patch.note || undefined } : {}),
        ...(account.kind === "cantera"
          ? {
              ...(amount !== undefined
                ? { items: [{ ...(p.items[0] ?? { name: "Deuda", tons: 0, pricePerTon: 0 }), total: Math.round(amount) }] }
                : {}),
              ...(patch.due !== undefined ? { payDue: patch.due || undefined } : {}),
            }
          : {
              ...(amount !== undefined ? { freightTotal: Math.round(amount) } : {}),
              ...(patch.due !== undefined ? { freightDue: patch.due || undefined } : {}),
            }),
      },
      false,
    );
  };
  const saveLabel = () => {
    const t = label.trim();
    if (t === group.label) return;
    group.cuotas.forEach((c, k) =>
      saveCuota(c.purchaseId, {
        note: n > 1 ? `Cuota ${k + 1}/${n}${t ? " · " + t : ""}` : t,
      }),
    );
  };
  const markPaid = (c: Account["entries"][number], k: number) => {
    const [method, acc] = payHow.split("|") as ["transferencia" | "efectivo", Bank];
    addSupplierPayment({
      date: payDate === today ? new Date().toISOString() : payDate + "T12:00:00.000Z",
      party: account.party,
      kind: account.kind,
      amount: payAmt,
      method,
      account: acc,
      detail: n > 1 ? `Cuota ${k + 1}/${n}` : undefined,
      purchaseId: c.purchaseId,
    });
    setPayFor(null);
  };

  return (
    <div className="on-surface rounded-3xl bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-muted-foreground">Deuda {index}</p>
          {editing ? (
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onBlur={saveLabel}
              placeholder="Detalle de la deuda"
              className="mt-1 h-9 w-72"
            />
          ) : (
            <p className="text-sm font-semibold">{group.label}</p>
          )}
          <p className="text-xs text-muted-foreground">
            {n > 1 ? `${n} cuotas · ${group.paidCount} pagadas · ` : ""}total {ars(group.total)} ·{" "}
            {group.rest > 0.5 ? (
              <b className="text-danger-soft-foreground">falta {ars(group.rest)}</b>
            ) : (
              <span className="text-success-foreground">pagada</span>
            )}
            {!open && next ? ` · próxima ${fmtDay(next.due ?? next.date)} ${ars(next.rest)}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {!open ? (
            <button className={btn.ghost} onClick={onOpen}>
              Ver cuotas
            </button>
          ) : (
            <button className={editing ? btn.soft : btn.ghost} onClick={() => setEditing((x) => !x)}>
              <Pencil className="h-3.5 w-3.5" strokeWidth={1.6} /> {editing ? "Listo" : "Editar"}
            </button>
          )}
          {confirm === "all" ? (
            <button
              className={btn.danger}
              onClick={() => {
                group.cuotas.forEach((c) => removePurchase(c.purchaseId));
                setConfirm(null);
              }}
            >
              Sí, eliminar la deuda
            </button>
          ) : (
            <button
              className={btn.ghost}
              title="Borra todas las cuotas de esta deuda y los pagos hechos a esas cuotas"
              onClick={() => setConfirm("all")}
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.6} /> Eliminar
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className="mt-3 flex flex-col gap-1.5">
          {group.cuotas.map((c, k) => {
            const pays = db.supplierPayments.filter(
              (x) => x.purchaseId === c.purchaseId && x.kind === account.kind,
            );
            const due = c.due ?? c.date;
            const done = c.rest <= 0.5;
            const late = !done && due < today;
            return (
              <div key={c.id} className="rounded-2xl bg-card p-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="w-12 text-xs text-muted-foreground">
                    {n > 1 ? `${k + 1}/${n}` : "Pago"}
                  </span>
                  {editing ? (
                    <>
                      <span className="w-36">
                        <Input
                          type="date"
                          value={due.slice(0, 10)}
                          onChange={(e) => e.target.value && saveCuota(c.purchaseId, { due: e.target.value })}
                          className="h-9"
                        />
                      </span>
                      <span className="w-36">
                        <NumberInput
                          value={c.amount}
                          onChange={(x) => x > 0 && saveCuota(c.purchaseId, { amount: x })}
                          prefix="$"
                          className="h-9"
                        />
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="w-24 tabular-nums">{fmtDay(due)}</span>
                      <span className="w-28 text-right font-semibold tabular-nums">
                        {ars(c.amount)}
                      </span>
                    </>
                  )}
                  <span className="flex-1">
                    {done ? (
                      <Badge tone="ok">Pagada</Badge>
                    ) : c.paid > 0.5 ? (
                      <Badge tone="dark">Falta {ars(c.rest)}</Badge>
                    ) : late ? (
                      <Badge tone="danger">Vencida</Badge>
                    ) : (
                      <Badge>Pendiente</Badge>
                    )}
                  </span>
                  {editing ? (
                    confirm === c.id ? (
                      <button
                        className={btn.danger}
                        onClick={() => {
                          removePurchase(c.purchaseId);
                          setConfirm(null);
                        }}
                      >
                        Sí, borrar
                      </button>
                    ) : (
                      <button
                        className={btn.icon}
                        aria-label="Borrar cuota"
                        title="Borrar esta cuota"
                        onClick={() => setConfirm(c.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.6} />
                      </button>
                    )
                  ) : (
                    !done &&
                    payFor !== c.id && (
                      <button
                        className={btn.soft}
                        onClick={() => {
                          setPayFor(c.id);
                          setPayAmt(Math.round(c.rest));
                          setPayDate(today);
                        }}
                      >
                        <Check className="h-3.5 w-3.5" /> Marcar pagada
                      </button>
                    )
                  )}
                </div>
                {payFor === c.id && (
                  <div className="mt-2 flex flex-wrap items-end gap-2 border-t border-border pt-2">
                    <Field label="Importe pagado" className="w-40">
                      <NumberInput value={payAmt} onChange={setPayAmt} prefix="$" />
                    </Field>
                    <Field label="Fecha" className="w-40">
                      <Input
                        type="date"
                        value={payDate}
                        onChange={(e) => setPayDate(e.target.value || today)}
                      />
                    </Field>
                    <Field label="Sale de" className="w-44">
                      <Select value={payHow} onChange={(e) => setPayHow(e.target.value as typeof payHow)}>
                        <option value="transferencia|BBVA">Transferencia BBVA</option>
                        <option value="transferencia|Provincia">Transferencia Provincia</option>
                        <option value="efectivo|Caja">Efectivo (caja)</option>
                      </Select>
                    </Field>
                    <button className={btn.soft} onClick={() => setPayFor(null)}>
                      Cancelar
                    </button>
                    <button
                      className={btn.primary}
                      disabled={payAmt <= 0}
                      onClick={() => markPaid(c, k)}
                    >
                      Confirmar pago {payAmt > 0 ? ars(payAmt) : ""}
                    </button>
                  </div>
                )}
                {pays.length > 0 && (
                  <div className="mt-1.5 flex flex-col gap-0.5 pl-14 text-[11px] text-muted-foreground">
                    {pays.map((x) => (
                      <span key={x.id} className="flex items-center gap-2">
                        Pagado {ars(x.amount)} el {fmtDay(x.date.slice(0, 10))} ·{" "}
                        {methodName[x.method]}
                        {x.account ? ` ${x.account}` : ""}
                        <button
                          className="underline hover:text-danger-soft-foreground"
                          onClick={() => removeSupplierPayment(x.id)}
                          title="Borrar este pago (vuelve a la caja o al banco)"
                        >
                          borrar
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
