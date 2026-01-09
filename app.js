// Ambulancias MVP (sin servidor): LocalStorage + formularios
const KEY = "ambulancias_registros_v1";

const $ = (sel, el=document) => el.querySelector(sel);
const $$ = (sel, el=document) => Array.from(el.querySelectorAll(sel));

const isMobile = () => window.matchMedia && window.matchMedia("(max-width: 900px)").matches;

function setAppMode(mode){ // "menu" | "content"
  const app = $(".app");
  if(!app) return;
  app.classList.toggle("mobileMenu", mode === "menu");
  app.classList.toggle("mobileContent", mode === "content");
  const back = $("#btnBack");
  if(back) back.classList.toggle("hidden", mode !== "content");
}

const toast = (msg) => {
  const t = $("#toast");
  t.textContent = msg;
  t.style.display = "block";
  clearTimeout(toast._tm);
  toast._tm = setTimeout(()=> t.style.display="none", 2500);
};

const state = {
  currentId: null,
  data: {
    meta: { nombre:"", createdAt: null, updatedAt: null },
    inv: { unidad:"", fecha:"", responsable:"", turno:"", obs:"", rows: [] },
    mec: { unidad:"", fecha:"", km:"", tecnico:"", estado:"", checks:{}, hallazgos:"" },
    exp: {
      run: { fecha:"", paciente:"", edad:"", sexo:"", dx:"", nota:"" },
      vs:  { flight:"", paciente:"", rows: [], meds: [], note:"" }
    }
  }
};

let isDirty = false;
let autosaveTimer = null;

// UI pill helper
function setStatus(text){
  const pill = $("#statusPill");
  if(pill) pill.textContent = text;
}

function markDirty(){
  isDirty = true;
  setStatus("Cambios sin guardar");
  scheduleAutosave();
}

function scheduleAutosave(){
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(()=> autosaveNow(), 900);
}

function autosaveNow(){
  if(!isDirty) return;
  setStatus("Guardando…");
  saveCurrent({ promptName:false, silent:true });
  isDirty = false;
  setStatus("Guardado ✓");
}

const mecItems = [
  ["Aceite motor", "Nivel y fugas"],
  ["Refrigerante", "Nivel y mangueras"],
  ["Frenos", "Pedal, líquido, fugas"],
  ["Llantas", "Presión y desgaste"],
  ["Luces", "Bajas/altas/stop/direccionales"],
  ["Batería", "Carga y bornes"],
  ["Sirena / Baliza", "Funcionamiento"],
  ["Suspensión", "Ruidos, estabilidad"],
  ["Dirección", "Holguras, alineación"],
  ["Combustible", "Nivel y fugas"],
  ["Limpia parabrisas", "Plumillas y líquido"],
  ["Aire A/C", "Enfría / calienta"],
];

function loadAll(){
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); }
  catch { return []; }
}
function saveAll(list){
  localStorage.setItem(KEY, JSON.stringify(list));
}

function newRecord(){
  state.currentId = crypto.randomUUID();
  state.data = {
    meta: { nombre:"", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    inv: { unidad:"", fecha:"", responsable:"", turno:"", obs:"", rows: [] },
    mec: { unidad:"", fecha:"", km:"", tecnico:"", estado:"", checks:{}, hallazgos:"" },
    exp: {
      run: { fecha:"", paciente:"", edad:"", sexo:"", dx:"", nota:"" },
      vs:  { flight:"", paciente:"", rows: [], meds: [], note:"" }
    }
  };

  // Estado de auto-guardado
  isDirty = false;
  setStatus("Guardado ✓");

  renderAll();
  toast("Nuevo registro listo ✅");
}

function getBindEl(){
  return $$("[data-bind]");
}

function bindToState(){
  getBindEl().forEach(inp=>{
    const path = inp.getAttribute("data-bind");
    const v = (inp.type === "checkbox") ? inp.checked : inp.value;
    setPath(state.data, path, v);
  });
  // tables already update state directly
}

function renderBinds(){
  getBindEl().forEach(inp=>{
    const path = inp.getAttribute("data-bind");
    const v = getPath(state.data, path) ?? "";
    if(inp.type === "checkbox") inp.checked = !!v;
    else inp.value = v;
  });
}

function setPath(obj, path, value){
  const parts = path.split(".");
  let cur = obj;
  for(let i=0;i<parts.length-1;i++){
    if(!(parts[i] in cur)) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length-1]] = value;
}
function getPath(obj, path){
  return path.split(".").reduce((a,k)=> (a && a[k]!=null)?a[k]:undefined, obj);
}

