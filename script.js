import { createCloudStore } from "./firebase-backend.js?v=20260701-auth-cache1";

(function(){
  "use strict";

  /* ===================== Storage ===================== */
  var STORAGE_KEY = "handmadeOrders_v1";
  var cloudOrders = createCloudStore("orders");

  function loadOrders(){
    try{
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    }catch(e){
      console.error("讀取資料失敗", e);
      return [];
    }
  }
  function saveOrders(orders){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
    cloudOrders.saveAll(orders).catch(function(error){
      console.error("Failed to sync orders to Firestore", error);
    });
  }
  function clearOrdersView(){
    state.orders = [];
    state.editingId = null;
    localStorage.removeItem(STORAGE_KEY);
    closeForm();
    renderStats();
    renderList();
  }
  function loadOrdersFromCloud(){
    cloudOrders.loadAll().then(function(orders){
      if(orders === null) return;
      state.orders = orders;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.orders));
      renderStats();
      renderList();
    }).catch(function(error){
      console.error("Failed to load orders from Firestore", error);
    });
  }

  var state = {
    orders: [],
    editingId: null,
    formItems: [] // temp items while editing in modal
  };

  /* ===================== Helpers ===================== */
  function uid(){
    return 'o_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,8);
  }
  function todayStr(){
    var d = new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth()+1).padStart(2,'0');
    var day = String(d.getDate()).padStart(2,'0');
    return y + '-' + m + '-' + day;
  }
  function money(n){
    n = Number(n)||0;
    return 'NT$ ' + n.toLocaleString('zh-TW', {maximumFractionDigits:0});
  }
  function itemsTotal(items){
    return (items||[]).reduce(function(sum, it){
      return sum + (Number(it.qty)||0) * (Number(it.price)||0);
    }, 0);
  }
  function escapeHtml(s){
    return String(s==null?'':s).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  // Deterministic swatch color from a text string (fabric / first item name)
  var SWATCH_COLORS = ['#2C3E5C','#B5502E','#B8841C','#4F7A5B','#6B4C6E','#3C6E71','#8A5A2E'];
  function swatchColor(text){
    text = text || '';
    var h = 0;
    for(var i=0;i<text.length;i++){ h = (h*31 + text.charCodeAt(i)) & 0xffffffff; }
    var idx = Math.abs(h) % SWATCH_COLORS.length;
    return SWATCH_COLORS[idx];
  }

  var TAG_CLASS = {
    "未付款":"rust", "訂金":"mustard", "已付款":"sage",
    "未開始":"grey", "製作中":"indigo", "已完成":"sage",
    "未出貨":"grey", "已出貨":"indigo", "面交完成":"sage"
  };

  function toast(msg){
    var el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(function(){ el.classList.remove('show'); }, 2200);
  }

  /* ===================== Stats ===================== */
  function renderStats(){
    var orders = state.orders;
    var pending = orders.filter(function(o){ return o.productionStatus !== '已完成'; }).length;
    var unpaidAmount = orders.reduce(function(sum,o){
      if(o.paymentStatus === '已付款') return sum;
      // 訂金 or 未付款 both count remaining as outstanding (simple: full amount if 未付款, treat 訂金 as still open too)
      return sum + itemsTotal(o.items);
    }, 0);
    var now = new Date();
    var ym = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
    var monthOrders = orders.filter(function(o){ return (o.date||'').slice(0,7) === ym; });
    var monthRevenue = monthOrders.reduce(function(sum,o){ return sum + itemsTotal(o.items); }, 0);

    var html = ''
      + statBlock(orders.length, '總訂單數')
      + statBlock(pending, '未完成訂單')
      + statBlock(money(unpaidAmount), '未收款金額')
      + statBlock(money(monthRevenue), '本月營業額');
    document.getElementById('stats').innerHTML = html;
  }
  function statBlock(num, label){
    return '<div class="stat"><div class="num">'+ escapeHtml(num) +'</div><div class="label">'+ escapeHtml(label) +'</div></div>';
  }

  /* ===================== List rendering ===================== */
  function getFilters(){
    return {
      q: document.getElementById('searchInput').value.trim().toLowerCase(),
      payment: document.getElementById('filterPayment').value,
      production: document.getElementById('filterProduction').value,
      shipping: document.getElementById('filterShipping').value
    };
  }

  function matchesFilter(order, f){
    if(f.payment && order.paymentStatus !== f.payment) return false;
    if(f.production && order.productionStatus !== f.production) return false;
    if(f.shipping && order.shippingStatus !== f.shipping) return false;
    if(f.q){
      var hay = [order.customer, order.note].concat(
        (order.items||[]).map(function(it){ return it.name + ' ' + it.fabric; })
      ).join(' ').toLowerCase();
      if(hay.indexOf(f.q) === -1) return false;
    }
    return true;
  }

  function renderList(){
    var f = getFilters();
    var orders = state.orders
      .filter(function(o){ return matchesFilter(o, f); })
      .slice()
      .sort(function(a,b){ return (b.date||'').localeCompare(a.date||'') || (b.createdAt||0) - (a.createdAt||0); });

    var container = document.getElementById('orderList');

    if(orders.length === 0){
      container.innerHTML = '<div class="empty">'
        + '<span class="mark">🧺</span>'
        + '<h3>' + (state.orders.length===0 ? '還沒有任何訂單' : '沒有符合條件的訂單') + '</h3>'
        + '<div>' + (state.orders.length===0 ? '按下「＋ 新增訂單」開始記錄第一筆手作訂單吧' : '換個搜尋字或篩選條件試試看') + '</div>'
        + '</div>';
      return;
    }

    container.innerHTML = orders.map(renderCard).join('');

    // bind actions
    container.querySelectorAll('[data-edit]').forEach(function(btn){
      btn.addEventListener('click', function(){ openForm(btn.getAttribute('data-edit')); });
    });
  }

  function renderCard(order){
    var items = order.items || [];
    var total = itemsTotal(items);
    var firstFabric = items[0] ? (items[0].fabric || items[0].name) : order.customer;
    var color = swatchColor(firstFabric);

    var itemsHtml = items.map(function(it){
      return '<div class="item-row">'
        + '<span class="name">' + escapeHtml(it.name || '未命名商品') + (it.fabric ? '　<span class="fabric">· '+escapeHtml(it.fabric)+'</span>' : '') + '</span>'
        + '<span class="calc">' + (Number(it.qty)||0) + ' × ' + money(it.price) + ' = ' + money((Number(it.qty)||0)*(Number(it.price)||0)) + '</span>'
        + '</div>';
    }).join('');

    var tagsHtml = ''
      + tagHtml(order.paymentStatus)
      + tagHtml(order.productionStatus)
      + tagHtml(order.shippingStatus)
      + '<span class="tag grey"><span class="dot"></span>' + escapeHtml(order.deliveryMethod || '') + '</span>';

    return '<div class="card">'
      + '<div class="card-head">'
        + '<span class="swatch" style="background:'+color+'"></span>'
        + '<div class="who">'
          + '<p class="customer">' + escapeHtml(order.customer || '未命名客人') + '</p>'
          + '<div class="meta"><span>📅 ' + escapeHtml(order.date) + '</span><span>' + items.length + ' 項商品</span></div>'
        + '</div>'
        + '<div class="total"><div class="amt">' + money(total) + '</div><div class="amt-label">訂單總額</div></div>'
      + '</div>'
      + '<div class="items">' + itemsHtml + '</div>'
      + '<div class="tags">' + tagsHtml + '</div>'
      + '<div class="card-foot">'
        + '<div class="note">' + (order.note ? '<b>備註：</b>' + escapeHtml(order.note) : '') + '</div>'
        + '<div class="actions"><button class="btn btn-ghost btn-sm" data-edit="' + order.id + '">編輯</button></div>'
      + '</div>'
      + '</div>';
  }

  function tagHtml(status){
    var cls = TAG_CLASS[status] || 'grey';
    return '<span class="tag ' + cls + '"><span class="dot"></span>' + escapeHtml(status) + '</span>';
  }

  /* ===================== Form / Modal ===================== */
  var overlay = document.getElementById('overlay');
  var lockedScrollY = 0;

  function lockPageScroll(){
    lockedScrollY = window.scrollY || document.documentElement.scrollTop || 0;
    document.body.style.position = 'fixed';
    document.body.style.top = '-' + lockedScrollY + 'px';
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';
    document.body.classList.add('modal-open');
  }

  function unlockPageScroll(){
    document.body.classList.remove('modal-open');
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    document.body.style.width = '';
    window.scrollTo(0, lockedScrollY);
  }

  function openForm(orderId){
    state.editingId = orderId || null;
    var order = orderId ? state.orders.find(function(o){ return o.id === orderId; }) : null;

    document.getElementById('modalTitle').textContent = order ? '編輯訂單' : '新增訂單';
    document.getElementById('deleteOrderBtn').style.display = order ? 'inline-block' : 'none';

    document.getElementById('f_date').value = order ? order.date : todayStr();
    document.getElementById('f_customer').value = order ? order.customer : '';
    document.getElementById('f_payment').value = order ? order.paymentStatus : '未付款';
    document.getElementById('f_production').value = order ? order.productionStatus : '未開始';
    document.getElementById('f_shipping').value = order ? order.shippingStatus : '未出貨';
    document.getElementById('f_delivery').value = order ? order.deliveryMethod : '面交';
    document.getElementById('f_note').value = order ? order.note : '';

    state.formItems = order && order.items && order.items.length
      ? order.items.map(function(it){ return Object.assign({}, it); })
      : [{ id: uid(), name:'', fabric:'', qty:1, price:0 }];

    renderItemsEditor();
    overlay.classList.add('open');
    lockPageScroll();
    setTimeout(function(){ document.getElementById('f_customer').focus(); }, 50);
  }

  function closeForm(){
    overlay.classList.remove('open');
    unlockPageScroll();
    state.editingId = null;
  }

  function renderItemsEditor(){
    var el = document.getElementById('itemsEditor');
    el.innerHTML = state.formItems.map(function(it, idx){
      return itemEditorRow(it, idx);
    }).join('');

    el.querySelectorAll('[data-remove]').forEach(function(btn){
      btn.addEventListener('click', function(){
        var idx = Number(btn.getAttribute('data-remove'));
        if(state.formItems.length <= 1){
          toast('至少要保留一項商品');
          return;
        }
        state.formItems.splice(idx, 1);
        renderItemsEditor();
      });
    });
    el.querySelectorAll('[data-field]').forEach(function(input){
      input.addEventListener('input', function(){
        var idx = Number(input.getAttribute('data-idx'));
        var field = input.getAttribute('data-field');
        var val = input.value;
        state.formItems[idx][field] = (field==='qty' || field==='price') ? Number(val) : val;
        updateSubtotalRow(idx);
        updateTotalPreview();
      });
    });
    updateTotalPreview();
  }

  function itemEditorRow(it, idx){
    return '<div class="item-editor" data-row="'+idx+'">'
      + '<button type="button" class="item-remove" data-remove="'+idx+'" aria-label="刪除品項">×</button>'
      + '<div class="item-grid">'
        + '<div><label>商品名稱</label><input type="text" placeholder="例如：托特包" value="'+escapeHtml(it.name)+'" data-field="name" data-idx="'+idx+'"></div>'
        + '<div><label>布料／款式</label><input type="text" placeholder="例如：藍染帆布" value="'+escapeHtml(it.fabric)+'" data-field="fabric" data-idx="'+idx+'"></div>'
        + '<div><label>數量</label><input type="number" min="0" step="1" inputmode="numeric" value="'+ (it.qty!=null?it.qty:1) +'" data-field="qty" data-idx="'+idx+'"></div>'
        + '<div><label>單價</label><input type="number" min="0" step="1" inputmode="decimal" value="'+ (it.price!=null?it.price:0) +'" data-field="price" data-idx="'+idx+'"></div>'
      + '</div>'
      + '<div class="item-subtotal" id="subtotal_'+idx+'">小計：' + money((Number(it.qty)||0)*(Number(it.price)||0)) + '</div>'
      + '</div>';
  }

  function updateSubtotalRow(idx){
    var it = state.formItems[idx];
    var elS = document.getElementById('subtotal_'+idx);
    if(elS) elS.textContent = '小計：' + money((Number(it.qty)||0)*(Number(it.price)||0));
  }

  function updateTotalPreview(){
    document.getElementById('totalPreview').textContent = money(itemsTotal(state.formItems));
  }

  document.getElementById('addItemBtn').addEventListener('click', function(){
    state.formItems.push({ id: uid(), name:'', fabric:'', qty:1, price:0 });
    renderItemsEditor();
  });

  document.getElementById('orderForm').addEventListener('submit', function(e){
    e.preventDefault();

    var cleanItems = state.formItems
      .map(function(it){
        return { id: it.id || uid(), name: (it.name||'').trim(), fabric:(it.fabric||'').trim(), qty:Number(it.qty)||0, price:Number(it.price)||0 };
      })
      .filter(function(it){ return it.name || it.qty || it.price; });

    if(cleanItems.length === 0){
      toast('請至少填寫一項商品');
      return;
    }

    var data = {
      date: document.getElementById('f_date').value || todayStr(),
      customer: document.getElementById('f_customer').value.trim() || '未命名客人',
      items: cleanItems,
      paymentStatus: document.getElementById('f_payment').value,
      productionStatus: document.getElementById('f_production').value,
      shippingStatus: document.getElementById('f_shipping').value,
      deliveryMethod: document.getElementById('f_delivery').value,
      note: document.getElementById('f_note').value.trim()
    };

    if(state.editingId){
      var existing = state.orders.find(function(o){ return o.id === state.editingId; });
      Object.assign(existing, data);
      existing.updatedAt = Date.now();
      toast('已更新訂單');
    }else{
      data.id = uid();
      data.createdAt = Date.now();
      data.updatedAt = Date.now();
      state.orders.push(data);
      toast('已新增訂單');
    }

    saveOrders(state.orders);
    closeForm();
    renderStats();
    renderList();
  });

  document.getElementById('deleteOrderBtn').addEventListener('click', function(){
    if(!state.editingId) return;
    if(!confirm('確定要刪除這筆訂單嗎？此動作無法復原。')) return;
    state.orders = state.orders.filter(function(o){ return o.id !== state.editingId; });
    saveOrders(state.orders);
    closeForm();
    renderStats();
    renderList();
    toast('已刪除訂單');
  });

  document.getElementById('openAddBtn').addEventListener('click', function(){ openForm(null); });
  document.getElementById('cancelBtn').addEventListener('click', closeForm);
  document.getElementById('modalCloseBtn').addEventListener('click', closeForm);
  overlay.addEventListener('click', function(e){ if(e.target === overlay) closeForm(); });
  document.addEventListener('keydown', function(e){ if(e.key === 'Escape' && overlay.classList.contains('open')) closeForm(); });

  /* ===================== Filters ===================== */
  ['searchInput','filterPayment','filterProduction','filterShipping'].forEach(function(id){
    document.getElementById(id).addEventListener('input', renderList);
    document.getElementById(id).addEventListener('change', renderList);
  });

  /* ===================== Backup: export / import ===================== */
  document.getElementById('exportJsonBtn').addEventListener('click', function(){
    var blob = new Blob([JSON.stringify(state.orders, null, 2)], {type:'application/json'});
    downloadBlob(blob, '手作訂單備份_' + todayStr() + '.json');
    toast('已匯出備份檔');
  });

  document.getElementById('importJsonBtn').addEventListener('click', function(){
    document.getElementById('importFileInput').click();
  });
  document.getElementById('importFileInput').addEventListener('change', function(e){
    var file = e.target.files[0];
    if(!file) return;
    var reader = new FileReader();
    reader.onload = function(){
      try{
        var data = JSON.parse(reader.result);
        if(!Array.isArray(data)) throw new Error('格式錯誤');
        var mode = confirm('要「取代」目前所有訂單嗎？\n按「確定」＝取代全部\n按「取消」＝合併加入（保留現有訂單）');
        if(mode){
          state.orders = data;
        }else{
          var existingIds = new Set(state.orders.map(function(o){return o.id;}));
          data.forEach(function(o){
            if(!o.id || existingIds.has(o.id)) o.id = uid();
            state.orders.push(o);
          });
        }
        saveOrders(state.orders);
        renderStats();
        renderList();
        toast('匯入完成');
      }catch(err){
        alert('匯入失敗：檔案格式不正確');
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  });

  document.getElementById('exportCsvBtn').addEventListener('click', function(){
    var rows = [['訂單日期','客人名稱','商品名稱','布料/款式','數量','單價','小計','訂單總額','付款狀態','製作狀態','出貨狀態','交貨方式','備註']];
    state.orders.forEach(function(o){
      var total = itemsTotal(o.items);
      (o.items||[]).forEach(function(it, idx){
        rows.push([
          o.date, o.customer,
          it.name, it.fabric, it.qty, it.price, (Number(it.qty)||0)*(Number(it.price)||0),
          idx===0 ? total : '',
          idx===0 ? o.paymentStatus : '',
          idx===0 ? o.productionStatus : '',
          idx===0 ? o.shippingStatus : '',
          idx===0 ? o.deliveryMethod : '',
          idx===0 ? o.note : ''
        ]);
      });
    });
    var csv = rows.map(function(r){
      return r.map(function(v){
        v = (v===undefined||v===null) ? '' : String(v);
        if(/[",\n]/.test(v)) v = '"' + v.replace(/"/g,'""') + '"';
        return v;
      }).join(',');
    }).join('\n');
    var blob = new Blob(['\uFEFF' + csv], {type:'text/csv;charset=utf-8;'});
    downloadBlob(blob, '手作訂單_' + todayStr() + '.csv');
    toast('已匯出 CSV');
  });

  function downloadBlob(blob, filename){
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function(){ document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
  }

  /* ===================== Init ===================== */
  renderStats();
  renderList();
  window.addEventListener("handmade-auth-change", function(event){
    if(!event.detail || !event.detail.signedIn) clearOrdersView();
  });
  window.addEventListener("handmade-auth-ready", loadOrdersFromCloud);
  loadOrdersFromCloud();
})();
