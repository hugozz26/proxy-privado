import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAk1-6DAcbRabkAdbmugXpPm4YSb5vH51o",
  authDomain: "my-proxy-5bd44.firebaseapp.com",
  projectId: "my-proxy-5bd44",
  storageBucket: "my-proxy-5bd44.firebasestorage.app",
  messagingSenderId: "969916294264",
  appId: "1:969916294264:web:54483052088a5500fd798d"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
