/* TAGADDOD Delta Reps - local oil sample analysis, storage & share image */
(() => {
  "use strict";

  const STORAGE_KEY = "delta_local_lab_analyses_v1";
  const $ = (id) => document.getElementById(id);
  const deletingAnalysisIds = new Set();
  let hasCalculated = false;
  async function withAnalysisButtonProgress(button, loadingMessage, action) {
    if (!button || button.dataset.actionPending === "true") return false;
    const originalText = button.textContent;
    const finishProgress = window.beginAppActionProgress?.(loadingMessage) || (() => {});
    button.dataset.actionPending = "true";
    button.setAttribute("aria-busy", "true");
    button.textContent = loadingMessage;
    try {
      return await action();
    } catch (error) {
      window.showAppToast?.(error.message || "تعذر تنفيذ العملية.", "error", 6000);
      return false;
    } finally {
      finishProgress();
      delete button.dataset.actionPending;
      button.removeAttribute("aria-busy");
      if (button.isConnected) button.textContent = originalText;
    }
  }
  const num = (id) => {
    const v = Number($(id)?.value);
    return Number.isFinite(v) ? v : 0;
  };

  const cleanFloat = (v) => Math.round((Number(v || 0) + Number.EPSILON) * 1e9) / 1e9;

  function computeAnalysis() {
    const clientName = ($("labClientName")?.value || "").trim() || "عميل بدون اسم";
    const acidsInput = num("labAcids");
    const emptyWeight = num("labEmptyWeight");
    const beforeBoil = num("labBeforeBoil");
    const afterBoil = num("labAfterBoil");
    const sedimentWeight = num("labSedimentWeight");

    const sampleDenom = cleanFloat(beforeBoil - emptyWeight);
    const waterDiff = cleanFloat(beforeBoil - afterBoil);
    const sedimentDiff = cleanFloat(sedimentWeight - emptyWeight);

    const waterPct = sampleDenom !== 0 ? Math.max(0, cleanFloat((waterDiff / sampleDenom) * 100)) : 0;
    const sedimentPct = sampleDenom !== 0 ? Math.max(0, cleanFloat((sedimentDiff / sampleDenom) * 100)) : 0;
    const acidPct = Math.max(0, cleanFloat(acidsInput));

    const acidPenalty = acidPct > 3 ? cleanFloat((acidPct - 3) * 10) : 0;
    const wsSum = cleanFloat(waterPct + sedimentPct);
    const wsPenalty = wsSum > 2 ? cleanFloat((wsSum - 2) * 10) : 0;
    const deductionPerTon = Math.round(cleanFloat(acidPenalty + wsPenalty));

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
    if (!hasCalculated) {
      if ($("resWaterPct")) $("resWaterPct").textContent = "0.00%";
      if ($("resSedimentPct")) $("resSedimentPct").textContent = "0.00%";
      if ($("resAcidPct")) $("resAcidPct").textContent = "0.00%";
      if ($("resDeductionPerTon")) $("resDeductionPerTon").textContent = "0";
      return;
    }
    const res = computeAnalysis();
    if ($("resWaterPct")) $("resWaterPct").textContent = `${res.waterPct.toFixed(2)}%`;
    if ($("resSedimentPct")) $("resSedimentPct").textContent = `${res.sedimentPct.toFixed(2)}%`;
    if ($("resAcidPct")) $("resAcidPct").textContent = `${res.acidPct.toFixed(2)}%`;
    if ($("resDeductionPerTon")) $("resDeductionPerTon").textContent = String(res.deductionPerTon);
  }

  function clearLabInputs() {
    ["labClientName", "labAcids", "labEmptyWeight", "labBeforeBoil", "labAfterBoil", "labSedimentWeight"].forEach((id) => {
      if ($(id)) $(id).value = "";
    });
    hasCalculated = false;
    updateDisplay();
    window.showAppToast?.("تم تفريغ حقول التحليل.", "success");
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
    tbody.innerHTML = items.map((item, idx) => {
      const isDeleting = deletingAnalysisIds.has(item.id || `local:${idx}`);
      return `
        <tr>
          <td data-label="العميل">${escapeHtml(item.clientName)}</td>
          <td data-label="الأحماض">${Number(item.acidPct || 0).toFixed(2)}%</td>
          <td data-label="المياه">${Number(item.waterPct || 0).toFixed(2)}%</td>
          <td data-label="الرواسب">${Number(item.sedimentPct || 0).toFixed(2)}%</td>
          <td data-label="خصم/طن">${Number(item.deductionPerTon || 0)} كجم</td>
          <td data-label="إجراء">
            <button type="button" class="btn btn-danger btn-sm del-lab-btn" data-index="${idx}" ${isDeleting ? 'disabled aria-busy="true"' : ""}>${isDeleting ? "جاري الحذف..." : "حذف"}</button>
          </td>
        </tr>
      `;
    }).join("");

    tbody.querySelectorAll(".del-lab-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const idx = Number(btn.dataset.index);
        const list = readSaved();
        const item = list[idx];
        if (!item) return;
        const deletionKey = item.id || `local:${idx}`;
        if (deletingAnalysisIds.has(deletionKey)) return;
        deletingAnalysisIds.add(deletionKey);
        const finishProgress = window.beginAppActionProgress?.("جاري حذف التحليل...") || (() => {});
        btn.disabled = true;
        btn.setAttribute("aria-busy", "true");
        btn.textContent = "جاري الحذف...";
        let deleted = false;
        try {
          if (item.id && typeof window.deleteServerAnalysis === "function") {
            if (!await window.deleteServerAnalysis(item.id)) return;
          }
          const current = readSaved();
          const remaining = item.id
            ? current.filter((entry) => entry.id !== item.id)
            : current.filter((_, currentIndex) => currentIndex !== idx);
          writeSaved(remaining);
          renderSavedLabAnalyses();
          deleted = true;
          window.showAppToast?.("تم حذف التحليل المحفوظ.", "success");
        } finally {
          finishProgress();
          deletingAnalysisIds.delete(deletionKey);
          if (!deleted && btn.isConnected) {
            btn.disabled = false;
            btn.removeAttribute("aria-busy");
            btn.textContent = "حذف";
          }
        }
      });
    });
  }
  window.renderSavedLabAnalyses = renderSavedLabAnalyses;

  window.mergeServerAnalyses = function (items) {
    if (!Array.isArray(items)) return;
    const local = readSaved();
    const withoutLegacyDuplicates = local.filter((item) => item.id);
    const server = items.map((item) => ({
      id: item.id,
      clientName: item.clientName,
      emptyWeight: item.emptyWeight,
      beforeBoil: item.beforeBoil,
      afterBoil: item.afterBoil,
      sedimentWeight: item.sedimentWeight,
      waterPct: item.waterPct,
      sedimentPct: item.sedimentPct,
      acidPct: item.acidPct,
      deductionPerTon: item.deductionPerTon,
      savedAt: item.createdAt
    }));
    writeSaved([...server, ...withoutLegacyDuplicates.filter((item) => !server.some((entry) => entry.id === item.id))].slice(0, 100));
    renderSavedLabAnalyses();
  };

  async function saveCurrentAnalysis() {
    const res = computeAnalysis();
    const list = readSaved();
    const item = {
      ...res,
      savedAt: new Date().toISOString()
    };
    list.unshift(item);
    writeSaved(list);
    renderSavedLabAnalyses();
    if (navigator.onLine && typeof window.syncAnalysisToServer === "function") {
      const saved = await window.syncAnalysisToServer(item);
      if (saved) {
        item.id = saved.id;
        writeSaved([item, ...readSaved().filter((entry, index) => index !== 0)]);
        renderSavedLabAnalyses();
      }
    } else {
      window.showAppToast?.("تم حفظ التحليل على الجهاز. سجل دخولك وسجّله على Google Sheets.", "warning");
    }
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

  function fmtWeightDisplay(v) {
    return Number.isInteger(v) ? String(v) : Number(v).toFixed(2).replace(/\.?0+$/, "");
  }

  async function shareAnalysisImage() {
        if (!hasCalculated) {
      window.showAppToast?.("اضغط احسب التحليل أولًا قبل المشاركة.", "warning");
      return;
    }
    const res = computeAnalysis();
    const sharedAt = new Date();
    const sharedDate = `${String(sharedAt.getDate()).padStart(2, "0")}-${String(sharedAt.getMonth() + 1).padStart(2, "0")}-${sharedAt.getFullYear()}`;
    const hour = sharedAt.getHours();
    const sharedTime = `${hour % 12 || 12}:${String(sharedAt.getMinutes()).padStart(2, "0")} ${hour >= 12 ? "م" : "ص"}`;
    
    // أبعاد عرضية (نسخة كمبيوتر)
    const canvas = document.createElement("canvas");
    canvas.width = 1600;
    canvas.height = 1000;
    const ctx = canvas.getContext("2d");

    ctx.direction = "rtl";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // خلفية رصاصي ناعم
    ctx.fillStyle = "#e5e7eb";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // إطار رئيسي أبيض بحافة نبيتي
    ctx.fillStyle = "#ffffff";
    drawRoundedRect(ctx, 16, 16, canvas.width - 32, canvas.height - 32, 32);
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#881337";
    ctx.stroke();

    // العنوان الرئيسي (تحليل عينة) - لون رصاصي داكن
    const hasClient = (($("labClientName")?.value || "").trim().length > 0);
    ctx.fillStyle = "#1f2937";
    ctx.font = "800 56px 'Segoe UI', Tahoma, sans-serif";
    ctx.fillText("تحليل عينة", canvas.width / 2, 80);

    // اسم العميل - بلون مميز (نبيتي)
    if (hasClient) {
      ctx.fillStyle = "#881337"; // لون نبيتي غامق مميز
      ctx.font = "900 52px 'Segoe UI', Tahoma, sans-serif";
      ctx.fillText(`(${res.clientName})`, canvas.width / 2, 145);
    }

    // سطر البيانات (المندوب | التاريخ | الوقت)
    const repName = String(window.getActiveUserName?.() || "").trim();
    ctx.fillStyle = "#6b7280";
    ctx.font = "600 30px 'Segoe UI', Tahoma, sans-serif";
    const shareDetails = `${repName ? `المندوب: ${repName}  |  ` : ""}التاريخ: ${sharedDate}  |  الوقت: ${sharedTime}`;
    ctx.fillText(shareDetails, canvas.width / 2, 205);

    // خط فاصل رصاصي
    ctx.strokeStyle = "#d1d5db";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(140, 245);
    ctx.lineTo(canvas.width - 140, 245);
    ctx.stroke();

    // ====== مجموعة الأوزان ======
    const wGroupX = 60;
    const wGroupY = 275;
    const wGroupW = canvas.width - 120;
    const wGroupH = 240;

    ctx.fillStyle = "#f3f4f6";
    ctx.strokeStyle = "#d1d5db";
    ctx.lineWidth = 2;
    drawRoundedRect(ctx, wGroupX, wGroupY, wGroupW, wGroupH, 24);
    ctx.fill();
    ctx.stroke();

    const weights = [
      { label: "وزن فارغ", val: fmtWeightDisplay(res.emptyWeight) },
      { label: "قبل الغليان", val: fmtWeightDisplay(res.beforeBoil) },
      { label: "بعد الغليان", val: fmtWeightDisplay(res.afterBoil) },
      { label: "وزن الرواسب", val: fmtWeightDisplay(res.sedimentWeight) }
    ];
    const wGap = 20;
    const wPad = 24;
    const wCardW = (wGroupW - wPad * 2 - wGap * 3) / 4;
    const wCardH = wGroupH - wPad * 2;

    weights.forEach((item, idx) => {
      const cardX = wGroupX + wGroupW - wPad - (idx + 1) * wCardW - idx * wGap;
      const cardY = wGroupY + wPad;
      
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#881337"; 
      ctx.lineWidth = 2;
      drawRoundedRect(ctx, cardX, cardY, wCardW, wCardH, 16);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#4b5563";
      ctx.font = "700 26px 'Segoe UI', Tahoma, sans-serif";
      ctx.fillText(item.label, cardX + wCardW / 2, cardY + 40);

      ctx.fillStyle = "#1f2937";
      ctx.font = "900 48px 'Segoe UI', Tahoma, sans-serif";
      ctx.fillText(item.val, cardX + wCardW / 2, cardY + 110);
    });

    // ====== مجموعة النسب ======
    const rGroupX = 60;
    const rGroupY = 535; // تم النزول شوية لاستيعاب العنوان الجديد
    const rGroupW = canvas.width - 120;
    const rGroupH = 240;

    ctx.fillStyle = "#f3f4f6";
    ctx.strokeStyle = "#d1d5db";
    ctx.lineWidth = 2;
    drawRoundedRect(ctx, rGroupX, rGroupY, rGroupW, rGroupH, 24);
    ctx.fill();
    ctx.stroke();

    const ratios = [
      { label: "نسبة المياه", val: `${res.waterPct.toFixed(2)}%` },
      { label: "نسبة الرواسب", val: `${res.sedimentPct.toFixed(2)}%` },
      { label: "نسبة الأحماض", val: `${res.acidPct.toFixed(2)}%` }
    ];
    const rGap = 20;
    const rPad = 24;
    const rCardW = (rGroupW - rPad * 2 - rGap * 2) / 3;
    const rCardH = rGroupH - rPad * 2;

    ratios.forEach((item, idx) => {
      const cardX = rGroupX + rGroupW - rPad - (idx + 1) * rCardW - idx * rGap;
      const cardY = rGroupY + rPad;
      
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#881337"; 
      ctx.lineWidth = 2;
      drawRoundedRect(ctx, cardX, cardY, rCardW, rCardH, 16);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#4b5563";
      ctx.font = "700 28px 'Segoe UI', Tahoma, sans-serif";
      ctx.fillText(item.label, cardX + rCardW / 2, cardY + 45);

      ctx.fillStyle = "#881337";
      ctx.font = "900 54px 'Segoe UI', Tahoma, sans-serif";
      ctx.fillText(item.val, cardX + rCardW / 2, cardY + 125);
    });

    // ====== مربع الخصم ======
    const dedW = 540;
    const dedH = 150;
    const dedX = (canvas.width - dedW) / 2;
    const dedY = 800;

    ctx.fillStyle = "#881337";
    ctx.strokeStyle = "#4c0519";
    ctx.lineWidth = 3;
    drawRoundedRect(ctx, dedX, dedY, dedW, dedH, 24);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#ffe4e6";
    ctx.font = "700 28px 'Segoe UI', Tahoma, sans-serif";
    ctx.fillText("الخصم (كجم/طن)", canvas.width / 2, dedY + 45);

    ctx.fillStyle = "#ffffff";
    ctx.font = "900 64px 'Segoe UI', Tahoma, sans-serif";
    ctx.fillText(String(res.deductionPerTon), canvas.width / 2, dedY + 110);

    // التوقيع السفلي
    ctx.direction = "ltr";
    ctx.fillStyle = "#9ca3af";
    ctx.font = "600 20px 'Segoe UI', Tahoma, sans-serif";
    ctx.fillText("Structured by. ALI M.RAGAB - TAGADDOD", canvas.width / 2, canvas.height - 40);

    // توليد الصورة والمشاركة
    const dataUrl = canvas.toDataURL("image/png");
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], `تحليل_${res.clientName.replace(/\s+/g, "_")}.png`, { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: "تحليل عينة زيت"
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
    $("calculateLabBtn")?.addEventListener("click", (event) => {
      hasCalculated = true;
      updateDisplay();
      withAnalysisButtonProgress(event.currentTarget, "تم حساب التحليل", () => {
        window.showAppToast?.("تم حساب نتائج التحليل.", "success");
        return true;
      });
    });
    $("shareLabImageBtn")?.addEventListener("click", (event) => {
      withAnalysisButtonProgress(event.currentTarget, "جاري تجهيز صورة التحليل...", shareAnalysisImage);
    });
    $("clearLabFormBtn")?.addEventListener("click", clearLabInputs);
    updateDisplay();
    renderSavedLabAnalyses();
  });
})();
