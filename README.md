# Ibirifas

Plataforma móvil multi-organizador para gestionar rifas: cuadrícula de
números disponibles/ocupados, registro del comprador con foto del
comprobante, y acceso simple por código de 6 dígitos.

## Roles

- **Superadmin**: crea cuentas de organizador (y su plan). No administra
  rifas directamente — pantalla `/usuarios`.
- **Organizador**: dueño de sus propias rifas. Las crea (`/rifas/nueva`) y
  crea/gestiona sus propios vendedores (`/usuarios`, mostrada como "Mi
  equipo").
- **Vendedor**: creado por un organizador, hereda acceso a *todas* las rifas
  de ese organizador (aún no hay asignación fina por rifa individual). Solo
  puede marcar números — no crea rifas ni usuarios.

Cada usuario solo ve los datos de su propio organizador (tenant); el acceso
cruzado entre organizadores está bloqueado a nivel de API (404, no 403, para
no filtrar ni la existencia de datos ajenos).

## Stack

- Next.js 16 (App Router) + TypeScript + Tailwind CSS v4
- Prisma 6 + SQLite (`prisma/dev.db`, fácil de migrar a Postgres/MySQL más adelante)
- Autenticación propia: JWT de acceso (15 min) + refresh token opaco rotativo (30 días) en cookies `httpOnly`

## Primeros pasos

```bash
npm install
cp .env.example .env   # genera tus propios secretos, no uses los de ejemplo en producción
npx prisma migrate deploy
npm run db:seed        # crea la rifa de ejemplo (100 números) y los códigos de acceso
npm run dev
```

El seed imprime el código de organización de la demo (`demo`, o el que fijes con
`SEED_ORG_CODE`) y tres códigos de acceso de 6 dígitos (superadmin,
organizador y vendedor) — úsalos para el primer login y luego crea tus propias
cuentas desde la app (`/usuarios`); no dependas de estos códigos de ejemplo en
producción. El superadmin entra **sin** código de organización.

## Modelo de datos

- `AdminUser`: usuario con código de acceso, `role` (`SUPERADMIN` /
  `ORGANIZER` / `SELLER`), `ownerId` (un vendedor pertenece a su
  organizador), `orgCode` (solo en organizadores; ver "Organizaciones y
  acceso") y `plan` (placeholder para futuros planes de pago, hoy sin límites
  reales).
- `Raffle`: pertenece a un organizador (`ownerId`); premio, precio por
  número, fecha del sorteo, y colores de tema opcionales
  (`themeBackground`/`themeNumberColor`/`themeTextColor`) — si están vacíos
  se usa el look dorado/negro por defecto. Editable desde `/rifas/[id]/editar`
  (no se puede cambiar `totalNumbers` una vez creada). **La aplicación
  siempre se ve en amarillo y negro**; los colores de la rifa solo se aplican
  al enlace público para compradores, a la imagen para compartir y a la
  vista previa al compartir el enlace. Si el fondo elegido es claro (o de tono
  medio), la página pública pasa a un esquema claro (texto oscuro, tarjetas
  claras, dorado más profundo) para que todo se lea; el formulario avisa si el
  texto casi no se lee sobre el color de los números.
- **Colores de marca del cliente**: el color de los números de la rifa es su
  color de marca. En el enlace público reemplaza al dorado en todo (precios,
  etiquetas "Disponible", botones, bordes, botones de copiar), con una variante
  ajustada para que se lea como texto sobre el fondo, y el texto de los botones
  y de los números se elige solo (blanco o casi negro, el que mejor contraste).
  El color del texto de los números es **automático** por defecto; si alguien
  elige uno que no se lee sobre el color de los números (contraste menor a 3, p.
  ej. negro sobre azul oscuro), se usa el automático. El formulario ofrece 8
  **estilos listos** (Clásico, Azul, Rojo, Verde, Morado, Naranja, Celeste,
  Rosa) para partir de ahí, y la imagen para compartir y la vista previa del
  enlace usan las mismas reglas. La aplicación del equipo sigue amarilla y negra.
- `RaffleAccount`: una o varias cuentas de pago publicadas en la rifa
  (label + número + "responsable" opcional), visibles en el dashboard y en
  la imagen para compartir — para que el comprador sepa dónde consignar.
- **Enlace para compradores** (`/p/<token>`): página pública y de solo lectura
  para que un comprador vea, sin cuenta, qué números o letras siguen
  disponibles. Viene **apagada**: el organizador la activa desde "Crear enlace
  para compradores", y puede copiarla, compartirla, generar una nueva (la
  anterior deja de funcionar al instante) o desactivarla. `Raffle.publicToken`
  guarda un secreto aleatorio de 128 bits. Quien la abre ve premio, precios,
  fecha, cuentas de pago y disponible/vendido por número y letra (y el número
  ganador si la rifa está cerrada), **nunca** nombres, teléfonos, comprobantes
  ni pagos: `lib/publicRaffle.ts` es el único camino de datos anónimo y elige
  los campos uno por uno. La página se actualiza sola cada 20 s, no se indexa
  en buscadores, el endpoint público limita 60 consultas por minuto por IP y
  eliminar la rifa mata el enlace. Los vendedores pueden copiarlo si está
  activo, pero solo el organizador lo administra.
