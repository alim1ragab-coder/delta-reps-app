const LAB_STORAGE_KEY = "delta_lab_analyses_v1";

function numVal(id) {
  const el = document.getElementById(id);
  if (!el) return 0;
  const v = parseFloat(el.value);
  return Number.isFinite(v) ? v : 0;
}

function fmtInputNum_(id) {
  const el = document.getElementById(id);
  if (!el || el.value === "") return "0";
  const v = parseFloat(el.value);
  return Number.isFinite(v) ? String(v) : "0";
}

function computeLabMetrics() {
  const acidsRaw = numVal("labAcids");
  const emptyWeight = numVal("labEmptyWeight");
  const beforeBoil = numVal("labBeforeBoil");
  const sedimentWeight = numVal("labSedimentWeight");
  const afterBoil = numVal("labAfterBoil");

  const netBeforeBoil = Math.max(0, beforeBoil - emptyWeight);
  const netSediment = Math.max(0, sedimentWeight - emptyWeight);

  const acidPct = acidsRaw > 0 ? acidsRaw : 0;

  let waterPct = 0;
  if (netBeforeBoil > 0 && beforeBoil > 0 && afterBoil > 0) {
    const lostWater = Math.max(0, beforeBoil - afterBoil);
    waterPct = (lostWater / netBeforeBoil) * 100;
  }

  let sedimentPct = 0;
  if (netBeforeBoil > 0 && netSediment > 0) {
    sedimentPct = (netSediment / netBeforeBoil) * 100;
  }

  // 1. خصم الأحماض: السماح 3%، والزيادة تتضرب في 10 كجم لكل 1%
  const extraAcidsPct = Math.max(0, acidPct - 3);
  const acidsDeduction = extraAcidsPct * 10;

  // 2. خصم المياه والرواسب: السماح لمجموعهما 2%، والزيادة تتضرب في 10 كجم لكل 1%
  const totalImpuritiesPct = waterPct + sedimentPct;
  const extraImpuritiesPct = Math.max(0, totalImpuritiesPct - 2);
  const impuritiesDeduction = extraImpuritiesPct * 10;

  // إجمالي الخصم بالطن (كجم/طن)
  const deductionPerTon = Math.round(acidsDeduction + impuritiesDeduction);

  return {
    acidPct: Number(acidPct.toFixed(2)),
    waterPct: Number(waterPct.toFixed(2)),
    sedimentPct: Number(sedimentPct.toFixed(2)),
    deductionPerTon
  };
}

function updateLiveLabCalculations() {
  const acidEl = document.getElementById("resAcidPct");
  const waterEl = document.getElementById("resWaterPct");
  const sedEl = document.getElementById("resSedimentPct");
  const dedEl = document.getElementById("resDeductionPerTon");

  if (!acidEl || !waterEl || !sedEl || !dedEl) return;

  const metrics = computeLabMetrics();
  acidEl.textContent = `${metrics.acidPct.toFixed(2)}%`;
  waterEl.textContent = `${metrics.waterPct.toFixed(2)}%`;
  sedEl.textContent = `${metrics.sedimentPct.toFixed(2)}%`;
  dedEl.textContent = String(metrics.deductionPerTon);
}

function getSavedLabAnalyses() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LAB_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function setSavedLabAnalyses(list) {
  localStorage.setItem(LAB_STORAGE_KEY, JSON.stringify(list));
}

