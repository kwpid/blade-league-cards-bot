// firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc, updateDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCRzbaYkuQ2pNgk-lbNwm536WUpgjK2ZA4",
  authDomain: "bladeleaguecardsbot.firebaseapp.com",
  projectId: "bladeleaguecardsbot",
  storageBucket: "bladeleaguecardsbot.appspot.com",
  messagingSenderId: "783236573753",
  appId: "1:783236573753:web:c25adda3fb5d65da2f7be8",
  measurementId: "G-CSB88WGEQ8"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// User balance functions
async function getBalance(userId) {
  const userRef = doc(db, "userBalances", userId);
  const docSnap = await getDoc(userRef);
  
  if (docSnap.exists()) {
    return docSnap.data().balance || 100;
  } else {
    // Initialize with default balance if user doesn't exist
    await setDoc(userRef, { balance: 100 });
    return 100;
  }
}

async function setBalance(userId, amount) {
  const userRef = doc(db, "userBalances", userId);
  await setDoc(userRef, { balance: amount }, { merge: true });
}

// User inventory functions
async function getInventory(userId) {
  const userRef = doc(db, "userInventories", userId);
  const docSnap = await getDoc(userRef);
  
  if (docSnap.exists()) {
    return docSnap.data().inventory || { packs: [], cards: [] };
  } else {
    // Initialize with empty inventory if user doesn't exist
    await setDoc(userRef, { inventory: { packs: [], cards: [] } });
    return { packs: [], cards: [] };
  }
}

async function updateInventory(userId, inventory) {
  const userRef = doc(db, "userInventories", userId);
  await setDoc(userRef, { inventory }, { merge: true });
}

// Card update functions
async function updateCardInAllInventories(cardId, updates) {
  // This is a more complex operation that would require a Cloud Function
  // For now, we'll implement a basic version that updates when users access their inventory
  // In a production environment, you should create a Cloud Function for this
  console.log(`Card ${cardId} needs updating with:`, updates);
}

export { getBalance, setBalance, getInventory, updateInventory, updateCardInAllInventories };
