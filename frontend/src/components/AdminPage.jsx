import { useState, useEffect, useRef } from 'react';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { collection, query, where, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase/config';

const AdminPage = () => {
  const [formData, setFormData] = useState({
    fullName: '',
    displayName: '',
    email: '',
    password: ''
  });

  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [displayNameChecking, setDisplayNameChecking] = useState(false);
  const [displayNameValid, setDisplayNameValid] = useState(null); // null = not checked, true = valid, false = invalid
  const debounceTimerRef = useRef(null);

  // Handle input changes
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    // Clear error for this field when user starts typing
    if (errors[name]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
    // Clear success message when form changes
    if (successMessage) {
      setSuccessMessage('');
    }
    // Reset display name validation when display name changes
    if (name === 'displayName') {
      setDisplayNameValid(null);
    }
  };

  // Validate email format
  const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  // Validate password strength (Firebase requires at least 6 characters)
  const validatePassword = (password) => {
    if (password.length < 6) {
      return 'Password must be at least 6 characters long';
    }
    return null;
  };

  // Check if display name is unique in Firestore
  const checkDisplayNameUnique = async (displayName) => {
    if (!displayName.trim()) {
      setDisplayNameValid(null);
      return { isUnique: false, error: 'Display Name is required' };
    }

    setDisplayNameChecking(true);
    try {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('displayName', '==', displayName.trim()));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        setDisplayNameChecking(false);
        setDisplayNameValid(false);
        return { isUnique: false, error: 'This Display Name is already taken.' };
      }

      setDisplayNameChecking(false);
      setDisplayNameValid(true);
      return { isUnique: true, error: null };
    } catch (error) {
      setDisplayNameChecking(false);
      setDisplayNameValid(null);
      console.error('Error checking display name:', error);
      return { isUnique: false, error: 'Error checking display name availability. Please try again.' };
    }
  };

  // Debounced display name check - runs as user types
  useEffect(() => {
    // Clear previous timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Only check if display name has a value
    if (!formData.displayName.trim()) {
      setDisplayNameValid(null);
      if (errors.displayName) {
        setErrors(prev => {
          const newErrors = { ...prev };
          delete newErrors.displayName;
          return newErrors;
        });
      }
      return;
    }

    // Set a timer to check after user stops typing (500ms delay)
    debounceTimerRef.current = setTimeout(async () => {
      const result = await checkDisplayNameUnique(formData.displayName);
      // Only update error if the display name hasn't changed since we started checking
      if (result.error && !result.isUnique) {
        setErrors(prev => ({
          ...prev,
          displayName: result.error
        }));
      } else if (result.isUnique) {
        // Clear any existing display name errors
        setErrors(prev => {
          const newErrors = { ...prev };
          delete newErrors.displayName;
          return newErrors;
        });
      }
    }, 500);

    // Cleanup function
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.displayName]); // Only re-run when displayName changes

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrors({});
    setSuccessMessage('');

    // Client-side validation
    const newErrors = {};

    if (!formData.fullName.trim()) {
      newErrors.fullName = 'Full Name is required';
    }

    if (!formData.displayName.trim()) {
      newErrors.displayName = 'Display Name is required';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!validateEmail(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else {
      const passwordError = validatePassword(formData.password);
      if (passwordError) {
        newErrors.password = passwordError;
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    // Quick check: If display name validation is still in progress, wait a moment
    if (displayNameChecking) {
      setErrors({ general: 'Please wait while we verify the display name...' });
      return;
    }

    // If display name was checked and found invalid, show error
    if (displayNameValid === false) {
      setErrors({ displayName: 'This Display Name is already taken.' });
      return;
    }

    // If display name hasn't been checked yet (shouldn't happen with debounce, but just in case)
    if (displayNameValid === null && formData.displayName.trim()) {
      const displayNameCheck = await checkDisplayNameUnique(formData.displayName);
      if (!displayNameCheck.isUnique) {
        setErrors({ displayName: displayNameCheck.error });
        return;
      }
    }

    setIsSubmitting(true);

    try {
      // Verify auth is properly initialized before use
      if (!auth) {
        throw {
          code: 'auth/configuration-not-found',
          message: 'Firebase Auth is not initialized. Please refresh the page.'
        };
      }
      
      if (!auth.app) {
        throw {
          code: 'auth/configuration-not-found',
          message: 'Firebase Auth configuration not found. Please check your Firebase setup.'
        };
      }
      
      console.log('Creating user in Firebase Auth...');
      console.log('Auth app name:', auth.app?.name);
      console.log('Auth app projectId:', auth.app?.options?.projectId);
      
      // Create user in Firebase Authentication
      // Note: This will sign in the newly created user, which will log out the admin
      // After creating the user, we sign out to allow the admin to sign back in
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        formData.email.trim(),
        formData.password
      );

      const newUser = userCredential.user;
      console.log('User created in Auth:', newUser.uid);

      // Post-creation: Insert user document into Firestore
      try {
        console.log('Adding user document to Firestore...');
        await addDoc(collection(db, 'users'), {
          fullName: formData.fullName.trim(),
          displayName: formData.displayName.trim(),
          email: formData.email.trim(),
          createdAt: serverTimestamp(),
          uid: newUser.uid // Store the Firebase Auth UID for reference
        });
        console.log('User document added to Firestore successfully');
      } catch (firestoreError) {
        console.error('Firestore error:', firestoreError);
        // If Firestore write fails, we still have the Auth user created
        // This is a partial success scenario - user exists in Auth but not in Firestore
        throw {
          code: 'firestore/write-failed',
          message: `User created in Authentication, but failed to save to database: ${firestoreError.message}`,
          originalError: firestoreError
        };
      }

      // Sign out the newly created user immediately after creation
      // This allows the admin to sign back in
      try {
        await signOut(auth);
        console.log('Signed out newly created user');
      } catch (signOutError) {
        // Non-critical error - log but don't fail the operation
        console.warn('Error signing out after user creation:', signOutError);
      }

      // Success - reset form and show success message
      const successDisplayName = formData.displayName.trim();
      setFormData({
        fullName: '',
        displayName: '',
        email: '',
        password: ''
      });
      setDisplayNameValid(null); // Reset display name validation
      setSuccessMessage(`User "${successDisplayName}" created successfully! Note: You will need to sign back in as admin.`);

    } catch (error) {
      console.error('Error creating user:', error);
      console.error('Error code:', error.code);
      console.error('Error message:', error.message);
      
      // Handle specific Firebase errors
      let errorMessage = 'An error occurred while creating the user.';
      let errorField = 'general';
      
      // Firebase Auth errors
      if (error.code === 'auth/email-already-in-use') {
        errorMessage = 'This email is already registered.';
        errorField = 'email';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Invalid email address.';
        errorField = 'email';
      } else if (error.code === 'auth/weak-password') {
        errorMessage = 'Password is too weak. Please use a stronger password.';
        errorField = 'password';
      } else if (error.code === 'auth/network-request-failed') {
        errorMessage = 'Network error. Please check your connection and try again.';
        errorField = 'general';
      } else if (error.code === 'auth/operation-not-allowed') {
        errorMessage = 'Email/password accounts are not enabled. Please enable them in Firebase Console.';
        errorField = 'general';
      } else if (error.code === 'auth/too-many-requests') {
        errorMessage = 'Too many requests. Please try again later.';
        errorField = 'general';
      } else if (error.code === 'auth/configuration-not-found') {
        errorMessage = 'Firebase Auth configuration not found. Please refresh the page. If the issue persists, check that Firebase Auth is enabled in your Firebase Console.';
        errorField = 'general';
      } else if (error.code === 'permission-denied' || (error.code && error.code.includes('permission'))) {
        // Firestore permission errors
        errorMessage = 'Permission denied. Please check your Firestore security rules. Make sure authenticated users can write to the "users" collection.';
        errorField = 'general';
      } else if (error.code === 'unavailable') {
        errorMessage = 'Service temporarily unavailable. Please try again.';
        errorField = 'general';
      } else if (error.code === 'failed-precondition') {
        errorMessage = 'Operation failed. Please check your Firestore security rules and try again.';
        errorField = 'general';
      } else if (error.code === 'firestore/write-failed') {
        errorMessage = error.message || 'User created but failed to save to database.';
        errorField = 'general';
      } else {
        // Generic error handling - show more detailed error for debugging
        errorMessage = error.message || `An error occurred: ${error.code || 'Unknown error'}`;
        errorField = 'general';
      }
      
      // Set error in appropriate field
      if (errorField === 'general') {
        setErrors({ general: errorMessage });
      } else {
        setErrors({ [errorField]: errorMessage });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-lg shadow-xl p-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2 text-center">
            Create New User
          </h1>
          <p className="text-gray-600 text-center mb-6">
            Admin User Management
          </p>

          {successMessage && (
            <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-green-800 text-sm">{successMessage}</p>
            </div>
          )}

          {errors.general && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-800 text-sm font-semibold mb-2">{errors.general}</p>
              {(errors.general.includes('Permission denied') || errors.general.includes('permission')) && (
                <div className="mt-2 text-xs text-red-700">
                  <p className="font-semibold">Troubleshooting:</p>
                  <ul className="list-disc list-inside mt-1 space-y-1">
                    <li>Check Firestore security rules allow writes to the "users" collection</li>
                    <li>Ensure you're authenticated (if rules require authentication)</li>
                    <li>Verify the collection name is exactly "users"</li>
                  </ul>
                </div>
              )}
              {errors.general.includes('not enabled') && (
                <div className="mt-2 text-xs text-red-700">
                  <p className="font-semibold">Troubleshooting:</p>
                  <ul className="list-disc list-inside mt-1 space-y-1">
                    <li>Go to Firebase Console → Authentication → Sign-in method</li>
                    <li>Enable "Email/Password" provider</li>
                  </ul>
                </div>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Full Name Input */}
            <div>
              <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-1">
                Full Name
              </label>
              <input
                type="text"
                id="fullName"
                name="fullName"
                value={formData.fullName}
                onChange={handleChange}
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition ${
                  errors.fullName ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="Enter full name"
                disabled={isSubmitting}
              />
              {errors.fullName && (
                <p className="mt-1 text-sm text-red-600">{errors.fullName}</p>
              )}
            </div>

            {/* Display Name Input */}
            <div>
              <label htmlFor="displayName" className="block text-sm font-medium text-gray-700 mb-1">
                Display Name <span className="text-gray-500">(must be unique)</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  id="displayName"
                  name="displayName"
                  value={formData.displayName}
                  onChange={handleChange}
                  className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition ${
                    errors.displayName 
                      ? 'border-red-500' 
                      : displayNameValid === true 
                        ? 'border-green-500' 
                        : displayNameValid === false
                          ? 'border-red-500'
                          : 'border-gray-300'
                  }`}
                  placeholder="Enter display name"
                  disabled={isSubmitting}
                />
                {displayNameChecking && (
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                  </div>
                )}
                {!displayNameChecking && formData.displayName.trim() && displayNameValid === true && (
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                    <svg className="h-5 w-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
                {!displayNameChecking && formData.displayName.trim() && displayNameValid === false && (
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                    <svg className="h-5 w-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </div>
                )}
              </div>
              {errors.displayName && (
                <p className="mt-1 text-sm text-red-600">{errors.displayName}</p>
              )}
              {!errors.displayName && displayNameChecking && (
                <p className="mt-1 text-sm text-gray-500">Checking availability...</p>
              )}
              {!errors.displayName && !displayNameChecking && displayNameValid === true && formData.displayName.trim() && (
                <p className="mt-1 text-sm text-green-600">Display name is available</p>
              )}
            </div>

            {/* Email Input */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition ${
                  errors.email ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="Enter email address"
                disabled={isSubmitting}
              />
              {errors.email && (
                <p className="mt-1 text-sm text-red-600">{errors.email}</p>
              )}
            </div>

            {/* Password Input */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                type="password"
                id="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition ${
                  errors.password ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="Enter password (min. 6 characters)"
                disabled={isSubmitting}
              />
              {errors.password && (
                <p className="mt-1 text-sm text-red-600">{errors.password}</p>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting || displayNameChecking}
              className={`w-full py-3 px-4 rounded-lg font-semibold text-white transition ${
                isSubmitting || displayNameChecking
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2'
              }`}
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Creating User...
                </span>
              ) : (
                'Create User'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AdminPage;
