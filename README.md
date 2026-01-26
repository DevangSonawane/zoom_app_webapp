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
├── src/
│   ├── components/
│   │   └── AdminPage.jsx      # Main admin form component
│   ├── firebase/
│   │   └── config.js          # Firebase configuration with dual app instances
│   ├── App.jsx                 # Root component
│   ├── main.jsx                # Entry point
│   └── index.css               # Tailwind CSS imports
├── index.html
├── package.json
├── vite.config.js
├── tailwind.config.js
└── postcss.config.js
```

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
