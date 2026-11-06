// Explicaciones de cada campo de la app. Se muestran con el botón "?" al lado del nombre del campo.
// La clave es el texto exacto del campo (label). Los precios se cargan siempre SIN IVA.

export const FIELD_HELP: Record<string, string> = {
  // Producto
  "Nombre del producto":
    "Como lo va a ver el cliente en ventas y presupuestos. Ej: Piedra blanca decorativa.",
  Tipo: "Piedra/árido se vende por kg, bolsón o tonelada y el precio sale de la calculadora. Laja se vende por m². Líquido por bidón. Unitario por unidad.",
  "Precio del proveedor":
    "Lo que te cobra la cantera por cada tonelada, sin IVA. '/ t' significa 'por tonelada' (1.000 kg).",
  Flete:
    "Lo que cuesta traer cada tonelada desde el proveedor hasta el corralón ('/ t' = por tonelada). Si viene incluido en el precio del proveedor, dejalo en 0.",
  Descarga:
    "Costo de bajar cada tonelada del camión (máquina, personal). El valor por defecto se carga en Configuración.",
  "Mano de obra (opcional)":
    "Costo de personal propio por tonelada para embolsar o acomodar. Si no lo querés contar, dejalo en 0.",
  "Gastos extras (opcional)":
    "Cualquier otro costo por tonelada: mermas, limpieza, zarandeo. Opcional.",
  "Margen de ganancia":
    "Porcentaje que le sumás al costo total por tonelada para armar el precio de venta. Ej: costo $100 + 40% = precio $140 (sin IVA).",
  "Kg por bolsón":
    "Cuántos kilos entran en un bolsón. Con eso el sistema calcula el precio del bolsón a partir del precio por kg.",
  "Embalaje por bolsón":
    "Costo de la bolsa, cinta o pallet por cada bolsón. Solo se suma al precio del bolsón, no al precio por kg o tonelada.",
  "Litros por bidón": "Capacidad del envase que vendés. Sirve para mostrar el precio por litro.",
  Costo: "Lo que te cuesta a vos una unidad (m², bidón o unidad), sin IVA.",
  Margen: "Porcentaje que le sumás al costo para armar el precio de venta.",
  "Precio de venta":
    "Precio de lista sin IVA. Se calcula con el margen, pero podés escribirlo a mano. El IVA se agrega solo cuando se emite Factura A.",
  "Stock actual":
    "Cantidad que tenés hoy en el corralón. Baja sola con cada venta y sube con cada ingreso de mercadería.",
  "Avisar cuando quede menos de":
    "Cuando el stock baje de esta cantidad, aparece un aviso para reponer.",
  Desde: "A partir de qué cantidad se aplica el descuento.",
  Hasta: "Hasta qué cantidad se aplica (dejalo vacío para 'en adelante').",
  Porcentaje:
    "Descuento que se aplica solo sobre el precio de lista cuando se compra esa cantidad.",
  "Superficie (m²)": "Metros cuadrados que cubre la laja que vendés. Se usa para el precio por m².",
  "Espesor (cm)": "Grosor de la laja en centímetros. Es informativo para el cliente.",
  Piedra: "Qué piedra o laja es, para agruparla en el catálogo.",

  // Ventas y presupuestos
  Cliente:
    "Elegí un cliente de tu lista o dejá 'Consumidor final'. Hace falta un cliente para cuenta corriente, cheques y Factura A.",
  Cantidad: "Cuánto se vende, en la unidad elegida (kg, bolsón, tonelada, m², bidón o unidad).",
  Unidad: "En qué unidad se vende este renglón. El precio se convierte solo.",
  Bonificación:
    "Descuento sobre el total de la venta, en porcentaje. Los descuentos por cantidad de cada producto ya vienen aplicados.",
  Zona: "Zona de entrega definida en Configuración. Trae el precio del flete que se cobra al cliente y lo que te cuesta el viaje.",
  Dirección: "Calle y número. En una venta, es a dónde se entrega.",
  "Fecha de entrega": "Día en que se entrega. Aparece en 'Entregas de hoy' en el inicio.",
  "Cómo paga":
    "Medio de cobro: efectivo, transferencia, tarjeta por Payway, cheque o cuenta corriente. Se pueden combinar varios en la misma venta.",
  Medio:
    "Medio de cobro. Cada medio tiene su comisión y en qué banco acredita (ver Configuración).",
  Monto: "Importe en pesos.",
  Cuotas: "En cuántas cuotas se cobra. Para cuenta corriente, genera un vencimiento por mes.",
  "Cuotas mensuales":
    "Cantidad de cuotas mensuales en cuenta corriente. Cada una queda como pendiente de cobro en la ficha del cliente.",
  "N° de cheque": "Número impreso en el cheque. Sirve para seguirlo hasta que se cobra.",
  "Banco emisor": "Banco del cheque (el banco de quien lo firma).",
  Librador: "Quién firma el cheque. Si es de un tercero, ponelo acá para poder reclamarlo.",
  "Fecha de cobro":
    "Día en que se puede depositar o cobrar el cheque. Hasta esa fecha queda como 'en cartera'.",
  "Válido por (días)":
    "Cuántos días vale el presupuesto. Después de esa fecha aparece como vencido.",
  "Nota (opcional)":
    "Texto libre para la venta o el presupuesto: aclaraciones, horario de entrega, etc.",
  Nota: "Texto libre, solo para uso interno.",
  "Observaciones (opcional)":
    "Texto que aparece en el comprobante. Ej: número de orden de compra o remito.",
  "Traer de un presupuesto":
    "Carga los ítems, el cliente y el flete de un presupuesto ya hecho, para no volver a escribirlos.",
  "Precio por kg": "Precio de lista por kilo, sin IVA.",

  // Facturalo Fácil
  "Punto de venta":
    "Punto de venta habilitado en ARCA para ese CUIT. Define la numeración de la factura (ej. 00011-00000123).",
  Comprobante:
    "Tipo de factura. Sale solo: A si vos sos inscripto y el cliente también; B si vos sos inscripto y el cliente no; C si facturás desde el monotributo.",
  Fecha: "Fecha del comprobante o del movimiento.",
  "Importe total":
    "Importe a facturar cuando no cargás ítems. Se toma sin IVA: en Factura A se le suma el IVA; en B va incluido.",
  "Ítems genéricos":
    "Conceptos rápidos (ej. 'Flete', 'Servicio') para facturar sin elegir un producto del catálogo.",
  "Email del cliente":
    "Si está cargado, la factura se envía sola a ese email al emitirla, con el PDF adjunto.",
  "CUIT (opcional)":
    "Con el CUIT, 'Consultar padrón' trae de ARCA la razón social, el domicilio y la condición de IVA.",

  // Clientes
  Nombre: "Nombre o razón social.",
  "Razón social / nombre":
    "Nombre legal que figura en ARCA. Si consultás el padrón por CUIT, se completa solo.",
  Teléfono:
    "Con código de área, sin 0 ni 15 (ej. 2392 123456). Se usa para mandar recordatorios por WhatsApp.",
  Email: "Dirección de correo. Si está cargada, las facturas se envían solas a ese email.",
  CUIT: "11 números. Con el CUIT cargado, el sistema busca en ARCA la razón social y la condición de IVA.",
  Localidad: "Ciudad o pueblo del cliente.",
  "DNI (si no tiene CUIT)":
    "Para facturar a una persona sin CUIT por encima del tope de consumidor final que fija ARCA.",
  "Categoría de IVA":
    "Condición frente al IVA: Responsable inscripto, Monotributo, Exento o Consumidor final. Define si recibe Factura A o B.",
  "Límite de crédito":
    "Máximo que se le deja deber en cuenta corriente. Si lo supera, el sistema avisa al vender. 0 = sin límite.",
  "Domicilio fiscal": "Domicilio que figura en ARCA. Va impreso en la factura.",
  "Ingresos brutos": "Número de inscripción en Ingresos Brutos. Va impreso en la factura.",
  "Inicio de actividades":
    "Fecha de inicio de actividades que figura en ARCA. Va impresa en la factura.",

  // Stock
  Proveedor: "De quién se compró la mercadería.",
  "Precio de la mercadería ($)":
    "Lo que se pagó por la mercadería, sin IVA. Se usa para actualizar el costo del producto.",
  "Flete pagado ($)": "Lo que costó el transporte de esta compra, total.",
  "Descarga ($)": "Lo que costó descargar esta compra, total.",
  "Cómo se pagó": "Con qué se pagó la compra, para registrar la salida de plata en Caja.",
  "Sale de": "De qué caja o banco salió la plata.",
  Motivo: "Por qué se ajusta el stock: rotura, merma, conteo, etc.",
  "Qué ajustar": "Si querés sumar o restar unidades del stock.",

  // Caja, gastos y cierre
  Concepto: "Qué es el movimiento o el gasto (ej. 'Combustible camión').",
  Categoría: "Rubro del gasto, para los reportes.",
  "Entra en": "Caja o banco donde entra la plata.",
  "Efectivo contado en caja":
    "Lo que contaste físicamente al cerrar. Se compara con lo que debería haber según las ventas.",
  Para: "A quién se le manda el correo.",
  "CC (opcional)": "Con copia a otras direcciones, separadas por coma.",
  Asunto: "Título del correo.",
  Mensaje: "Cuerpo del correo.",

  // Configuración
  "Nombre del negocio": "Aparece en presupuestos, facturas y correos.",
  WhatsApp: "Número que ve el cliente en presupuestos y facturas.",
  Instagram: "Usuario de Instagram, sin @. Aparece en presupuestos y facturas.",
  "Saludo del presupuesto": "Texto con el que arranca el PDF del presupuesto.",
  "Descarga por tonelada":
    "Costo de descarga que se carga por defecto en cada producto nuevo (se puede cambiar producto por producto).",
  "Flete de compra por tonelada":
    "Flete por tonelada que se carga por defecto en cada producto nuevo.",
  "Margen de ganancia habitual":
    "Margen que se propone al crear un producto. Se puede cambiar en cada uno.",
  "IVA por defecto":
    "Alícuota que se aplica al facturar. Los precios de lista son siempre sin IVA: en Factura A se suma este porcentaje; en Factura B va incluido en el precio; en Factura C no hay IVA.",
  "Margen mínimo (avisa en rojo)":
    "Si un producto o una venta queda por debajo de este margen, se marca en rojo.",
  "Validez de presupuestos": "Días por defecto que vale un presupuesto nuevo.",
  "Recordar seguimiento a los":
    "A los cuántos días de hecho un presupuesto sin respuesta aparece el aviso para llamar al cliente.",
  "Cobra al cliente": "Lo que se le cobra al cliente por el flete a esa zona, sin IVA.",
  "Costo del viaje":
    "Lo que te cuesta a vos hacer ese viaje (combustible, chofer). La diferencia es lo que ganás por flete.",
  Comisión: "Porcentaje que descuenta la pasarela o el banco por cada cobro con ese medio.",
  Días: "Cuántos días tarda en acreditarse la plata en el banco.",
  Activo: "Si está apagado, ese medio no aparece al cobrar.",
  Banco: "Banco o caja donde acredita ese medio de cobro.",
  Pasarela: "Procesador de tarjetas (Payway). 'Ninguna' para efectivo, transferencia o cheque.",
  Contraseña: "La clave de acceso al sistema.",
};

export const SECTION_HELP: Record<string, string> = {
  "Costo por tonelada":
    "Todos los valores son por tonelada (1.000 kg) y sin IVA. El sistema suma proveedor + flete + descarga + mano de obra + extras, le aplica el margen y arma el precio por kg, por bolsón y por tonelada.",
  "Descuento por cantidad":
    "Precios más bajos cuando compran más. Se aplican solos en ventas y presupuestos.",
  "Stock y avisos":
    "El stock baja con cada venta y sube con cada ingreso de mercadería. El aviso aparece en el inicio cuando queda poco.",
  "Precio de venta":
    "Precios de lista sin IVA. 'Ganás' es la diferencia con el costo. 'Margen sobre el precio' es qué parte del precio es ganancia.",
};

export const helpFor = (label: string | undefined): string | undefined =>
  label ? FIELD_HELP[label] : undefined;
export const sectionHelpFor = (title: string | undefined): string | undefined =>
  title ? SECTION_HELP[title] : undefined;
