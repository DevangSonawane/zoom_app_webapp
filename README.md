# Zoom App Webapp - Admin User Creation

A React admin page for creating new user accounts in Firebase without logging out the admin.

## Features

- ✅ Create new users via Firebase Authentication
- ✅ Pre-validate Display Name uniqueness in Firestore
- ✅ Admin remains logged in during user creation (using secondary Firebase app instance)
- ✅ Comprehensive error handling and validation
- ✅ Modern UI with Tailwind CSS
- ✅ Responsive design

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure Firebase:**
   - Open `src/firebase/config.js`
   - Replace the placeholder values in `firebaseConfig` with your actual Firebase project credentials:
     - `apiKey`
     - `authDomain`
     - `projectId`
     - `storageBucket`
     - `messagingSenderId`
     - `appId`

3. **Set up Firestore:**
   - Create a `users` collection in Firestore
   - Set up appropriate security rules (see below)

4. **Run the development server:**
   ```bash
   npm run dev
   ```

## Firebase Security Rules

Make sure your Firestore security rules allow:
- Reading from the `users` collection to check display name uniqueness
- Writing to the `users` collection for authenticated admins

Example rules:
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      // Allow read for checking display name uniqueness
      allow read: if request.auth != null;
      // Allow write for authenticated users (adjust based on your admin logic)
      allow write: if request.auth != null;
    }
  }
}
```

## Architecture Decision: Secondary Firebase App Instance

This implementation uses a **secondary Firebase App instance** to create users without affecting the admin's session.

### Why This Approach?

1. **Independent Authentication State**: Each Firebase app instance maintains its own auth state. Creating a user in the secondary app only affects that app's auth state.

2. **Simplicity**: No need for backend infrastructure or Cloud Functions. Everything runs client-side.

3. **Safety**: The admin's session on the primary app remains completely unaffected.

4. **Cost-Effective**: No additional Cloud Function invocations or server costs.

### How It Works

- **Primary App**: Used for the admin's authentication session
- **Secondary App**: Used exclusively for creating new users
- After user creation, the secondary app is signed out to clean up, while the primary app (admin) remains logged in

## Project Structure

```
zoom_app_webapp/
├── backend/
│   ├── functions/              # Firebase auth callback + Zoom token helpers
│   └── zoom-integration/       # Optional Zoom token distribution HTTP/WebSocket server
├── docs/
│   └── flutter-integration.md  # Flutter integration walkthrough
├── scripts/
│   └── zoom_oauth_redirect.py  # Local OAuth callback proxy for emulators
├── src/
│   ├── components/
│   │   └── AdminPage.jsx       # Main admin form component
│   ├── firebase/
│   │   └── config.js           # Firebase configuration with dual app instances
│   ├── App.jsx                 # Root component
│   ├── main.jsx                # Entry point
│   └── index.css               # Tailwind CSS imports
├── public/
│   └── _redirects              # Vercel/Netlify rewrite helper
├── index.html
├── package.json
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
└── README.md
```

## Additional resources

- **Flutter integration guide** – `docs/flutter-integration.md`
- **Local OAuth redirect proxy** – `scripts/zoom_oauth_redirect.py`

## Validation

The form validates:
- Full Name: Required
- Display Name: Required, globally unique (checked against Firestore)
- Email: Required, valid email format
- Password: Required, minimum 6 characters (Firebase requirement)

## Error Handling

The component handles:
- Display name already taken
- Invalid email format
- Weak passwords
- Firebase Auth errors (email already in use, network errors, etc.)
- Firestore write failures

---

## Auth Callback Cloud Function (Testing Only)

A temporary HTTPS Cloud Function for testing OAuth / redirect-based authentication so a remote frontend can connect without LAN issues. **Does not perform real auth verification — for testing only.**

### What it does

- **Endpoint:** `authCallback` — publicly accessible HTTPS GET endpoint
- **Query params:** Reads and logs `code`, `state`, `error` (if present)
- **Response:** JSON `{ success: true, message: "Auth callback received", receivedParams: { ... } }`
- **CORS:** Basic CORS support enabled for cross-origin requests

### 1. Firebase initialization (one-time)

From the project root:

```bash
# Install Firebase CLI if needed
npm install -g firebase-tools

# Log in and select/create project
firebase login
firebase use zoomappplatform
# Or: firebase use --add  (to add and select a project)
```

### 2. Functions setup

```bash
# From project root
cd backend/functions
npm install
npm run build
cd ..
```

### 3. `backend/functions/src/index.ts` (already in repo)

The function:

- Exports `authCallback` (HTTPS, GET-only)
- Logs `code`, `state`, `error` when present
- Returns the required JSON and sets CORS via `cors: true` in options

### 4. Deploy

```bash
# From project root
firebase deploy --only functions
```

Or from `backend/functions/`:

```bash
cd backend/functions
npm run deploy
```

After deploy, the CLI prints the function URL.

### 5. Callback URL format

After deployment you’ll see a URL like:

```
https://us-central1-<PROJECT_ID>.cloudfunctions.net/authCallback
```

For this project (if `zoomappplatform` is the project ID):

```
https://us-central1-zoomappplatform.cloudfunctions.net/authCallback
```

Use this as the redirect/callback URL in your OAuth provider for testing.

**Example test in browser or curl:**

```bash
curl "https://us-central1-zoomappplatform.cloudfunctions.net/authCallback?code=test123&state=abc"
```

Expected response:

```json
{
  "success": true,
  "message": "Auth callback received",
  "receivedParams": { "code": "test123", "state": "abc" }
}
```

### Security note

This function is **temporary and for testing only**. It does not verify tokens or perform real auth. Remove or replace it before production.

### Fix "Page not found" on /auth-callback (hosted site)

The app is a **single-page app (SPA)**. The host must serve `index.html` for all paths (e.g. `/auth-callback`) so the React app can handle routing. Otherwise you get "Page not found" on direct or OAuth redirect URLs.

**Hosted site:** https://sselectronics.asynk.in (Hostinger)

#### Hostinger (Apache)

A `public/.htaccess` file is included so that when you build and upload `dist/` to Hostinger, Apache will serve `index.html` for all routes (including `/auth-callback`).

1. Run `npm run build` (this copies `public/.htaccess` into `dist/`).
2. Upload the **contents** of the `dist/` folder to your Hostinger public_html (or the domain’s root) via File Manager or FTP.
3. Ensure `.htaccess` is uploaded (it’s inside `dist/` after build). If your client hides dotfiles, enable “Show hidden files” or upload `.htaccess` manually from `dist/.htaccess`.

After redeploying, https://sselectronics.asynk.in/auth-callback should load the app.

#### Other hosts

- **Firebase Hosting:** `firebase.json` has rewrites. Deploy with `npm run build` then `firebase deploy --only hosting`.
- **Netlify:** `public/_redirects` is copied to `dist/`. Deploy the `dist/` folder.
- **Vercel:** `vercel.json` rewrites to `/index.html`. Deploy as usual.
- **Nginx:** In `location /`: `try_files $uri $uri/ /index.html;`
- **Apache (other):** In the folder with `index.html`, add `.htaccess`: `FallbackResource /index.html`