function renderSavedLabAnalyses() {
  const tbody = document.getElementById("savedLabAnalysisBody");
  if (!tbody) return;

  const list = getSavedLabAnalyses();
  tbody.innerHTML = "";

  list.forEach((item) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeLabHtml(item.client || "-")}</td>
      <td>${Number(item.acidPct || 0).toFixed(2)}%</td>
      <td>${Number(item.waterPct || 0).toFixed(2)}%</td>
      <td>${Number(item.sedimentPct || 0).toFixed(2)}%</td>
      <td>${Number(item.deductionPerTon || 0)}</td>
    `;
    tbody.appendChild(tr);
  });
}

function escapeLabHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function saveCurrentLabAnalysis() {
  const clientInput = document.getElementById("labClientName");
  const client = clientInput ? clientInput.value.trim() : "";
  const metrics = computeLabMetrics();

  if (!client) {
    alert("من فضلك أدخل اسم العميل أولاً.");
    return;
  }

  const entry = {
    id: `lab_${Date.now()}`,
    client,
    acidPct: metrics.acidPct,
    waterPct: metrics.waterPct,
    sedimentPct: metrics.sedimentPct,
    deductionPerTon: metrics.deductionPerTon
  };

  const list = getSavedLabAnalyses();
  list.unshift(entry);
  setSavedLabAnalyses(list);
  renderSavedLabAnalyses();
  alert("تم حفظ التحليل محلياً على الجهاز.");
}

function getCurrentLabSummaryData() {
  const clientName =
    (document.getElementById("labClientName")?.value || "").trim() || "تحليل عينة";

  const metrics = computeLabMetrics();

  const inputs = [
    { label: "الأحماض", value: fmtInputNum_("labAcids") },
    { label: "وزن فارغ", value: fmtInputNum_("labEmptyWeight") },
    { label: "قبل الغليان", value: fmtInputNum_("labBeforeBoil") },
    { label: "بعد الغليان", value: fmtInputNum_("labAfterBoil") },
    { label: "وزن الرواسب", value: fmtInputNum_("labSedimentWeight") }
  ];

  return {
    clientName,
    water: { label: "نسبة المياه", value: `${metrics.waterPct.toFixed(2)}%` },
    sediment: { label: "نسبة الرواسب", value: `${metrics.sedimentPct.toFixed(2)}%` },
    acid: { label: "نسبة الأحماض", value: `${metrics.acidPct.toFixed(2)}%` },
    deductionLabel: "الخصم بالطن (كجم/طن)",
    deductionValue: String(metrics.deductionPerTon),
    inputs
  };
}

function drawRoundedRect_(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function renderLabCardImageBlob() {
  return new Promise((resolve) => {
    const data = getCurrentLabSummaryData();
    const width = 920;
    const height = 560;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");

    ctx.direction = "rtl";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 3;
    drawRoundedRect_(ctx, 14, 14, width - 28, height - 28, 22);
    ctx.stroke();

    // اسم العميل كبير في المنتصف بالأعلى
    ctx.fillStyle = "#0f172a";
    ctx.font = "800 34px 'Segoe UI', Tahoma, sans-serif";
    ctx.fillText(data.clientName, width / 2, 70);

    // الحاوية الخارجية للنسب الثلاث
    const groupX = 46;
    const groupY = 112;
    const groupW = width - 92;
    const groupH = 142;

    ctx.fillStyle = "#f8fafc";
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 2;
    drawRoundedRect_(ctx, groupX, groupY, groupW, groupH, 18);
    ctx.fill();
    ctx.stroke();

    const items = [data.water, data.sediment, data.acid];
    const gap = 16;
    const innerPad = 16;
    const cardW = (groupW - innerPad * 2 - gap * 2) / 3;
    const cardH = groupH - innerPad * 2;
    const cardY = groupY + innerPad;

    items.forEach((item, index) => {
      const cardX = groupX + groupW - innerPad - (index + 1) * cardW - index * gap;

      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#cbd5e1";
      ctx.lineWidth = 1.8;
      drawRoundedRect_(ctx, cardX, cardY, cardW, cardH, 14);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#475569";
      ctx.font = "700 18px 'Segoe UI', Tahoma, sans-serif";
      ctx.fillText(item.label, cardX + cardW / 2, cardY + 36);

      ctx.fillStyle = "#0f172a";
      ctx.font = "800 26px 'Segoe UI', Tahoma, sans-serif";
      ctx.fillText(item.value, cardX + cardW / 2, cardY + 78);
    });

    // كارت الخصم بالطن صغير في المنتصف بلون أحمر هادئ
    const dedW = 330;
    const dedH = 92;
    const dedX = (width - dedW) / 2;
    const dedY = 272;

    ctx.fillStyle = "#fef2f2";
    ctx.strokeStyle = "#fca5a5";
    ctx.lineWidth = 2.2;
    drawRoundedRect_(ctx, dedX, dedY, dedW, dedH, 16);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#991b1b";
    ctx.font = "700 17px 'Segoe UI', Tahoma, sans-serif";
    ctx.fillText(data.deductionLabel, width / 2, dedY + 28);

    ctx.fillStyle = "#b91c1c";
    ctx.font = "800 27px 'Segoe UI', Tahoma, sans-serif";
    ctx.fillText(data.deductionValue, width / 2, dedY + 64);

    // شريط بيانات الإدخال التي بنى عليها الحساب
    const inpGroupX = 46;
    const inpGroupY = 382;
    const inpGroupW = width - 92;
    const inpGroupH = 104;

    ctx.fillStyle = "#f8fafc";
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 1.8;
    drawRoundedRect_(ctx, inpGroupX, inpGroupY, inpGroupW, inpGroupH, 16);
    ctx.fill();
    ctx.stroke();

    const inpCount = data.inputs.length;
    const inpGap = 10;
    const inpPad = 12;
    const inpW = (inpGroupW - inpPad * 2 - inpGap * (inpCount - 1)) / inpCount;
    const inpH = inpGroupH - inpPad * 2;
    const inpY = inpGroupY + inpPad;

    data.inputs.forEach((inp, idx) => {
      const inpX = inpGroupX + inpGroupW - inpPad - (idx + 1) * inpW - idx * inpGap;

      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#e2e8f0";
      ctx.lineWidth = 1.4;
      drawRoundedRect_(ctx, inpX, inpY, inpW, inpH, 11);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#475569";
      ctx.font = "700 13.5px 'Segoe UI', Tahoma, sans-serif";
      ctx.fillText(inp.label, inpX + inpW / 2, inpY + 26);

      ctx.fillStyle = "#0f172a";
      ctx.font = "800 18px 'Segoe UI', Tahoma, sans-serif";
      ctx.fillText(inp.value, inpX + inpW / 2, inpY + 56);
    });

    // التذييل السفلي بخط صغير
    ctx.fillStyle = "#64748b";
    ctx.font = "600 13px 'Segoe UI', Tahoma, sans-serif";
    ctx.fillText("تصميم وهيكله ALI RAGAB -TAGADDOD", width / 2, height - 26);

    canvas.toBlob((blob) => resolve(blob || null), "image/png");
  });
}

async function shareLabAnalysisAsImage() {
  const blob = await renderLabCardImageBlob();
  if (!blob) {
    alert("تعذر إنشاء صورة التحليل.");
    return;
  }

  const data = getCurrentLabSummaryData();
  const safeClient = data.clientName.replace(/[\\/:*?"<>|]+/g, "_");
  const fileName = `تحليل_${safeClient}.png`;
  const file = new File([blob], fileName, { type: "image/png" });

  if (navigator.canShare && navigator.canShare({ files: [file] }) && typeof navigator.share === "function") {
    try {
      await navigator.share({
        files: [file],
        title: `تحليل ${data.clientName}`
      });
      return;
    } catch (err) {
      if (err && err.name === "AbortError") return;
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  alert("تم حفظ صورة التحليل على جهازك لمشاركتها.");
}

function initLabAnalysisModule() {
  const inputIds = [
    "labAcids",
    "labEmptyWeight",
    "labBeforeBoil",
    "labSedimentWeight",
    "labAfterBoil"
  ];

  inputIds.forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", updateLiveLabCalculations);
      el.addEventListener("change", updateLiveLabCalculations);
    }
  });

  const saveBtn = document.getElementById("saveLabAnalysisBtn");
  if (saveBtn) {
    saveBtn.addEventListener("click", saveCurrentLabAnalysis);
  }

  const shareBtn = document.getElementById("shareLabImageBtn");
  if (shareBtn) {
    shareBtn.addEventListener("click", shareLabAnalysisAsImage);
  }

  updateLiveLabCalculations();
  renderSavedLabAnalyses();
}

document.addEventListener("DOMContentLoaded", initLabAnalysisModule);