- **Vista previa al compartir enlaces** (WhatsApp, Telegram, Facebook…): el
  enlace de ingreso muestra una tarjeta de marca con título y descripción
  cortos, y el enlace público de cada rifa muestra **su propia tarjeta** de
  1200×630 con el nombre, el premio, el valor, cuántos números o conjuntos
  quedan y la fecha del sorteo, en los colores de la rifa (rifa cerrada: "Ganó el
  47"). Se dibuja al pedirla, con la tipografía Baloo 2 (`public/fonts`, licencia
  OFL), y solo usa datos públicos. Las direcciones de las imágenes se arman con
  el dominio real desde los encabezados del proxy (`x-forwarded-host/proto`);
  `APP_URL` (opcional, ej. `https://rifas.midominio.com`) lo fija a mano. Las
  apps de chat guardan la vista previa un buen rato: si acabas de cambiar el
  nombre o vendiste mucho, puede tardar en actualizarse en un chat ya compartido.
- **Instalar la app**: la pantalla de ingreso tiene un botón "Instalar app". Donde
  el navegador lo permite (Android, Chrome, Edge) instala con un toque usando
  `beforeinstallprompt`; en iPhone/iPad, que no tiene ese evento, abre los pasos
  Compartir → Añadir a pantalla de inicio. No aparece si la app ya está
  instalada ni si el navegador no puede instalarla. `public/sw.js` tiene un
  `fetch` vacío (algunos navegadores lo piden para considerar el sitio
  instalable) y sigue sin guardar nada en caché.
- **Botones de la cabecera del tablero**: "Mis rifas / Crear rifa / Mi equipo /
  Cerrar rifa" van siempre en una sola fila; en el celular usan etiquetas cortas
  (Nueva, Equipo, Cerrar) y, por debajo de 360 px, sin la flecha.
- **Encabezado plegable**: en el tablero, el botón "Detalles / Ocultar" pliega
  la tarjeta de premio y precio, las cuentas de pago y los botones de imagen y
  enlace, para que en el celular el tablero de números quede a la vista. Nombre,
  contadores, lo recaudado y el aviso de rifa cerrada siempre se ven, y una
  flecha lleva a "Mis rifas". La elección se recuerda en el dispositivo
  (`localStorage`); la primera vez todo aparece abierto.
- **Cobrar por WhatsApp**: en Participantes, cada comprador que debe tiene
  "Recordar pago" y el que ya pagó algo tiene "Enviar comprobante". Abren
  WhatsApp (`wa.me`) con el mensaje escrito: sus números o letras, el total, las
  cuentas de pago de la rifa y la fecha del sorteo. Un celular colombiano de 10
  dígitos recibe el `57` solo; uno con código de país se respeta; sin teléfono se
  abre el selector de contactos de WhatsApp. No hay integración ni costo: el
  mensaje sale del WhatsApp del propio vendedor.
- **Copiar la cuenta de pago**: cada cuenta de pago tiene un botón "Copiar" que
  copia solo el número (sin nombre ni responsable) y muestra "¡Copiado!". Está
  en la página pública, en la confirmación de la reserva y en la cabecera del
  tablero.
- **Copiar como texto**: en la cabecera del tablero, el botón "Texto" (rifa
  abierta) copia un mensaje listo para pegar en WhatsApp o Telegram: nombre,
  premio, sorteo, valor, lo que sigue disponible, las cuentas de pago y el
  enlace público si existe ("Reserva y mira lo disponible aquí" cuando las
  reservas están abiertas). Una rifa normal lista sus números libres; una rifa
  por conjuntos lista cada letra libre con sus números y su precio (un conjunto
  vendido no aparece), y después los números sueltos libres.
- **Imagen de una rifa por letras**: solo dibuja lo que todavía se puede
  comprar (los conjuntos vendidos y los números sueltos tomados no aparecen, y
  la leyenda solo explica "Disponible"); si ya no queda nada, lo dice. La imagen
  de una rifa normal sigue mostrando todos los números, los vendidos atenuados.
- **Imagen para compartir**: en el celular el botón "Compartir imagen" abre
  directo el menú del sistema (Guardar imagen en Fotos, WhatsApp, etc.) usando
  la Web Share API con archivos. Si el navegador lo rechaza (por ejemplo, pasó
  mucho tiempo desde el toque), o no puede compartir archivos, se abre una hoja
  con la imagen para compartirla, descargarla o guardarla manteniéndola
  presionada. En computador sigue siendo una descarga directa.
- `RaffleNumber`: cada número con su estado (`available` / `occupied` /
  `paid`), datos del comprador y foto del comprobante en base64.
  `paymentMethod` (`cash` / `nequi` / `transfer` / `other`) registra cómo se
  cobró en persona. `paymentRef` sigue sin usarse, reservado para cuando se
  conecte una pasarela de pago (Wompi, PSE, Stripe, etc.) sin tener que
  migrar el esquema — hoy el cobro es 100% manual por decisión de producto.
- `RaffleGroup`: un **conjunto** con letra (A, B, C…) y precio propio. Al
  crear una rifa se puede activar "Vender por conjuntos": se elige cuántos
  números lleva cada letra y su precio, y los números se reparten **al azar**
  (con "Sortear de nuevo") o **a mano** (eliges una letra y tocas sus
  números). `RaffleNumber.groupId` dice a qué conjunto pertenece; los que
  quedan sin conjunto son **sueltos** y se venden de a uno al "valor por
  número suelto". Los conjuntos se definen al crear la rifa y no se editan.
  Un conjunto siempre se vende, cobra y libera **completo** a un solo
  comprador: `/api/numbers/bulk` rechaza (400) un pedido que traiga solo parte
  de un conjunto y `/api/numbers/[id]` rechaza tocar un número que es de un
  conjunto. Además de `sell` y `pay`, el endpoint acepta `unpay`, `release` y
  `edit` (corregir nombre/teléfono del comprador), todos atómicos.
