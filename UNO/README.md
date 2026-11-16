# UNO LEVELING

A responsive, black/white/grey discipline and consistency web application with:
- User registration and sign-in
- Personal quests and XP progression
- Responsive dashboard for mobile, tablet and desktop
- Private administrator area
- Sponsor/advertisement management with image uploads
- Quote management
- SQLite database and server-side sessions
- Password hashing, secure cookies, rate limiting, security headers and CSRF token checks

## Requirements

- Node.js 20 or newer
- npm

## Run locally

1. Extract the ZIP.
2. Open a terminal in the extracted `uno-leveling` folder.
3. Install dependencies:

   ```bash
   npm install
   ```

4. Create your environment file:

   - Windows PowerShell: `Copy-Item .env.example .env`
   - macOS/Linux: `cp .env.example .env`

5. Edit `.env`. Set:
   - `SESSION_SECRET` to a long random string (32+ characters).
   - `ADMIN_USERNAME` to your preferred admin username.
   - `ADMIN_PASSCODE` to a unique passcode of at least 12 characters.

   Never publish your `.env` file or put secrets in frontend JavaScript.

6. Start the app:

   ```bash
   npm start
   ```

7. Open:
   - User app: http://localhost:3000
   - Admin: http://localhost:3000/admin

## First use

Create a normal account on the user page. Open `/admin` and sign in with the admin username and passcode from `.env`. From the admin console you can create, pause, publish and delete sponsors and quotes. Sponsor images can be JPG, PNG, WEBP or GIF, up to 5 MB.

## Hosting / deployment

This is a Node.js application, not a static-only website. Choose a web host that supports:
- Node.js 20+
- Persistent writable disk/storage
- Long-running Express apps
- Environment variables

Deployment outline:
1. Upload the extracted project to a Node.js host or connect its Git repository.
2. Set the start command to `npm start`.
3. Set all environment variables from `.env.example` in the host's dashboard.
4. Set `NODE_ENV=production`.
5. Set `APP_ORIGIN` to the deployed HTTPS origin.
6. Use persistent storage for the `data/` and `uploads/` directories. If the host has ephemeral storage, configure a persistent disk or replace SQLite/local uploads with managed database and object storage.
7. Enable HTTPS. The app uses secure session cookies in production.

Do not upload `.env`, `node_modules`, or private database files to a public static hosting bucket.

## Important production notes

- SQLite and local image storage are suitable for a small first deployment on a single persistent Node.js instance. For multi-instance/high-traffic hosting, migrate to managed PostgreSQL and object storage.
- Back up `data/uno.sqlite` and `uploads/` regularly.
- Sponsor links open in a new tab with `noopener noreferrer`.
- The admin passcode is read only by the server. The app does not expose it in the browser.
- The current MVP awards XP and calculates levels. Daily streak automation, password reset emails, email verification, multi-admin roles, moderation workflows, payments and sponsor impression analytics are not yet implemented.
- Use original or properly licensed sponsor artwork and quote content.
- Have a qualified developer review the deployment and security configuration before opening registration publicly.

## Project structure

```text
uno-leveling/
├── database.js
├── server.js
├── package.json
├── .env.example
├── .gitignore
├── README.md
├── data/                 # created at runtime; do not commit
├── uploads/              # uploaded sponsor images
└── public/
    ├── index.html
    ├── admin.html
    ├── styles.css
    ├── app.js
    └── admin.js
```
