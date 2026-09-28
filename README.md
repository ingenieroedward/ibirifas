# Ibirifas

Panel móvil para gestionar rifas: cuadrícula de números disponibles/ocupados,
registro del comprador con foto del comprobante, y acceso simple por código de
6 dígitos.

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

El seed imprime dos códigos de acceso de 6 dígitos (organizador y vendedor) —
cámbialos o crea los tuyos directamente en la base de datos antes de usar la
app en producción.

## Modelo de datos

- `Raffle`: una rifa activa con premio, precio por número y fecha del sorteo.
- `RaffleNumber`: cada número (00-99) con su estado (`available` / `occupied`
  / `paid`), datos del comprador y foto del comprobante en base64.
  Incluye `paymentStatus` / `paymentRef`, hoy sin usar más allá de "pending" /
  "paid" manuales, pensados para conectar una pasarela de pago (Wompi, PSE,
  Stripe, etc.) sin tener que migrar el esquema.
- `AdminUser` / `RefreshToken`: usuarios con código de acceso y sus sesiones.

## Seguridad del login

El código de 6 dígitos tiene un espacio de búsqueda pequeño, así que el login
está limitado por IP (`lib/rateLimit.ts`, en memoria — para producción con
varias instancias conviene moverlo a Redis). Los tokens de acceso duran 15
minutos; el cliente (`lib/api-client.ts`) los renueva automáticamente contra
`/api/auth/refresh` cuando expiran, y cierra sesión si el refresh también falla.

## Notas conocidas

- `npm audit` reporta una vulnerabilidad en una dependencia transitiva del
  *CLI* de Prisma (`deepmerge-ts`, usada solo en tiempo de desarrollo) — no
  afecta el código que corre en producción.