- **Precio individual con conjuntos**: al vender por conjuntos, el formulario
  muestra siempre "Precio individual (números sueltos)" justo debajo del precio
  del conjunto. Es obligatorio solo si quedan números fuera de los conjuntos; si
  todos caben en letras es opcional (y se explica por qué). Para dejar números
  sueltos, el campo "Cantidad de conjuntos" (por defecto, todos los que caben)
  permite hacer menos conjuntos, o se sacan números de una letra en el modo "Elegir
  yo". Los sueltos se venden de a uno a ese precio.
- **Sorteo al completarse**: en el formulario, "¿Cuándo se juega?" ofrece tres
  opciones (`Raffle.drawTrigger`): **en una fecha** (lo de siempre), **cuando se
  vendan todos los números** o **cuando se paguen todos los números**. Con las dos
  últimas la fecha es opcional al principio: el tablero, la página pública, el
  texto copiable, la imagen para compartir, la vista previa del enlace y los
  recordatorios de WhatsApp dicen "Sorteo cuando se vendan todos los números" y
  muestran el avance ("7 de 10 vendidos", con barra). En el instante en que se
  cumple la condición (venta del equipo, reserva desde el enlace, cobro, o un
  cambio de la condición) se guarda `completedAt` y el equipo recibe una
  notificación **una sola vez** ("¡completa! Fija la fecha del sorteo"); el
  organizador ve un aviso verde con el botón "Fijar fecha", que abre una hoja
  rápida con el calendario (los vendedores ven el aviso sin el botón). Si se
  libera algún número (a mano o por vencimiento) y deja de estar completa,
  `completedAt` se borra, y al volver a completarse se avisa otra vez. En la
  lista de rifas la celda "Sorteo" dice "Al vender todo" / "Al cobrar todo" en
  lugar de "Por definir". La página pública solo recibe totales (vendidos /
  pagados), nunca cuáles números están pagados.
- **Rifa por etapas** (varios sorteos, pago por cuotas): al crear la rifa se
  activa "Rifa por etapas" (no se combina con conjuntos). Cada etapa
  (`RaffleStage`, de 2 a 6) es un sorteo con su premio, fecha y lotería, y cuesta
  una cuota; el valor del número es la suma de las cuotas. Ejemplo: 100 números a
  $150.000 en 3 cuotas de $50.000; etapa 1 por $500.000, etapa 2 por $500.000 y la
  final por $7.000.000. Reglas:
  - El comprador juega **con el mismo número en todas las etapas**, y un número
    puede ganar varias.
  - Una cuota cuenta para una etapa si se pagó a más tardar el día que queda
    `Raffle.stageDeadlineDays` días antes del sorteo (3 por defecto,
    configurable). Si sale un número que **no está al día**, o que nadie tiene, el
    premio **queda en la casa** (`outcome = "house"`).
  - **Entrar tarde**: quien compra con etapas ya jugadas paga las cuotas
    anteriores para ponerse al día ("Ponerse al día" cobra lo necesario para la
    próxima etapa); al final siempre paga el total.
  - **Pagar todo de una** (`Raffle.fullPayPerk`): sin beneficio, con **descuento**
    (`fullPayDiscount`, se aplica si paga todo junto antes de la fecha límite de la
    primera etapa) o con un **sorteo extra gratis** (una etapa `bonus` de precio
    0, que juegan solo los números pagados completos antes de esa fecha límite).
  - Las cuotas pagadas se guardan en `NumberQuota` (cuota, valor, método, fecha y
    quién cobró). En la hoja del número: "Cobrar cuota N", "Ponerse al día",
    "Cobrar todo" (con el descuento si aplica) y "Deshacer la última cuota"; el
    número pasa a "Pagado" cuando completa las cuotas. "Marcar como pagado" y el
    cobro masivo normal no se usan en estas rifas (`POST /api/numbers/quotas`).
  - El tablero muestra el panel **Etapas** (premio, fecha, hasta cuándo pagar,
    cuántos vendidos están al día) y cada número vendido lleva "1/3". El
    organizador usa "Registrar resultado", que antes de guardar dice si el número
    gana o si el premio queda en la casa; se puede deshacer el último resultado.
    Al registrar la última etapa la rifa se cierra sola.
  - Pasada la fecha límite de la etapa en cobro, con "Liberar los números
    atrasados" los números que no pagaron esa cuota vuelven a la venta (sus cuotas
    se pierden); si no, se avisa al equipo una vez al día. Quien pagó tarde
    conserva el número y juega desde la siguiente etapa.
  - Participantes, el reporte de vendedores, los recordatorios y comprobantes de
    WhatsApp, el texto para copiar, la imagen, la página pública (con resultados,
    sin nombres) y la vista previa del enlace entienden las etapas. El formulario
    hace las cuentas: lo que entra si se venden todos contra los premios en dinero.
  - Al editar se pueden cambiar premio, nombre, fecha y lotería de las etapas que
    no se han jugado, los días de plazo y el beneficio; las cuotas no.
