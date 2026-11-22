const LAB_STORAGE_KEY = "delta_lab_analyses_v1";

function numVal(id) {
  const el = document.getElementById(id);
  if (!el) return 0;
  const v = parseFloat(el.value);
  return Number.isFinite(v) ? v : 0;
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

  updateLiveLabCalculations();
  renderSavedLabAnalyses();
}

document.addEventListener("DOMContentLoaded", initLabAnalysisModule);