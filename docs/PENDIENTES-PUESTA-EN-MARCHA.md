# Pendientes: puesta en marcha (cobro por rifa, pagos y dominio nuevo)

Lista para dejar todo funcionando en producción después de los cambios de octubre de 2026
(dominio `ibirifas.com`, cobro por rifa, hora del sorteo, avisos del ganador). Sigue el orden:
cada paso dice cómo comprobarlo. Marca las casillas a medida que avances.

---

## 1. Redesplegar Ibirifas

- [ ] Dokploy → app **Ibirifas** → **Deploy**.

Las migraciones de la base de datos corren solas al arrancar. Las rifas que ya existían
siguen activas.

**Comprobar:** `https://ibirifas.com/api/health` responde `{"ok":true}`.

---

## 2. Marcar tu organización "Sin cobro" ⚠️ (primero)

Hasta que lo hagas, las rifas **nuevas** de tu organización te pedirán activación.

1. [ ] Entra a `https://ibirifas.com` como **superadmin**: el código de organización vacío
   y tu código de 6 dígitos.
2. [ ] En **Organizadores**, toca el ✏️ de **tu** organización.
3. [ ] En **Cobro de rifas**, marca **Sin cobro** y toca **Guardar cambios**.

**Comprobar:** en la lista, tu organización dice "· Sin cobro".

> Repite estos pasos para las organizaciones de amigos que no quieras cobrar.

---

## 3. Conectar pagoradar al dominio nuevo

Los avisos de pago se envían por POST; la redirección del dominio viejo no los reenvía
de forma segura, así que hay que apuntar el webhook al nuevo.

1. [ ] Panel de pagoradar → **Apps** → **Ibirifas**.
2. [ ] Cambia la **URL del webhook** a `https://ibirifas.com/api/pagoradar/webhook` y guarda.
3. [ ] Toca **"Enviar evento de prueba"**.

**Comprobar:** en **Entregas** la prueba aparece como entregada (respuesta 200).

---

## 4. Configurar el cobro de paquetes

**Lo mínimo (sin pagoradar):** entra como superadmin → **Menú → Cobros** → escribe tu llave
Bre-B y tu nombre → **Guardar llave**. Desde ese momento los organizadores te transfieren el
paquete y suben el comprobante; tú lo apruebas en **Cobros** y la rifa se activa sola.

**Opcional, cobro en línea automático con pagoradar:**

1. [ ] Panel de pagoradar → **Cuentas** → abre **tu** cuenta receptora y copia su id
   (empieza por `acc_`).
2. [ ] Dokploy → app **Ibirifas** → **Environment**, agrega (con tus datos):

   ```
   PAGORADAR_BILLING_ACCOUNT=acc_xxxxxxxx
   BILLING_WHATSAPP=573001234567
   ```

   - `PAGORADAR_BILLING_ACCOUNT`: la cuenta donde te pagan los paquetes; con ella la rifa
     se activa sola al llegar el pago.
   - `BILLING_WHATSAPP`: tu WhatsApp con el 57 adelante, para quien pida un paquete a mano o
     un plan a convenir.
   - Opcional, para cambiar los paquetes: `PACK_SMALL_RAFFLES` y `PACK_SMALL_PRICE` (por
     defecto 3 rifas por 15000), `PACK_LARGE_RAFFLES` y `PACK_LARGE_PRICE` (por defecto 10
     rifas por 35000).
3. [ ] **Guarda y redespliega.**

---

## 5. Probar con un pago real (cuando estés en casa)

Prueba los dos flujos de una vez: lo que te paga un organizador y lo que le paga un comprador.

**a. Activación de una rifa**

1. [ ] Como superadmin, crea una **organización de prueba**, sin marcar "Sin cobro".
2. [ ] Entra con esa organización y acepta los términos de uso.
3. [ ] Crea una rifa de 100 números → **Activar** → **Activar gratis** (la primera es gratis).
4. [ ] Crea una **segunda** rifa → **Activar** → **Pagar con Bre-B**.
5. [ ] Paga **el monto exacto** que muestra la página (por ejemplo $15.037) a tu llave.
6. [ ] Espera uno o dos minutos.

**Comprobar:** la rifa pasa a activa sola y llega la notificación "Rifa activada". Ese pago
**no** aparece en *Pagos* de ninguna organización.

**b. Pago de un comprador**

1. [ ] En la rifa de prueba activa: **Editar rifa** → "Los apartados sin pagar vencen" con un
   plazo, y reservas en línea en "Permitir".
2. [ ] Abre el **Enlace** público, reserva un número con tu nombre y paga ese valor a la cuenta
   conectada de esa organización.

**Comprobar:** la reserva queda pagada sola (o aparece en *Pagos* para aprobarla).

**c. Limpieza**

- [ ] Cierra y elimina las rifas de prueba. Si quieres, desactiva la organización de prueba.

> Si algo no cruza: panel de pagoradar → **Pagos** (¿llegó el aviso del banco?) y
> **Entregas** (¿Ibirifas respondió 200?).

---

## 6. Lo que falta del cambio de dominio

Detalle en [CAMBIO-DE-DOMINIO.md](CAMBIO-DE-DOMINIO.md).

- [ ] **Turnstile**: Cloudflare → Turnstile → tu widget → *Hostnames* → agrega `ibirifas.com`.
  Sin esto fallan las reservas desde el enlace público.
- [ ] **Resend**: verifica el dominio `ibirifas.com` (registros SPF/DKIM en Cloudflare) y cambia
  en Dokploy `MAIL_FROM="Rifas <rifas@ibirifas.com>"`. Comprueba con *Mi equipo → Enviar correo
  de prueba*. Los correos de "¡Ganaste!" y del resultado del sorteo dependen de esto.
- [ ] **UptimeRobot**: cambia el monitor a `https://ibirifas.com/api/health`.
- [ ] **Avisar al equipo**: borrar el ícono viejo de la app, abrir `ibirifas.com`, iniciar
  sesión, instalarla de nuevo y activar la campana 🔔 de notificaciones (en cada celular).

---

## 7. Para las próximas rifas (recordatorio)

- **Hora del sorteo**: en *Editar rifa* pon la hora de la lotería (ej. 9:00 p. m.). Ese día, a
  esa hora, se cierran las reservas en línea.
- **Registrar el ganador**: tablero → **Cerrar** → número ganador → "Cerrar y registrar
  ganador". Luego usa **"Avisar a … por WhatsApp"** e **"Imagen para el estado"**. Las rifas por
  etapas se registran en el panel **Etapas**.
- **Permiso**: si la rifa tiene permiso de la alcaldía, escríbelo en el campo *Permiso*; sale
  en la página pública y en la imagen.