- **Cierre de la rifa**: el organizador puede "Cerrar rifa" desde el tablero,
  con el número ganador (o sin él si terminó sin sorteo). Se guardan
  `Raffle.winnerValue` y `closedAt`, el equipo recibe una notificación
  ("Ganó el 47: María Pérez") y el ganador queda marcado en el tablero, en las
  letras, en Participantes y en el listado. Una rifa cerrada **no vende ni
  libera** números (el servidor responde 409), pero sí deja registrar,
  deshacer o corregir pagos y datos del comprador. "Reabrir rifa" la vuelve a
  abrir y olvida al ganador. "Eliminar rifa" solo existe para rifas cerradas,
  pide escribir el nombre de la rifa y borra todo (números, compradores,
  comprobantes) sin vuelta atrás. Los tableros abiertos se enteran en vivo:
  `/api/raffles/[id]/numbers` devuelve también el estado de la rifa.
- **Ventas por vendedor**: en Participantes, el selector "Vendedores" (el
  vendedor lo ve como "Mis ventas") muestra cuánto vendió cada persona, cuánto de
  eso ya está cobrado y cuánto falta, con conjuntos a su precio de conjunto. Sirve
  para liquidar comisiones: un campo opcional de % calcula la comisión sobre lo
  **cobrado**, y "Enviar resumen por WhatsApp" manda el resumen. Una venta se
  acredita a quien vendió (`RaffleNumber.soldById` y `soldAt`, que no cambian
  cuando otra persona registra el pago; a diferencia de `updatedBy`, que es solo
  el último que tocó el número), aunque otro haya recibido el dinero. El
  organizador ve a todo el equipo; un vendedor solo su propia línea. Los números
  vendidos antes de existir este dato se acreditan a quien los tocó por última
  vez (la migración lo rellena así). Liberar un número borra su vendedor y fecha.
- **Apartados que vencen**: en "Editar rifa" (o al crearla) el organizador puede
  activar "Los apartados sin pagar vencen" con un plazo en días
  (`Raffle.holdDays`, 1–365), contado desde `soldAt`. Pasado el plazo, un número
  vendido y sin pagar está **vencido**: aparece un aviso rojo en el tablero, el
  comprador sube al inicio de Participantes con "Vencido · N días sin pagar" (los
  demás muestran "Vence en N días") y el equipo recibe una notificación push, como
  máximo una vez al día (`expiryNoticeAt`). Con "Liberarlos automáticamente"
  (`Raffle.autoRelease`) los números vuelven a estar disponibles solos (un
  conjunto siempre completo, aunque solo uno de sus números esté vencido), y el
  equipo recibe "apartados liberados" con quién y cuánto. Lo pagado nunca vence,
  y una rifa cerrada no se toca. Lo aplica un temporizador del servidor cada 10
  minutos, desde que arranca (`instrumentation.ts`, `lib/expirySweeper.ts`), y
  también se revisa al abrir la rifa, así una pantalla nunca muestra algo
  desactualizado. Como el resto del tiempo real, asume una sola instancia.
- **Reservas desde el enlace público**: quien abre `/p/<token>` puede apartar
  números o letras por su cuenta (toca lo que quiere, "Reservar", nombre y
  teléfono). Se configura por **organización** y por **rifa**: en "Mi equipo" el
  organizador marca el valor por defecto de todas sus rifas
  (`AdminUser.publicReservations`), y en "Editar rifa" cada una puede seguirlo
  ("Como mi organización"), forzarlo ("Permitir") o apagarlo ("No permitir")
  (`Raffle.publicReservations`: `null` / `"on"` / `"off"`). Además la rifa debe
  tener **plazo de pago** (`holdDays`): sin plazo las reservas no se abren, para
  que nadie pueda dejar números apartados para siempre. Lo reservado queda como
  apartado a nombre del visitante (`RaffleNumber.online`, sin vendedor: en el
  reporte de ventas es la línea "Reservas en línea"), se avisa al equipo por push
  y, si no se paga a tiempo, sigue las reglas de vencimiento (aviso o liberación
  automática). Un conjunto se reserva completo. Límites: 10 números y 3
  conjuntos por reserva, 20 números sin pagar por teléfono y por rifa, y 6
  reservas por hora por IP; un número tomado entre tanto responde 409 y no se
  aparta nada. La respuesta pública solo trae lo mismo que antes (nada de
  compradores ni teléfonos ajenos). Endpoint: `POST /api/public/raffles/[token]/reserve`.
  **Comprobante de pago**: al terminar la reserva, el visitante puede subir su
  comprobante ("¿Ya pagaste? Sube tu comprobante"): elige una foto o una captura
  de la galería (sin forzar la cámara) y el navegador la **comprime antes de
  enviarla** (lado mayor 1000 px, JPEG al 72 %: una foto de varios MB queda en
  unos cientos de KB, y se muestra el peso final). Se adjunta a todos los números
  de esa reserva (`RaffleNumber.photoDataUrl`, como en una venta hecha por el
  equipo), el equipo recibe un aviso y ve la imagen en el número o conjunto y la
  marca "Con comprobante" en Participantes. Solo quien hizo la reserva puede
  subirlo: recibe una clave secreta (`holdToken`) que solo sirve para esa
  reserva y deja de servir cuando los números se liberan o se revenden. Solo
  acepta JPEG/PNG/WebP (nada de SVG) y hasta 1,5 MB.
  **Subirlo más tarde**: en la página pública el botón "Ya reservé: subir mi
  comprobante" pide el teléfono con el que se reservó (el mismo que se recuerda del
  formulario) y la imagen; no hace falta la clave. El teléfono identifica la
  reserva (con o sin `+57`), solo alcanza reservas hechas en línea y **aún sin
  pagar** (no las vendidas por el equipo ni las ya pagadas), y si hay varias con
  el mismo teléfono la imagen va a las que todavía no tienen comprobante. Como un
  teléfono es una identidad débil, se limita a 10 intentos por hora por IP, y la
  respuesta de "no encontramos" no dice si el teléfono existe o si la reserva se
  liberó. Endpoint: `POST /api/public/raffles/[token]/receipt` con `key` (justo
  después de reservar) o con `phone`.
  **Ver el comprobante**: en Participantes, la tarjeta de cada comprador muestra
  miniaturas de sus comprobantes ("Ver"), así se ven desde afuera sin abrir cada
  número o conjunto; un conjunto (que lleva la misma imagen en todos sus
  números) muestra una sola, y varias reservas con imágenes distintas muestran
  una miniatura por imagen. Al tocar se abre a pantalla completa.