function renderSavedList(){
  const list = loadAll();
  const box = $("#savedList");
  box.innerHTML = "";
  if(!list.length){
    box.innerHTML = '<div class="muted">Aún no hay registros guardados.</div>';
    return;
  }
  list
    .sort((a,b)=> (b.data?.meta?.updatedAt||"").localeCompare(a.data?.meta?.updatedAt||""))
    .forEach(item=>{
      const div = document.createElement("div");
      div.className = "savedItem";
      const name = item.name || "Registro sin nombre";
      const meta = item.data?.meta || {};
      const when = (meta.updatedAt || meta.createdAt || "").replace("T"," ").slice(0,16);
      div.innerHTML = `
        <div class="savedItemTop">
          <div class="savedName">${escapeHtml(name)}</div>
          <div class="pill">${when || "—"}</div>
        </div>
        <div class="savedMeta">ID: ${item.id.slice(0,8)} · Sección: ${guessSection(item.data)}</div>
        <div class="savedActions">
          <button class="btn primary" data-act="open" data-id="${item.id}">Abrir</button>
          <button class="btn" data-act="dup" data-id="${item.id}">Duplicar</button>
          <button class="btn danger" data-act="del" data-id="${item.id}">Eliminar</button>
        </div>
      `;
      box.appendChild(div);
    });

  $$("[data-act='open']").forEach(b=> b.onclick = ()=> openRecord(b.dataset.id));
  $$("[data-act='dup']").forEach(b=> b.onclick = ()=> duplicateRecord(b.dataset.id));
  $$("[data-act='del']").forEach(b=> b.onclick = ()=> deleteRecord(b.dataset.id));
}

function guessSection(data){
  if(data?.inv?.unidad || data?.inv?.rows?.length) return "Inventario";
  if(data?.mec?.unidad || Object.keys(data?.mec?.checks||{}).length) return "Mecánica";
  if(data?.exp?.run?.paciente || data?.exp?.vs?.rows?.length) return "Expediente";
  return "—";
}

function saveCurrent(opts = { promptName:true, silent:false }){
  bindToState();
  state.data.meta.updatedAt = new Date().toISOString();

  // Nombre del registro:
  let displayName = (state.data.meta.nombre || "").trim();

  if(!displayName){
    if(opts.promptName){
      displayName = prompt("Nombre corto para este registro (ej: A-12 2026-01-08):", "") || "";
    }
    // Si sigue vacío (o en autosave), ponemos un nombre seguro
    if(!displayName){
      const d = new Date();
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth()+1).padStart(2,"0");
      const dd = String(d.getDate()).padStart(2,"0");
      const hh = String(d.getHours()).padStart(2,"0");
      const mi = String(d.getMinutes()).padStart(2,"0");
      displayName = `Borrador ${yyyy}-${mm}-${dd} ${hh}:${mi}`;
    }
    state.data.meta.nombre = displayName;
  }

  const list = loadAll();
  const idx = list.findIndex(x=>x.id === state.currentId);
  const payload = { id: state.currentId, name: displayName, data: state.data };

  if(idx >= 0) list[idx] = payload;
  else list.push(payload);

  saveAll(list);
  renderSavedList();

  if(!opts.silent) toast("Guardado ✅");
}

function openRecord(id){
  const list = loadAll();
  const item = list.find(x=>x.id === id);
  if(!item){ toast("No encontré ese registro."); return; }
  state.currentId = item.id;
  state.data = item.data;
  renderAll();
  toast("Registro abierto ✅");
}

function duplicateRecord(id){
  const list = loadAll();
  const item = list.find(x=>x.id === id);
  if(!item){ toast("No encontré ese registro."); return; }
  const copy = structuredClone(item);
  copy.id = crypto.randomUUID();
  copy.name = (item.name || "Registro") + " (copia)";
  copy.data.meta = copy.data.meta || {};
  copy.data.meta.createdAt = new Date().toISOString();
  copy.data.meta.updatedAt = new Date().toISOString();
  list.push(copy);
  saveAll(list);
  renderSavedList();
  toast("Duplicado ✅");
}

function deleteRecord(id){
  if(!confirm("¿Eliminar este registro?")) return;
  const list = loadAll().filter(x=>x.id !== id);
  saveAll(list);
  renderSavedList();
  toast("Eliminado 🗑️");
}

