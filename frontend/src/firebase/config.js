import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDDzYJYAiOaMdWRcNhvonX7X-6uNW1VW60",
  authDomain: "zoomappplatform.firebaseapp.com",
  projectId: "zoomappplatform",
  storageBucket: "zoomappplatform.firebasestorage.app",
  messagingSenderId: "874315820400",
  appId: "1:874315820400:web:d5abbf8e67adf90eb1b3b5",
  measurementId: "G-Y6T8L66LPC"
};

// Initialize Firebase app
// Always use the default app (no name parameter = default app)
let app;
try {
  const existingApps = getApps();
  
  // Try to get the default app first
  try {
    app = getApp(); // Gets the default app
    console.log('Using existing default Firebase app');
  } catch (error) {
    // Default app doesn't exist, initialize it
    app = initializeApp(firebaseConfig);
    console.log('Initialized new default Firebase app');
  }
  
  // Verify the app is the default app
  if (app.name !== '[DEFAULT]') {
    console.warn('App is not default, reinitializing...');
    app = initializeApp(firebaseConfig);
  }
} catch (error) {
  console.error('Error initializing Firebase app:', error);
  // Last resort: try to initialize anyway
  app = initializeApp(firebaseConfig);
}

// Verify app is properly initialized
if (!app) {
  throw new Error('Failed to initialize Firebase app');
}

// Get Firebase services
let auth;
let db;

try {
  auth = getAuth(app);
  db = getFirestore(app);
  
  // Verify auth is properly configured
  if (!auth) {
    throw new Error('Firebase Auth instance is null');
  }
  
  if (!auth.app) {
    throw new Error('Firebase Auth app property is missing');
  }
  
  console.log('Firebase Auth initialized successfully');
  console.log('Auth app name:', auth.app.name);
  console.log('Auth app projectId:', auth.app.options?.projectId);
} catch (error) {
  console.error('Error initializing Firebase services:', error);
  console.error('Error details:', {
    message: error.message,
    code: error.code,
    stack: error.stack
  });
  throw error;
}

export { auth, db, app };