- `RefreshToken`: sesiones revocables (rotación en cada refresh).

## Organizaciones y acceso

Cada organizador es una **organización** (él y sus vendedores forman su
equipo) y tiene un **código de organización** corto, por ejemplo
`rifas-norte` (3 a 30 caracteres: minúsculas, números y guiones). Para
ingresar se escribe ese código y el de 6 dígitos personal. Como el de 6
dígitos solo se compara dentro del equipo, dos organizaciones distintas pueden
tener cada una un vendedor con el mismo código, y el mensaje de "código en
uso" ya no revela nada de otras organizaciones.

- El celular recuerda la organización después del primer ingreso, y un enlace
  `/login?org=rifas-norte` la deja escrita (el organizador lo copia desde
  "Mi equipo").
- El superadmin entra dejando la organización vacía. Al crear un organizador
  elige su código (o se genera a partir del nombre) y puede cambiarlo después
  desde el lápiz de su tarjeta.
- Al crear o editar una cuenta, **Generar aleatorio** llena el código de 6
  dígitos (sin repeticiones ni secuencias obvias como `111111` o `123456`) y
  **Copiar código** lo copia. Es el único momento para anotarlo: se guarda
  cifrado y no se puede volver a ver. Para organizadores, **Aleatorio** propone
  un código de organización tipo `org-k7m2xq` (sin caracteres que se confunden).
- Si se suspende (desactiva) a un organizador, todo su equipo deja de poder
  ingresar.
- Al actualizar desde una versión anterior, cada organizador que ya existía
  recibe un código generado de su nombre (`Rifas del Norte` → `rifas-del-norte`,
  con `-2`, `-3`… si se repite). Se asigna solo al arrancar y el superadmin lo
  ve en "Organizadores".
- El seed (`prisma/seed.ts`) corre en cada arranque del contenedor y por eso
  el `Dockerfile` copia `lib/orgCode.ts` a la imagen: es lo único de `lib/`
  que importa.

## Seguridad del login

Los códigos de organización no son secretos (los conocen todos los vendedores),
pero tampoco se regalan: un código de organización inexistente y un código de 6
dígitos incorrecto reciben exactamente la misma respuesta. Un observador muy
paciente aún podría inferir por el tiempo de respuesta que una organización
existe (compara contra cada persona del equipo), y por eso el límite por IP de
abajo es la defensa real contra probar códigos.

El código de 6 dígitos tiene un espacio de búsqueda pequeño, así que el login
está limitado por IP (`lib/rateLimit.ts`, en memoria — para producción con
varias instancias conviene moverlo a Redis). Los tokens de acceso duran 15
minutos; el cliente (`lib/api-client.ts`) los renueva automáticamente contra
`/api/auth/refresh` cuando expiran, y cierra sesión si el refresh también falla.

**Cambiar mi código**: cualquiera (también el administrador de la plataforma)
cambia su propio código en **Mi cuenta** (`/cuenta`, tocando su nombre arriba a
la derecha). Pide el código actual (los intentos fallidos cuentan para el mismo
límite por IP del login), rechaza códigos obvios (111111, 123456, 987654…) y los
que ya usa alguien del mismo equipo, y cierra las sesiones de los demás
dispositivos dejando abierta la actual.

### Pruebas de ataque y endurecimiento

`test-security` (suite de ataques contra el servidor real: 56 comprobaciones) y
`test-csp` cubren lo siguiente; lo que falló en la primera pasada quedó corregido:

- **Aislamiento entre organizaciones y roles**: un organizador o vendedor no
  puede leer, editar, borrar ni vender en rifas, números ni usuarios de otra
  organización (siempre 404/403, sin filtrar que existen); un vendedor no puede
  gestionar rifas, usuarios ni ajustes; enviar `role`/`plan`/`ownerId` al crear o
  editar usuarios no escala privilegios. Suspender a un organizador ahora corta
  también las sesiones que ya tenían abiertas sus vendedores.
- **Sesiones**: tokens con `alg=none`, firmados con otra clave, expirados,
  alterados o de otro algoritmo (ahora solo HS256) son rechazados; un refresh
  token usado o de una sesión cerrada no sirve; cookies `HttpOnly`, `Secure`,
  `SameSite=Lax`.
- **Fuerza bruta**: el límite por IP (8 intentos / 5 min en el login, 6
  reservas / hora, 10 consultas de comprobante por teléfono / hora) usa la IP
  que agrega el proxy (la última de `X-Forwarded-For`), no el primer valor, que
  cualquiera podía inventar para saltarse los límites. **`TRUSTED_PROXY_HOPS`**
  (por defecto 1: Traefik de Dokploy) indica cuántos proxies hay delante; ponlo
  en 2 si además hay Cloudflare u otro. Además cada organización tiene un tope
  de 60 intentos fallidos cada 15 min desde cualquier IP (30 para el
  superadministrador): un ataque repartido entre muchas IPs deja de poder probar
  los 1.000.000 de códigos.
