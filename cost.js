(function(){
  "use strict";

  /* ===================== Storage ===================== */
  var STORAGE_KEY = "handmadeCostSheets_v1";

  function loadSheets(){
    try{
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    }catch(e){
      console.error("讀取資料失敗", e);
      return [];
    }
  }
  function saveSheets(sheets){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sheets));
  }

  var METHOD_LABEL = { markup: "加成倍率", margin: "目標毛利率", fixed: "指定利潤金額" };

  var state = {
    sheets: loadSheets(),
    editingId: null,
    formMaterials: [],
    formMethod: 'markup'
  };

  /* ===================== Helpers ===================== */
  function uid(){
    return 's_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,8);
  }
  function money(n){
    n = Number(n)||0;
    return 'NT$ ' + Math.round(n).toLocaleString('zh-TW');
  }
  function pct(n){
    n = Number(n)||0;
    return n.toFixed(1) + '%';
  }
  function escapeHtml(s){
    return String(s==null?'':s).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function num(v){ var n = Number(v); return isFinite(n) ? n : 0; }

  function materialsCost(materials){
    return (materials||[]).reduce(function(sum, m){
      return sum + num(m.qty) * num(m.unitCost);
    }, 0);
  }

  function toast(msg){
    var el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(function(){ el.classList.remove('show'); }, 2200);
  }

  /* ===================== Pricing math ===================== */
  function priceFromMarkup(cost, multiplier){
    return cost * (num(multiplier));
  }
  function priceFromMargin(cost, marginPercent){
    var m = num(marginPercent);
    if(m >= 100) return null; // impossible target
    return cost / (1 - m/100);
  }
  function priceFromFixed(cost, fixedProfit){
    return cost + num(fixedProfit);
  }
  function marginOfPrice(cost, price){
    if(!price) return 0;
    return ((price - cost) / price) * 100;
  }
  function computeAllPrices(cost, params){
    return {
      markup: priceFromMarkup(cost, params.markupMultiplier),
      margin: priceFromMargin(cost, params.marginPercent),
      fixed: priceFromFixed(cost, params.fixedProfit)
    };
  }
  function chosenPrice(cost, params){
    var prices = computeAllPrices(cost, params);
    var p = prices[params.pricingMethod];
    return (p==null || !isFinite(p)) ? 0 : p;
  }

  function marginTagClass(marginPercent){
    if(marginPercent >= 40) return 'sage';
    if(marginPercent >= 20) return 'mustard';
    return 'rust';
  }

  /* ===================== Stats ===================== */
  function renderStats(){
    var sheets = state.sheets;
    var n = sheets.length;
    var totalPrice = 0, totalMargin = 0, totalProfit = 0;

    sheets.forEach(function(s){
      var cost = materialsCost(s.materials) + num(s.laborHours)*num(s.hourlyRate) + num(s.packaging) + num(s.other);
      var price = chosenPrice(cost, s);
      var net = price * (1 - num(s.platformFee)/100);
      var profit = net - cost;
      totalPrice += price;
      totalProfit += profit;
      totalMargin += price > 0 ? (profit/price*100) : 0;
    });

    var html = ''
      + statBlock(n, '已建立商品數')
      + statBlock(n ? money(totalPrice/n) : money(0), '平均建議售價')
      + statBlock(n ? pct(totalMargin/n) : pct(0), '平均實際毛利率')
      + statBlock(n ? money(totalProfit/n) : money(0), '平均單件利潤');
    document.getElementById('stats').innerHTML = html;
  }
  function statBlock(num, label){
    return '<div class="stat"><div class="num">'+ escapeHtml(num) +'</div><div class="label">'+ escapeHtml(label) +'</div></div>';
  }

  /* ===================== List rendering ===================== */
  function renderList(){
    var q = document.getElementById('searchInput').value.trim().toLowerCase();
    var sheets = state.sheets
      .filter(function(s){ return !q || (s.name||'').toLowerCase().indexOf(q) !== -1; })
      .slice()
      .sort(function(a,b){ return (b.updatedAt||0) - (a.updatedAt||0); });

    var container = document.getElementById('sheetList');

    if(sheets.length === 0){
      container.innerHTML = '<div class="empty">'
        + '<span class="mark">🧮</span>'
        + '<h3>' + (state.sheets.length===0 ? '還沒有任何成本表' : '沒有符合條件的商品') + '</h3>'
        + '<div>' + (state.sheets.length===0 ? '按下「＋ 新增商品成本表」開始算第一個商品的成本吧' : '換個關鍵字試試看') + '</div>'
        + '</div>';
      return;
    }

    container.innerHTML = sheets.map(renderCard).join('');
    container.querySelectorAll('[data-edit]').forEach(function(btn){
      btn.addEventListener('click', function(){ openForm(btn.getAttribute('data-edit')); });
    });
  }

  function renderCard(s){
    var mCost = materialsCost(s.materials);
    var lCost = num(s.laborHours)*num(s.hourlyRate);
    var cost = mCost + lCost + num(s.packaging) + num(s.other);
    var price = chosenPrice(cost, s);
    var fee = num(s.platformFee);
    var net = price * (1 - fee/100);
    var profit = net - cost;
    var marginPct = price > 0 ? (profit/price*100) : 0;

    var methodDetail = s.pricingMethod === 'markup' ? ('×' + num(s.markupMultiplier))
      : s.pricingMethod === 'margin' ? (num(s.marginPercent) + '%')
      : money(s.fixedProfit);

    return '<div class="card">'
      + '<div class="card-head">'
        + '<span class="swatch" style="background:'+ (marginPct>=40 ? 'var(--sage)' : marginPct>=20 ? 'var(--mustard)' : 'var(--rust)') +'"></span>'
        + '<div class="who">'
          + '<p class="customer">' + escapeHtml(s.name || '未命名商品') + '</p>'
          + '<div class="meta"><span class="method-badge">' + METHOD_LABEL[s.pricingMethod] + ' ' + methodDetail + '</span>'
          + (fee ? '<span>平台費 ' + fee + '%</span>' : '') + '</div>'
        + '</div>'
        + '<div class="total"><div class="amt">' + money(price) + '</div><div class="amt-label">建議售價</div></div>'
      + '</div>'
      + '<div class="items">'
        + '<div class="kv-row"><span class="k">材料費</span><span class="v">' + money(mCost) + '</span></div>'
        + '<div class="kv-row"><span class="k">工時成本（' + num(s.laborHours) + ' 小時 × ' + money(s.hourlyRate) + '）</span><span class="v">' + money(lCost) + '</span></div>'
        + '<div class="kv-row"><span class="k">包材費／其他</span><span class="v">' + money(num(s.packaging)+num(s.other)) + '</span></div>'
        + '<div class="kv-row total"><span class="k">成本總計</span><span class="v">' + money(cost) + '</span></div>'
      + '</div>'
      + '<div class="tags">'
        + '<span class="tag ' + marginTagClass(marginPct) + '"><span class="dot"></span>實際毛利率 ' + pct(marginPct) + '</span>'
        + '<span class="tag grey"><span class="dot"></span>單件利潤 ' + money(profit) + '</span>'
      + '</div>'
      + '<div class="card-foot">'
        + '<div class="note">' + (s.note ? '<b>備註：</b>' + escapeHtml(s.note) : '') + '</div>'
        + '<div class="actions"><button class="btn btn-ghost btn-sm" data-edit="' + s.id + '">編輯</button></div>'
      + '</div>'
      + '</div>';
  }

  /* ===================== Form / Modal ===================== */
  var overlay = document.getElementById('overlay');

  function openForm(sheetId){
    state.editingId = sheetId || null;
    var s = sheetId ? state.sheets.find(function(x){ return x.id === sheetId; }) : null;

    document.getElementById('modalTitle').textContent = s ? '編輯商品成本表' : '新增商品成本表';
    document.getElementById('deleteSheetBtn').style.display = s ? 'inline-block' : 'none';

    document.getElementById('f_name').value = s ? s.name : '';
    document.getElementById('f_laborHours').value = s ? s.laborHours : 0;
    document.getElementById('f_hourlyRate').value = s ? s.hourlyRate : 0;
    document.getElementById('f_packaging').value = s ? s.packaging : 0;
    document.getElementById('f_other').value = s ? s.other : 0;
    document.getElementById('f_platformFee').value = s ? s.platformFee : 0;
    document.getElementById('f_note').value = s ? s.note : '';

    state.formMaterials = s && s.materials && s.materials.length
      ? s.materials.map(function(m){ return Object.assign({}, m); })
      : [{ id: uid(), name:'', unit:'', qty:1, unitCost:0 }];

    state.formParams = {
      markupMultiplier: s ? s.markupMultiplier : 1.5,
      marginPercent: s ? s.marginPercent : 40,
      fixedProfit: s ? s.fixedProfit : 300,
      pricingMethod: s ? s.pricingMethod : 'markup'
    };

    renderMaterialsEditor();
    renderCompareTable();
    recalcOutputs();

    overlay.classList.add('open');
    setTimeout(function(){ document.getElementById('f_name').focus(); }, 50);
  }

  function closeForm(){
    overlay.classList.remove('open');
    state.editingId = null;
  }

  /* ---------- Materials repeater ---------- */
  function renderMaterialsEditor(){
    var el = document.getElementById('materialsEditor');
    el.innerHTML = state.formMaterials.map(materialEditorRow).join('');

    el.querySelectorAll('[data-remove]').forEach(function(btn){
      btn.addEventListener('click', function(){
        var idx = Number(btn.getAttribute('data-remove'));
        if(state.formMaterials.length <= 1){
          toast('至少要保留一項材料');
          return;
        }
        state.formMaterials.splice(idx, 1);
        renderMaterialsEditor();
        recalcOutputs();
      });
    });
    el.querySelectorAll('[data-field]').forEach(function(input){
      input.addEventListener('input', function(){
        var idx = Number(input.getAttribute('data-idx'));
        var field = input.getAttribute('data-field');
        var val = input.value;
        state.formMaterials[idx][field] = (field==='qty' || field==='unitCost') ? Number(val) : val;
        updateMaterialSubtotal(idx);
        recalcOutputs();
      });
    });
  }

  function materialEditorRow(m, idx){
    return '<div class="item-editor" data-row="'+idx+'">'
      + '<button type="button" class="item-remove" data-remove="'+idx+'" aria-label="刪除材料">×</button>'
      + '<div class="item-grid">'
        + '<div><label>材料名稱</label><input type="text" placeholder="例如：帆布" value="'+escapeHtml(m.name)+'" data-field="name" data-idx="'+idx+'"></div>'
        + '<div><label>單位（選填）</label><input type="text" placeholder="例如：尺／公克／顆" value="'+escapeHtml(m.unit)+'" data-field="unit" data-idx="'+idx+'"></div>'
        + '<div><label>用量</label><input type="number" min="0" step="0.1" value="'+ (m.qty!=null?m.qty:1) +'" data-field="qty" data-idx="'+idx+'"></div>'
        + '<div><label>單價</label><input type="number" min="0" step="1" value="'+ (m.unitCost!=null?m.unitCost:0) +'" data-field="unitCost" data-idx="'+idx+'"></div>'
      + '</div>'
      + '<div class="item-subtotal" id="mat_subtotal_'+idx+'">小計：' + money((Number(m.qty)||0)*(Number(m.unitCost)||0)) + '</div>'
      + '</div>';
  }

  function updateMaterialSubtotal(idx){
    var m = state.formMaterials[idx];
    var elS = document.getElementById('mat_subtotal_'+idx);
    if(elS) elS.textContent = '小計：' + money((Number(m.qty)||0)*(Number(m.unitCost)||0));
  }

  document.getElementById('addMaterialBtn').addEventListener('click', function(){
    state.formMaterials.push({ id: uid(), name:'', unit:'', qty:1, unitCost:0 });
    renderMaterialsEditor();
    recalcOutputs();
  });

  /* ---------- Compare table (3 pricing methods, switchable) ---------- */
  function renderCompareTable(){
    var p = state.formParams;
    var el = document.getElementById('compareTable');
    el.innerHTML = ''
      + compareRow('markup', '加成倍率', '<input type="number" min="0" step="0.1" id="mm_multiplier" value="'+p.markupMultiplier+'">', '成本 × 倍率')
      + compareRow('margin', '目標毛利率', '<input type="number" min="0" max="99" step="1" id="mm_margin" value="'+p.marginPercent+'">', '售價的多少% 是利潤')
      + compareRow('fixed', '指定利潤金額', '<input type="number" min="0" step="10" id="mm_fixed" value="'+p.fixedProfit+'">', '每件想賺多少錢');

    el.querySelectorAll('.compare-row').forEach(function(row){
      row.addEventListener('click', function(e){
        if(e.target.tagName === 'INPUT' && e.target.type !== 'radio') return;
        var method = row.getAttribute('data-method');
        state.formParams.pricingMethod = method;
        row.querySelector('input[type="radio"]').checked = true;
        highlightActiveRow();
        recalcOutputs();
      });
    });
    document.getElementById('mm_multiplier').addEventListener('input', function(e){
      state.formParams.markupMultiplier = Number(e.target.value)||0;
      recalcOutputs();
    });
    document.getElementById('mm_margin').addEventListener('input', function(e){
      state.formParams.marginPercent = Number(e.target.value)||0;
      recalcOutputs();
    });
    document.getElementById('mm_fixed').addEventListener('input', function(e){
      state.formParams.fixedProfit = Number(e.target.value)||0;
      recalcOutputs();
    });
    highlightActiveRow();
  }

  function compareRow(method, label, inputHtml, hint){
    return '<div class="compare-row" data-method="'+method+'">'
      + '<label class="method-label"><input type="radio" name="pricingMethodRadio" value="'+method+'"' + (state.formParams.pricingMethod===method?' checked':'') + '>' + label + '</label>'
      + '<div class="param-input"><label>' + hint + '</label>' + inputHtml + '</div>'
      + '<div class="out"><span class="price" id="out_price_'+method+'">NT$ 0</span>建議售價</div>'
      + '<div class="out margin"><span class="price" id="out_margin_'+method+'">0%</span>毛利率</div>'
      + '</div>';
  }

  function highlightActiveRow(){
    document.querySelectorAll('.compare-row').forEach(function(row){
      row.classList.toggle('active', row.getAttribute('data-method') === state.formParams.pricingMethod);
    });
  }

  /* ---------- Live cost + price computation ---------- */
  function currentCost(){
    return materialsCost(state.formMaterials)
      + num(document.getElementById('f_laborHours').value) * num(document.getElementById('f_hourlyRate').value)
      + num(document.getElementById('f_packaging').value)
      + num(document.getElementById('f_other').value);
  }

  function recalcOutputs(){
    var cost = currentCost();
    document.getElementById('costTotalOut').textContent = money(cost);

    var prices = computeAllPrices(cost, state.formParams);
    ['markup','margin','fixed'].forEach(function(method){
      var p = prices[method];
      var priceEl = document.getElementById('out_price_' + method);
      var marginEl = document.getElementById('out_margin_' + method);
      if(p == null || !isFinite(p)){
        priceEl.textContent = '無法計算';
        marginEl.textContent = '—';
      }else{
        priceEl.textContent = money(p);
        marginEl.textContent = pct(marginOfPrice(cost, p));
      }
    });

    var price = chosenPrice(cost, state.formParams);
    var fee = num(document.getElementById('f_platformFee').value);
    var net = price * (1 - fee/100);
    var profit = net - cost;
    var marginPct = price > 0 ? (profit/price*100) : 0;

    var panel = document.getElementById('resultPanel');
    panel.innerHTML = ''
      + '<div class="r-row main"><span>主要建議售價（' + METHOD_LABEL[state.formParams.pricingMethod] + '）</span><span class="amt">' + money(price) + '</span></div>'
      + '<hr>'
      + (fee ? ('<div class="r-row"><span>平台手續費 ' + fee + '% 後實收</span><span class="amt">' + money(net) + '</span></div>') : '')
      + '<div class="r-row"><span>實際利潤（扣手續費後）</span><span class="amt">' + money(profit) + '</span></div>'
      + '<div class="r-row"><span>實際毛利率</span><span class="amt">' + pct(marginPct) + '</span></div>';
  }

  ['f_laborHours','f_hourlyRate','f_packaging','f_other','f_platformFee'].forEach(function(id){
    document.getElementById(id).addEventListener('input', recalcOutputs);
  });

  /* ---------- Save / delete ---------- */
  document.getElementById('sheetForm').addEventListener('submit', function(e){
    e.preventDefault();

    var cleanMaterials = state.formMaterials
      .map(function(m){
        return { id: m.id || uid(), name:(m.name||'').trim(), unit:(m.unit||'').trim(), qty:Number(m.qty)||0, unitCost:Number(m.unitCost)||0 };
      })
      .filter(function(m){ return m.name || m.qty || m.unitCost; });

    if(cleanMaterials.length === 0){
      toast('請至少填寫一項材料');
      return;
    }

    var data = {
      name: document.getElementById('f_name').value.trim() || '未命名商品',
      materials: cleanMaterials,
      laborHours: Number(document.getElementById('f_laborHours').value)||0,
      hourlyRate: Number(document.getElementById('f_hourlyRate').value)||0,
      packaging: Number(document.getElementById('f_packaging').value)||0,
      other: Number(document.getElementById('f_other').value)||0,
      platformFee: Number(document.getElementById('f_platformFee').value)||0,
      pricingMethod: state.formParams.pricingMethod,
      markupMultiplier: state.formParams.markupMultiplier,
      marginPercent: state.formParams.marginPercent,
      fixedProfit: state.formParams.fixedProfit,
      note: document.getElementById('f_note').value.trim()
    };

    if(state.editingId){
      var existing = state.sheets.find(function(s){ return s.id === state.editingId; });
      Object.assign(existing, data);
      existing.updatedAt = Date.now();
      toast('已更新成本表');
    }else{
      data.id = uid();
      data.createdAt = Date.now();
      data.updatedAt = Date.now();
      state.sheets.push(data);
      toast('已新增成本表');
    }

    saveSheets(state.sheets);
    closeForm();
    renderStats();
    renderList();
  });

  document.getElementById('deleteSheetBtn').addEventListener('click', function(){
    if(!state.editingId) return;
    if(!confirm('確定要刪除這個商品的成本表嗎？此動作無法復原。')) return;
    state.sheets = state.sheets.filter(function(s){ return s.id !== state.editingId; });
    saveSheets(state.sheets);
    closeForm();
    renderStats();
    renderList();
    toast('已刪除成本表');
  });

  document.getElementById('openAddBtn').addEventListener('click', function(){ openForm(null); });
  document.getElementById('cancelBtn').addEventListener('click', closeForm);
  document.getElementById('modalCloseBtn').addEventListener('click', closeForm);
  overlay.addEventListener('click', function(e){ if(e.target === overlay) closeForm(); });
  document.addEventListener('keydown', function(e){ if(e.key === 'Escape' && overlay.classList.contains('open')) closeForm(); });

  document.getElementById('searchInput').addEventListener('input', renderList);

  /* ===================== Backup: export / import ===================== */
  function todayStr(){
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }

  document.getElementById('exportJsonBtn').addEventListener('click', function(){
    var blob = new Blob([JSON.stringify(state.sheets, null, 2)], {type:'application/json'});
    downloadBlob(blob, '手作成本備份_' + todayStr() + '.json');
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
        var mode = confirm('要「取代」目前所有成本表嗎？\n按「確定」＝取代全部\n按「取消」＝合併加入（保留現有資料）');
        if(mode){
          state.sheets = data;
        }else{
          var existingIds = new Set(state.sheets.map(function(s){return s.id;}));
          data.forEach(function(s){
            if(!s.id || existingIds.has(s.id)) s.id = uid();
            state.sheets.push(s);
          });
        }
        saveSheets(state.sheets);
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
    var rows = [['商品名稱','材料名稱','單位','用量','單價','材料小計','成本總計','工時','時薪','包材費','其他成本','平台手續費%','定價方式','建議售價','平台費後實收','實際利潤','實際毛利率%','備註']];
    state.sheets.forEach(function(s){
      var mCost = materialsCost(s.materials);
      var lCost = num(s.laborHours)*num(s.hourlyRate);
      var cost = mCost + lCost + num(s.packaging) + num(s.other);
      var price = chosenPrice(cost, s);
      var net = price * (1 - num(s.platformFee)/100);
      var profit = net - cost;
      var marginPct = price > 0 ? (profit/price*100) : 0;

      (s.materials||[]).forEach(function(m, idx){
        rows.push([
          s.name, m.name, m.unit, m.qty, m.unitCost, (Number(m.qty)||0)*(Number(m.unitCost)||0),
          idx===0 ? cost.toFixed(0) : '',
          idx===0 ? s.laborHours : '',
          idx===0 ? s.hourlyRate : '',
          idx===0 ? s.packaging : '',
          idx===0 ? s.other : '',
          idx===0 ? s.platformFee : '',
          idx===0 ? METHOD_LABEL[s.pricingMethod] : '',
          idx===0 ? price.toFixed(0) : '',
          idx===0 ? net.toFixed(0) : '',
          idx===0 ? profit.toFixed(0) : '',
          idx===0 ? marginPct.toFixed(1) : '',
          idx===0 ? s.note : ''
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
    downloadBlob(blob, '手作成本表_' + todayStr() + '.csv');
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
})();
