import { createCloudStore } from "./firebase-backend.js?v=20260708-inventory1";

(function(){
  "use strict";

  var STORAGE_KEY = "handmadeInventoryItems_v1";
  var cloudInventory = createCloudStore("inventoryItems");
  var isSavingItem = false;
  var deferredCloudLoad = false;
  var isFormDirty = false;

  var state = {
    items: [],
    editingId: null
  };

  function loadItems(){
    try{
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    }catch(e){
      console.error("讀取庫存資料失敗", e);
      return [];
    }
  }

  function saveItems(items){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    setSyncStatus("syncing", "同步中");
    return cloudInventory.saveAll(items).catch(function(error){
      setSyncStatus("error", "同步失敗");
      console.error("Failed to sync inventory to Firestore", error);
      throw error;
    }).then(function(){
      setSyncStatus("synced", "已同步");
    });
  }

  function saveItem(item){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.items));
    setSyncStatus("syncing", "同步中");
    return cloudInventory.saveOne(item).then(function(){
      setSyncStatus("synced", "已同步");
    }).catch(function(error){
      setSyncStatus("error", "同步失敗");
      console.error("Failed to sync inventory item to Firestore", error);
      throw error;
    });
  }

  function deleteItemFromCloud(itemId){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.items));
    setSyncStatus("syncing", "同步中");
    return cloudInventory.deleteOne(itemId).then(function(){
      setSyncStatus("synced", "已同步");
    }).catch(function(error){
      setSyncStatus("error", "同步失敗");
      console.error("Failed to delete inventory item from Firestore", error);
      throw error;
    });
  }

  function clearItemsView(){
    if(typeof overlay !== "undefined" && overlay && overlay.classList.contains("open")){
      deferredCloudLoad = true;
      return;
    }
    state.items = [];
    state.editingId = null;
    localStorage.removeItem(STORAGE_KEY);
    closeForm(true);
    renderStats();
    renderList();
  }

  function loadItemsFromCloud(){
    if(isSavingItem || (typeof overlay !== "undefined" && overlay && overlay.classList.contains("open"))){
      deferredCloudLoad = true;
      return Promise.resolve(null);
    }
    deferredCloudLoad = false;
    return cloudInventory.loadAll().then(function(items){
      if(items === null){
        setSyncStatus("error", "未登入");
        return;
      }
      state.items = items;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.items));
      setSyncStatus("synced", "已同步");
      renderStats();
      renderList();
    }).catch(function(error){
      setSyncStatus("error", "同步失敗");
      console.error("Failed to load inventory from Firestore", error);
    });
  }

  function uid(){
    return "i_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2,8);
  }

  function todayStr(){
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
  }

  function num(v){
    var n = Number(v);
    return isFinite(n) ? n : 0;
  }

  function fmtQty(v){
    v = num(v);
    if(Math.abs(v - Math.round(v)) < 0.0001) return String(Math.round(v));
    return String(Math.round(v * 100) / 100);
  }

  function money(n){
    n = Number(n)||0;
    return "NT$ " + Math.round(n).toLocaleString("zh-TW");
  }

  function escapeHtml(s){
    return String(s==null?"":s).replace(/[&<>"']/g, function(c){
      return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c];
    });
  }

  function itemValue(item){
    return num(item.quantity) * num(item.unitCost);
  }

  function isLowStock(item){
    return num(item.safetyStock) > 0 && num(item.quantity) <= num(item.safetyStock);
  }

  function toast(msg){
    var el = document.getElementById("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(el._t);
    el._t = setTimeout(function(){ el.classList.remove("show"); }, 2200);
  }

  function setSyncStatus(status, text){
    var el = document.getElementById("syncStatus");
    if(!el){
      el = document.createElement("div");
      el.id = "syncStatus";
      var toolbar = document.querySelector(".toolbar");
      if(toolbar) toolbar.appendChild(el);
    }
    el.className = "sync-status " + status;
    el.textContent = text;
  }

  function markFormDirty(){
    if(overlay && overlay.classList.contains("open")) isFormDirty = true;
  }

  function canCloseForm(){
    return !isFormDirty || confirm("內容尚未儲存，確定離開嗎？");
  }

  function renderStats(){
    var total = state.items.length;
    var low = state.items.filter(isLowStock).length;
    var finished = state.items.filter(function(item){ return item.type === "成品"; }).reduce(function(sum, item){ return sum + num(item.quantity); }, 0);
    var value = state.items.reduce(function(sum, item){ return sum + itemValue(item); }, 0);

    document.getElementById("stats").innerHTML = ""
      + statBlock(total, "庫存品項")
      + statBlock(low, "低庫存")
      + statBlock(fmtQty(finished), "成品數量")
      + statBlock(money(value), "庫存成本估算");
  }

  function statBlock(value, label){
    return '<div class="stat"><div class="num">'+escapeHtml(value)+'</div><div class="label">'+escapeHtml(label)+'</div></div>';
  }

  function currentFilters(){
    return {
      q: document.getElementById("searchInput").value.trim().toLowerCase(),
      type: document.getElementById("filterType").value,
      stock: document.getElementById("filterStock").value
    };
  }

  function matchesFilter(item, filters){
    var haystack = [item.name, item.variant, item.type, item.location, item.note].join(" ").toLowerCase();
    if(filters.q && haystack.indexOf(filters.q) === -1) return false;
    if(filters.type && item.type !== filters.type) return false;
    if(filters.stock === "low" && !isLowStock(item)) return false;
    if(filters.stock === "available" && num(item.quantity) <= 0) return false;
    if(filters.stock === "zero" && num(item.quantity) > 0) return false;
    return true;
  }

  function renderList(){
    var list = document.getElementById("inventoryList");
    var filters = currentFilters();
    var items = state.items.slice().sort(function(a,b){
      if(isLowStock(a) !== isLowStock(b)) return isLowStock(a) ? -1 : 1;
      return String(a.name||"").localeCompare(String(b.name||""), "zh-Hant");
    }).filter(function(item){ return matchesFilter(item, filters); });

    if(items.length === 0){
      list.innerHTML = '<div class="empty"><span class="mark">📦</span><h3>還沒有符合條件的庫存</h3><p>新增庫存品項後，就可以開始記錄入庫、出庫與盤點。</p></div>';
      return;
    }

    list.innerHTML = items.map(renderCard).join("");
    list.querySelectorAll("[data-edit]").forEach(function(btn){
      btn.addEventListener("click", function(){ openForm(btn.getAttribute("data-edit")); });
    });
    list.querySelectorAll("[data-move]").forEach(function(btn){
      btn.addEventListener("click", function(){
        recordMovement(btn.getAttribute("data-id"), btn.getAttribute("data-move"));
      });
    });
  }

  function renderCard(item){
    var low = isLowStock(item);
    var movements = (item.movements || []).slice(-3).reverse();
    var movementHtml = movements.length
      ? movements.map(function(m){
          return '<div class="movement-row"><span>'+movementLabel(m.type)+'</span><span>'+escapeHtml(fmtQty(m.qty))+' '+escapeHtml(item.unit || "")+'</span><span>'+escapeHtml((m.createdAtText || "").slice(0,10))+'</span></div>';
        }).join("")
      : '<div class="movement-row muted">尚無異動紀錄</div>';

    return '<div class="card inventory-card">'
      + '<div class="card-head">'
        + '<span class="swatch inventory-swatch '+(low ? "low" : "")+'"></span>'
        + '<div class="who">'
          + '<p class="customer">'+escapeHtml(item.name || "未命名品項")+'</p>'
          + '<div class="meta"><span>'+escapeHtml(item.type || "其他")+'</span>'+(item.variant ? '<span>'+escapeHtml(item.variant)+'</span>' : '')+(item.location ? '<span>'+escapeHtml(item.location)+'</span>' : '')+'</div>'
        + '</div>'
        + '<div class="total"><div class="amt">'+escapeHtml(fmtQty(item.quantity))+' '+escapeHtml(item.unit || "")+'</div><div class="amt-label">'+(low ? "低庫存" : "目前庫存")+'</div></div>'
      + '</div>'
      + '<div class="inventory-kv">'
        + '<div><span>安全庫存</span><b>'+escapeHtml(fmtQty(item.safetyStock))+' '+escapeHtml(item.unit || "")+'</b></div>'
        + '<div><span>單位成本</span><b>'+money(item.unitCost)+'</b></div>'
        + '<div><span>成本估算</span><b>'+money(itemValue(item))+'</b></div>'
      + '</div>'
      + '<div class="tags">'
        + '<span class="tag '+(low ? "rust" : "sage")+'"><span class="dot"></span>'+(low ? "低庫存" : "庫存正常")+'</span>'
        + '<span class="tag grey"><span class="dot"></span>'+escapeHtml(item.type || "其他")+'</span>'
      + '</div>'
      + '<div class="movement-list">'+movementHtml+'</div>'
      + '<div class="card-foot">'
        + '<div class="note">'+(item.note ? '<b>備註：</b>'+escapeHtml(item.note) : '')+'</div>'
        + '<div class="actions inventory-actions">'
          + '<button class="btn btn-ghost btn-sm" data-move="in" data-id="'+item.id+'">入庫</button>'
          + '<button class="btn btn-ghost btn-sm" data-move="out" data-id="'+item.id+'">出庫</button>'
          + '<button class="btn btn-ghost btn-sm" data-move="adjust" data-id="'+item.id+'">盤點</button>'
          + '<button class="btn btn-ghost btn-sm" data-edit="'+item.id+'">編輯</button>'
        + '</div>'
      + '</div>'
      + '</div>';
  }

  function movementLabel(type){
    return type === "in" ? "入庫" : type === "out" ? "出庫" : "盤點";
  }

  var overlay = document.getElementById("overlay");
  var lockedScrollY = 0;

  function lockPageScroll(){
    lockedScrollY = window.scrollY || document.documentElement.scrollTop || 0;
    document.body.style.position = "fixed";
    document.body.style.top = "-" + lockedScrollY + "px";
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.width = "100%";
    document.body.classList.add("modal-open");
  }

  function unlockPageScroll(){
    document.body.classList.remove("modal-open");
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.left = "";
    document.body.style.right = "";
    document.body.style.width = "";
    window.scrollTo(0, lockedScrollY);
  }

  function openForm(itemId){
    state.editingId = itemId || null;
    isFormDirty = false;
    var item = itemId ? state.items.find(function(x){ return x.id === itemId; }) : null;

    document.getElementById("modalTitle").textContent = item ? "編輯庫存品項" : "新增庫存品項";
    document.getElementById("deleteItemBtn").style.display = item ? "inline-block" : "none";
    document.getElementById("f_name").value = item ? item.name : "";
    document.getElementById("f_type").value = item ? item.type : "成品";
    document.getElementById("f_variant").value = item ? item.variant : "";
    document.getElementById("f_unit").value = item ? item.unit : "個";
    document.getElementById("f_quantity").value = item ? item.quantity : 0;
    document.getElementById("f_safetyStock").value = item ? item.safetyStock : 0;
    document.getElementById("f_unitCost").value = item ? item.unitCost : 0;
    document.getElementById("f_location").value = item ? item.location : "";
    document.getElementById("f_note").value = item ? item.note : "";

    overlay.classList.add("open");
    lockPageScroll();
    setTimeout(function(){ document.getElementById("f_name").focus(); }, 50);
  }

  function closeForm(force){
    if(!force && !canCloseForm()) return false;
    overlay.classList.remove("open");
    unlockPageScroll();
    state.editingId = null;
    isFormDirty = false;
    if(deferredCloudLoad && !isSavingItem) loadItemsFromCloud();
    return true;
  }

  function formData(){
    return {
      name: document.getElementById("f_name").value.trim(),
      type: document.getElementById("f_type").value,
      variant: document.getElementById("f_variant").value.trim(),
      unit: document.getElementById("f_unit").value,
      quantity: num(document.getElementById("f_quantity").value),
      safetyStock: num(document.getElementById("f_safetyStock").value),
      unitCost: num(document.getElementById("f_unitCost").value),
      location: document.getElementById("f_location").value.trim(),
      note: document.getElementById("f_note").value.trim()
    };
  }

  document.getElementById("inventoryForm").addEventListener("input", markFormDirty);
  document.getElementById("inventoryForm").addEventListener("change", markFormDirty);

  document.getElementById("inventoryForm").addEventListener("submit", async function(e){
    e.preventDefault();
    if(isSavingItem) return;

    var data = formData();
    if(!data.name){
      toast("請輸入品項名稱");
      return;
    }

    var saveBtn = document.getElementById("saveBtn");
    var saveBtnText = saveBtn.textContent;
    isSavingItem = true;
    saveBtn.disabled = true;
    saveBtn.textContent = "儲存中...";

    if(state.editingId){
      var existing = state.items.find(function(item){ return item.id === state.editingId; });
      Object.assign(existing, data);
      existing.updatedAt = Date.now();
    }else{
      data.id = uid();
      data.movements = [];
      data.createdAt = Date.now();
      data.updatedAt = Date.now();
      state.items.push(data);
      state.editingId = data.id;
    }

    try{
      await saveItem(state.items.find(function(item){ return item.id === state.editingId; }));
      deferredCloudLoad = false;
      closeForm(true);
      renderStats();
      renderList();
      toast("已儲存庫存");
    }catch(error){
      toast("儲存失敗，請確認網路或重新登入後再試");
    }finally{
      isSavingItem = false;
      saveBtn.disabled = false;
      saveBtn.textContent = saveBtnText;
    }
  });

  document.getElementById("deleteItemBtn").addEventListener("click", async function(){
    if(!state.editingId) return;
    if(!confirm("確定要刪除這個庫存品項嗎？此動作無法復原。")) return;

    var deletedId = state.editingId;
    var previousItems = state.items.slice();
    state.items = state.items.filter(function(item){ return item.id !== deletedId; });

    try{
      await deleteItemFromCloud(deletedId);
      closeForm(true);
      renderStats();
      renderList();
      toast("已刪除庫存品項");
    }catch(error){
      state.items = previousItems;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.items));
      toast("刪除失敗，請確認網路或重新登入後再試");
    }
  });

  async function recordMovement(itemId, type){
    var item = state.items.find(function(x){ return x.id === itemId; });
    if(!item) return;

    var label = movementLabel(type);
    var raw = prompt(type === "adjust" ? "請輸入盤點後的實際數量" : "請輸入" + label + "數量");
    if(raw === null) return;
    var qty = num(raw);
    if(qty < 0 || (!qty && type !== "adjust")){
      toast("請輸入有效數量");
      return;
    }

    var reason = prompt("備註原因（可空白）", type === "in" ? "補貨" : type === "out" ? "使用 / 出貨" : "盤點調整");
    if(reason === null) return;

    var previousItem = JSON.parse(JSON.stringify(item));
    var before = num(item.quantity);
    var after = type === "in" ? before + qty : type === "out" ? before - qty : qty;
    if(after < 0 && !confirm("出庫後庫存會變成負數，仍要繼續嗎？")) return;

    item.quantity = Math.round(after * 100) / 100;
    item.updatedAt = Date.now();
    item.movements = Array.isArray(item.movements) ? item.movements : [];
    item.movements.push({
      id: uid(),
      type: type,
      qty: type === "adjust" ? Math.abs(after - before) : qty,
      before: before,
      after: item.quantity,
      reason: reason.trim(),
      createdAt: Date.now(),
      createdAtText: todayStr()
    });

    try{
      await saveItem(item);
      renderStats();
      renderList();
      toast("已記錄" + label);
    }catch(error){
      Object.keys(item).forEach(function(key){ delete item[key]; });
      Object.assign(item, previousItem);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.items));
      toast("異動同步失敗，請確認網路或重新登入後再試");
    }
  }

  document.getElementById("openAddBtn").addEventListener("click", function(){ openForm(null); });
  document.getElementById("cancelBtn").addEventListener("click", function(){ closeForm(); });
  document.getElementById("modalCloseBtn").addEventListener("click", function(){ closeForm(); });
  overlay.addEventListener("click", function(e){ if(e.target === overlay) closeForm(); });
  document.addEventListener("keydown", function(e){ if(e.key === "Escape" && overlay.classList.contains("open")) closeForm(); });

  ["searchInput","filterType","filterStock"].forEach(function(id){
    document.getElementById(id).addEventListener("input", renderList);
    document.getElementById(id).addEventListener("change", renderList);
  });

  document.getElementById("exportJsonBtn").addEventListener("click", function(){
    var blob = new Blob([JSON.stringify(state.items, null, 2)], {type:"application/json"});
    downloadBlob(blob, "手作庫存備份_" + todayStr() + ".json");
    toast("已匯出備份檔");
  });

  document.getElementById("importJsonBtn").addEventListener("click", function(){
    document.getElementById("importFileInput").click();
  });

  document.getElementById("importFileInput").addEventListener("change", function(e){
    var file = e.target.files[0];
    if(!file) return;
    var reader = new FileReader();
    reader.onload = function(){
      try{
        var data = JSON.parse(reader.result);
        if(!Array.isArray(data)) throw new Error("格式錯誤");
        var replace = confirm("按「確定」覆蓋目前庫存；按「取消」則合併匯入。");
        if(replace){
          state.items = data;
        }else{
          var existingIds = new Set(state.items.map(function(item){ return item.id; }));
          data.forEach(function(item){
            if(!item.id || existingIds.has(item.id)) item.id = uid();
            state.items.push(item);
          });
        }
        saveItems(state.items);
        renderStats();
        renderList();
        toast("匯入完成");
      }catch(err){
        alert("匯入失敗，請確認 JSON 格式正確。");
      }
      e.target.value = "";
    };
    reader.readAsText(file);
  });

  document.getElementById("exportCsvBtn").addEventListener("click", function(){
    var rows = [["類型","品項名稱","規格/款式","目前數量","單位","安全庫存","單位成本","成本估算","存放位置","備註"]];
    state.items.forEach(function(item){
      rows.push([
        item.type,
        item.name,
        item.variant,
        item.quantity,
        item.unit,
        item.safetyStock,
        item.unitCost,
        itemValue(item).toFixed(0),
        item.location,
        item.note
      ]);
    });
    var csv = rows.map(function(row){
      return row.map(function(v){
        v = (v===undefined||v===null) ? "" : String(v);
        if(/[",\n]/.test(v)) v = '"' + v.replace(/"/g,'""') + '"';
        return v;
      }).join(",");
    }).join("\n");
    var blob = new Blob(["\uFEFF" + csv], {type:"text/csv;charset=utf-8;"});
    downloadBlob(blob, "手作庫存_" + todayStr() + ".csv");
    toast("已匯出 CSV");
  });

  function downloadBlob(blob, filename){
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function(){ document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
  }

  state.items = loadItems();
  setSyncStatus("syncing", "同步中");
  renderStats();
  renderList();

  window.addEventListener("handmade-auth-change", function(event){
    if(!event.detail || !event.detail.signedIn){
      setSyncStatus("error", "未登入");
      clearItemsView();
    }
  });
  window.addEventListener("handmade-auth-ready", loadItemsFromCloud);
  loadItemsFromCloud();
})();