- **CSRF**: una escritura que el navegador declara de otro sitio (`Origin`
  distinto del host o `Sec-Fetch-Site: cross-site`) no se autentica con la cookie.
- **Cuerpos enormes**: `lib/body.ts` corta con 413 cualquier cuerpo sobre el
  límite de cada endpoint (16 KB los pequeños, 512 KB crear/editar rifas, 2,2 MB
  el comprobante público, 4,5 MB una foto del equipo), antes o durante la lectura.
- **Entradas hostiles**: inyección SQL (Prisma parametriza todo), prototype
  pollution, números y textos extremos, path traversal en el token público: 4xx,
  nunca 500 ni archivos. Los comprobantes solo pueden ser JPEG, PNG o WebP
  (nada de SVG) tanto desde la web pública como desde el equipo.
- **XSS**: nombres con `<script>`/`<img onerror>` se muestran como texto en la
  app y en la página pública.
- **Cabeceras** (`next.config.ts`): CSP (solo recursos propios, sin plugins, sin
  `<base>` ajeno, no incrustable), `X-Frame-Options: DENY`, `nosniff`,
  `Referrer-Policy: no-referrer` (el token del enlace público no sale en el
  Referer), HSTS, `Permissions-Policy`, sin `X-Powered-By`, y la API responde
  `Cache-Control: no-store`.
- **Abuso de recursos**: la imagen de vista previa de la rifa (se dibuja en
  cada petición) tiene su propio límite de 30 por minuto por IP; una suscripción
  push hacia una dirección interna (SSRF) se rechaza.

Riesgos que se aceptan o quedan por vigilar: un atacante decidido puede hacer
esperar el login de una organización (a cambio de frenar el adivinar códigos);
los límites viven en memoria (una sola instancia); un refresh token robado sirve
hasta que caduca (30 días) o se cierra sesión; el enlace público es un secreto
compartido, quien lo tenga puede ver la rifa y reservar dentro de los límites.

## Desplegar con Dokploy (Docker Compose)

El repo incluye `Dockerfile` y `docker-compose.yml` listos para un despliegue
de tipo **Docker Compose** en Dokploy.

1. En Dokploy, crea una aplicación tipo *Docker Compose* apuntando a este
   repositorio y rama (`compose file`: `docker-compose.yml`).
2. En **Environment Variables** de la app, define al menos:
   - `ACCESS_TOKEN_SECRET` — string aleatorio largo (`openssl rand -hex 32`).
   - `REFRESH_TOKEN_PEPPER` — otro string aleatorio largo, distinto al anterior.
   - Opcional: `SEED_ORG_CODE` (código de organización de la demo, por defecto
     `demo`) y `SEED_SUPERADMIN_CODE` / `SEED_ORGANIZER_CODE` /
     `SEED_SELLER_CODE` (6 dígitos cada uno) para fijar los códigos de acceso
     iniciales. Si no los defines, el primer arranque genera códigos
     aleatorios y los imprime una sola vez en los logs del contenedor —
     revísalos ahí antes de que se pierdan.
   - Opcional, para las notificaciones push: `VAPID_PUBLIC_KEY`,
     `VAPID_PRIVATE_KEY` y `VAPID_SUBJECT` (ver "Notificaciones push" abajo).
   - Recomendado: `APP_URL` (la dirección pública, ej. `https://rifas.tu-dominio.com`;
     se usa en los enlaces de los correos) y `TRUSTED_PROXY_HOPS` (`1` si delante
     solo está Dokploy; `2` con Cloudflare en modo proxy, la nube naranja).
   - Opcional, para los correos a compradores: `SMTP_HOST`, `SMTP_PORT`,
     `SMTP_USER`, `SMTP_PASS` y `MAIL_FROM` (ver "Correos a compradores" abajo).
   - Opcional, contra reservas automáticas: `TURNSTILE_SITE_KEY` y
     `TURNSTILE_SECRET_KEY` (ver "Protección de las reservas en línea").
   - Solo las variables listadas en `docker-compose.yml` llegan al contenedor:
     si agregas una nueva en Dokploy, también debe estar ahí.
3. Configura el dominio de la app en Dokploy apuntando al puerto **interno**
   3000 del servicio `app` (el `docker-compose.yml` del repo no publica
   ningún puerto del host a propósito — Dokploy enruta por su propio proxy
   directo al contenedor, así que nunca compite con otras apps del mismo
   servidor por un puerto). No necesitas tocar nada de puertos aquí.
4. Despliega. El contenedor, al arrancar, aplica las migraciones de Prisma y
   siembra la rifa de 100 números si la base de datos está vacía (es
   idempotente: en despliegues posteriores no vuelve a tocar los datos).

Los datos (SQLite) se guardan en el volumen nombrado `ibirifas_data`, montado
en `/app/data` dentro del contenedor — persiste entre redeploys mientras no
borres el volumen. Para migrar a Postgres/MySQL más adelante: cambia
`provider` en `prisma/schema.prisma`, ajusta `DATABASE_URL` y regenera las
migraciones; el resto de la app no cambia.

### Probarlo en local con Docker

`docker-compose.override.yml` publica el puerto 3000 al host — Compose lo
mezcla automáticamente cuando corres `docker compose` sin `-f` explícito (así
es como lo invoca Dokploy, así que a él nunca le llega este archivo, y por
lo tanto nunca choca con otro puerto ocupado en el servidor):

