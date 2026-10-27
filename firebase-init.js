// Firebase initialisation shared by every page.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { getAnalytics, isSupported } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-analytics.js";

const firebaseConfig = {
  apiKey: "AIzaSyClWKAnA96ZBm212UayYPNK4CfZ-Ap3zBU",
  authDomain: "tuesday-call-tracker.firebaseapp.com",
  projectId: "tuesday-call-tracker",
  storageBucket: "tuesday-call-tracker.firebasestorage.app",
  messagingSenderId: "601163232658",
  appId: "1:601163232658:web:e29ac3aa7ebb31ac917d4b",
  measurementId: "G-8YGTJ6Q3DL"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Analytics only works on http(s) pages in supporting browsers; never let it break the app.
isSupported().then((ok) => { if (ok) getAnalytics(app); }).catch(() => {});
