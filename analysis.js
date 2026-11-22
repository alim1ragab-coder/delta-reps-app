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

function deleteSavedLabAnalysis(id) {
  const filtered = getSavedLabAnalyses().filter((item) => item.id !== id);
  setSavedLabAnalyses(filtered);
  renderSavedLabAnalyses();
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
      <td><button type="button" class="btn btn-danger btn-sm del-sample-btn" data-id="${escapeLabHtml(item.id)}">حذف</button></td>
    `;
    const delBtn = tr.querySelector(".del-sample-btn");
    if (delBtn) {
      delBtn.addEventListener("click", () => deleteSavedLabAnalysis(item.id));
    }
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

  const weights = [
    { label: "وزن فارغ", value: fmtInputNum_("labEmptyWeight") },
    { label: "قبل الغليان", value: fmtInputNum_("labBeforeBoil") },
    { label: "بعد الغليان", value: fmtInputNum_("labAfterBoil") },
    { label: "وزن الرواسب", value: fmtInputNum_("labSedimentWeight") }
  ];

  return {
    clientName,
    weights,
    water: { label: "نسبة المياه", value: `${metrics.waterPct.toFixed(2)}%` },
    sediment: { label: "نسبة الرواسب", value: `${metrics.sedimentPct.toFixed(2)}%` },
    acid: { label: "نسبة الأحماض", value: `${metrics.acidPct.toFixed(2)}%` },
    deductionLabel: "الخصم بالطن (كجم/طن)",
    deductionValue: String(metrics.deductionPerTon)
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
    const width = 960;
    const height = 600;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");

    ctx.direction = "rtl";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // خلفية بيضاء نقية
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = "#0f766e";
    ctx.lineWidth = 3;
    drawRoundedRect_(ctx, 16, 16, width - 32, height - 32, 24);
    ctx.stroke();

    // اسم العميل في الأعلى
    ctx.fillStyle = "#0f172a";
    ctx.font = "800 36px 'Segoe UI', Tahoma, sans-serif";
    ctx.fillText(data.clientName, width / 2, 68);

    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(140, 102);
    ctx.lineTo(width - 140, 102);
    ctx.stroke();

    // الصف الأول: 4 مربعات للأوزان
    const wGroupX = 44;
    const wGroupY = 122;
    const wGroupW = width - 88;
    const wGroupH = 124;

    ctx.fillStyle = "#f8fafc";
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 2;
    drawRoundedRect_(ctx, wGroupX, wGroupY, wGroupW, wGroupH, 18);
    ctx.fill();
    ctx.stroke();

    const wCount = data.weights.length;
    const wGap = 14;
    const wPad = 14;
    const wCardW = (wGroupW - wPad * 2 - wGap * (wCount - 1)) / wCount;
    const wCardH = wGroupH - wPad * 2;
    const wCardY = wGroupY + wPad;

    data.weights.forEach((item, idx) => {
      const cardX = wGroupX + wGroupW - wPad - (idx + 1) * wCardW - idx * wGap;

      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#94a3b8";
      ctx.lineWidth = 1.6;
      drawRoundedRect_(ctx, cardX, wCardY, wCardW, wCardH, 13);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#475569";
      ctx.font = "700 16px 'Segoe UI', Tahoma, sans-serif";
      ctx.fillText(item.label, cardX + wCardW / 2, wCardY + 31);

      ctx.fillStyle = "#0f172a";
      ctx.font = "800 24px 'Segoe UI', Tahoma, sans-serif";
      ctx.fillText(item.value, cardX + wCardW / 2, wCardY + 68);
    });

    // الصف الثاني: النسب الثلاث (المياه، الرواسب، الأحماض)
    const rGroupX = 44;
    const rGroupY = 264;
    const rGroupW = width - 88;
    const rGroupH = 142;

    ctx.fillStyle = "#f8fafc";
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 2;
    drawRoundedRect_(ctx, rGroupX, rGroupY, rGroupW, rGroupH, 18);
    ctx.fill();
    ctx.stroke();

    const ratios = [data.water, data.sediment, data.acid];
    const rGap = 18;
    const rPad = 16;
    const rCardW = (rGroupW - rPad * 2 - rGap * 2) / 3;
    const rCardH = rGroupH - rPad * 2;
    const rCardY = rGroupY + rPad;

    ratios.forEach((item, index) => {
      const cardX = rGroupX + rGroupW - rPad - (index + 1) * rCardW - index * rGap;

      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#94a3b8";
      ctx.lineWidth = 1.8;
      drawRoundedRect_(ctx, cardX, rCardY, rCardW, rCardH, 14);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#475569";
      ctx.font = "700 18px 'Segoe UI', Tahoma, sans-serif";
      ctx.fillText(item.label, cardX + rCardW / 2, rCardY + 35);

      ctx.fillStyle = "#0f766e";
      ctx.font = "800 28px 'Segoe UI', Tahoma, sans-serif";
      ctx.fillText(item.value, cardX + rCardW / 2, rCardY + 78);
    });

    // الصف الثالث: كارت الخصم بالطن في المنتصف
    const dedW = 380;
    const dedH = 100;
    const dedX = (width - dedW) / 2;
    const dedY = 424;

    ctx.fillStyle = "#fef2f2";
    ctx.strokeStyle = "#fca5a5";
    ctx.lineWidth = 2.4;
    drawRoundedRect_(ctx, dedX, dedY, dedW, dedH, 16);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#991b1b";
    ctx.font = "700 18px 'Segoe UI', Tahoma, sans-serif";
    ctx.fillText(data.deductionLabel, width / 2, dedY + 30);

    ctx.fillStyle = "#b91c1c";
    ctx.font = "800 30px 'Segoe UI', Tahoma, sans-serif";
    ctx.fillText(data.deductionValue, width / 2, dedY + 68);

    // الفوتر في الأسفل
    ctx.direction = "ltr";
    ctx.fillStyle = "#475569";
    ctx.font = "600 14px 'Segoe UI', Tahoma, sans-serif";
    ctx.fillText("Designed & Structured by ALI RAGAB - TAGADDOD", width / 2, height - 34);

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