```bash
cp .env.example .env   # o exporta ACCESS_TOKEN_SECRET/REFRESH_TOKEN_PEPPER
docker compose up --build
# app disponible en http://localhost:3000 (o el puerto que pongas en APP_PORT)
```

## Notificaciones push

Cuando alguien del equipo **vende, cobra o libera** un número, el resto del
equipo (el organizador y sus vendedores, salvo quien hizo la acción) recibe un
aviso en su celular aunque no tenga la app abierta. Cada persona las activa
desde la campana del encabezado, en cada dispositivo donde las quiera.

Para activarlas en el servidor hacen falta dos llaves (VAPID) que identifican
a tu servidor ante Google, Apple y Mozilla:

```bash
npx web-push generate-vapid-keys
```

Define en Dokploy `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y `VAPID_SUBJECT`
(un `mailto:` con un correo real tuyo). Sin las llaves la app funciona igual y
la campana simplemente no aparece. **No cambies las llaves después**: cada
suscripción queda atada a la llave con la que se creó, y habría que volver a
activar las notificaciones en todos los dispositivos.

Requisitos y límites:

- El sitio debe abrirse por **HTTPS** (el dominio de Dokploy ya lo es;
  `localhost` también funciona para desarrollo).
- **iPhone/iPad (iOS 16.4+)**: las notificaciones solo funcionan con la app
  instalada en la pantalla de inicio (Compartir → *Añadir a pantalla de
  inicio*) y abierta desde su ícono. En Safari normal no existen.
- El servidor solo acepta direcciones de los servicios de push reales (Google,
  Mozilla, Apple, Windows), para que nadie pueda usarlo para hacer peticiones
  a direcciones internas.
- El aviso se envía después de guardar la venta y nunca la retrasa ni la
  hace fallar: si el servicio de push está caído, la venta se guarda igual.

## Correos a compradores

Quien reserva desde el enlace público puede dejar su **correo** (opcional) y
recibe un aviso cuando pasa algo con su reserva:

- **Reserva hecha**: lo que apartó, el total, hasta cuándo tiene para pagar, las
  cuentas de pago y el botón "Subir comprobante".
- **Comprobante recibido**: el organizador lo va a revisar.
- **Pago confirmado** cuando el equipo marca el número o el conjunto como pagado
  (en una rifa por etapas: "Recibimos tu cuota N de M" con lo que le falta, y
  "Pago confirmado" al completar).
- **Comprobante rechazado**: el equipo usa "Rechazar comprobante" en la hoja del
  número o del conjunto, con un motivo opcional ("No llegó el pago", "No se ve el
  valor o la fecha"…). El comprobante se quita, la reserva sigue activa y el
  comprador recibe el motivo y el enlace para subir otro.
- **Reserva liberada**, por el equipo o porque venció el plazo de pago (o la
  cuota de una etapa).

Además, cada reserva tiene su página **"Mi reserva"** (`/p/<token>/reserva/<clave>`),
que funciona aunque no deje correo: muestra el estado (pendiente, en revisión,
rechazado con su motivo, confirmado), lo que apartó, cuánto paga y hasta cuándo,
y permite subir o reemplazar el comprobante. Se abre desde la confirmación de la
reserva, desde los correos y desde el botón "Ver mi reserva" del enlace público
(en el mismo dispositivo). La clave es secreta y solo da acceso a esa reserva.
Varios números de un mismo correo en una sola acción se avisan en **un solo
correo**.

**Configuración** (Dokploy → Environment Variables), con cualquier servidor SMTP:

| Variable | Ejemplo |
| --- | --- |
| `SMTP_HOST` | `smtp.resend.com`, `smtp-relay.brevo.com`, `smtp.gmail.com` |
| `SMTP_PORT` | `587` (STARTTLS) o `465` (TLS directo) |
| `SMTP_USER` / `SMTP_PASS` | el usuario y la clave SMTP del proveedor |
| `MAIL_FROM` | `Rifas <rifas@tu-dominio.com>` |
| `APP_URL` | `https://rifas.tu-dominio.com` (para los enlaces de los correos) |

Para que los correos no lleguen a spam, envía desde tu propio dominio y
verifícalo en el proveedor (registros SPF/DKIM que te da, en Cloudflare). Con
Gmail sirve una "contraseña de aplicación", pero tiene límite diario y es fácil
que caiga en spam; para una rifa grande es mejor Resend o Brevo (ambos tienen
plan gratis). Sin `SMTP_HOST` la app funciona igual: el formulario no pide correo
y no se envía nada, pero "Mi reserva" sigue disponible.

En **Mi equipo → Correos a compradores** el organizador guarda su **correo de
contacto** (las respuestas de los compradores llegan ahí) y puede enviarse un
**correo de prueba** para revisar la configuración. El equipo ve el correo del
comprador en la hoja del número, y en Participantes aparece "Comprobante
rechazado" mientras espera uno nuevo.

Los correos usan los **colores de la rifa** (los mismos del enlace público): el
encabezado con su fondo y su color, el botón y los resaltados en el color de los
números (ajustado para que se lea), y un fondo suave del mismo tono.

## Protección de las reservas en línea

- **Límite por IP**: 20 reservas por hora (antes 6). No es más bajo porque los
  operadores móviles ponen a muchos clientes detrás de la misma IP. Además cada
  reserva tiene tope (10 números, 3 conjuntos) y un teléfono no puede tener más
  de 20 números sin pagar.
