# Despliegue en Render

Este setup usa:
- API Node (Express) con Firestore: carpeta `server-firestore/`.
- Frontend Vite estático: carpeta `web/`.

## Pasos
1. Crea un Service Account en Google Cloud con rol "Firestore User" y descarga el JSON.
2. En Render crea un Web Service:
   - Name: phoenixgymturnos-api
   - Root Directory: `server-firestore`
   - Build Command: `npm ci`
   - Start Command: `node index.js`
   - Plan: Free
   - Env Vars:
     - `NODE_VERSION=18`
     - `JWT_SECRET` (genera un valor seguro)
     - `GOOGLE_APPLICATION_CREDENTIALS_JSON` (pega el JSON del service account)
3. Crea un Static Site para el frontend:
   - Name: phoenixgymturnos-web
   - Build Command: `npm --prefix web ci && npm --prefix web run build`
   - Publish directory: `web/dist`
   - Env var: `VITE_API_BASE=https://<TU-DOMINIO-API>.onrender.com`
4. (Opcional) Usa `render.yaml` para infra como código.

## Notas
- El frontend reescribe las llamadas a `/api` hacia `VITE_API_BASE` si la variable está definida en build.
- Asegúrate de tener un usuario admin en Firestore para login inicial.
