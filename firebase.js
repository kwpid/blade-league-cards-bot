// firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc, collection, writeBatch } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || "AIzaSyCRzbaYkuQ2pNgk-lbNwm536WUpgjK2ZA4",
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || "bladeleaguecardsbot.firebaseapp.com",
  projectId: process.env.FIREBASE_PROJECT_ID || "bladeleaguecardsbot",
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "bladeleaguecardsbot.appspot.com",
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "783236573753",
  appId: process.env.FIREBASE_APP_ID || "1:783236573753:web:c25adda3fb5d65da2f7be8",
  measurementId: process.env.FIREBASE_MEASUREMENT_ID || "G-CSB88WGEQ8"
};

// Initialize Firebase
let db;
try {
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  console.log("Firebase initialized successfully");
} catch (error) {
  console.error("Error initializing Firebase:", error);
  throw error;
}

// Helper function to initialize user data if it doesn't exist
async function initUserData(userId, initialData = {}) {
  const userRef = doc(db, "users", userId);
  const docSnap = await getDoc(userRef);
  
  if (!docSnap.exists()) {
    await setDoc(userRef, {
      balance: 100,
      inventory: {
        packs: [],
        cards: []
      },
      ...initialData
    });
    console.log(`Initialized new user data for ${userId}`);
  }
}

// User balance functions
async function getBalance(userId) {
  try {
    await initUserData(userId);
    const userRef = doc(db, "users", userId);
    const docSnap = await getDoc(userRef);
    return docSnap.data().balance;
  } catch (error) {
    console.error("Error getting balance:", error);
    return 100; // Default balance if error occurs
  }
}

async function setBalance(userId, amount) {
  try {
    const userRef = doc(db, "users", userId);
    await setDoc(userRef, { balance: amount }, { merge: true });
  } catch (error) {
    console.error("Error setting balance:", error);
    throw error;
  }
}

// User inventory functions
async function getInventory(userId) {
  try {
    await initUserData(userId);
    const userRef = doc(db, "users", userId);
    const docSnap = await getDoc(userRef);
    return docSnap.data().inventory || { packs: [], cards: [] };
  } catch (error) {
    console.error("Error getting inventory:", error);
    return { packs: [], cards: [] };
  }
}

async function updateInventory(userId, inventory) {
  try {
    const userRef = doc(db, "users", userId);
    await setDoc(userRef, { inventory }, { merge: true });
  } catch (error) {
    console.error("Error updating inventory:", error);
    throw error;
  }
}

// Card update functions
async function updateCardInAllInventories(cardId, updates) {
  try {
    // This would be more efficient as a Cloud Function
    // For now, we'll implement a basic version that updates when accessed
    console.log(`[INFO] Card ${cardId} needs updating with:`, updates);
    
    // Get all users who have this card
    const usersRef = collection(db, "users");
    const querySnapshot = await getDocs(usersRef);
    const batch = writeBatch(db);
    
    querySnapshot.forEach((doc) => {
      const userData = doc.data();
      if (userData.inventory?.cards) {
        const updatedCards = userData.inventory.cards.map(card => {
          if (card.cardId === cardId) {
            return { ...card, ...updates };
          }
          return card;
        });
        
        if (JSON.stringify(updatedCards) !== JSON.stringify(userData.inventory.cards)) {
          batch.update(doc.ref, { "inventory.cards": updatedCards });
        }
      }
    });
    
    await batch.commit();
    console.log(`[SUCCESS] Updated card ${cardId} in all inventories`);
  } catch (error) {
    console.error("Error updating card in inventories:", error);
  }
}

export { db, getBalance, setBalance, getInventory, updateInventory, updateCardInAllInventories };
