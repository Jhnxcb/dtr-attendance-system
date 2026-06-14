const dashboardGrid = document.getElementById("dashboardGrid");
const searchInput = document.getElementById("searchInput");
const typeFilter = document.getElementById("typeFilter");
const refreshDashboard = document.getElementById("refreshDashboard");
const dashboardCsv = document.getElementById("dashboardCsv");
const todayCount = document.getElementById("todayCount");
const insideCount = document.getElementById("insideCount");
const siteCount = document.getElementById("siteCount");
const photoDialog = document.getElementById("photoDialog");
const photoDialogImage = document.getElementById("photoDialogImage");
const closePhotoDialog = document.getElementById("closePhotoDialog");

let dashboardRecords = [];

function getSupabaseConfig() {
  const url = (localStorage.getItem("dtr-supabase-url") || "").replace(/\/$/, "");
  const key = localStorage.getItem("dtr-supabase-key") || "";

  if (!url || !key) {
    throw new Error("Open the scanner page and enter Supabase URL and anon key first.");
  }

  return { url, key };
}

async function supabaseFetch(path) {
  const config = getSupabaseConfig();
  const response = await fetch(`${config.url}${path}`, {
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
    },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

function filteredRecords() {
  const query = searchInput.value.trim().toLowerCase();
  const selectedType = typeFilter.value;

  return dashboardRecords.filter((record) => {
    const text = [
      record.employee_name,
      record.employee_id,
      record.branch_site,
      record.verification_id,
      record.location_address,
    ].join(" ").toLowerCase();
    const matchesSearch = !query || text.includes(query);
    const matchesType = !selectedType || record.attendance_type === selectedType;
    return matchesSearch && matchesType;
  });
}

function renderMetrics(records) {
  const today = new Date().toISOString().slice(0, 10);
  const todayRows = records.filter((record) => String(record.timestamp || "").startsWith(today));
  const latestByEmployee = new Map();

  records.forEach((record) => {
    if (!latestByEmployee.has(record.employee_id)) {
      latestByEmployee.set(record.employee_id, record);
    }
  });

  todayCount.textContent = todayRows.length;
  insideCount.textContent = [...latestByEmployee.values()].filter((record) => record.attendance_type === "TIME IN").length;
  siteCount.textContent = new Set(records.map((record) => record.branch_site).filter(Boolean)).size;
}

function renderDashboard() {
  const records = filteredRecords();
  renderMetrics(dashboardRecords);

  dashboardGrid.innerHTML = records.map((record) => `
    <article class="dashboard-card">
      <div class="dashboard-card-top">
        <img src="${record.registered_photo_url || ""}" alt="" onerror="this.hidden=true" />
        <div>
          <strong>${record.employee_name || "No name"}</strong>
          <small>${record.employee_id || ""}</small>
          <span class="badge">${record.attendance_type || ""}</span>
        </div>
      </div>
      <p>${record.attendance_date || ""} ${record.attendance_time || ""}</p>
      <p>${record.branch_site || ""}</p>
      <p>${record.location_address || ""}</p>
      <small>Lat: ${record.latitude || ""} | Lng: ${record.longitude || ""}</small>
      <small>${record.verification_id || ""}</small>
      <div class="record-actions">
        ${record.verification_photo_url ? `<button type="button" data-photo="${record.verification_photo_url}">Verified Photo</button>` : ""}
        ${record.evidence_photo_url ? `<button type="button" data-photo="${record.evidence_photo_url}">Original Photo</button>` : ""}
      </div>
    </article>
  `).join("");

  dashboardGrid.querySelectorAll("[data-photo]").forEach((button) => {
    button.addEventListener("click", () => {
      photoDialogImage.src = button.dataset.photo;
      photoDialog.showModal();
    });
  });
}

async function loadDashboard() {
  try {
    dashboardGrid.innerHTML = '<p class="muted">Loading attendance records...</p>';
    dashboardRecords = await supabaseFetch("/rest/v1/attendance_records?select=*&order=timestamp.desc&limit=200");
    renderDashboard();
  } catch (error) {
    dashboardGrid.innerHTML = `<p class="muted">${error.message}</p>`;
  }
}

function exportCsv() {
  const headers = ["Timestamp", "Employee Name", "Employee ID", "Email", "Type", "Branch", "Address", "Latitude", "Longitude", "Evidence Photo", "Verification Photo", "Verification ID"];
  const rows = filteredRecords().map((record) => [
    record.timestamp,
    record.employee_name,
    record.employee_id,
    record.email,
    record.attendance_type,
    record.branch_site,
    record.location_address,
    record.latitude,
    record.longitude,
    record.evidence_photo_url,
    record.verification_photo_url,
    record.verification_id,
  ]);
  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell || "").replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `dtr-dashboard-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

searchInput.addEventListener("input", renderDashboard);
typeFilter.addEventListener("change", renderDashboard);
refreshDashboard.addEventListener("click", loadDashboard);
dashboardCsv.addEventListener("click", exportCsv);
closePhotoDialog.addEventListener("click", () => photoDialog.close());

loadDashboard();
setInterval(loadDashboard, 15000);
