# HB Sports — Guía de Despliegue en Render

Esta guía te lleva paso a paso para publicar la plataforma. No necesitas saber programar.

---

## Qué incluye este paquete

```
hb-sports-render/
├── server.js          → El servidor (protege tu token)
├── package.json       → Dependencias
├── render.yaml        → Configuración automática de Render
├── .gitignore         → Archivos a ignorar
└── public/
    └── index.html     → La plataforma (lo que ve la gente)
```

---

## PARTE 1 — Subir a GitHub

1. Entra a **github.com** e inicia sesión con tu cuenta `hondubasket`.

2. Arriba a la derecha, clic en **+** → **New repository**.

3. Nombre del repositorio: `hb-sports`

4. Déjalo en **Public** (o Private si prefieres).

5. Clic en **Create repository**.

6. En la página que aparece, clic en **"uploading an existing file"** (subir archivos existentes).

7. **Arrastra TODOS los archivos** de la carpeta `hb-sports-render` (server.js, package.json, render.yaml, .gitignore y la carpeta public con su index.html).
   - Importante: respeta la estructura. El `index.html` va dentro de la carpeta `public`.

8. Abajo, clic en **Commit changes**.

---

## PARTE 2 — Conectar el token a Airtable (importante)

Tu token debe tener acceso a las DOS bases (jugadores y clubes). Ya lo configuraste antes, así que solo confírmalo:
- Base de jugadores: `appeSfTpQN0rm03K1`
- Base de clubes: `appWAZgIGnaS2kSm3`

Guarda tu token a la mano (empieza con `pat...`), lo necesitarás en la Parte 3.

---

## PARTE 3 — Desplegar en Render

1. Entra a **render.com** e inicia sesión.

2. Clic en **New +** → **Web Service**.

3. Conecta tu cuenta de GitHub si no lo has hecho, y selecciona el repositorio **hb-sports**.

4. Render detectará la configuración automáticamente. Verifica:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** Free

5. Antes de crear, baja a la sección **Environment Variables** (Variables de entorno) y agrega:

   | Key (nombre) | Value (valor) |
   |---|---|
   | `AIRTABLE_TOKEN` | *(pega aquí tu token pat...)* |

   Las demás variables (PLAYERS_BASE, CLUBS_BASE, etc.) ya vienen del archivo render.yaml, no tienes que escribirlas.

   ⚠️ **El token va SOLO aquí, en Render.** Así queda protegido en el servidor y nunca se expone al público.

6. Clic en **Create Web Service**.

7. Espera unos minutos mientras Render construye y publica. Cuando termine verás una URL tipo:
   ```
   https://hb-sports.onrender.com
   ```

---

## PARTE 4 — Probar

1. Abre tu URL `https://hb-sports.onrender.com`

2. La plataforma cargará automáticamente los jugadores y clubes desde Airtable (sin pedir token).

3. Para gestionar: botón **Modo gestión** → clave `hb2026`.

4. Crea torneos, carga resultados — todo se guarda en el servidor.

---

## Notas importantes

- **Plan gratuito de Render:** el servidor "se duerme" tras 15 minutos sin uso. La primera visita después de eso tarda ~30 segundos en despertar. Es normal.

- **Actualización automática:** cada vez que agregues un jugador en Airtable, aparece solo al recargar la página. Ya no hay que reconectar nada.

- **Cambiar la clave:** si algún día quieres cambiar `hb2026`, ve a Render → tu servicio → Environment → edita `ADMIN_PIN`.

- **Los resultados se guardan** en el servidor mientras esté activo. Para algo más permanente a futuro se puede conectar una base de datos, pero para empezar esto funciona bien.

---

## Si algo falla

- **"No se pudo cargar desde el servidor"** → revisa que el `AIRTABLE_TOKEN` esté bien puesto en Render y tenga acceso a las dos bases.
- **La página tarda mucho la primera vez** → es el plan gratuito despertando, espera 30 segundos.
- **Logs de error** → en Render, entra a tu servicio y mira la pestaña "Logs".

---

¡Listo! Con esto HB Sports queda público, automático y permanente.
