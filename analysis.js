function renderClientAnalysis() {
  const statsGrid = document.getElementById("analysisStatsGrid");
  const tbody = document.getElementById("clientsAnalysisBody");
  if (!statsGrid || !tbody) return;

  const allTrips = typeof getTrips === "function"
    ? getTrips()
    : JSON.parse(localStorage.getItem("delta_trips_records_v4") || "[]");

  const currentUser = typeof getCurrentUser === "function" ? getCurrentUser() : null;
  const trips = currentUser && currentUser.role !== "admin"
    ? allTrips.filter((t) => String(t.ownerPhone || "").replace(/\D/g, "") === String(currentUser.phone || "").replace(/\D/g, ""))
    : allTrips;

  const clientMap = new Map();
  let totalAllowance = 0;

  trips.forEach((t) => {
    const clientName = (t.client || "عميل غير مسمى").trim();
    const allowance = parseFloat(t.allowance) || 0;
    totalAllowance += allowance;

    if (!clientMap.has(clientName)) {
      clientMap.set(clientName, {
        client: clientName,
        visits: 0,
        allowance: 0,
        lastDate: t.date || "-",
        places: new Set()
      });
    }

    const entry = clientMap.get(clientName);
    entry.visits += 1;
    entry.allowance += allowance;
    if (t.date && (!entry.lastDate || t.date > entry.lastDate)) {
      entry.lastDate = t.date;
    }
    if (t.place) {
      entry.places.add(t.place.trim());
    }
  });

  statsGrid.innerHTML = `
    <div class="stat-card">
      <div class="label">إجمالي الرحلات</div>
      <div class="value">${trips.length}</div>
    </div>
    <div class="stat-card">
      <div class="label">عدد العملاء</div>
      <div class="value">${clientMap.size}</div>
    </div>
    <div class="stat-card">
      <div class="label">إجمالي البدلات</div>
      <div class="value">${totalAllowance.toFixed(2)} ج</div>
    </div>
  `;

  tbody.innerHTML = "";
  const sortedClients = Array.from(clientMap.values()).sort((a, b) => b.visits - a.visits);

  sortedClients.forEach((c) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${c.client}</td>
      <td>${c.visits}</td>
      <td>${c.allowance.toFixed(2)}</td>
      <td>${c.lastDate}</td>
      <td>${Array.from(c.places).join("، ") || "-"}</td>
    `;
    tbody.appendChild(tr);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  renderClientAnalysis();
});
