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

El seed imprime tres códigos de acceso de 6 dígitos (superadmin, organizador
y vendedor) — úsalos para el primer login y luego crea tus propias cuentas
desde la app (`/usuarios`); no dependas de estos códigos de ejemplo en
producción.

## Modelo de datos

- `AdminUser`: usuario con código de acceso, `role` (`SUPERADMIN` /
  `ORGANIZER` / `SELLER`), `ownerId` (un vendedor pertenece a su
  organizador) y `plan` (placeholder para futuros planes de pago, hoy sin
  límites reales).
- `Raffle`: pertenece a un organizador (`ownerId`); premio, precio por
  número y fecha del sorteo.
- `RaffleNumber`: cada número con su estado (`available` / `occupied` /
  `paid`), datos del comprador y foto del comprobante en base64. Incluye
  `paymentStatus` / `paymentRef`, hoy sin usar más allá de "pending"/"paid"
  manuales, pensados para conectar una pasarela de pago (Wompi, PSE, Stripe,
  etc.) sin tener que migrar el esquema.
- `RefreshToken`: sesiones revocables (rotación en cada refresh).

## Seguridad del login

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
   - Opcional: `SEED_SUPERADMIN_CODE` / `SEED_ORGANIZER_CODE` /
     `SEED_SELLER_CODE` (6 dígitos cada uno) para fijar los códigos de acceso
     iniciales. Si no los defines, el primer arranque genera códigos
     aleatorios y los imprime una sola vez en los logs del contenedor —
     revísalos ahí antes de que se pierdan.
   - Opcional: `APP_PORT` si quieres publicar el contenedor en un puerto de
     host distinto de 3000 (Dokploy puede enrutar por dominio sin esto).
3. Configura el dominio/puerto de la app en Dokploy apuntando al puerto
   interno **3000** del servicio `app`.
4. Despliega. El contenedor, al arrancar, aplica las migraciones de Prisma y
   siembra la rifa de 100 números si la base de datos está vacía (es
   idempotente: en despliegues posteriores no vuelve a tocar los datos).

Los datos (SQLite) se guardan en el volumen nombrado `ibirifas_data`, montado
en `/app/data` dentro del contenedor — persiste entre redeploys mientras no
borres el volumen. Para migrar a Postgres/MySQL más adelante: cambia
`provider` en `prisma/schema.prisma`, ajusta `DATABASE_URL` y regenera las
migraciones; el resto de la app no cambia.

### Probarlo en local con Docker

```bash
cp .env.example .env   # o exporta ACCESS_TOKEN_SECRET/REFRESH_TOKEN_PEPPER
docker compose up --build
# app disponible en http://localhost:3000
```

## Notas conocidas

- `npm audit` reporta una vulnerabilidad en una dependencia transitiva del
  *CLI* de Prisma (`deepmerge-ts`, usada solo en tiempo de desarrollo) — no
  afecta el código que corre en producción.
