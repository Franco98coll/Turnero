## Despliegue en Firebase (Hosting + Functions)

1. Requisitos: tener `firebase-tools` instalado e iniciar sesión.
2. Configuración incluida:
   - `firebase.json` con Hosting sirviendo `web/dist` y rewrites `/api/**` a la Function `api`.
   - `functions/` con una API Express equivalente usando Firestore.
3. Variables: define `JWT_SECRET` como variable de entorno de Functions si querés cambiar la default.
4. Pasos:
   - En `web/`: `npm install` y `npm run build` para generar `web/dist`.
   - En `functions/`: `npm install`.
   - En raíz del proyecto: `firebase deploy --only functions,hosting`.
5. Firestore: la Function usa colecciones `users`, `slots`, `bookings`.

Nota: El frontend actual consume `/api/*`. En Firebase Hosting se reescribe a la Function `api` automáticamente.

# Vibe Turnos (Vue 2.7 + Vuetify 2 + Node/Express + SQL Server)

Sistema básico de turnos:

- Admin crea usuarios y define horarios (slots) con cupos.
- Usuarios inician sesión y reservan turnos en slots disponibles.

## Requisitos

- Node.js 18+
- SQL Server (local o remoto)

## Configuración

1. Copiar `.env.example` a `.env` y completar credenciales.
2. Ejecutar el SQL `db/schema.sql` en tu SQL Server para crear tablas.
3. Crear un usuario admin. Puedes generar un hash bcrypt (10 rounds) y ejecutarlo:
   - INSERT INTO users (name, email, password_hash, role) VALUES ('Admin','admin@example.com','<hash>','admin');

## Instalar y ejecutar

```bash
npm install
npm run dev
```

API: http://localhost:3002/api/health
Frontend (simple por CDN): abrir `public/index.html` en el navegador.

Para servir el frontend desde un server estático simple, puedes usar la extensión Live Server de VS Code.

## Endpoints principales

- POST /api/auth/login
- GET/POST/PATCH/DELETE /api/users (admin)
- GET/POST/DELETE /api/slots (GET público; POST/DELETE admin)
- GET/POST/DELETE /api/bookings (autenticado)

## Notas

- Autenticación por JWT (header Authorization: Bearer <token>).
- Ajusta CORS y seguridad para producción.
- Mejora sugerida: validaciones, rate limiting, cambio de estado de reservas, recordatorios, etc.
