# FixMyRoad — Smart Road Damage Reporting and Tracking System

A full-stack starter project built with React + Vite, Node.js + Express, MongoDB, JWT authentication, image uploads, and OpenStreetMap/Leaflet maps.

## Features included

- Citizen registration with email OTP verification and sign-in with email + password only (JWT; passwords hashed with bcrypt)
- Six-digit email OTP expires after 5 minutes by default, with resend support and a 5-attempt verification limit
- Submit road damage reports with title, description, issue type, severity, GPS coordinates, address/landmark, and optional photo
- Browser GPS button (permission required) plus manual coordinate entry
- Public report list with search and filters, map pins, and report detail view
- Status tracking: Reported, Verified, Assigned, In Progress, Resolved, Rejected
- Duplicate hint when a recent report of the same damage type is within 100 metres
- Authority-only dashboard with counts, status updates, assigned team, and resolution notes
- Automatic priority ranking based on severity
- Image validation for JPG/PNG/WEBP, max 5 MB

## Requirements

- Node.js 18+ (Node 20 LTS recommended)
- npm
- MongoDB Community Server running locally, or a MongoDB Atlas database

## 1. Set up MongoDB

**Local option:** Install and start MongoDB Community Server. The default connection used by this project is `mongodb://127.0.0.1:27017/fixmyroad`.

**Atlas option:** Create a database and database user in MongoDB Atlas, allow your current IP in Network Access, and copy the connection string. Replace the database name with `fixmyroad` if desired. Never share your database password or commit it to GitHub.

## 2. Configure the backend

Open a terminal in the `FixMyRoad/backend` folder:

```bash
npm install
```

Copy `.env.example` to `.env` and update values. On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Edit `backend/.env` and set a long random `JWT_SECRET`. For Atlas, set `MONGODB_URI` to your Atlas connection string. Change `AUTHORITY_PASSWORD` before seeding the authority user. Configure `EMAIL_USER` and `EMAIL_PASS` with a Gmail address and a Google App Password (requires 2-Step Verification); do not use your regular Gmail password. OTP email will not send until these values are configured.

Example local settings:

```env
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/fixmyroad
JWT_SECRET=use_a_long_random_secret_here
CLIENT_URL=http://localhost:5173
AUTHORITY_NAME=Road Authority
AUTHORITY_EMAIL=authority@fixmyroad.local
AUTHORITY_PASSWORD=ChangeThisPassword123!
EMAIL_USER=yourgmail@gmail.com
EMAIL_PASS=your_google_app_password
OTP_EXPIRES_MINUTES=5
```

Create the authority account once:

```bash
npm run seed:authority
```

Start the API:

```bash
npm run dev
```

You should see `FixMyRoad API running at http://localhost:5000`. Check `http://localhost:5000/api/health` in a browser.

## 3. Configure the frontend

Open a second terminal in `FixMyRoad/frontend`:

```bash
npm install
```

Copy `.env.example` to `.env` (optional if using the default local API URL):

```powershell
Copy-Item .env.example .env
```

Start React:

```bash
npm run dev
```

Open the local address Vite prints, usually `http://localhost:5173`.

## 4. Test the application

1. Open the site. New visitors are shown the dedicated **Login** screen first (`/login`).
2. New users select **Create account** (`/register`), enter their name, email, and a password of at least 8 characters, then enter the 6-digit email OTP (expires after 5 minutes). Use **Resend code** if needed.
3. Existing users enter their email and password on the Login screen. No OTP is required during normal login.
4. After successful login, the user is taken to the main FixMyRoad app (`/home`). Signing out returns them to `/login`.
4. Submit a sample report. Allow location permission or enter coordinates manually. For a Coimbatore sample, you can use latitude `11.0168` and longitude `76.9558` (these are only sample coordinates; replace them with the actual road location).
5. Add an optional JPG/PNG/WEBP photo under 5 MB and submit.
6. Open **Explore reports** to see the report, filters, and map marker.
7. Sign out, then sign in with the authority email and password from `backend/.env`. Normal login does not require an OTP.
8. Open **Authority dashboard**, change a report status, enter an assigned team or resolution note, and click out of the input to save it.
9. Sign back in as the citizen to view **My reports** and see updates.

## Project structure

```text
FixMyRoad/
├── README.md
├── backend/
│   ├── .env.example
│   ├── package.json
│   ├── uploads/             # created automatically for uploaded photos
│   └── src/
│       ├── auth.js
│       ├── models.js
│       ├── seedAuthority.js
│       └── server.js
└── frontend/
    ├── .env.example
    ├── index.html
    ├── package.json
    └── src/
        ├── App.jsx
        ├── main.jsx
        └── styles.css
```

## Troubleshooting

- **MongoDB connection refused:** confirm MongoDB is running, or check your Atlas URI, database-user password, and IP allowlist.
- **JWT secret missing:** create `backend/.env`; the `.env.example` file is a template and is not loaded automatically.
- **OTP email not sending:** verify `EMAIL_USER` is a valid Gmail address and `EMAIL_PASS` is a Google App Password for that same account; ensure 2-Step Verification is enabled and restart the backend. Do not use your normal Gmail password. Check spam/junk mail too.
- **Duplicate `expiresAt` index warning:** `backend/src/models.js` declares the TTL index once with `emailOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })`; do not also set `index: true` on the `expiresAt` field. Restart the backend after changing the schema.
- **Existing citizen accounts cannot log in:** this update requires verified emails. For a demo database, register a fresh citizen account and verify its OTP. The authority seed script marks the configured authority account as verified.
- **CORS error:** `CLIENT_URL` in backend `.env` should match the frontend origin (default `http://localhost:5173`).
- **Map is blank:** confirm internet access; Leaflet map tiles and marker images load from OpenStreetMap-related public services.
- **GPS doesn't work:** browser geolocation generally requires localhost or HTTPS and permission from the user. Manual coordinates are supported.
- **Photo upload fails:** use JPG, PNG, or WEBP and keep it under 5 MB.
- **Port already in use:** change `PORT` in backend `.env`, and update `VITE_UPLOADS_URL` in frontend `.env` to the same backend host/port.
- **Authority dashboard unavailable:** run `npm run seed:authority` in the backend after setting the authority credentials, then sign in with those credentials.

## Notes before real-world deployment

This is a course/demo-ready baseline, not a hardened municipal production system. Before public deployment, add rate limiting, stronger input validation, audit logs, password reset, secure cloud image storage, backup/retention policies, and an authority approval process. Configure HTTPS and environment secrets in your hosting provider. The current duplicate detection is a simple distance-based hint, not image-AI detection; it checks up to 300 recent reports of the same issue type. Public report visibility is intentional in this demo, so avoid uploading faces, vehicle plates, or sensitive personal information.
