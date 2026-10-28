import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";

// Tour guiado: recorre la plataforma paso a paso resaltando cada herramienta.
// Se abre solo la primera vez (localStorage) o con el evento "abrir-tour".

const DONE_KEY = "ap-tour-visto";

type Step = {
  route?: string; // a qué pantalla ir antes de mostrar el paso
  target?: string; // valor de data-tour del elemento a resaltar
  title: string;
  body: string;
  tip?: string;
};

const steps: Step[] = [
  {
    route: "/",
    title: "Bienvenido al panel de Áridos Petreos",
    body: "En un par de minutos te muestro dónde está cada herramienta y cómo se usa en el día a día. Podés avanzar con Siguiente, volver atrás o saltar el recorrido cuando quieras; después lo relanzás desde el botón ? de arriba.",
  },
  {
    route: "/",
    target: "inicio-acciones",
    title: "Lo de todos los días, a mano",
    body: "Estos accesos son el centro del trabajo diario: cargar una venta, armar un presupuesto, cargar stock, registrar un gasto, buscar un cliente y cerrar el día. Están en el inicio para que no tengas que navegar menús.",
    tip: "Desde el celular los mismos accesos están en la barra de abajo.",
  },
  {
    route: "/",
    target: "inicio-kpis",
    title: "Cómo viene el día",
    body: "Ventas de hoy, ganancia estimada (precio menos costo y comisiones), lo cobrado y lo que quedó en cuenta corriente. Se actualiza solo con cada venta y cobro.",
  },
  {
    route: "/",
    target: "inicio-plata",
    title: "Dónde está la plata",
    body: "Acá ves en qué quedó cada cobro: efectivo en caja, transferencias a BBVA o Provincia, tarjetas por Payway pendientes de acreditar, cheques y cuenta corriente. Es la base del cierre de lote.",
  },
  {
    target: "nueva-venta",
    title: "Nueva venta",
    body: "Siempre visible arriba a la derecha. Es la operación más frecuente, así que está a un clic desde cualquier pantalla.",
  },
  {
    route: "/nueva-venta",
    target: "venta-productos",
    title: "Cargar una venta",
    body: "Escribís el nombre del producto y lo agregás con un clic. Cada renglón se vende por tonelada, bolsón, m², litro o unidad según el producto, con el precio de lista y los descuentos por cantidad ya aplicados. Debajo cargás el flete, el cliente, con o sin IVA y la forma de pago: efectivo, transferencia, tarjeta, cheque o cuenta corriente en cuotas, incluso mezclando varias.",
    tip: "Si el cliente no existe, lo creás ahí mismo sin salir de la venta.",
  },
  {
    route: "/catalogo",
    target: "catalogo-nuevo",
    title: "Catálogo y calculadora de precios",
    body: "Acá viven los productos. Al crear o editar uno cargás lo que pagás por tonelada (proveedor, flete, descarga, embalaje, mano de obra, extras) y el margen; la calculadora te devuelve el precio por kilo, por bolsón de 25 kg y por tonelada. Las lajas van por m², el fijador por litros y los unitarios por unidad.",
    tip: "Con 'Actualizar precios' ajustás toda una categoría por porcentaje en un paso.",
  },
  {
    route: "/stock",
    target: "page",
    title: "Stock",
    body: "El stock baja solo con cada venta. Cuando llega un camión cargás la compra y sube, actualizando el costo. También podés ajustar diferencias después de contar. Si un producto queda por debajo del mínimo, te avisa.",
  },
  {
    route: "/clientes",
    target: "page",
    title: "Clientes y cuentas corrientes",
    body: "Cada cliente tiene su ficha con teléfono, localidad, CUIT y condición de IVA. Si compró en cuenta corriente, acá ves las cuotas, registrás cada cobro y le mandás un recordatorio por WhatsApp con un clic.",
  },
  {
    route: "/presupuestos",
    target: "page",
    title: "Presupuestos y seguimiento",
    body: "Armás el presupuesto igual que una venta, lo descargás en PDF con el diseño de la marca o lo mandás por WhatsApp. Queda con fecha de vencimiento y seguimiento: cuando el cliente acepta, lo convertís en venta sin volver a cargar nada.",
  },
  {
    route: "/facturalo",
    target: "fact-cuit",
    title: "Facturalo Fácil · desde qué CUIT",
    body: "Tenés dos emisores: el CUIT monotributo, para facturar a consumidor final sin IVA (Factura C), y el CUIT responsable inscripto, para facturar con IVA 21% (Factura A si el cliente es inscripto, B si no). Tocás la tarjeta del que corresponda y el sistema elige solo el tipo de comprobante.",
  },
  {
    route: "/facturalo",
    target: "fact-pv",
    title: "Punto de venta, fecha y comprobante",
    body: "Cada CUIT tiene sus propios puntos de venta: elegís uno, la fecha, y a la derecha ves qué factura va a salir (A, B o C) según el emisor y la categoría de IVA del cliente.",
    tip: "Los CUIT, razón social y puntos de venta se cargan una sola vez desde el botón 'CUITs y puntos de venta', arriba a la derecha.",
  },
  {
    route: "/facturalo",
    target: "fact-cliente",
    title: "Cliente y presupuesto",
    body: "Elegís el cliente de tu lista o lo dejás como consumidor final. Si ya le hiciste un presupuesto, lo seleccionás y se cargan sus ítems y el flete sin volver a tipear nada.",
  },
  {
    route: "/facturalo",
    target: "fact-items",
    title: "Ítems de la factura",
    body: "Tres formas de cargar: buscar un producto del catálogo (trae el precio de lista), tocar un ítem genérico como 'Venta de áridos' o 'Flete y entrega' para facturas que no necesitan mucho detalle, o 'Ítem a mano' para escribir lo que quieras. Cada renglón tiene cantidad, unidad y precio editables.",
    tip: "Si no querés detallar ítems, dejá la lista vacía y cargá el importe total directamente a la derecha.",
  },
  {
    route: "/facturalo",
    target: "fact-emitir",
    title: "Importe y emisión",
    body: "Arriba ves el total; si facturás desde el inscripto, se discrimina el neto y el IVA. El botón 'Emitir factura' va a generar el comprobante electrónico con CAE en ARCA y descargar el PDF: esa conexión está en desarrollo, así que por ahora te avisa que estamos trabajando en eso.",
  },
  {
    route: "/caja",
    target: "page",
    title: "Caja y bancos",
    body: "El saldo de caja, BBVA y Provincia, con cada movimiento. Las tarjetas y cheques depositados aparecen como 'por acreditar' hasta que los marcás acreditados en el banco. Los cheques recibidos se siguen acá: en cartera, depositados, endosados o rechazados.",
  },
  {
    route: "/gastos",
    target: "page",
    title: "Gastos y débitos",
    body: "Gastos del día (combustible, fletes pagados, sueldos), gastos fijos del mes y débitos automáticos de cada banco. Todo se descuenta de la ganancia del período.",
  },
  {
    route: "/cierre",
    target: "page",
    title: "Cierre del día",
    body: "Al final de la jornada cerrás el lote: ventas, cobros por medio de pago y banco, comisiones de Payway, gastos del día y la parte proporcional de los fijos. Contás el efectivo, lo comparás con lo esperado y queda guardado el cierre con la ganancia real.",
  },
  {
    target: "buscador",
    title: "Buscador",
    body: "Escribí cualquier cosa: un producto, un cliente o un número de venta, y saltás directo. Desde el teclado: Ctrl + K (⌘ K en Mac).",
  },
  {
    target: "asistente",
    title: "Asistente con inteligencia artificial",
    body: "Conoce toda tu base y todos los flujos. Podés preguntarle cuánto vendiste, qué cliente debe, cómo se carga algo, o pedirle que arme una venta o un producto: te responde en español y te da botones para hacerlo. Si querés una función nueva, se la pedís y queda anotada. También podés dictarle.",
  },
  {
    target: "avisos",
    title: "Avisos y agenda",
    body: "Stock bajo, cuotas que vencen, cheques por depositar, presupuestos por vencer, liquidaciones de Payway que deberían haberse acreditado y entregas pendientes. El punto rojo indica que hay algo urgente.",
  },
  {
    target: "configuracion",
    title: "Configuración",
    body: "Datos del negocio, valores por defecto de la calculadora, medios de pago con su banco y comisión, zonas de flete y gastos fijos. Desde acá también relanzás este recorrido.",
  },
  {
    route: "/",
    title: "Listo para empezar",
    body: "Un buen primer día: cargá tus productos en el catálogo, después los clientes habituales y a partir de ahí registrá las ventas. Cualquier duda, preguntale al asistente.",
  },
];

