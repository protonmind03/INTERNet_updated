# Deploying INTERNet

Frontend on **Vercel**, backend + PostgreSQL + uploaded files on **Railway**.
Do the steps in order: the backend URL is needed to build the frontend, and
the frontend URL is needed by the backend.

## 0. Put the project on GitHub

Both hosts deploy from a GitHub repository. Create a **private** repository
and push this folder. The root `.gitignore` already keeps `.env` files,
`node_modules`, build output and uploaded photos out of it.

## 1. Railway: database

1. New Project > **Deploy PostgreSQL**.

## 2. Railway: backend

1. In the same project: New > **GitHub Repo** > select the repository.
2. Service Settings > **Root Directory**: `backend`.
   `backend/railway.json` then supplies the rest: it runs the database
   migrations before each deploy, starts the server with `npm start`, and
   uses `/api/health` as the health check.
3. Service > **Volumes** > add a volume mounted at `/data`.
4. Service > **Variables**:

   | Variable | Value |
   |---|---|
   | `DATABASE_PUBLIC_URL` | `${{Postgres.DATABASE_PUBLIC_URL}}` |
   | `JWT_SECRET` | a new random value (command below) |
   | `NODE_ENV` | `production` |
   | `FRONTEND_URL` | the Vercel URL from step 3 (fill in after step 3) |
   | `PRIVATE_UPLOAD_DIR` | `/data/private-uploads` |

   Generate the secret with:
   `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`

   Do not set `PORT`; Railway provides it.
5. Settings > Networking > **Generate Domain**. This is the backend URL.
6. Keep the service on **one instance** and on a plan that does not sleep.
   Deadline reminders and live notifications run inside the server process.

Optional, each can be added later:

- Email (password recovery, deadline reminder emails): `SMTP_HOST`,
  `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`. Without all five,
  "Forgot password" reports that email is not configured.
- Browser push notifications: `WEB_PUSH_VAPID_PUBLIC_KEY`,
  `WEB_PUSH_VAPID_PRIVATE_KEY`, `WEB_PUSH_SUBJECT`. Generate the key pair
  with `npx web-push generate-vapid-keys`. Set all three or none.
- Azure Blob Storage instead of the volume:
  `AZURE_STORAGE_CONNECTION_STRING`, `AZURE_STORAGE_CONTAINER`.

## 3. Vercel: frontend

1. Add New > Project > import the same repository.
2. **Root Directory**: `my-pwa`. Framework preset: Vite.
3. Environment Variables: `VITE_API_URL` = the Railway backend URL from
   step 2.5, starting with `https://` and with no trailing slash.
4. Deploy. Copy the resulting URL into `FRONTEND_URL` on Railway (step 2.4)
   and redeploy the backend.

`VITE_API_URL` is read when the site is built. After changing it, redeploy.

## 4. First login

1. Open the Vercel URL and log in as the coordinator created by the
   migration (credentials are in `CHANGES.md`).
2. The system immediately asks for a new password and blocks everything
   else until it is set, because the default one is published in this
   repository. Do this before sharing the URL with anyone.
3. Create supervisor and student accounts from the coordinator screens.
   Each starting password must have at least 12 characters with an
   uppercase letter, a lowercase letter and a number. Every new account is
   asked to replace its starting password at first login.

Changing a password signs that account out on all other devices.

The demo accounts from `npm run db:seed-demo` are for local testing only;
the script refuses to run against a hosted database.

## Checks after deploying

- `https://<backend>/api/health` returns `{"status":"ok"}`.
- Refreshing a page such as `/student/dashboard` reloads it, not a 404.
- A time-in shows the correct Philippine time.
- Upload a document, redeploy the backend, and confirm it still downloads.
- On a phone, tap Time in: the camera opens, the prompts appear, and the
  photo is taken by itself. (The camera needs https, which both hosts
  provide. The Vercel build copies the face-tracking files itself.)
