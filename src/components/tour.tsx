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

const fullSteps: Step[] = [
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
    body: "Tenés dos emisores: el CUIT monotributo, para facturar a consumidor final sin IVA (Factura C), y el CUIT responsable inscripto, para facturar con IVA (Factura A si el cliente es inscripto: el IVA se suma al precio de lista; Factura B si no: el precio de lista es el final). Tocás la tarjeta del que corresponda y el sistema elige solo el tipo de comprobante.",
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
    body: "Elegís el cliente de tu lista o lo dejás como consumidor final. Si escribís un CUIT y tocás 'Consultar padrón', trae de ARCA la razón social, el domicilio y la condición de IVA y crea el cliente solo. Abajo aparece el email del cliente: con eso cargado, la factura se le envía automáticamente al emitirla. Si ya le hiciste un presupuesto, lo seleccionás y se cargan sus ítems y el flete.",
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
    body: "Arriba ves el total. Todos los precios se cargan sin IVA: en Factura A se le suma el IVA; en Factura B va incluido y se discrimina; en C no hay IVA. Con 'Emitir factura' se pide el CAE a ARCA, la factura queda guardada y se abre el PDF con el QR oficial. Si el cliente tiene email cargado, la factura se le manda sola: un mail con el diseño de la marca y el PDF adjunto, desde la casilla oficial. Desde 'Emitidas' reimprimís o reenviás cualquier factura, y desde el detalle de una venta podés facturarla directo.",
  },
  {
    route: "/correo",
    target: "page",
    title: "Casilla de correo",
    body: "El correo del negocio adentro de la plataforma: recibidos, enviados, buscar, leer con adjuntos, responder, reenviar y redactar. Lo que mandás sale desde la casilla oficial con la firma del negocio, y las facturas que se envían a los clientes quedan en Enviados.",
    tip: "Tocá un mensaje para leerlo; con Responder se cita el texto original y se mantiene el hilo.",
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

// Novedades: cambiar NEWS_VERSION cada vez que se publican herramientas nuevas para que
// el aviso vuelva a aparecer una vez a cada usuario.
const NEWS_KEY = "ap-novedades-vistas";
const NEWS_VERSION = "2026-11-19c";
const newsList = [
  "Calculadora de precios más corta, con base de gastos",
  "Bolsa, bolsón de 1.000 kg y segundo bolsón (ej. 1.200 kg)",
  "Lista de precios para imprimir o mandar por WhatsApp",
  "Descarga cobrada al cliente en ventas y presupuestos",
  "Editar y eliminar ventas y presupuestos",
  "Cargar una cuenta corriente sin hacer una venta",
  "Descargas de proveedores, con cuentas de canteras y transportes",
  "Precio fijo de la bolsa y venta por viaje en construcción",
  "El asistente lee fotos, PDF y Excel con tus listas",
  "Mail de seguimiento de presupuestos de lunes a viernes",
];

// Tutorial de la sección Descargas: se abre solo la primera vez que se entra y con el botón "Cómo funciona".
const DESC_KEY = "ap-tour-descargas";
const descargasSteps: Step[] = [
  {
    route: "/descargas",
    target: "page",
    title: "Descargas de proveedores",
    body: "Acá se asienta cada camión que llega de la cantera. Con un solo formulario queda todo hecho: entra el stock, se actualizan los costos y los precios, y queda anotado cuánto se le debe a la cantera y al transporte. Reemplaza la planilla de canteras y transportes.",
  },
  {
    route: "/descargas",
    target: "desc-nueva",
    title: "1. Cargar la descarga",
    body: 'Tocás "Nueva descarga" y completás la cantera, el número de remito y la fecha. Las canteras y los transportes que ya usaste aparecen en la lista para no escribirlos de nuevo.',
  },
  {
    route: "/descargas",
    target: "desc-nueva",
    title: "2. El material que llegó",
    body: "Elegís el producto, las toneladas y el precio por tonelada (o el total, y el precio se calcula solo). Si el mismo camión trajo varios materiales, agregás un renglón por cada uno.",
    tip: "Al elegir el producto te muestra cuánto pagaste la última vez y a quién, y si ahora subió o bajó.",
  },
  {
    route: "/descargas",
    target: "desc-nueva",
    title: "3. El flete y la descarga",
    body: "Cargás el transporte y el flete, por tonelada o como total del viaje, y si hubo costo de descarga. Si el camión trajo varios materiales, el flete y la descarga se reparten por tonelada entre todos.",
  },
  {
    route: "/descargas",
    target: "desc-nueva",
    title: "4. Pagado o queda debiendo",
    body: "Si le pagás a la cantera o al transporte en el momento, lo marcás ahí mismo: todo o solo una parte, y elegís cómo. Lo que queda debiendo va a su cuenta y elegís en cuántos días querés el aviso para pagar el saldo (7, 15, 30 o 60). Ese día aparece en Notificaciones y en el Calendario.",
  },
  {
    route: "/descargas",
    target: "desc-nueva",
    title: "Qué pasa al asentar",
    body: "Se suma el stock de cada producto, se actualiza su costo (precio de cantera, flete y descarga por tonelada) y se recalculan los precios de bolsón, tonelada y viaje con el margen de cada uno. Los precios fijos de la bolsa no cambian.",
    tip: 'Si no querés tocar los precios con esa descarga, apagás "Actualizar costos y precios" antes de guardar.',
  },
  {
    route: "/descargas",
    target: "desc-historial",
    title: "Historial de descargas",
    body: "Queda cada descarga con su fecha, cantera, remito, materiales y el precio que se pagó, más el transporte y el flete. Sirve para ver cómo fueron cambiando los precios de cada cantera. Cada una marca si se debe o está al día.",
  },
  {
    route: "/descargas",
    target: "desc-cuentas",
    title: "Cuentas con canteras y transportes",
    body: "Cada proveedor tiene su cuenta con lo que se le debe. Al tocarla ves el detalle de debe, pagado y saldo, y registrás los pagos: transferencia, efectivo o cheque. Para el cheque ponés el número y la fecha de cobro, con botones de 30 y 60 días; sale del banco ese día.",
    tip: "A los transportes también se les paga con gasoil: cargás el monto y los litros. Descuenta la deuda, pero no saca plata de caja ni de los bancos.",
  },
  {
    route: "/descargas",
    target: "desc-stats",
    title: "Cuánto se debe hoy",
    body: 'Arriba ves el total que se les debe a las canteras y a los transportes. Este recorrido lo podés repetir cuando quieras con el botón "Cómo funciona".',
  },
];

const newsSteps: Step[] = [
  {
    target: "menu",
    title: "El menú ahora muestra los nombres",
    body: "Cada sección aparece con su nombre al lado del ícono, así no hay que adivinar. La sección en la que estás queda marcada en negro. En el celular sigue la barra de abajo.",
  },
  {
    route: "/catalogo",
    target: "catalogo-nuevo",
    title: "Cargar un producto es más corto",
    body: 'Una piedra se carga con 5 datos: precio del proveedor, flete, descarga, base de gastos y margen. La base de gastos es un monto fijo por tonelada para cubrir los gastos del negocio. Palet, Sampi, desperdicio y las medidas de las bolsas están en "Más costos y medidas", que se abre solo si hace falta.',
    tip: "Todos los precios se cargan sin IVA. El signo ? al lado de cada campo explica para qué sirve.",
  },
  {
    route: "/catalogo",
    target: "page",
    title: "Bolsa, bolsón y tonelada",
    body: 'Cada piedra tiene precio por bolsa de 25 kg, por bolsón de 1.000 kg y por tonelada, y la bolsa vale lo mismo por kilo que la tonelada. Si una piedra también se vende en otro bolsón (por ejemplo 1.200 kg, como la grava), se carga como "Segundo bolsón" y aparece como una unidad más al vender. Los líquidos ahora tienen su flete por unidad.',
  },
  {
    route: "/catalogo",
    target: "lista-precios",
    title: "Lista de precios",
    body: "Una tabla simple con todos los productos y su precio por bolsa, bolsón y tonelada. Elegís sin IVA o con IVA y la imprimís, la guardás en PDF o la copiás para mandar por WhatsApp.",
  },
  {
    route: "/nueva-venta",
    target: "venta-productos",
    title: "Vender por bolsa o por bolsón, con descarga",
    body: 'En cada renglón elegís la unidad: kg, bolsa, bolsón o tonelada. Al prender la entrega a domicilio aparece "Descarga al cliente": se completa sola según el pedido lleve bolsas o bolsones y la podés cambiar a mano. En el presupuesto con IVA, los precios salen con el IVA incluido y un solo total.',
  },
  {
    route: "/ventas",
    target: "page",
    title: "Editar o eliminar una venta",
    body: 'Tocás una venta y abajo tenés "Editar venta" y "Eliminar venta". Al editar se corrigen solos el stock, la caja y las cuotas, y la venta conserva su número. Al eliminar, el stock vuelve y se borran sus cobros.',
    tip: "Si la venta ya tiene factura en ARCA, eliminarla no anula la factura: hace falta una nota de crédito.",
  },
  {
    route: "/presupuestos",
    target: "page",
    title: "Editar o eliminar un presupuesto",
    body: 'Cada presupuesto tiene "Editar" (cambia productos, cantidades, precios o cliente y conserva el número) y "Eliminar". Además, de lunes a viernes a las 8:30 llega un mail con los presupuestos que hay que llamar ese día.',
    tip: "El mail se prende, se apaga o cambia de dirección en Configuración.",
  },
  ...descargasSteps,
  {
    route: "/clientes",
    target: "cargar-cc",
    title: "Cargar una cuenta corriente",
    body: "Para anotar una deuda sin hacer una venta: escribís el nombre, WhatsApp, email y CUIT, el monto y las cuotas. Si el cliente ya existe se le suma a su cuenta; si es nuevo, se guarda solo. Los vencimientos aparecen en Avisos.",
  },
  {
    target: "asistente",
    title: "El asistente lee tus listas",
    body: "Con el clip le mandás una foto, un PDF o un Excel con tu lista de productos y precios. La lee, te muestra una tabla para revisar y con un toque crea o actualiza los productos. También le podés pedir mejoras: quedan anotadas para el programador.",
  },
  {
    route: "/",
    title: "Eso es todo lo nuevo",
    body: 'Los números ahora se muestran y se escriben con punto para los miles y coma para los centavos. Este repaso lo podés volver a ver cuando quieras desde Configuración, en "Novedades".',
  },
];

type Rect = { top: number; left: number; width: number; height: number };

/** Celular: por ancho de pantalla física, no del viewport (que se agranda si algo desborda). */
const isMobile = () =>
  typeof window !== "undefined" &&
  Math.min(window.innerWidth, window.screen?.width ?? Infinity) < 640;

/** Viewport realmente visible (en el celular, innerWidth/innerHeight mienten si algo desborda). */
const viewport = () => {
  const vv = typeof window !== "undefined" ? window.visualViewport : null;
  return vv
    ? { x: vv.offsetLeft, y: vv.offsetTop, w: vv.width, h: vv.height }
    : { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
};

export function Tour() {
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [cardH, setCardH] = useState(320);
  const [sheetTop, setSheetTop] = useState(false);
  const cardHRef = useRef(cardH);
  cardHRef.current = cardH;
  const [mode, setMode] = useState<"full" | "news" | "descargas">("full");
  const [news, setNews] = useState(false);
  const steps = mode === "news" ? newsSteps : mode === "descargas" ? descargasSteps : fullSteps;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const step = steps[i] ?? steps[0]!;
  const markNews = () => {
    try {
      localStorage.setItem(NEWS_KEY, NEWS_VERSION);
    } catch {
      /* sin storage */
    }
  };
  const startNews = () => {
    markNews();
    try {
      localStorage.setItem(DESC_KEY, "1"); // el repaso de novedades ya incluye Descargas
    } catch {
      /* sin storage */
    }
    setNews(false);
    setMode("news");
    setI(0);
    setOpen(true);
  };

  // Apertura por evento o primera vez.
  useEffect(() => {
    const show = () => {
      setNews(false);
      setMode("full");
      setI(0);
      setOpen(true);
    };
    const showNews = () => setNews(true);
    window.addEventListener("abrir-tour", show);
    const showDesc = () => {
      setNews(false);
      setMode("descargas");
      setI(0);
      setOpen(true);
    };
    window.addEventListener("abrir-novedades", showNews);
    window.addEventListener("abrir-tour-descargas", showDesc);
    let seen = true;
    try {
      seen = localStorage.getItem(DONE_KEY) === "1";
    } catch {
      /* sin storage */
    }
    // Usuario nuevo: recorrido completo (ya incluye lo nuevo). Usuario que ya lo vio: aviso de novedades.
    let newsSeen = true;
    try {
      newsSeen = localStorage.getItem(NEWS_KEY) === NEWS_VERSION;
    } catch {
      /* sin storage */
    }
    if (!seen) markNews();
    const t = !seen
      ? window.setTimeout(show, 900)
      : !newsSeen
        ? window.setTimeout(showNews, 900)
        : 0;
    return () => {
      window.removeEventListener("abrir-novedades", showNews);
      window.removeEventListener("abrir-tour-descargas", showDesc);
      window.removeEventListener("abrir-tour", show);
      if (t) window.clearTimeout(t);
    };
  }, []);

  // La primera vez que se entra a Descargas, se abre su tutorial solo.
  useEffect(() => {
    if (pathname !== "/descargas" || open || news) return;
    let seen = true;
    try {
      seen = localStorage.getItem(DESC_KEY) === "1";
      if (!seen) localStorage.setItem(DESC_KEY, "1");
    } catch {
      /* sin storage */
    }
    if (seen) return;
    const t = window.setTimeout(() => window.dispatchEvent(new Event("abrir-tour-descargas")), 600);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const finish = () => {
    setOpen(false);
    if (modeRef.current === "descargas") return; // se queda en la sección
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
    let autoScrolled = false;
    const measure = () => {
      const el = step.target
        ? document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`)
        : null;
      const visible = el && el.offsetParent !== null && el.getBoundingClientRect().width > 0;
      if (visible) {
        const r = el.getBoundingClientRect();
        const pad = 8;
        const mobile = isMobile();
        if (mobile) {
          // En el celular la tarjeta es una hoja abajo: el elemento tiene que quedar en la franja visible de arriba.
          const inHeader = !!el.closest("header");
          const headerH = inHeader ? 0 : 76;
          const vp = viewport();
          const vh = vp.y + vp.h;
          const sheetTop = vh - cardHRef.current - 24;
          if (
            !inHeader &&
            !autoScrolled &&
            (r.top < headerH || r.top + Math.min(r.height, 120) > sheetTop)
          ) {
            autoScrolled = true;
            window.scrollBy({ top: r.top - headerH - 8, behavior: "smooth" });
            frame = requestAnimationFrame(measure);
            return;
          }
          // Si aun así queda abajo (final de la página), la hoja pasa arriba y se resalta la franja de abajo.
          const atTop = r.top + 24 > sheetTop;
          setSheetTop(atTop);
          const bandTop = vp.y + (atTop ? cardHRef.current + 20 : Math.max(4, headerH - 4));
          const bandBottom = atTop ? vh - 8 : sheetTop - 6;
          const top = Math.max(r.top - pad, bandTop);
          const bottom = Math.min(r.bottom + pad, bandBottom);
          setRect({
            top,
            left: Math.max(vp.x + 4, r.left - pad),
            width: Math.min(r.width + pad * 2, vp.w - 8),
            height: Math.max(24, bottom - top),
          });
          return;
        }
        setSheetTop(false);
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
    if (el && !isMobile()) el.scrollIntoView({ block: "center", behavior: "smooth" });
    frame = requestAnimationFrame(measure);
    const onChange = () => {
      tries = 0;
      measure();
    };
    window.addEventListener("resize", onChange);
    window.addEventListener("scroll", onChange, true);
    window.visualViewport?.addEventListener("resize", onChange);
    window.visualViewport?.addEventListener("scroll", onChange);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onChange);
      window.removeEventListener("scroll", onChange, true);
      window.visualViewport?.removeEventListener("resize", onChange);
      window.visualViewport?.removeEventListener("scroll", onChange);
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

  if (news && !open)
    return (
      <div
        className="fixed inset-0 z-[90] grid place-items-center bg-black/40 p-4 backdrop-blur-sm"
        role="dialog"
        aria-label="Actualizaciones nuevas"
      >
        <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-card shadow-soft">
          <div className="overflow-y-auto p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Actualizaciones nuevas
            </p>
            <h2 className="mt-1.5 text-xl font-bold tracking-tight">
              Hay herramientas nuevas en el panel
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Sumamos lo que nos fueron pidiendo. En dos minutos te mostramos dónde está cada cosa y
              cómo se usa.
            </p>
            <ul className="mt-4 flex flex-col gap-2">
              {newsList.map((t) => (
                <li key={t} className="flex items-start gap-2.5 text-sm">
                  <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
                    <Check className="h-2.5 w-2.5" strokeWidth={3} />
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-2 border-t border-border p-4 sm:flex-row-reverse">
            <button
              className="h-11 shrink-0 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground sm:flex-1"
              onClick={startNews}
            >
              Iniciar tutorial
            </button>
            <button
              className="h-11 shrink-0 rounded-full px-5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={() => {
                markNews();
                setNews(false);
              }}
            >
              Ahora no
            </button>
          </div>
        </div>
      </div>
    );

  if (!open) return null;

  const last = i === steps.length - 1;
  const pos = cardPosition(rect, cardH, sheetTop);

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

function cardPosition(rect: Rect | null, cardH: number, sheetTop = false): CSSProperties {
  if (typeof window === "undefined") return {};
  const vp = viewport();
  const vw = vp.w;
  const vh = vp.h;
  const w = Math.min(400, vw - 24);
  if (!rect || isMobile()) {
    // Centrado (sin elemento) o en el celular: abajo como una hoja (posición explícita dentro del viewport visible).
    if (isMobile()) {
      const maxH = Math.round(vh * (rect ? 0.46 : 0.7));
      const h = Math.min(cardH + 8, maxH);
      const top = rect && sheetTop ? vp.y + 8 : vp.y + vh - h - 8;
      return { left: vp.x + 8, top, width: vw - 16, maxHeight: maxH };
    }
    return { left: (vw - w) / 2, top: Math.max(24, vh / 2 - 160), width: w, maxHeight: vh - 48 };
  }
  const gap = 14;
  const h = cardH + 8; // alto real de la tarjeta
  let top = rect.top + rect.height + gap;
  const fitsBelow = top + h <= vh - 12;
  const fitsAbove = rect.top - h - gap >= 12;
  if (!fitsBelow && fitsAbove) top = rect.top - h - gap;
  // Si no entra ni abajo ni arriba, va al costado (derecha o izquierda) para no tapar el elemento.
  if (!fitsBelow && !fitsAbove) {
    const sideTop = Math.max(12, Math.min(rect.top, vh - h - 12));
    if (rect.left + rect.width + gap + w < vw)
      return { left: rect.left + rect.width + gap, top: sideTop, width: w };
    if (rect.left - gap - w > 12) return { left: rect.left - gap - w, top: sideTop, width: w };
    top = Math.max(12, vh - h - 12);
  }
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
      className="absolute flex flex-col gap-2.5 rounded-3xl bg-card p-4 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.45)] transition-all duration-300 sm:gap-3 sm:p-5"
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
      <h3 className="text-[15px] font-bold leading-tight tracking-tight sm:text-base">
        {step.title}
      </h3>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <p className="text-[13px] leading-relaxed text-muted-foreground sm:text-sm">{step.body}</p>
        {step.tip && (
          <p className="mt-2 rounded-2xl bg-surface px-3 py-2 text-xs leading-relaxed">
            {step.tip}
          </p>
        )}
      </div>
      <div className="mt-1 hidden items-center gap-1.5 sm:flex">
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
