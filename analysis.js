const ANALYSIS_STORAGE_KEY = "delta_client_analyses_v2";

function calculateAnalysisValues() {
  const acid = parseFloat(document.getElementById("anAcid").value) || 0;
  const emptyW = parseFloat(document.getElementById("anEmpty").value) || 0;
  const beforeBoil = parseFloat(document.getElementById("anBeforeBoil").value) || 0;
  const afterBoil = parseFloat(document.getElementById("anAfterBoil").value) || 0;
  const sedimentW = parseFloat(document.getElementById("anSediment").value) || 0;
  const clientWeight = parseFloat(document.getElementById("anClientWeight").value) || 0;

  const netSample = beforeBoil - emptyW;
  const waterPct = netSample > 0 ? ((beforeBoil - afterBoil) / netSample) * 100 : 0;
  const sedimentPct = netSample > 0 ? ((sedimentW - emptyW) / netSample) * 100 : 0;

  const acidPenalty = acid > 3 ? (acid - 3) * 10 : 0;
  const waterSedimentSum = waterPct + sedimentPct;
  const wsPenalty = waterSedimentSum > 2 ? (waterSedimentSum - 2) * 10 : 0;
  const deductionPerTon = Math.round(acidPenalty + wsPenalty);
  const deductionQty = (deductionPerTon / 1000) * clientWeight;

  document.getElementById("resAcid").textContent = `${acid.toFixed(2)}%`;
  document.getElementById("resWater").textContent = `${waterPct.toFixed(2)}%`;
  document.getElementById("resSediment").textContent = `${sedimentPct.toFixed(2)}%`;
  document.getElementById("resDeductionTon").textContent = `${deductionPerTon}`;
  document.getElementById("resDeductionQty").textContent = `${deductionQty.toFixed(2)}`;

  return {
    client: document.getElementById("anClient").value.trim() || "غير محدد",
    acid: acid.toFixed(2),
    waterPct: waterPct.toFixed(2),
    sedimentPct: sedimentPct.toFixed(2),
    deductionPerTon,
    deductionQty: deductionQty.toFixed(2)
  };
}

function loadSavedAnalyses() {
  return JSON.parse(localStorage.getItem(ANALYSIS_STORAGE_KEY) || "[]");
}

function renderSavedAnalyses() {
  const list = loadSavedAnalyses();
  const tbody = document.getElementById("analysisBody");
  tbody.innerHTML = "";

  list.forEach((item) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${item.client}</td>
      <td>${item.acid}%</td>
      <td>${item.waterPct}%</td>
      <td>${item.sedimentPct}%</td>
      <td>${item.deductionPerTon}</td>
      <td>${item.deductionQty}</td>
    `;
    tbody.appendChild(tr);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  ["anAcid", "anEmpty", "anBeforeBoil", "anAfterBoil", "anSediment", "anClientWeight"].forEach((id) => {
    document.getElementById(id).addEventListener("input", calculateAnalysisValues);
  });

  document.getElementById("saveAnalysisBtn").addEventListener("click", () => {
    const calc = calculateAnalysisValues();
    const list = loadSavedAnalyses();
    list.unshift(calc);
    localStorage.setItem(ANALYSIS_STORAGE_KEY, JSON.stringify(list));
    renderSavedAnalyses();
    alert("تم حفظ التحليل محلياً على الجهاز.");
  });

  calculateAnalysisValues();
  renderSavedAnalyses();
});