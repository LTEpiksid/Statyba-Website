    // firebase.js
    import { initializeApp } from 'firebase/app';
    import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';
    import { getStorage } from 'firebase/storage';
    import { getAuth, signInWithCustomToken, onAuthStateChanged, signOut, signInAnonymously } from 'firebase/auth'; // Added signInAnonymously

    // Use Vite's environment variables for Firebase configuration
    // These variables are injected at build time by Vite.
    const firebaseConfig = {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID
    };

    // appId is also available directly from the config
    const appId = firebaseConfig.appId;

    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);
    const storage = getStorage(app);
    const auth = getAuth(app); // Initialize Firebase Auth

    let currentUserId = null; // Store current user ID

    // Function to authenticate Firebase
    async function authenticateFirebase() {
      try {
        // In a real deployed app, __initial_auth_token will not be defined.
        // You would typically rely on your Firebase Auth login flow.
        // For testing purposes or if you still want anonymous access for unauthenticated users,
        // you can sign in anonymously if no other auth method is used.
        // For this admin panel, we expect explicit email/password login.
        // If this firebase.js is also used on the main site, signInAnonymously can be useful there.
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          // This block is primarily for the Canvas environment.
          await signInWithCustomToken(auth, __initial_auth_token);
          console.log('Firebase: Signed in with custom token (Canvas environment).');
        } else {
          // For a live deployment, if you want unauthenticated users to access public data,
          // you might sign in anonymously here.
          // For the admin panel, explicit login (handled in admin-dashboard.js/admin-index-editor.js) is expected.
          console.warn('Firebase: __initial_auth_token is not defined. Automatic Canvas authentication skipped.');
          // If you need unauthenticated public access, you could do:
          // await signInAnonymously(auth);
          // console.log('Firebase: Signed in anonymously for public access.');
        }
      } catch (error) {
        console.error('Firebase authentication failed:', error);
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

    export { db, storage, auth, appId, currentUserId, signOut }; // Export signOut for use in logout
    