function exportJSON(){
  bindToState();
  const blob = new Blob([JSON.stringify({ id: state.currentId, data: state.data }, null, 2)], {type:"application/json"});
  const a = document.createElement("a");
  const name = (state.data.meta.nombre || "registro").replace(/[^a-z0-9_-]+/gi,"_");
  a.href = URL.createObjectURL(blob);
  a.download = `ambulancia_${name}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function importJSON(file){
  const fr = new FileReader();
  fr.onload = () => {
    try{
      const obj = JSON.parse(fr.result);
      state.currentId = obj.id || crypto.randomUUID();
      state.data = obj.data || obj;
      if(!state.data.meta) state.data.meta = { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      renderAll();
      toast("Importado ✅ (guardá para persistir)");
    }catch(e){
      console.error(e);
      toast("JSON inválido ❌");
    }
  };
  fr.readAsText(file);
}

function renderChecks(){
  const wrap = $("#mecChecks");
  wrap.innerHTML = "";
  mecItems.forEach(([label, desc])=>{
    const key = label;
    const id = "chk_" + label.replace(/\W+/g,"_");
    const div = document.createElement("div");
    div.className = "check";
    div.innerHTML = `
      <input type="checkbox" id="${id}" />
      <div>
        <div class="label">${escapeHtml(label)}</div>
        <div class="desc">${escapeHtml(desc)}</div>
      </div>
    `;
    const cb = div.querySelector("input");
    cb.checked = !!state.data.mec.checks[key];
    cb.addEventListener("change", ()=>{
      state.data.mec.checks[key] = cb.checked;
    });
    wrap.appendChild(div);
  });
}

function makeRowInput(value, onChange){
  const inp = document.createElement("input");
  inp.value = value ?? "";
  inp.addEventListener("input", ()=> onChange(inp.value));
  return inp;
}

function renderTable(tableId, rows, columns, onRemove){
  const tbody = $(tableId + " tbody");
  tbody.innerHTML = "";
  rows.forEach((row, idx)=>{
    const tr = document.createElement("tr");
    columns.forEach(col=>{
      const td = document.createElement("td");
      td.appendChild(makeRowInput(row[col] ?? "", v=> row[col] = v));
      tr.appendChild(td);
    });
    const tdX = document.createElement("td");
    const x = document.createElement("button");
    x.className = "xBtn";
    x.textContent = "✖";
    x.onclick = ()=> onRemove(idx);
    tdX.appendChild(x);
    tr.appendChild(tdX);
    tbody.appendChild(tr);
  });
}

function renderInventarioTable(){
  const cols = ["item","cantidad","estado","vencimiento","notas"];
  renderTable("#invTable", state.data.inv.rows, cols, (idx)=>{
    state.data.inv.rows.splice(idx,1);
    renderInventarioTable();
  });
}
function renderVitalsTable(){
  const cols = ["time","hr","rhythm","bp","map","rr","spo2","etco2","temp","pain","gcs","vtidal","rate","peep"];
  renderTable("#vsTable", state.data.exp.vs.rows, cols, (idx)=>{
    state.data.exp.vs.rows.splice(idx,1);
    renderVitalsTable();
  });
}
function renderMedsTable(){
  const cols = ["time","medication","concentration","dose","route","outcome"];
  renderTable("#medTable", state.data.exp.vs.meds, cols, (idx)=>{
    state.data.exp.vs.meds.splice(idx,1);
    renderMedsTable();
  });
}

function renderAll(){
  renderBinds();
  renderChecks();
  renderInventarioTable();
  renderVitalsTable();
  renderMedsTable();
  renderSavedList();
}

function setupNav(){
  $$(".navBtn").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      $$(".navBtn").forEach(b=> b.classList.remove("active"));
      btn.classList.add("active");
      const view = btn.dataset.view;

      // In mobile we behave like an app: Menu -> Content
      if(isMobile()){
        history.pushState({screen:"content", view}, "", `#${view}`);
        setAppMode("content");
      }
      showView(view);
      window.scrollTo(0,0);
    });
  });

  $$(".tabBtn").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      $$(".tabBtn").forEach(b=> b.classList.remove("active"));
      btn.classList.add("active");
      const tab = btn.dataset.tab;
      $("#tab-run").classList.toggle("hidden", tab !== "run");
      $("#tab-vitals").classList.toggle("hidden", tab !== "vitals");
    });
  });
}

function showView(view){
  // Antes de cambiar de pantalla, auto-guardamos si hay cambios
  if(isDirty) autosaveNow();
  $("#view-inventario").classList.toggle("hidden", view !== "inventario");
  $("#view-mecanica").classList.toggle("hidden", view !== "mecanica");
  $("#view-expediente").classList.toggle("hidden", view !== "expediente");

  const map = {
    inventario: ["📦 Inventario de ambulancia", "Checklist editable. Guarda en el navegador."],
    mecanica: ["🛠️ Revisión mecánica de ambulancias", "Checklist mecánico + hallazgos."],
    expediente: ["🗂️ Expediente y hoja de trabajo", "Dos pestañas: Run Report y Vital Signs."]
  };
  $("#viewTitle").textContent = map[view][0];
  $("#viewSub").textContent = map[view][1];
}

