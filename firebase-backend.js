import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
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
auth.languageCode = "zh-TW";
const db = getFirestore(app);

let authUiReady = false;
let currentUser = null;

const authReady = new Promise(function(resolve) {
  onAuthStateChanged(auth, function(user) {
    currentUser = user;
    renderAuthUi(user);
    if (user) {
      window.dispatchEvent(new CustomEvent("handmade-auth-ready"));
    }
    resolve(user);
  });
});

async function requireUser() {
  await authReady;
  return currentUser;
}

function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  return signInWithPopup(auth, provider);
}

function renderAuthUi(user) {
  if (!document.body) {
    document.addEventListener("DOMContentLoaded", function() { renderAuthUi(currentUser); }, { once: true });
    return;
  }

  let bar = document.getElementById("firebaseAuthBar");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "firebaseAuthBar";
    bar.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:1000;display:flex;gap:8px;align-items:center;padding:10px 12px;border:1px solid rgba(0,0,0,.12);border-radius:10px;background:#fff;box-shadow:0 10px 24px rgba(0,0,0,.16);font:14px/1.4 system-ui,-apple-system,BlinkMacSystemFont,'Noto Sans TC',sans-serif;color:#2d2d2d;";
    document.body.appendChild(bar);
  }

  bar.innerHTML = "";

  const label = document.createElement("span");
  label.textContent = user ? (user.displayName || user.email || "已登入") : "尚未同步";
  bar.appendChild(label);

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = user ? "登出" : "Google 登入";
  button.style.cssText = "border:0;border-radius:8px;padding:7px 10px;background:#2f5d50;color:#fff;font:inherit;cursor:pointer;";
  button.addEventListener("click", function() {
    const action = user ? signOut(auth) : signInWithGoogle();
    action.catch(function(error) {
      console.error("Firebase auth failed", error);
      alert("Firebase 登入失敗，請確認 Firebase Console 已啟用 Google 登入。");
    });
  });
  bar.appendChild(button);

  authUiReady = true;
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
      const user = await requireUser();
      if (!user) return [];
      const snap = await getDocs(colRef);
      return snap.docs.map(function(documentSnap) {
        return Object.assign({ id: documentSnap.id }, documentSnap.data());
      });
    },

    async saveAll(items) {
      const user = await requireUser();
      if (!user) {
        if (!authUiReady) renderAuthUi(null);
        console.warn("Skipped Firestore sync because the user is not signed in.");
        return;
      }
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
