// Firebase Auth + Roles + Firestore + Autosave
// IMPORTANTE: Reemplaza firebaseConfig (REPLACE_ME) con los datos de tu proyecto Firebase.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, sendPasswordResetEmail, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, addDoc, collection, query, orderBy, limit,
  getDocs, serverTimestamp, enableIndexedDbPersistence
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

// Config real del proyecto Firebase (Ambulancias)
const firebaseConfig = {
  apiKey: "AIzaSyC3L0qi5SW8qwIy4jcCGfyebjmYtgkqT7w",
  authDomain: "ambulancias12.firebaseapp.com",
  projectId: "ambulancias12",
  storageBucket: "ambulancias12.firebasestorage.app",
  messagingSenderId: "992244158421",
  appId: "1:992244158421:web:a620ea0179a6d92affb75c",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Offline persistence (best effort)
enableIndexedDbPersistence(db).catch(() => {});

// ---------- Helpers ----------
const $ = (id) => document.getElementById(id);
const pill = $("savePill");

function esc(s){
  return String(s ?? "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;")
    .replaceAll(">","&gt;").replaceAll('"',"&quot;");
}

function setPill(state){
  pill.classList.remove("good","warn","bad");
  if(state === "dirty"){ pill.textContent = "Cambios sin guardar"; pill.classList.add("warn"); }
  else if(state === "saving"){ pill.textContent = "Guardando…"; pill.classList.add("warn"); }
  else if(state === "saved"){ pill.textContent = "Guardado ✓"; pill.classList.add("good"); }
  else if(state === "readonly"){ pill.textContent = "Solo lectura"; pill.classList.add("bad"); }
  else { pill.textContent = "Listo"; }
}

function toast(msg){
  const el = $("authMsg");
  if(!el) return;
  el.textContent = msg || "";
}

function showView(name){
  ["viewAuth","viewHome","viewInventario","viewMecanica","viewExpediente"].forEach(v => $(v).classList.remove("active"));
  $(name).classList.add("active");
  $("btnBack").classList.toggle("hidden", name === "viewHome");
}

function goHome(){ showView("viewHome"); history.pushState({view:"home"}, "", "#home"); }
function goSection(section){
  const map = { inventario:"viewInventario", mecanica:"viewMecanica", expediente:"viewExpediente" };
  showView(map[section] || "viewHome");
  history.pushState({view:section}, "", `#${section}`);
}

// Back
$("btnBack").addEventListener("click", () => history.back());
window.addEventListener("popstate", (e) => {
  const v = (e.state && e.state.view) || (location.hash || "#home").replace("#","");
  if(v === "inventario") showView("viewInventario");
  else if(v === "mecanica") showView("viewMecanica");
  else if(v === "expediente") showView("viewExpediente");
  else showView("viewHome");
});

// ---------- Role model ----------
let currentUser = null;
let currentRole = null;           // admin | operador | lector
let currentRecordId = null;
let currentRecordMeta = null;     // {name,...}
let dirty = false;
let saving = false;
let saveTimer = null;

function canEdit(){ return currentRole === "admin" || currentRole === "operador"; }

function applyPermissions(){
  const editable = canEdit();

  // Always allow: logout/back/nav/tabs/refresh/export
  const allowIds = new Set([
    "btnLogout","btnBack",
    "navInventario","navMecanica","navExpediente",
    "tabRun","tabVitals",
    "btnRefresh","btnExport","search"
  ]);

  document.querySelectorAll("input,textarea,select,button").forEach(el => {
    if(allowIds.has(el.id)) return;

    // Import only if can edit
    if(el.id === "fileImport" || el.closest?.(".fileBtn")){
      if(!editable) el.setAttribute("disabled","disabled"); else el.removeAttribute("disabled");
      return;
    }

    // Record action buttons always clickable (open). Others handled when created.
    if(el.classList.contains("smallbtn")) return;

    if(editable){
      el.removeAttribute("disabled");
      el.removeAttribute("readonly");
    } else {
      if(el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT"){
        el.setAttribute("readonly","readonly");
      } else if(el.tagName === "BUTTON") {
        el.setAttribute("disabled","disabled");
      }
    }
  });

  setPill(editable ? "saved" : "readonly");
}

// ---------- Tabs ----------
$("tabRun").addEventListener("click", () => {
  $("tabRun").classList.add("active"); $("tabVitals").classList.remove("active");
  $("panelRun").classList.add("active"); $("panelVitals").classList.remove("active");
});
$("tabVitals").addEventListener("click", () => {
  $("tabVitals").classList.add("active"); $("tabRun").classList.remove("active");
  $("panelVitals").classList.add("active"); $("panelRun").classList.remove("active");
});

// ---------- Tables ----------
function addInvRow(row={item:"",qty:"",state:"",exp:"",notes:""}){
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td><input class="inv_item" value="${esc(row.item)}"></td>
    <td><input class="inv_qty" value="${esc(row.qty)}"></td>
    <td><input class="inv_state" value="${esc(row.state)}"></td>
    <td><input class="inv_exp" type="date" value="${esc(row.exp)}"></td>
    <td><input class="inv_notes" value="${esc(row.notes)}"></td>
    <td><button type="button" class="secondary inv_del">✖</button></td>
  `;
  tr.querySelector(".inv_del").addEventListener("click", () => { tr.remove(); markDirty(); });
  $("inv_table").querySelector("tbody").appendChild(tr);
}
function addVitRow(row={time:"",bp:"",hr:"",rr:"",spo2:"",temp:"",gcs:""}){
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td><input class="vit_time" type="time" value="${esc(row.time)}"></td>
    <td><input class="vit_bp" value="${esc(row.bp)}"></td>
    <td><input class="vit_hr" value="${esc(row.hr)}"></td>
    <td><input class="vit_rr" value="${esc(row.rr)}"></td>
    <td><input class="vit_spo2" value="${esc(row.spo2)}"></td>
    <td><input class="vit_temp" value="${esc(row.temp)}"></td>
    <td><input class="vit_gcs" value="${esc(row.gcs)}"></td>
    <td><button type="button" class="secondary vit_del">✖</button></td>
  `;
  tr.querySelector(".vit_del").addEventListener("click", () => { tr.remove(); markDirty(); });
  $("vit_table").querySelector("tbody").appendChild(tr);
}

$("inv_addRow").addEventListener("click", () => { addInvRow(); markDirty(); });
$("inv_clear").addEventListener("click", () => {
  if(confirm("¿Limpiar toda la tabla de inventario?")){
    $("inv_table").querySelector("tbody").innerHTML = "";
    markDirty();
  }
});
$("vit_addRow").addEventListener("click", () => { addVitRow(); markDirty(); });
$("vit_clear").addEventListener("click", () => {
  if(confirm("¿Limpiar todas las tomas?")){
    $("vit_table").querySelector("tbody").innerHTML = "";
    markDirty();
  }
});

// ---------- Auth ----------
$("btnLogin").addEventListener("click", async () => {
  const email = $("authEmail").value.trim();
  const pass = $("authPass").value;
  toast("");
  try{
    await signInWithEmailAndPassword(auth, email, pass);
  }catch(e){
    toast("Error: " + (e?.message || "No se pudo iniciar sesión."));
  }
});

$("btnForgot").addEventListener("click", async () => {
  const email = $("authEmail").value.trim();
  if(!email) return toast("Escribe tu email primero.");
  try{
    await sendPasswordResetEmail(auth, email);
    toast("Listo. Revisa tu correo para restablecer la contraseña.");
  }catch(e){
    toast("Error: " + (e?.message || "No se pudo enviar el correo."));
  }
});

$("btnLogout").addEventListener("click", async () => {
  await signOut(auth);
});

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  currentRole = null;
  currentRecordId = null;
  currentRecordMeta = null;
  dirty = false;

  if(!user){
    $("btnLogout").classList.add("hidden");
    showView("viewAuth");
    setPill("idle");
    return;
  }

  $("btnLogout").classList.remove("hidden");

  // Load role from users/{uid}
  const uref = doc(db, "users", user.uid);
  const usnap = await getDoc(uref);
  if(!usnap.exists()){
    // first login: create as lector
    await setDoc(uref, { email: user.email || "", role: "lector", createdAt: serverTimestamp() }, { merge:true });
    currentRole = "lector";
  } else {
    currentRole = usnap.data().role || "lector";
  }

  applyPermissions();
  await refreshRecords();
  showView("viewHome");
  history.replaceState({view:"home"}, "", "#home");
});

