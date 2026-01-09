
/* === Ambulancias – Control de Roles ===
   Roles soportados:
   - admin
   - operador
   - lector
*/

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyC3L0qi5SW8qwIy4jcCGfyebjmYtgkqT7w",
  authDomain: "ambulancias12.firebaseapp.com",
  projectId: "ambulancias12",
  storageBucket: "ambulancias12.appspot.com",
  messagingSenderId: "992244158421",
  appId: "1:992244158421:web:a620ea0179a6d92affb75c"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// === Mapa de permisos por rol ===
const ROLE_PERMISSIONS = {
  admin: ["add", "edit", "delete", "export", "import", "users"],
  operador: ["add", "edit", "export"],
  lector: []
};

function lockUI() {
  document.querySelectorAll("[data-permission]").forEach(el => {
    el.disabled = true;
    el.classList.add("disabled");
  });
}

function applyPermissions(role) {
  lockUI();
  const allowed = ROLE_PERMISSIONS[role] || [];
  document.querySelectorAll("[data-permission]").forEach(el => {
    const need = el.dataset.permission;
    if (allowed.includes(need)) {
      el.disabled = false;
      el.classList.remove("disabled");
    }
  });
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    alert("Debes iniciar sesión");
    return;
  }

  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);

  let role = "lector";
  if (snap.exists()) {
    role = snap.data().role || "lector";
  }

  console.log("Rol activo:", role);
  applyPermissions(role);

  const badge = document.getElementById("roleBadge");
  if (badge) badge.innerText = "Rol: " + role;
});

