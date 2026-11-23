/* TAGADDOD Delta Reps - local oil sample analysis + optional sheet sync */
(() => {
  "use strict";

  const STORAGE_KEY = "delta_local_lab_analyses_v1";
  const $ = (id) => document.getElementById(id);
  const num = (id) => { const v = Number($(id)?.value); return Number.isFinite(v) ? v : 0; };
  const cleanFloat = (v) => Math.round((Number(v||0)+Number.EPSILON)*1e9)/1e9;

  function computeAnalysis() {
    const clientName = ($("labClientName")?.value||"").trim() || "عميل بدون اسم";
    const acidsInput = num("labAcids");
    const emptyWeight = num("labEmptyWeight");
    const beforeBoil = num("labBeforeBoil");
    const afterBoil = num("labAfterBoil");
    const sedimentWeight = num("labSedimentWeight");
    const sampleDenom = cleanFloat(beforeBoil - emptyWeight);
    const waterDiff = cleanFloat(beforeBoil - afterBoil);
    const sedimentDiff = cleanFloat(sedimentWeight - emptyWeight);
    const waterPct = sampleDenom !== 0 ? Math.max(0, cleanFloat((waterDiff/sampleDenom)*100)) : 0;
    const sedimentPct = sampleDenom !== 0 ? Math.max(0, cleanFloat((sedimentDiff/sampleDenom)*100)) : 0;
    const acidPct = Math.max(0, cleanFloat(acidsInput));
    const acidPenalty = acidPct > 3 ? cleanFloat((acidPct-3)*10) : 0;
    const wsSum = cleanFloat(waterPct + sedimentPct);
    const wsPenalty = wsSum > 2 ? cleanFloat((wsSum-2)*10) : 0;
    const deductionPerTon = Math.round(cleanFloat(acidPenalty + wsPenalty));
    return { clientName, emptyWeight, beforeBoil, afterBoil, sedimentWeight, waterPct, sedimentPct, acidPct, deductionPerTon };
  }

  function updateDisplay() {
    const r = computeAnalysis();
    if ($("resWaterPct")) $("resWaterPct").textContent = `${r.waterPct.toFixed(2)}%`;
    if ($("resSedimentPct")) $("resSedimentPct").textContent = `${r.sedimentPct.toFixed(2)}%`;
    if ($("resAcidPct")) $("resAcidPct").textContent = `${r.acidPct.toFixed(2)}%`;
    if ($("resDeductionPerTon")) $("resDeductionPerTon").textContent = String(r.deductionPerTon);
  }

  function clearLabInputs() {
    ["labClientName","labAcids","labEmptyWeight","labBeforeBoil","labAfterBoil","labSedimentWeight"].forEach((id)=>{ if ($(id)) $(id).value = ""; });
    updateDisplay();
    window.showAppToast?.("تم تفريغ الحقول.", "success");
  }

  function readSaved() { try { const l = JSON.parse(localStorage.getItem(STORAGE_KEY)||"[]"); return Array.isArray(l)?l:[]; } catch(_) { return []; } }
  function writeSaved(l) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(l.slice(0,100))); } catch(_){} }

  function escapeHtml(v) {
    return String(v??"").replace(/[&<>"']/g,(ch)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  }

  function renderSavedLabAnalyses() {
    const tbody = $("savedLabAnalysisBody"); if (!tbody) return;
    const items = readSaved();
    if (!items.length) { tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">لا توجد تحاليل محفوظة حتى الآن.</td></tr>`; return; }
    tbody.innerHTML = items.map((it, i)=>`
      <tr>
        <td data-label="العميل">${escapeHtml(it.clientName)}</td>
        <td data-label="الأحماض">${Number(it.acidPct||0).toFixed(2)}%</td>
        <td data-label="المياه">${Number(it.waterPct||0).toFixed(2)}%</td>
        <td data-label="الرواسب">${Number(it.sedimentPct||0).toFixed(2)}%</td>
        <td data-label="خصم/طن">${Number(it.deductionPerTon||0)} كجم</td>
        <td data-label="إجراء"><button type="button" class="btn btn-danger btn-sm del-lab-btn" data-index="${i}">حذف</button></td>
      </tr>`).join("");
    tbody.querySelectorAll(".del-lab-btn").forEach((b)=>{
      b.addEventListener("click", ()=>{
        const idx = Number(b.dataset.index);
        writeSaved(readSaved().filter((_,i)=>i!==idx));
        renderSavedLabAnalyses();
        window.showAppToast?.("تم الحذف.", "success");
      });
    });
  }
  window.renderSavedLabAnalyses = renderSavedLabAnalyses;

  async function saveCurrentAnalysis() {
    const res = computeAnalysis();
    const list = readSaved();
    list.unshift({ ...res, savedAt: new Date().toISOString() });
    writeSaved(list);
    renderSavedLabAnalyses();
    window.showAppToast?.("تم حفظ التحليل على الجهاز.", "success");
    // sync to sheet (optional, silent)
    try {
      if (navigator.onLine && typeof window.deltaPost === "function") {
        await window.deltaPost("add_analysis", { analysis: res });
      }
    } catch(_) {}
  }

  function drawRoundedRect(ctx,x,y,w,h,r) {
    const rad = Math.min(r,w/2,h/2);
    ctx.beginPath();
    ctx.moveTo(x+rad,y);
    ctx.arcTo(x+w,y,x+w,y+h,rad);
    ctx.arcTo(x+w,y+h,x,y+h,rad);
    ctx.arcTo(x,y+h,x,y,rad);
    ctx.arcTo(x,y,x+w,y,rad);
    ctx.closePath();
  }
  function fmtWeightDisplay(v) { return Number.isInteger(v)?String(v):Number(v).toFixed(2).replace(/\.?0+$/,""); }

  async function shareAnalysisImage() {
    const res = computeAnalysis();
    const canvas = document.createElement("canvas");
    canvas.width = 960; canvas.height = 600;
    const ctx = canvas.getContext("2d");
    ctx.direction = "rtl"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = "#e5e7eb"; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle = "#ffffff";
    drawRoundedRect(ctx,16,16,canvas.width-32,canvas.height-32,24); ctx.fill();
    ctx.lineWidth = 3.5; ctx.strokeStyle = "#881337"; ctx.stroke();

    const hasClient = (($("labClientName")?.value||"").trim().length>0);
    ctx.fillStyle = "#1f2937"; ctx.font = "800 32px 'Segoe UI', Tahoma, sans-serif";
    ctx.fillText(hasClient?`تحليل عينة - ${res.clientName}`:"تحليل عينة", canvas.width/2, 64);
    ctx.strokeStyle = "#d1d5db"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(140,100); ctx.lineTo(canvas.width-140,100); ctx.stroke();

    const wgX=44, wgY=120, wgW=canvas.width-88, wgH=124;
    ctx.fillStyle = "#f3f4f6"; ctx.strokeStyle = "#cbd5e1"; ctx.lineWidth = 1.8;
    drawRoundedRect(ctx,wgX,wgY,wgW,wgH,18); ctx.fill(); ctx.stroke();

    const weights = [
      {label:"وزن فارغ", val:fmtWeightDisplay(res.emptyWeight)},
      {label:"قبل الغليان", val:fmtWeightDisplay(res.beforeBoil)},
      {label:"بعد الغليان", val:fmtWeightDisplay(res.afterBoil)},
      {label:"وزن الرواسب", val:fmtWeightDisplay(res.sedimentWeight)}
    ];
    const wGap=14, wPad=14;
    const wCardW=(wgW-wPad*2-wGap*(weights.length-1))/weights.length;
    const wCardH=wgH-wPad*2, wCardY=wgY+wPad;
    weights.forEach((it,idx)=>{
      const cardX = wgX+wgW-wPad-(idx+1)*wCardW-idx*wGap;
      ctx.fillStyle = "#ffffff"; ctx.strokeStyle = "#9ca3af"; ctx.lineWidth = 1.5;
      drawRoundedRect(ctx,cardX,wCardY,wCardW,wCardH,13); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#4b5563"; ctx.font = "700 16px 'Segoe UI', Tahoma, sans-serif";
      ctx.fillText(it.label, cardX+wCardW/2, wCardY+30);
      ctx.fillStyle = "#1f2937"; ctx.font = "800 24px 'Segoe UI', Tahoma, sans-serif";
      ctx.fillText(it.val, cardX+wCardW/2, wCardY+68);
    });

    const rgX=44, rgY=262, rgW=canvas.width-88, rgH=140;
    ctx.fillStyle = "#f3f4f6"; ctx.strokeStyle = "#cbd5e1"; ctx.lineWidth = 1.8;
    drawRoundedRect(ctx,rgX,rgY,rgW,rgH,18); ctx.fill(); ctx.stroke();
    const ratios = [
      {label:"نسبة المياه", val:`${res.waterPct.toFixed(2)}%`},
      {label:"نسبة الرواسب", val:`${res.sedimentPct.toFixed(2)}%`},
      {label:"نسبة الأحماض", val:`${res.acidPct.toFixed(2)}%`}
    ];
    const rGap=18, rPad=16;
    const rCardW=(rgW-rPad*2-rGap*2)/3;
    const rCardH=rgH-rPad*2, rCardY=rgY+rPad;
    ratios.forEach((it,idx)=>{
      const cardX = rgX+rgW-rPad-(idx+1)*rCardW-idx*rGap;
      ctx.fillStyle = "#ffffff"; ctx.strokeStyle = "#9ca3af"; ctx.lineWidth = 1.6;
      drawRoundedRect(ctx,cardX,rCardY,rCardW,rCardH,14); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#4b5563"; ctx.font = "700 18px 'Segoe UI', Tahoma, sans-serif";
      ctx.fillText(it.label, cardX+rCardW/2, rCardY+34);
      ctx.fillStyle = "#881337"; ctx.font = "800 28px 'Segoe UI', Tahoma, sans-serif";
      ctx.fillText(it.val, cardX+rCardW/2, rCardY+78);
    });

    const ddW=380, ddH=98;
    const ddX=(canvas.width-ddW)/2, ddY=422;
    ctx.fillStyle = "#881337"; ctx.strokeStyle = "#4c0519"; ctx.lineWidth = 2.4;
    drawRoundedRect(ctx,ddX,ddY,ddW,ddH,16); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#ffe4e6"; ctx.font = "700 18px 'Segoe UI', Tahoma, sans-serif";
    ctx.fillText("الخصم بالطن (كجم/طن)", canvas.width/2, ddY+29);
    ctx.fillStyle = "#ffffff"; ctx.font = "800 30px 'Segoe UI', Tahoma, sans-serif";
    ctx.fillText(String(res.deductionPerTon), canvas.width/2, ddY+67);

    ctx.direction = "ltr"; ctx.fillStyle = "#6b7280"; ctx.font = "600 14px 'Segoe UI', Tahoma, sans-serif";
    ctx.fillText("Designed & Structured by. ALI RAGAB - TAGADDOD", canvas.width/2, canvas.height-34);

    const dataUrl = canvas.toDataURL("image/png");
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], `تحليل_${res.clientName.replace(/\s+/g,"_")}.png`, {type:"image/png"});
      if (navigator.canShare && navigator.canShare({files:[file]})) {
        await navigator.share({files:[file], title:"تحليل عينة زيت"});
        window.showAppToast?.("تمت المشاركة.", "success");
        return;
      }
    } catch(_) {}
    const link = document.createElement("a");
    link.href = dataUrl; link.download = `تحليل_${res.clientName.replace(/\s+/g,"_")}.png`;
    link.click();
    window.showAppToast?.("تم حفظ الصورة.", "success");
  }

  document.addEventListener("DOMContentLoaded", ()=>{
    ["labClientName","labAcids","labEmptyWeight","labBeforeBoil","labAfterBoil","labSedimentWeight"].forEach((id)=>{
      $(id)?.addEventListener("input", updateDisplay);
      $(id)?.addEventListener("change", updateDisplay);
    });
    $("saveLabAnalysisBtn")?.addEventListener("click", saveCurrentAnalysis);
    $("shareLabImageBtn")?.addEventListener("click", shareAnalysisImage);
    $("clearLabFormBtn")?.addEventListener("click", clearLabInputs);
    updateDisplay();
    renderSavedLabAnalyses();
  });
})();
