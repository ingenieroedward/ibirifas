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
  (no se puede cambiar `totalNumbers` una vez creada).
- `RaffleAccount`: una o varias cuentas de pago publicadas en la rifa
  (label + número + "responsable" opcional), visibles en el dashboard y en
  la imagen para compartir — para que el comprador sepa dónde consignar.
- `RaffleNumber`: cada número con su estado (`available` / `occupied` /
  `paid`), datos del comprador y foto del comprobante en base64.
  `paymentMethod` (`cash` / `nequi` / `transfer` / `other`) registra cómo se
  cobró en persona. `paymentRef` sigue sin usarse, reservado para cuando se
  conecte una pasarela de pago (Wompi, PSE, Stripe, etc.) sin tener que
  migrar el esquema — hoy el cobro es 100% manual por decisión de producto.
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

Límites a tener en cuenta:

- Las conexiones viven en la memoria del servidor (`lib/realtime.ts`), así
  que esto asume **una sola instancia** de la app, como hoy en Dokploy. Si algún
  día se escala a varias, hay que cambiar ese archivo por un canal compartido
  (por ejemplo Redis pub/sub); el respaldo de 30 s sigue funcionando mientras tanto.
- Un proxy inverso no debe guardar en buffer las respuestas
  `text/event-stream`. El de Dokploy (Traefik) no lo hace por defecto y la app
  envía `X-Accel-Buffering: no` para los que sí (nginx).
- Cada rifa admite hasta 300 conexiones en vivo a la vez.

## Notas conocidas

- `npm audit` reporta una vulnerabilidad en una dependencia transitiva del
  *CLI* de Prisma (`deepmerge-ts`, usada solo en tiempo de desarrollo) — no
  afecta el código que corre en producción.
