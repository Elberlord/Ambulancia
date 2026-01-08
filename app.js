// Ambulancias MVP (sin servidor): LocalStorage + formularios
const KEY = "ambulancias_registros_v1";

const $ = (sel, el=document) => el.querySelector(sel);
const $$ = (sel, el=document) => Array.from(el.querySelectorAll(sel));

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

function saveCurrent(){
  bindToState();
  state.data.meta.updatedAt = new Date().toISOString();

  // Ask for a display name (simple prompt)
  let displayName = state.data.meta.nombre?.trim();
  if(!displayName){
    displayName = prompt("Nombre corto para este registro (ej: A-12 2026-01-08):", "") || "";
    state.data.meta.nombre = displayName;
  }

  const list = loadAll();
  const idx = list.findIndex(x=>x.id === state.currentId);
  const payload = { id: state.currentId, name: displayName || "Registro sin nombre", data: state.data };
  if(idx >= 0) list[idx] = payload;
  else list.push(payload);

  saveAll(list);
  renderSavedList();
  toast("Guardado ✅");
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
      showView(view);
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
  document.addEventListener("input", ()=>{
    $("#statusPill").textContent = "Editando…";
    clearTimeout(setupButtons._tm);
    setupButtons._tm = setTimeout(()=> $("#statusPill").textContent = "Listo", 600);
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
  // Try auto-load last saved item if exists
  const list = loadAll();
  if(list.length){
    const latest = list.sort((a,b)=> (b.data?.meta?.updatedAt||"").localeCompare(a.data?.meta?.updatedAt||""))[0];
    if(latest?.id){
      openRecord(latest.id);
    }
  }
})();
