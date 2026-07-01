import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  setDoc
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBrVs9xZkYgoxXy9EM9as0gSWW_mSHudyw",
  authDomain: "handmade-order-c3fc0.firebaseapp.com",
  projectId: "handmade-order-c3fc0",
  storageBucket: "handmade-order-c3fc0.firebasestorage.app",
  messagingSenderId: "706663497551",
  appId: "1:706663497551:web:ad30a3d373ab969cd98f3a"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let authPromise = null;

function ensureAuth() {
  if (!authPromise) {
    authPromise = signInAnonymously(auth);
  }
  return authPromise;
}

function cleanForFirestore(item) {
  const copy = Object.assign({}, item);
  delete copy._firestorePath;
  return copy;
}

export function createCloudStore(collectionName) {
  const colRef = collection(db, collectionName);

  return {
    async loadAll() {
      await ensureAuth();
      const snap = await getDocs(colRef);
      return snap.docs.map(function(documentSnap) {
        return Object.assign({ id: documentSnap.id }, documentSnap.data());
      });
    },

    async saveAll(items) {
      await ensureAuth();
      const safeItems = Array.isArray(items) ? items : [];
      const existing = await getDocs(colRef);
      const nextIds = new Set(safeItems.map(function(item) { return item.id; }).filter(Boolean));

      await Promise.all(existing.docs.map(function(documentSnap) {
        if (nextIds.has(documentSnap.id)) return Promise.resolve();
        return deleteDoc(documentSnap.ref);
      }));

      await Promise.all(safeItems.map(function(item) {
        const id = item.id || String(Date.now());
        return setDoc(doc(db, collectionName, id), cleanForFirestore(Object.assign({}, item, { id: id })));
      }));
    }
  };
}