function setupButtons(){
  const back = $("#btnBack");
  if(back){
    back.onclick = () => {
      // go back to menu in one tap
      if(isMobile()){
        history.pushState({screen:"menu"}, "", location.pathname + location.search);
        setAppMode("menu");
      }
      window.scrollTo(0,0);
    };
  }
  $("#btnNuevo").onclick = newRecord;
  $("#btnGuardar").onclick = saveCurrent;
  $("#btnImprimir").onclick = ()=> window.print();
  $("#btnExportar").onclick = exportJSON;
  $("#btnRefresh").onclick = renderSavedList;

  $("#fileImport").addEventListener("change", (e)=>{
    const f = e.target.files?.[0];
    if(f) importJSON(f);
    e.target.value = "";
  });

  $("#invAddRow").onclick = ()=>{
    state.data.inv.rows.push({item:"", cantidad:"", estado:"", vencimiento:"", notas:""});
    renderInventarioTable();
  };
  $("#invClear").onclick = ()=>{
    if(!confirm("¿Limpiar toda la tabla de inventario?")) return;
    state.data.inv.rows = [];
    renderInventarioTable();
  };

  $("#vsAddRow").onclick = ()=>{
    state.data.exp.vs.rows.push({time:"",hr:"",rhythm:"",bp:"",map:"",rr:"",spo2:"",etco2:"",temp:"",pain:"",gcs:"",vtidal:"",rate:"",peep:""});
    renderVitalsTable();
  };
  $("#vsClear").onclick = ()=>{
    if(!confirm("¿Limpiar toda la tabla de vitales?")) return;
    state.data.exp.vs.rows = [];
    renderVitalsTable();
  };

  $("#medAddRow").onclick = ()=>{
    state.data.exp.vs.meds.push({time:"",medication:"",concentration:"",dose:"",route:"",outcome:""});
    renderMedsTable();
  };
  $("#medClear").onclick = ()=>{
    if(!confirm("¿Limpiar toda la tabla de medicamentos?")) return;
    state.data.exp.vs.meds = [];
    renderMedsTable();
  };

  // update pill on any input
  
  // Auto-guardado anti-olvido 😅
  document.addEventListener("input", (e)=>{
    // Ignora inputs del file chooser si existieran
    if(e?.target?.type === "file") return;
    markDirty();
  });
  document.addEventListener("change", (e)=>{
    if(e?.target?.type === "file") return;
    // checkboxes/selects también cuentan
    markDirty();
  });

  // Si intentan salir con cambios sin guardar, avisamos
  window.addEventListener("beforeunload", (e)=>{
    if(!isDirty) return;
    e.preventDefault();
    e.returnValue = "";
  });
}

function escapeHtml(s){
  return String(s ?? "").replace(/[&<>\"']/g, m=>({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"
  }[m]));
}

// Boot
(function(){
  setupNav();
  setupButtons();
  newRecord(); // start fresh

  const allowed = new Set(["inventario","mecanica","expediente"]);
  const hashView = (location.hash || "").replace("#","").trim();
  const initialView = allowed.has(hashView) ? hashView : "inventario";

  // Mark active nav button
  $$(".navBtn").forEach(b=>{
    b.classList.toggle("active", b.dataset.view === initialView);
  });

  showView(initialView);

  // Mobile starts on Menu unless a deep-link hash was provided
  if(isMobile()){
    setAppMode(allowed.has(hashView) ? "content" : "menu");
  } else {
    setAppMode("content");
  }

  // Back/forward navigation support
  window.addEventListener("popstate", ()=>{
    const hv = (location.hash || "").replace("#","").trim();
    if(isMobile()){
      if(allowed.has(hv)){
        setAppMode("content");
        showView(hv);
        $$(".navBtn").forEach(b=> b.classList.toggle("active", b.dataset.view === hv));
      } else {
        setAppMode("menu");
      }
      window.scrollTo(0,0);
    }
  });

  // Try auto-load last saved item if exists
  const list = loadAll();
  if(list.length){
    const latest = list.sort((a,b)=> (b.data?.meta?.updatedAt||"").localeCompare(a.data?.meta?.updatedAt||""))[0];
    if(latest?.id){
      openRecord(latest.id);
    }
  }
})();
