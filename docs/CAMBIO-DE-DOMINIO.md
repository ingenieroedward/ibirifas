# Cambiar el dominio de Ibirifas

Guía para pasar la app a un dominio nuevo (por ejemplo de `rifas.edwsystem.com` a
`ibirifas.co`). El código no tiene el dominio escrito en ningún lado: todo sale de
`APP_URL` y de la dirección con la que llega cada visita, así que el cambio es solo
de configuración. Sigue el orden; cada paso dice cómo comprobarlo.

> Mantén el dominio viejo funcionando (redirigiendo al nuevo) **al menos un año**:
> hay enlaces de rifas compartidos por WhatsApp, imágenes con el enlace y correos
> con "Ver mi reserva" que apuntan a él.

## 1. Dominio y DNS (Cloudflare)

1. Compra el dominio y agrégalo a Cloudflare (cambia los *nameservers* donde lo
   compraste por los que te da Cloudflare).
2. Crea el registro `A` (o `CNAME`) hacia la IP del servidor de Dokploy, con la
   **nube naranja** (proxy) activada.
3. SSL/TLS → modo **Full (strict)**.

Comprobar: `https://<nuevo-dominio>` responde (aunque todavía dé error de Dokploy).

## 2. Dokploy

1. En la app (Docker Compose) → *Domains* → agrega el dominio nuevo hacia el
   servicio `app`, puerto **3000**, con HTTPS. **No borres todavía el viejo.**
2. *Environment*: cambia `APP_URL=https://<nuevo-dominio>`. `TRUSTED_PROXY_HOPS`
   sigue en `2` mientras uses Cloudflare con proxy.
3. Redespliega.

Comprobar: `https://<nuevo-dominio>/api/health` → `{"ok":true}` y puedes entrar.

## 3. Redirigir el dominio viejo

En Cloudflare, en la zona del dominio **viejo** → *Rules* → *Redirect Rules*:
redirección **301** de `rifas.edwsystem.com/*` a `https://<nuevo-dominio>/${1}`
**conservando la ruta y los parámetros** (así `/p/<token>` y
`/p/<token>/reserva/<clave>` siguen funcionando). Después quita el dominio viejo de
Dokploy.

Comprobar: abre un enlace viejo de una rifa → llega a la misma rifa en el nuevo.

## 4. Correo saliente (Resend)

1. Resend → *Domains* → agrega el dominio nuevo y crea en Cloudflare los registros
   que pide (SPF, DKIM y, si lo sugiere, DMARC). Espera a que diga *Verified*.
2. Dokploy → `MAIL_FROM="Rifas <rifas@<nuevo-dominio>>"` y redespliega.
3. Deja el dominio viejo verificado en Resend hasta comprobar que todo sale bien.

Comprobar: Mi equipo → Correos a compradores → **Enviar correo de prueba**; y una
reserva de prueba con tu correo (los enlaces deben ir al dominio nuevo).

## 5. Cloudflare Turnstile

Cloudflare → *Turnstile* → tu widget → *Hostnames*: agrega el dominio nuevo (las
mismas llaves siguen sirviendo). Sin esto el formulario de reserva muestra "No se
pudo cargar la verificación".

Comprobar: reservar un número desde el enlace público del dominio nuevo.

## 6. Lo que le toca a cada persona del equipo

- **Iniciar sesión de nuevo**: la sesión está guardada por dominio.
- **Notificaciones push**: cada suscripción pertenece al dominio; cada persona
  debe volver a activar la campana en cada celular (las llaves VAPID no cambian).
- **App instalada** (PWA): borrar el ícono viejo e instalarla desde el dominio nuevo.

## 7. Servicios externos

- **UptimeRobot**: cambia la URL del monitor a `https://<nuevo-dominio>/api/health`.
- **Respaldos en R2**: no cambian (no dependen del dominio).
- **Imágenes y textos para compartir**: se generan con el dominio con el que se abre
  la app; las que ya circulan funcionan por la redirección del paso 3.

## 8. Lector de pagos (pagoradar)

Recomendación: la dirección que **recibe** los avisos de los bancos (ej.
`pagos-xxxx@pagos.edwsystem.com`) puede **quedarse en el dominio actual** aunque la
app cambie: nadie la ve, la comparten tus otros sistemas y así no hay que tocar los
filtros de Gmail. Si igual la cambias:

1. Cloudflare → *Email Routing* en el dominio nuevo, con la ruta hacia el Worker.
2. En cada Gmail, editar el filtro de reenvío con la dirección nueva (Gmail pide
   confirmarla con un código).
3. En la configuración del lector, actualizar la URL del aviso hacia la app
   (`https://<nuevo-dominio>/api/pagoradar/webhook`), y su secreto si se regenera.

Aunque la dirección de recepción no cambie, **la URL a la que el lector avisa a la
app sí** cambia con el dominio de la app: en Dokploy, en la app **pagoradar**, edita
`PAGORADAR_SOURCES` y cambia la `url` del webhook a
`https://<nuevo-dominio>/api/pagoradar/webhook`; redespliega pagoradar. Si además
cambias el dominio de pagoradar, actualiza `PAGORADAR_URL` en Ibirifas y la variable
`PAGORADAR_URL` del Worker de Cloudflare.

## Lista rápida

- [ ] Dominio en Cloudflare, registro con proxy, SSL Full (strict)
- [ ] Dominio en Dokploy + `APP_URL` + redeploy
- [ ] Redirección 301 del dominio viejo (con ruta)
- [ ] Resend verificado + `MAIL_FROM` + correo de prueba
- [ ] Turnstile con el hostname nuevo
- [ ] UptimeRobot
- [ ] Avisar al equipo: volver a entrar, activar notificaciones, reinstalar la app
- [ ] Lector de pagos: URL de aviso (y recepción si se cambia)