- **Cloudflare Turnstile** (opcional, recomendado): la verificación "no soy un
  robot" de Cloudflare, casi siempre invisible. En Cloudflare → *Turnstile* →
  *Add widget*, con el dominio de la app y modo *Managed*; copia la **Site Key** y
  la **Secret Key** a `TURNSTILE_SITE_KEY` y `TURNSTILE_SECRET_KEY` en Dokploy y
  redespliega. Con las dos llaves, reservar exige el token del widget, que el
  servidor comprueba con Cloudflare (si Cloudflare no responde, la reserva se
  rechaza: falla cerrado). Sin ellas no cambia nada.
- **Aviso de privacidad** (Ley 1581 de 2012): cada rifa tiene su aviso en
  `/p/<token>/privacidad` (enlazado al pie del enlace público), con el
  organizador como responsable de los datos y su correo de contacto. Para
  reservar hay que marcar "Acepto el aviso de privacidad"; la fecha de la
  aceptación se guarda con la reserva (`RaffleNumber.privacyConsentAt`) y se
  borra junto con los datos del comprador si la reserva se libera.

## Visitas al enlace

El organizador y los vendedores ven en **Enlace para compradores** cuántas
personas abrieron el enlace hoy, en los últimos 7 días y en total, cuántas veces
se abrió, una barra de los últimos 14 días y cuántos números hay reservados en
línea. Se cuenta cada vez que alguien abre la página (no las actualizaciones
automáticas), sin contar los robots de vista previa (WhatsApp, Facebook,
Telegram…). Cada visitante es un resumen irreversible de IP + navegador + día
(`RaffleVisit`): la misma persona cuenta una vez al día y no se puede seguir de un
día a otro. Las visitas de más de 120 días se borran solas.

## Actualización en tiempo real

Cuando alguien del equipo vende, cobra o libera un número, los demás lo ven
en su tablero al instante, sin recargar. El botón de recargar junto a las
pestañas (con un punto verde cuando hay conexión en vivo) fuerza una
actualización completa, que además trae cambios de la rifa misma (premio,
cuentas de pago).

Cómo funciona: cada tablero mantiene una conexión Server-Sent Events con
`/api/raffles/:id/events`, que solo avisa "algo cambió"; el navegador pide
entonces los cambios con su propia sesión (`/api/raffles/:id/numbers?since=…`).
Esa misma puesta al día se ejecuta al reconectar, al volver a abrir la app y
cada 30 segundos, así que si la conexión en vivo se pierde o algún proxy la
retiene, el tablero igual se actualiza (con unos segundos de retraso).

Al volver a la app tras cerrarla o dejarla en segundo plano (el celular corta la
conexión), se abre una conexión nueva de inmediato, y el aviso "Sin conexión en
vivo" solo aparece si la conexión sigue caída pasados unos 4 segundos, así que ya
no parpadea al reabrir.

Límites a tener en cuenta:

- Las conexiones viven en la memoria del servidor (`lib/realtime.ts`), así
  que esto asume **una sola instancia** de la app, como hoy en Dokploy. Si algún
  día se escala a varias, hay que cambiar ese archivo por un canal compartido
  (por ejemplo Redis pub/sub); el respaldo de 30 s sigue funcionando mientras tanto.
- Un proxy inverso no debe guardar en buffer las respuestas
  `text/event-stream`. El de Dokploy (Traefik) no lo hace por defecto y la app
  envía `X-Accel-Buffering: no` para los que sí (nginx).
- Cada rifa admite hasta 300 conexiones en vivo a la vez.

## Concurrencia (muchas personas a la vez)

La base es SQLite, que acepta **un solo escritor a la vez**. Cada compra o
reserva es una escritura muy corta (milisegundos), así que basta con hacerlas
en fila: `lib/prisma.ts` fija el pool a **una sola conexión** (con esperas
largas), y las peticiones simultáneas simplemente se encolan dentro de la app.
Sin esto, con el pool por defecto de Prisma las conexiones se disputaban el
archivo y en una prueba 25 de 30 reservas simultáneas fallaban con "Socket
timeout" tras 30 s.

Quién se queda con un número lo decide el orden en que la base procesa las
escrituras: **el primero que llega gana**; a los demás el servidor les responde
409 ("ya lo reservó otra persona") y no se aparta nada de su pedido (todo o
nada, un conjunto siempre completo). Una pantalla del equipo que ofrece vender un
número que ya se tomó también recibe 409 (`expectAvailable`) en lugar de pisar la
venta anterior.

Medido en local (`test-concurrency`, 4 núcleos): 200 personas pidiendo el mismo
número → 1 gana y 199 reciben 409 en ~1 s; 200 personas sobre 100 números →
exactamente 100 ventas y 100 rechazos, sin duplicados ni errores; 500 personas
mirando la página + 30 ventas del equipo + 300 compradores a la vez → todo
atendido, sin errores 5xx; 1000 peticiones simultáneas sobre 1000 números → sin
errores en ~6 s. Límites a tener en cuenta: una sola instancia de la app (igual
que el tiempo real) y el límite de 20 reservas por hora por IP, que personas en
la misma red (un evento, el wifi de un local, algunos operadores móviles) comparten.

## Notas conocidas

- `npm audit` reporta una vulnerabilidad en una dependencia transitiva del
  *CLI* de Prisma (`deepmerge-ts`, usada solo en tiempo de desarrollo) — no
  afecta el código que corre en producción.
