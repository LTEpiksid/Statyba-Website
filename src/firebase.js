    // firebase.js
    import { initializeApp } from 'firebase/app';
    import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';
    import { getStorage } from 'firebase/storage';
    import { getAuth, signInWithCustomToken, onAuthStateChanged, signOut, signInAnonymously } from 'firebase/auth';

    let firebaseConfig;

    // Check if running in the Canvas environment (where __firebase_config is provided)
    if (typeof __firebase_config !== 'undefined' && __firebase_config !== null && __firebase_config !== '') {
        try {
            firebaseConfig = JSON.parse(__firebase_config);
            // Ensure essential config properties exist, even if parsing __firebase_config
            if (!firebaseConfig.apiKey || !firebaseConfig.projectId || !firebaseConfig.appId) {
                console.error("Firebase configuration from __firebase_config is incomplete. Missing apiKey, projectId, or appId. Using fallback values.");
                // Provide robust fallback in case Canvas's provided config is malformed
                firebaseConfig = {
                    apiKey: "CANVAS_FALLBACK_API_KEY",
                    authDomain: "CANVAS_FALLBACK.firebaseapp.com",
                    projectId: "CANVAS_FALLBACK-PROJECT-ID",
                    storageBucket: "CANVAS_FALLBACK.appspot.com",
                    messagingSenderId: "CANVAS_FALLBACK-SENDER-ID",
                    appId: "CANVAS_FALLBACK-APP-ID"
                };
            }
            console.log('Firebase: Using config from __firebase_config (Canvas environment).');
        } catch (e) {
            console.error("Error parsing __firebase_config JSON. Using fallback configuration.", e);
            // Fallback to a non-functional but syntactically correct config if parsing fails
            firebaseConfig = {
                apiKey: "PARSING_ERROR_FALLBACK_API_KEY",
                authDomain: "PARSING_ERROR_FALLBACK.firebaseapp.com",
                projectId: "PARSING_ERROR_FALLBACK-PROJECT-ID",
                storageBucket: "PARSING_ERROR_FALLBACK.appspot.com",
                messagingSenderId: "PARSING_ERROR_FALLBACK-SENDER-ID",
                appId: "PARSING_ERROR_FALLBACK-APP-ID"
            };
        }
    } else {
        // Assume non-Canvas environment (e.g., local development with Vite)
        // This relies on your build tool (like Vite) to replace these at build time.
        firebaseConfig = {
            apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
            authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
            projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
            storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
            messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
            appId: import.meta.env.VITE_FIREBASE_APP_ID
        };
        console.log('Firebase: Using config from import.meta.env (Non-Canvas environment).');
    }

    // Determine appId based on which config source was used, with __app_id as ultimate fallback
    // Note: 'appId' here typically refers to the client-side app identifier from Firebase config,
    // not the 'projectId' used in Firestore rules path matching.
    const appId = firebaseConfig.appId || (typeof __app_id !== 'undefined' ? __app_id : 'default-app-id');

    console.log('Firebase Configuration (final):', firebaseConfig); // Diagnostic log
    console.log('Derived appId (final):', appId); // Diagnostic log

    // Initialize Firebase app
    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);
    const storage = getStorage(app);
    const auth = getAuth(app); // Initialize Firebase Auth

    let currentUserId = null; // Store current user ID

    // Function to authenticate Firebase
    async function authenticateFirebase() {
      try {
        // MANDATORY: Use __initial_auth_token for custom token sign-in in Canvas.
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token !== null && __initial_auth_token !== '') {
          await signInWithCustomToken(auth, __initial_auth_token);
          console.log('Firebase: Signed in with custom token (Canvas environment).');
        } else {
          // Attempt to sign in anonymously for public read access if no custom token is provided.
          // This is crucial for Firebase Rules requiring 'request.auth != null'.
          console.log('Attempting anonymous sign-in for public access...');
          await signInAnonymously(auth);
          console.log('Firebase: Signed in anonymously for public access.');
        }
      } catch (error) {
        console.error('Firebase authentication failed:', error);
        if (error.code === 'auth/admin-restricted-operation') {
            console.error("Firebase Auth Error: 'auth/admin-restricted-operation'. Anonymous authentication might be disabled in your Firebase project settings or there are other project restrictions. Please ensure Anonymous Authentication is enabled in your Firebase Console (Authentication > Sign-in method).");
        }
      }
    }

    // Listen for auth state changes and update currentUserId
    onAuthStateChanged(auth, (user) => {
      if (user) {
        currentUserId = user.uid;
        console.log('Firebase: Auth state changed. User ID:', currentUserId);
      } else {
        currentUserId = null;
        console.log('Firebase: Auth state changed. No user is signed in.');
      }
    });

    // Authenticate on load
    authenticateFirebase();

    console.log('Firebase initialized and authentication initiated:', { app, db, storage, auth, appId }); // DEBUG

    export { db, storage, auth, appId, currentUserId, signOut, firebaseConfig }; // Export firebaseConfig