type Rect = { top: number; left: number; width: number; height: number };

export function Tour() {
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [cardH, setCardH] = useState(320);
  const step = steps[i] ?? steps[0]!;

  // Apertura por evento o primera vez.
  useEffect(() => {
    const show = () => {
      setI(0);
      setOpen(true);
    };
    window.addEventListener("abrir-tour", show);
    let seen = true;
    try {
      seen = localStorage.getItem(DONE_KEY) === "1";
    } catch {
      /* sin storage */
    }
    const t = !seen ? window.setTimeout(show, 900) : 0;
    return () => {
      window.removeEventListener("abrir-tour", show);
      if (t) window.clearTimeout(t);
    };
  }, []);

  const finish = () => {
    setOpen(false);
    try {
      localStorage.setItem(DONE_KEY, "1");
    } catch {
      /* sin storage */
    }
    if (pathname !== "/") void router.navigate({ to: "/" });
  };

  // Ir a la pantalla del paso.
  useEffect(() => {
    if (!open) return;
    if (step.route && step.route !== pathname) void router.navigate({ to: step.route });
  }, [open, i, step.route, pathname, router]);

  // Buscar y medir el elemento a resaltar (puede tardar en aparecer tras navegar).
  useLayoutEffect(() => {
    if (!open) return;
    let frame = 0;
    let tries = 0;
    const measure = () => {
      const el = step.target
        ? document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`)
        : null;
      const visible = el && el.offsetParent !== null && el.getBoundingClientRect().width > 0;
      if (visible) {
        const r = el.getBoundingClientRect();
        const pad = 8;
        setRect({
          top: r.top - pad,
          left: r.left - pad,
          width: r.width + pad * 2,
          height: r.height + pad * 2,
        });
      } else {
        setRect(null);
        if (step.target && tries < 40) {
          tries++;
          frame = requestAnimationFrame(measure);
          return;
        }
      }
    };
    const el = step.target
      ? document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`)
      : null;
    if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
    frame = requestAnimationFrame(measure);
    const onChange = () => {
      tries = 0;
      measure();
    };
    window.addEventListener("resize", onChange);
    window.addEventListener("scroll", onChange, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onChange);
      window.removeEventListener("scroll", onChange, true);
    };
  }, [open, i, step.target, pathname]);

  // Teclado.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      if (e.key === "ArrowRight" || e.key === "Enter")
        setI((n) => Math.min(n + 1, steps.length - 1));
      if (e.key === "ArrowLeft") setI((n) => Math.max(n - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const last = i === steps.length - 1;
  const pos = cardPosition(rect, cardH);

  return (
    <div className="fixed inset-0 z-[90]" role="dialog" aria-label="Recorrido guiado">
      {/* Fondo oscurecido con recorte sobre el elemento */}
      {rect ? (
        <div
          className="pointer-events-none absolute rounded-3xl ring-2 ring-primary/80 transition-all duration-300"
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            boxShadow: "0 0 0 9999px rgba(20,18,24,0.55)",
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-[rgba(20,18,24,0.55)]" />
      )}
      <div className="absolute inset-0" onClick={(e) => e.stopPropagation()} />

      <TourCard
        key={i}
        style={pos}
        step={step}
        index={i}
        total={steps.length}
        last={last}
        onPrev={() => setI((n) => Math.max(n - 1, 0))}
        onNext={() => (last ? finish() : setI((n) => n + 1))}
        onClose={finish}
        onHeight={setCardH}
      />
    </div>
  );
}

function cardPosition(rect: Rect | null, cardH: number): CSSProperties {
  if (typeof window === "undefined") return {};
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.min(400, vw - 24);
  if (!rect || vw < 640) {
    // Centrado (sin elemento) o en el celular: abajo como una hoja.
    return rect
      ? { left: 12, right: 12, bottom: 12, width: "auto" }
      : { left: (vw - w) / 2, top: Math.max(24, vh / 2 - 160), width: w };
  }
  const gap = 14;
  const h = cardH + 8; // alto real de la tarjeta
  let top = rect.top + rect.height + gap;
  if (top + h > vh - 12) top = Math.max(12, rect.top - h - gap);
  // Si tampoco entra arriba, va al costado.
  if (top + h > vh - 12 && rect.left + rect.width + gap + w < vw)
    return {
      left: rect.left + rect.width + gap,
      top: Math.max(12, Math.min(rect.top, vh - h - 12)),
      width: w,
    };
  let left = rect.left + rect.width / 2 - w / 2;
  left = Math.max(12, Math.min(left, vw - w - 12));
  return { left, top, width: w };
}

function TourCard({
  step,
  index,
  total,
  last,
  onPrev,
  onNext,
  onClose,
  onHeight,
  style,
}: {
  step: Step;
  index: number;
  total: number;
  last: boolean;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onHeight: (h: number) => void;
  style: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>("button[data-next]")?.focus();
  }, []);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    onHeight(el.offsetHeight);
    const ro = new ResizeObserver(() => onHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div
      ref={ref}
      className="absolute flex flex-col gap-3 rounded-3xl bg-card p-5 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.45)] transition-all duration-300"
      style={style}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Paso {index + 1} de {total}
        </p>
        <button
          onClick={onClose}
          className="-mr-2 -mt-2 grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Cerrar recorrido"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <h3 className="text-base font-bold leading-tight tracking-tight">{step.title}</h3>
      <p className="text-sm leading-relaxed text-muted-foreground">{step.body}</p>
      {step.tip && (
        <p className="rounded-2xl bg-surface px-3 py-2 text-xs leading-relaxed">{step.tip}</p>
      )}
      <div className="mt-1 flex items-center gap-1.5">
        {Array.from({ length: total }, (_, k) => (
          <span
            key={k}
            className={`h-1.5 rounded-full transition-all ${k === index ? "w-5 bg-primary" : "w-1.5 bg-border"}`}
          />
        ))}
      </div>
      <div className="flex items-center justify-between gap-2 pt-1">
        <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">
          Saltar el recorrido
        </button>
        <div className="flex items-center gap-2">
          {index > 0 && (
            <button
              onClick={onPrev}
              className="flex h-10 items-center gap-1.5 rounded-full bg-surface px-4 text-sm font-medium hover:bg-accent"
            >
              <ArrowLeft className="h-4 w-4" /> Anterior
            </button>
          )}
          <button
            data-next
            onClick={onNext}
            className="flex h-10 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            {last ? (
              <>
                <Check className="h-4 w-4" /> Terminar
              </>
            ) : (
              <>
                Siguiente <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
