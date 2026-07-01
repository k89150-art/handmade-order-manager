import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
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

const FAMILY_WORKSPACE_ID = "family";
const FAMILY_USERS = [
  {
    uid: "v5y5ycBQw8W1C7cjcLppOHBPOD93",
    email: "lolas8228@gmail.com"
  },
  {
    uid: "vbTLMWoYdwUEM6aI1vaUkDK8trV2",
    email: "k89150@gmail.com"
  }
];

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

function signInWithGoogleRedirect() {
  const provider = new GoogleAuthProvider();
  return signInWithRedirect(auth, provider);
}

function isFamilyUser(user) {
  if (!user) return false;
  return FAMILY_USERS.some(function(allowedUser) {
    return allowedUser.uid === user.uid || allowedUser.email === user.email;
  });
}

function workspaceIdForUser(user) {
  return isFamilyUser(user) ? FAMILY_WORKSPACE_ID : user.uid;
}

function workspaceLabelForUser(user) {
  return isFamilyUser(user) ? "家庭資料" : "個人資料";
}

function authErrorMessage(error) {
  const code = error && error.code ? error.code : "unknown";
  const message = error && error.message ? error.message : "Unknown Firebase auth error.";
  return "Firebase 登入失敗\n\n"
    + "錯誤碼: " + code + "\n"
    + "目前網域: " + window.location.hostname + "\n\n"
    + message + "\n\n"
    + "如果錯誤碼是 auth/unauthorized-domain，請到 Firebase Authentication 的 Authorized domains 加入目前網域。";
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
    document.body.appendChild(bar);
  }

  bar.innerHTML = "";

  const label = document.createElement("span");
  label.textContent = user ? ((user.displayName || user.email || "已登入") + " · " + workspaceLabelForUser(user)) : "尚未同步";
  bar.appendChild(label);

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = user ? "登出" : "Google 登入";
  button.style.cssText = "border:0;border-radius:8px;padding:7px 10px;background:#2f5d50;color:#fff;font:inherit;cursor:pointer;";
  button.addEventListener("click", function() {
    const action = user ? signOut(auth) : signInWithGoogle();
    action.catch(function(error) {
      console.error("Firebase auth failed", error);
      if (!user && (error.code === "auth/popup-blocked" || error.code === "auth/popup-closed-by-user" || error.code === "auth/cancelled-popup-request")) {
        signInWithGoogleRedirect().catch(function(redirectError) {
          console.error("Firebase redirect auth failed", redirectError);
          alert(authErrorMessage(redirectError));
        });
        return;
      }
      alert(authErrorMessage(error));
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

function collectionForUser(user, collectionName) {
  return collection(db, "workspaces", workspaceIdForUser(user), collectionName);
}

function legacyCollection(collectionName) {
  return collection(db, collectionName);
}

function docsToItems(snap) {
  return snap.docs.map(function(documentSnap) {
    return Object.assign({ id: documentSnap.id }, documentSnap.data());
  });
}

async function saveItemsToCollection(colRef, collectionName, items) {
  const safeItems = Array.isArray(items) ? items : [];
  const existing = await getDocs(colRef);
  const nextIds = new Set(safeItems.map(function(item) { return item.id; }).filter(Boolean));

  await Promise.all(existing.docs.map(function(documentSnap) {
    if (nextIds.has(documentSnap.id)) return Promise.resolve();
    return deleteDoc(documentSnap.ref);
  }));

  await Promise.all(safeItems.map(function(item) {
    const id = item.id || String(Date.now());
    return setDoc(doc(colRef, id), cleanForFirestore(Object.assign({}, item, { id: id })));
  }));
}

export function createCloudStore(collectionName) {
  return {
    async loadAll() {
      const user = await requireUser();
      if (!user) return null;

      const colRef = collectionForUser(user, collectionName);
      const snap = await getDocs(colRef);
      const workspaceItems = docsToItems(snap);
      if (workspaceItems.length || !isFamilyUser(user)) return workspaceItems;

      const legacySnap = await getDocs(legacyCollection(collectionName));
      const legacyItems = docsToItems(legacySnap);
      if (!legacyItems.length) return [];

      await saveItemsToCollection(colRef, collectionName, legacyItems);
      return legacyItems;
    },

    async saveAll(items) {
      const user = await requireUser();
      if (!user) {
        if (!authUiReady) renderAuthUi(null);
        console.warn("Skipped Firestore sync because the user is not signed in.");
        return;
      }
      await saveItemsToCollection(collectionForUser(user, collectionName), collectionName, items);
    }
  };
}