// ---------- Navigation ----------
$("navInventario").addEventListener("click", async () => { await preNavSave(); goSection("inventario"); });
$("navMecanica").addEventListener("click", async () => { await preNavSave(); goSection("mecanica"); });
$("navExpediente").addEventListener("click", async () => { await preNavSave(); goSection("expediente"); });

async function preNavSave(){
  if(dirty && canEdit()) await saveCurrentRecord(true);
}

// ---------- Record data mapping ----------
function buildRecordDataFromUI(){
  const invRows = [...$("inv_table").querySelectorAll("tbody tr")].map(tr => ({
    item: tr.querySelector(".inv_item")?.value || "",
    qty: tr.querySelector(".inv_qty")?.value || "",
    state: tr.querySelector(".inv_state")?.value || "",
    exp: tr.querySelector(".inv_exp")?.value || "",
    notes: tr.querySelector(".inv_notes")?.value || "",
  }));

  const vitRows = [...$("vit_table").querySelectorAll("tbody tr")].map(tr => ({
    time: tr.querySelector(".vit_time")?.value || "",
    bp: tr.querySelector(".vit_bp")?.value || "",
    hr: tr.querySelector(".vit_hr")?.value || "",
    rr: tr.querySelector(".vit_rr")?.value || "",
    spo2: tr.querySelector(".vit_spo2")?.value || "",
    temp: tr.querySelector(".vit_temp")?.value || "",
    gcs: tr.querySelector(".vit_gcs")?.value || "",
  }));

  return {
    inventario: {
      unit: $("inv_unit").value || "",
      date: $("inv_date").value || "",
      resp: $("inv_resp").value || "",
      shift: $("inv_shift").value || "",
      rows: invRows,
    },
    mecanica: {
      unit: $("mech_unit").value || "",
      date: $("mech_date").value || "",
      km: $("mech_km").value || "",
      resp: $("mech_resp").value || "",
      chk: {
        oil: $("mech_chk_oil").checked,
        tires: $("mech_chk_tires").checked,
        brakes: $("mech_chk_brakes").checked,
        lights: $("mech_chk_lights").checked,
        battery: $("mech_chk_battery").checked,
        fluids: $("mech_chk_fluids").checked,
      },
      notes: $("mech_notes").value || "",
    },
    expediente: {
      run: {
        number: $("run_number").value || "",
        date: $("run_date").value || "",
        time: $("run_time").value || "",
        unit: $("run_unit").value || "",
        patient: $("run_patient").value || "",
        age: $("run_age").value || "",
        desc: $("run_desc").value || "",
      },
      vitals: vitRows,
    }
  };
}

