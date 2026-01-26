Improved Cursor Prompt (High-Quality, Deterministic)
Role
You are a Senior React Engineer with deep Firebase expertise.
Objective
Build a React Admin Page (JSX) that allows an administrator to create new user accounts in Firebase without logging out the admin.
Functional Requirements
UI
Create a clean, centered admin form styled with Tailwind CSS containing the following inputs:
Full Name (text)
Display Name (text — must be globally unique)
Email (email)
Password (password)
Include a submit button and inline error messages.
Business Logic
Pre-Validation (Firestore)
Before creating a user, query the Firestore collection:
users
Check whether the entered Display Name already exists.
If it exists, prevent submission and show:
“This Display Name is already taken.”
User Creation (Firebase Auth)
If the Display Name is unique:
Create a new user using Firebase Authentication (email & password).
Ensure the admin remains logged in.
Post-Creation (Firestore)
After successful Auth creation, insert a document into the users collection with:
fullName
displayName
email
createdAt (server timestamp)
Firebase Architecture Constraints
Use the Firebase Client SDK.
Since creating users via Firebase Auth signs in the new user by default:
Implement one of the following:
A secondary Firebase App instance, OR
A Firebase Cloud Function using the Admin SDK
Briefly explain why the chosen approach is safe and correct.
Validation & Error Handling
Enforce:
Unique Display Name
Valid email format
Firebase password strength rules
Gracefully handle and display errors for:
Weak passwords
Malformed emails
Firebase Auth failures
Firestore write failures
Styling & UX
Use Tailwind CSS
Responsive layout
Clear success and error feedback
Disable submit button while processing
Output Expectations
Provide:
Complete React JSX component
Firebase setup code (including secondary app or Cloud Function usage)
Clear inline comments explaining key decisions