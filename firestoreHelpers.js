import { usersCollection, cardsCollection, packsCollection, doc, setDoc, getDoc, updateDoc } from "./firebase.js";

export async function getUserData(userId) {
  const userRef = doc(usersCollection, userId);
  const userSnap = await getDoc(userRef);
  
  if (userSnap.exists()) {
    return userSnap.data();
  } else {
    // Initialize new user with default values
    const defaultData = {
      balance: 100,
      packs: [],
      cards: [],
      createdAt: new Date().toISOString()
    };
    await setDoc(userRef, defaultData);
    return defaultData;
  }
}

export async function updateUserData(userId, data) {
  const userRef = doc(usersCollection, userId);
  await updateDoc(userRef, data);
}

export async function getShopPacks() {
  // You can cache this since it doesn't change often
  const packsRef = doc(packsCollection, "shopPacks");
  const packsSnap = await getDoc(packsRef);
  return packsSnap.exists() ? packsSnap.data().items : [];
}

export async function getAllCards() {
  // You can cache this since it doesn't change often
  const cardsRef = doc(cardsCollection, "allCards");
  const cardsSnap = await getDoc(cardsRef);
  return cardsSnap.exists() ? cardsSnap.data().items : [];
}