function loadUIFromRecordData(data){
  data = data || {};
  const inv = data.inventario || {};
  $("inv_unit").value = inv.unit || "";
  $("inv_date").value = inv.date || "";
  $("inv_resp").value = inv.resp || "";
  $("inv_shift").value = inv.shift || "";
  $("inv_table").querySelector("tbody").innerHTML = "";
  (inv.rows || []).forEach(addInvRow);

  const mech = data.mecanica || {};
  $("mech_unit").value = mech.unit || "";
  $("mech_date").value = mech.date || "";
  $("mech_km").value = mech.km || "";
  $("mech_resp").value = mech.resp || "";
  $("mech_notes").value = mech.notes || "";
  const chk = mech.chk || {};
  $("mech_chk_oil").checked = !!chk.oil;
  $("mech_chk_tires").checked = !!chk.tires;
  $("mech_chk_brakes").checked = !!chk.brakes;
  $("mech_chk_lights").checked = !!chk.lights;
  $("mech_chk_battery").checked = !!chk.battery;
  $("mech_chk_fluids").checked = !!chk.fluids;

  const exp = data.expediente || {};
  const run = exp.run || {};
  $("run_number").value = run.number || "";
  $("run_date").value = run.date || "";
  $("run_time").value = run.time || "";
  $("run_unit").value = run.unit || "";
  $("run_patient").value = run.patient || "";
  $("run_age").value = run.age || "";
  $("run_desc").value = run.desc || "";
  $("vit_table").querySelector("tbody").innerHTML = "";
  (exp.vitals || []).forEach(addVitRow);
}

