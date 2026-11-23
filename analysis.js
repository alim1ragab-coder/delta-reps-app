/* TAGADDOD Delta Reps - local oil sample analysis, storage & share image */
(() => {
  "use strict";

  const STORAGE_KEY = "delta_local_lab_analyses_v1";
  const $ = (id) => document.getElementById(id);
  const num = (id) => {
    const v = Number($(id)?.value);
    return Number.isFinite(v) ? v : 0;
  };

  function computeAnalysis() {
    const clientName = ($("labClientName")?.value || "").trim() || "عميل بدون اسم";
    const acidsInput = num("labAcids");
    const emptyWeight = num("labEmptyWeight");
    const beforeBoil = num("labBeforeBoil");
    const afterBoil = num("labAfterBoil");
    const sedimentWeight = num("labSedimentWeight");

    const sampleBefore = beforeBoil - emptyWeight;
    const waterPct = sampleBefore > 0 ? Math.max(0, ((beforeBoil - afterBoil) / sampleBefore) * 100) : 0;
    const sedimentPct = sampleBefore > 0 ? Math.max(0, (sedimentWeight / sampleBefore) * 100) : 0;
    const acidPct = Math.max(0, acidsInput);

    // السماح للأحماض 3%، والسماح للمياه والرواسب معًا 2%، وكل 1% زيادة = 10 كجم/طن
    const excessAcid = Math.max(0, acidPct - 3);
    const excessWaterSediment = Math.max(0, (waterPct + sedimentPct) - 2);
    const deductionPerTon = Math.round((excessAcid + excessWaterSediment) * 10);

    return {
      clientName,
      emptyWeight,
      beforeBoil,
      afterBoil,
      sedimentWeight,
      waterPct,
      sedimentPct,
      acidPct,
      deductionPerTon
    };
  }

  function updateDisplay() {
    const res = computeAnalysis();
    if ($("resWaterPct")) $("resWaterPct").textContent = `${res.waterPct.toFixed(2)}%`;
    if ($("resSedimentPct")) $("resSedimentPct").textContent = `${res.sedimentPct.toFixed(2)}%`;
    if ($("resAcidPct")) $("resAcidPct").textContent = `${res.acidPct.toFixed(2)}%`;
    if ($("resDeductionPerTon")) $("resDeductionPerTon").textContent = String(res.deductionPerTon);
  }

  function readSaved() {
    try {
      const list = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(list) ? list : [];
    } catch (_) {
      return [];
    }
  }

  function writeSaved(list) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, 100)));
    } catch (_) {}
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[ch]));
  }

  function renderSavedLabAnalyses() {
    const tbody = $("savedLabAnalysisBody");
    if (!tbody) return;
    const items = readSaved();
    if (!items.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">لا توجد تحاليل محفوظة على هذا الجهاز حتى الآن.</td></tr>`;
      return;
    }
    tbody.innerHTML = items.map((item, idx) => `
      <tr>
        <td data-label="العميل">${escapeHtml(item.clientName)}</td>
        <td data-label="الأحماض">${Number(item.acidPct || 0).toFixed(2)}%</td>
        <td data-label="المياه">${Number(item.waterPct || 0).toFixed(2)}%</td>
        <td data-label="الرواسب">${Number(item.sedimentPct || 0).toFixed(2)}%</td>
        <td data-label="خصم/طن">${Number(item.deductionPerTon || 0)} كجم</td>
        <td data-label="إجراء">
          <button type="button" class="btn btn-danger btn-sm del-lab-btn" data-index="${idx}">حذف</button>
        </td>
      </tr>
    `).join("");

    tbody.querySelectorAll(".del-lab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.dataset.index);
        const list = readSaved().filter((_, i) => i !== idx);
        writeSaved(list);
        renderSavedLabAnalyses();
        window.showAppToast?.("تم حذف التحليل المحفوظ.", "success");
      });
    });
  }
  window.renderSavedLabAnalyses = renderSavedLabAnalyses;

  function saveCurrentAnalysis() {
    const res = computeAnalysis();
    const list = readSaved();
    list.unshift({
      ...res,
      savedAt: new Date().toISOString()
    });
    writeSaved(list);
    renderSavedLabAnalyses();
    window.showAppToast?.("تم حفظ التحليل على الجهاز.", "success");
  }

  function drawRoundedRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  async function shareAnalysisImage() {
    const res = computeAnalysis();
    const canvas = document.createElement("canvas");
    canvas.width = 900;
    canvas.height = 1040;
    const ctx = canvas.getContext("2d");

    // خلفية رصاصي فاتح
    ctx.fillStyle = "#e5e7eb";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // الكارت الرئيسي أبيض بإطار أحمر
    ctx.fillStyle = "#ffffff";
    drawRoundedRect(ctx, 36, 36, 828, 968, 28);
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = "#dc2626";
    ctx.stroke();

    // هيدر علوي رصاصي غامق مع شريط أحمر
    ctx.fillStyle = "#1f2937";
    drawRoundedRect(ctx, 36, 36, 828, 120, 28);
    ctx.fill();
    ctx.fillStyle = "#dc2626";
    ctx.fillRect(36, 146, 828, 10);

    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 36px Arial, sans-serif";
    ctx.fillText("تقرير تحليل عينة زيت · TAGADDOD", 450, 96);

    ctx.fillStyle = "#d1d5db";
    ctx.font = "bold 20px Arial, sans-serif";
    ctx.fillText(`العميل: ${res.clientName}`, 450, 132);

    // صندوق الأوزان بالرصاصي والأبيض
    ctx.fillStyle = "#f3f4f6";
    drawRoundedRect(ctx, 70, 185, 760, 195, 20);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#9ca3af";
    ctx.stroke();

    const weights = [
      { label: "وزن فارغ", val: res.emptyWeight.toFixed(2) },
      { label: "قبل الغليان", val: res.beforeBoil.toFixed(2) },
      { label: "بعد الغليان", val: res.afterBoil.toFixed(2) },
      { label: "وزن الرواسب", val: res.sedimentWeight.toFixed(2) }
    ];
    weights.forEach((w, i) => {
      const boxW = 166;
      const gap = 16;
      const startX = 90 + i * (boxW + gap);
      ctx.fillStyle = "#ffffff";
      drawRoundedRect(ctx, startX, 208, boxW, 148, 14);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#d1d5db";
      ctx.stroke();

      ctx.fillStyle = "#4b5563";
      ctx.font = "bold 20px Arial, sans-serif";
      ctx.fillText(w.label, startX + boxW / 2, 252);

      ctx.fillStyle = "#111827";
      ctx.font = "bold 28px Arial, sans-serif";
      ctx.fillText(w.val, startX + boxW / 2, 315);
    });

    // صندوق النسب التلاتة جنب بعض
    ctx.fillStyle = "#f3f4f6";
    drawRoundedRect(ctx, 70, 410, 760, 210, 20);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#9ca3af";
    ctx.stroke();

    const metrics = [
      { label: "نسبة المياه", val: `${res.waterPct.toFixed(2)}%` },
      { label: "نسبة الرواسب", val: `${res.sedimentPct.toFixed(2)}%` },
      { label: "نسبة الأحماض", val: `${res.acidPct.toFixed(2)}%` }
    ];
    metrics.forEach((m, i) => {
      const boxW = 226;
      const gap = 18;
      const startX = 90 + i * (boxW + gap);
      ctx.fillStyle = "#ffffff";
      drawRoundedRect(ctx, startX, 435, boxW, 160, 16);
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = "#dc2626";
      ctx.stroke();

      ctx.fillStyle = "#374151";
      ctx.font = "bold 22px Arial, sans-serif";
      ctx.fillText(m.label, startX + boxW / 2, 485);

      ctx.fillStyle = "#b91c1c";
      ctx.font = "bold 34px Arial, sans-serif";
      ctx.fillText(m.val, startX + boxW / 2, 555);
    });

    // صندوق الخصم بالطن باللون الأحمر الواضح
    ctx.fillStyle = "#dc2626";
    drawRoundedRect(ctx, 150, 660, 600, 175, 22);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#7f1d1d";
    ctx.stroke();

    ctx.fillStyle = "#fef2f2";
    ctx.font = "bold 26px Arial, sans-serif";
    ctx.fillText("الخصم بالطن (كجم / طن)", 450, 715);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 54px Arial, sans-serif";
    ctx.fillText(`${res.deductionPerTon} كجم`, 450, 792);

    // الفوتر
    ctx.fillStyle = "#4b5563";
    ctx.font = "bold 19px Arial, sans-serif";
    ctx.fillText("Designed & Structured by ALI RAGAB - TAGADDOD", 450, 910);

    const dataUrl = canvas.toDataURL("image/png");
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], `تحليل_${res.clientName.replace(/\s+/g, "_")}.png`, { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: "تحليل عينة زيت",
          text: `تحليل عينة: ${res.clientName} - الخصم: ${res.deductionPerTon} كجم/طن`
        });
        window.showAppToast?.("تمت مشاركة صورة التحليل بنجاح.", "success");
        return;
      }
    } catch (_) {}

    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `تحليل_${res.clientName.replace(/\s+/g, "_")}.png`;
    link.click();
    window.showAppToast?.("تم حفظ صورة التحليل على الجهاز.", "success");
  }

  document.addEventListener("DOMContentLoaded", () => {
    ["labClientName", "labAcids", "labEmptyWeight", "labBeforeBoil", "labAfterBoil", "labSedimentWeight"].forEach((id) => {
      $(id)?.addEventListener("input", updateDisplay);
      $(id)?.addEventListener("change", updateDisplay);
    });
    $("saveLabAnalysisBtn")?.addEventListener("click", saveCurrentAnalysis);
    $("shareLabImageBtn")?.addEventListener("click", shareAnalysisImage);
    updateDisplay();
    renderSavedLabAnalyses();
  });
})();
