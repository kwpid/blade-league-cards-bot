// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCRzbaYkuQ2pNgk-lbNwm536WUpgjK2ZA4",
  authDomain: "bladeleaguecardsbot.firebaseapp.com",
  projectId: "bladeleaguecardsbot",
  storageBucket: "bladeleaguecardsbot.firebasestorage.app",
  messagingSenderId: "783236573753",
  appId: "1:783236573753:web:c25adda3fb5d65da2f7be8",
  measurementId: "G-CSB88WGEQ8"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