// ---------- Record actions ----------
function suggestName(){
  const unit = $("inv_unit").value || $("mech_unit").value || $("run_unit").value || "AMB";
  const d = $("inv_date").value || $("mech_date").value || $("run_date").value || new Date().toISOString().slice(0,10);
  return `${unit} ${d}`;
}

function newRecord(){
  currentRecordId = null;
  currentRecordMeta = null;
  loadUIFromRecordData({});
  dirty = false;
  setPill(canEdit() ? "saved" : "readonly");
}

$("btnNew").addEventListener("click", async () => {
  await preNavSave();
  newRecord();
});

$("btnSave").addEventListener("click", async () => {
  await saveCurrentRecord(false);
});

async function saveCurrentRecord(silent){
  if(!canEdit()){
    if(!silent) alert("Tu usuario es solo lectura. No puedes guardar cambios.");
    return;
  }
  if(saving) return;
  saving = true;
  setPill("saving");

  const nameDefault = suggestName();
  let name = currentRecordMeta?.name || nameDefault;

  if(!silent){
    name = (prompt("Nombre del registro:", name) || name).trim();
    if(!name){
      saving = false;
      setPill("dirty");
      return;
    }
  }

  const data = buildRecordDataFromUI();

  try{
    if(!currentRecordId){
      const ref = await addDoc(collection(db, "records"), {
        name,
        data,
        ownerUid: currentUser.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      currentRecordId = ref.id;
      currentRecordMeta = { name };
    } else {
      await updateDoc(doc(db, "records", currentRecordId), {
        name,
        data,
        updatedAt: serverTimestamp(),
      });
      currentRecordMeta = { name };
    }

    dirty = false;
    setPill("saved");
    await refreshRecords();
  } catch(e){
    console.error(e);
    setPill("bad");
    if(!silent) alert("No se pudo guardar. Revisa tu conexión o permisos.");
  } finally {
    saving = false;
  }
}

async function refreshRecords(){
  if(!currentUser) return;
  const list = $("recordsList");
  list.innerHTML = "<div class='muted'>Cargando…</div>";

  const q = query(collection(db, "records"), orderBy("updatedAt","desc"), limit(50));
  const snap = await getDocs(q);

  const term = ($("search").value || "").toLowerCase();
  const items = [];
  snap.forEach(docu => {
    const d = docu.data();
    if(term && !(d.name || "").toLowerCase().includes(term)) return;
    items.push({ id: docu.id, ...d });
  });

  if(items.length === 0){
    list.innerHTML = "<div class='muted'>Sin registros.</div>";
    return;
  }

  list.innerHTML = "";
  items.forEach(r => {
    const card = document.createElement("div");
    card.className = "record";
    const updated = r.updatedAt?.toDate ? r.updatedAt.toDate().toLocaleString() : "";
    card.innerHTML = `
      <div class="meta">
        <div>
          <div class="name">${esc(r.name || "(sin nombre)")}</div>
          <div class="sub">Actualizado: ${esc(updated)}</div>
        </div>
        <div class="sub">ID: ${esc(r.id)}</div>
      </div>
      <div class="actions">
        <button class="smallbtn" data-act="open" type="button">Abrir</button>
        <button class="smallbtn" data-act="dup" type="button">Duplicar</button>
        <button class="smallbtn" data-act="del" type="button">Eliminar</button>
      </div>
    `;

    const btnOpen = card.querySelector('[data-act="open"]');
    const btnDup  = card.querySelector('[data-act="dup"]');
    const btnDel  = card.querySelector('[data-act="del"]');

    btnOpen.addEventListener("click", async () => {
      await preNavSave();
      await openRecord(r.id);
    });

    btnDup.addEventListener("click", async () => {
      if(!canEdit()) return alert("Solo lectura. No puedes duplicar.");
      await preNavSave();
      await duplicateRecord(r.id);
    });

    // Delete is disabled in client (rules too). Keep admin hint.
    btnDel.addEventListener("click", () => {
      alert("Eliminación deshabilitada en cliente por seguridad. Un admin puede borrar desde Firebase Console.");
    });
    if(currentRole !== "admin"){
      btnDel.style.display = "none";
    }
    if(!canEdit()){
      btnDup.setAttribute("disabled","disabled");
    }

    list.appendChild(card);
  });
}

$("btnRefresh").addEventListener("click", refreshRecords);
$("search").addEventListener("input", refreshRecords);

async function openRecord(id){
  const snap = await getDoc(doc(db, "records", id));
  if(!snap.exists()) return alert("No existe.");
  const r = snap.data();
  currentRecordId = id;
  currentRecordMeta = { name: r.name || "" };
  loadUIFromRecordData(r.data || {});
  dirty = false;
  setPill(canEdit() ? "saved" : "readonly");
  goHome();
}

async function duplicateRecord(id){
  const snap = await getDoc(doc(db, "records", id));
  if(!snap.exists()) return;
  const r = snap.data();
  currentRecordId = null;
  currentRecordMeta = null;
  loadUIFromRecordData(r.data || {});
  dirty = true;
  setPill("dirty");
}

// ---------- Export / Import ----------
$("btnExport").addEventListener("click", () => {
  const payload = {
    id: currentRecordId || null,
    name: currentRecordMeta?.name || suggestName(),
    data: buildRecordDataFromUI(),
    exportedAt: new Date().toISOString(),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = (payload.name || "registro").replaceAll(/[\\/:*?"<>|]/g, "_") + ".json";
  a.click();
  URL.revokeObjectURL(url);
});

$("fileImport").addEventListener("change", async (e) => {
  const f = e.target.files?.[0];
  e.target.value = "";
  if(!f) return;
  if(!canEdit()) return alert("Solo lectura. No puedes importar.");

  const txt = await f.text();
  let obj;
  try{ obj = JSON.parse(txt); }catch{ return alert("JSON inválido."); }
  await preNavSave();
  currentRecordId = null;
  currentRecordMeta = null;
  loadUIFromRecordData(obj.data || {});
  dirty = true;
  setPill("dirty");
});

// ---------- Autosave (anti-olvido) ----------
function markDirty(){
  if(!canEdit()) return;
  dirty = true;
  setPill("dirty");
  if(saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveCurrentRecord(true), 900);
}

window.addEventListener("beforeunload", (e) => {
  if(dirty && canEdit()){
    e.preventDefault();
    e.returnValue = "";
  }
});

document.addEventListener("input", (e) => {
  const t = e.target;
  if(!t) return;
  if(t.closest("#viewAuth")) return;
  if(t.id === "search") return;
  markDirty();
});
document.addEventListener("change", (e) => {
  const t = e.target;
  if(!t) return;
  if(t.closest("#viewAuth")) return;
  if(t.id === "search") return;
  markDirty();
});

// ---------- Initial ----------
showView("viewAuth");
