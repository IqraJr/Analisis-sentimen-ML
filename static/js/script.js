// ==========================================================================
// PORTAL SUARA MAHASISWA — FRONTEND LOGIC (RAYCAST DARK THEME)
// ==========================================================================

document.addEventListener("DOMContentLoaded", () => {
    const isStudentPage = document.getElementById("feedbackForm") !== null;
    const isAdminPage = document.getElementById("feedbackTableBody") !== null;

    if (isStudentPage) initStudentPortal();
    if (isAdminPage) initAdminDashboard();
});

// ==========================================================================
// A. STUDENT PORTAL LOGIC
// ==========================================================================
function initStudentPortal() {
    const feedbackForm  = document.getElementById("feedbackForm");
    const reviewText    = document.getElementById("reviewText");
    const charCount     = document.getElementById("charCount");
    const submitBtn     = document.getElementById("submitBtn");
    const btnText       = submitBtn.querySelector(".btn-text");
    const spinner       = submitBtn.querySelector(".spinner");

    const resultCard    = document.getElementById("resultCard");
    const closeResultBtn = document.getElementById("closeResultBtn");
    const sentimentEmoji = document.getElementById("sentimentEmoji");
    const sentimentLabel = document.getElementById("sentimentLabel");

    const probPosVal = document.getElementById("probPosVal");
    const probPosBar = document.getElementById("probPosBar");
    const probNeuVal = document.getElementById("probNeuVal");
    const probNeuBar = document.getElementById("probNeuBar");
    const probNegVal = document.getElementById("probNegVal");
    const probNegBar = document.getElementById("probNegBar");

    const chips = document.querySelectorAll(".chip");

    // 1. Real-time Character Counter
    reviewText.addEventListener("input", () => {
        const len = reviewText.value.length;
        charCount.textContent = len;
        if (len > 500) {
            charCount.style.color = "var(--color-ember-red)";
            submitBtn.disabled = true;
        } else {
            charCount.style.color = "";
            submitBtn.disabled = false;
        }
    });

    // 2. Topic Suggestion Chips
    chips.forEach(chip => {
        chip.addEventListener("click", () => {
            reviewText.value = chip.getAttribute("data-text");
            reviewText.dispatchEvent(new Event("input"));
            reviewText.focus();
        });
    });

    // 3. Form Submission
    feedbackForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const text = reviewText.value.trim();
        if (!text) return;

        submitBtn.disabled = true;
        btnText.classList.add("hidden");
        spinner.classList.remove("hidden");

        try {
            const response = await fetch("/api/submit", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text })
            });

            const result = await response.json();

            if (result.status === "success") {
                const sentiment = result.sentiment;
                const prob = result.probabilities;

                let labelText = "Netral";
                let emoji = "😐";

                if (sentiment === "positif") { labelText = "Positif"; emoji = "😊"; }
                else if (sentiment === "negatif") { labelText = "Negatif"; emoji = "😔"; }

                sentimentEmoji.textContent = emoji;
                sentimentLabel.textContent = labelText;

                updateBar(probPosBar, probPosVal, prob.positif);
                updateBar(probNeuBar, probNeuVal, prob.netral);
                updateBar(probNegBar, probNegVal, prob.negatif);

                resultCard.classList.remove("hidden");
                resultCard.scrollIntoView({ behavior: "smooth", block: "nearest" });

                reviewText.value = "";
                charCount.textContent = "0";
            } else {
                alert("Gagal melakukan analisis: " + result.message);
            }
        } catch (error) {
            console.error("Submit error:", error);
            alert("Terjadi kesalahan sistem saat menghubungi server.");
        } finally {
            submitBtn.disabled = false;
            btnText.classList.remove("hidden");
            spinner.classList.add("hidden");
        }
    });

    function updateBar(barEl, valEl, value) {
        const pct = Math.round(value * 100);
        valEl.textContent = pct + "%";
        barEl.style.width = pct + "%";
    }

    // 4. Close Result Card
    closeResultBtn.addEventListener("click", () => {
        resultCard.classList.add("hidden");
    });
}


// ==========================================================================
// B. ADMIN DASHBOARD LOGIC
// ==========================================================================
let globalFeedbacks = [];
let sentimentChartObj = null;
let statusChartObj = null;

function initAdminDashboard() {
    const searchFilter    = document.getElementById("searchFilter");
    const sentimentFilter = document.getElementById("sentimentFilter");
    const statusFilter    = document.getElementById("statusFilter");

    const closeModalBtn  = document.getElementById("closeModalBtn");
    const saveChangesBtn = document.getElementById("saveChangesBtn");
    const deleteBtn      = document.getElementById("deleteBtn");

    closeModalBtn.addEventListener("click", closeDetailsModal);
    document.querySelector(".modal-backdrop").addEventListener("click", closeDetailsModal);
    saveChangesBtn.addEventListener("click", saveResolutionNotes);
    deleteBtn.addEventListener("click", deleteReviewEntry);

    searchFilter.addEventListener("input", debounce(fetchFeedbacks, 300));
    sentimentFilter.addEventListener("change", fetchFeedbacks);
    statusFilter.addEventListener("change", fetchFeedbacks);

    loadDashboard();
}

function loadDashboard() {
    fetchStats();
    fetchFeedbacks();
}

async function fetchStats() {
    try {
        const response = await fetch("/api/stats");
        const json = await response.json();

        if (json.status === "success") {
            const stats = json.stats;
            document.getElementById("statTotal").textContent    = stats.total;
            document.getElementById("statPositive").textContent = stats.sentiment.positif;
            document.getElementById("statNeutral").textContent  = stats.sentiment.netral;
            document.getElementById("statNegative").textContent = stats.sentiment.negatif;
            renderSentimentChart(stats.sentiment);
            renderStatusChart(stats.status);
        }
    } catch (e) {
        console.error("Stats fetch error:", e);
    }
}

// Doughnut chart — Raycast palette
function renderSentimentChart(sentimentStats) {
    const ctx = document.getElementById("sentimentChart").getContext("2d");
    if (sentimentChartObj) sentimentChartObj.destroy();

    sentimentChartObj = new Chart(ctx, {
        type: "doughnut",
        data: {
            labels: ["Positif", "Netral", "Negatif"],
            datasets: [{
                data: [sentimentStats.positif, sentimentStats.netral, sentimentStats.negatif],
                backgroundColor: ["#59d499", "#56c2ff", "#ff6363"],
                borderWidth: 2,
                borderColor: "#111214"
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: "bottom",
                    labels: {
                        font: { family: "Inter", size: 11 },
                        padding: 16,
                        color: "#9c9c9d",
                        usePointStyle: true,
                        pointStyleWidth: 8
                    }
                }
            },
            cutout: "70%"
        }
    });
}

// Bar chart — Raycast palette
function renderStatusChart(statusStats) {
    const ctx = document.getElementById("statusChart").getContext("2d");
    if (statusChartObj) statusChartObj.destroy();

    statusChartObj = new Chart(ctx, {
        type: "bar",
        data: {
            labels: ["Pending", "Diproses", "Selesai"],
            datasets: [{
                label: "Jumlah Aduan",
                data: [statusStats.Pending, statusStats.Diproses, statusStats.Selesai],
                backgroundColor: ["#363739", "#56c2ff", "#59d499"],
                borderRadius: 6,
                borderSkipped: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1,
                        font: { family: "Inter", size: 11 },
                        color: "#6a6b6c"
                    },
                    grid: { color: "rgba(54,55,57,0.6)" },
                    border: { color: "transparent" }
                },
                x: {
                    ticks: {
                        font: { family: "Inter", size: 11 },
                        color: "#6a6b6c"
                    },
                    grid: { display: false },
                    border: { color: "transparent" }
                }
            }
        }
    });
}

async function fetchFeedbacks() {
    const searchVal  = document.getElementById("searchFilter").value;
    const sentVal    = document.getElementById("sentimentFilter").value;
    const statusVal  = document.getElementById("statusFilter").value;
    const tableBody  = document.getElementById("feedbackTableBody");

    tableBody.innerHTML = `<tr><td colspan="6" class="table-loading">Memuat data aduan...</td></tr>`;

    try {
        const url = `/api/feedbacks?search=${encodeURIComponent(searchVal)}&sentiment=${sentVal}&status=${statusVal}`;
        const response = await fetch(url);
        const json = await response.json();

        if (json.status === "success") {
            globalFeedbacks = json.data;

            if (globalFeedbacks.length === 0) {
                tableBody.innerHTML = `<tr><td colspan="6" class="table-loading">Tidak ada ulasan yang sesuai filter.</td></tr>`;
                return;
            }

            tableBody.innerHTML = "";

            globalFeedbacks.forEach(item => {
                const tr = document.createElement("tr");

                // Date
                const date = new Date(item.created_at);
                const dateStr = date.toLocaleDateString("id-ID", {
                    day: "2-digit", month: "short", year: "numeric"
                }) + " " + date.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });

                // Sentiment badge
                let sentClass = "sentiment-netral";
                let sentLabel = "😐 Netral";
                if (item.sentiment === "positif") { sentClass = "sentiment-positif"; sentLabel = "👍 Positif"; }
                else if (item.sentiment === "negatif") { sentClass = "sentiment-negatif"; sentLabel = "👎 Negatif"; }

                // Status badge
                let statusClass = "status-pending";
                let statusLabel = "Pending";
                if (item.status === "Diproses") { statusClass = "status-diproses"; statusLabel = "Diproses"; }
                else if (item.status === "Selesai") { statusClass = "status-selesai"; statusLabel = "Selesai"; }

                // Prob mini bars
                const probBars = buildProbMini(item);

                tr.innerHTML = `
                    <td class="date-cell">${dateStr}</td>
                    <td class="review-text-cell" title="${escapeHtml(item.raw_text)}">${escapeHtml(truncate(item.raw_text, 80))}</td>
                    <td><span class="sentiment-badge ${sentClass}">${sentLabel}</span></td>
                    <td>${probBars}</td>
                    <td><span class="status-badge ${statusClass}">${statusLabel}</span></td>
                    <td><button class="btn-action" onclick="openDetailsModal(${item.id})">Proses</button></td>
                `;

                tableBody.appendChild(tr);
            });
        }
    } catch (e) {
        console.error("Feedbacks fetch error:", e);
        tableBody.innerHTML = `<tr><td colspan="6" class="table-loading" style="color:var(--color-ember-red)">Gagal memuat data dari server.</td></tr>`;
    }
}

function buildProbMini(item) {
    const barColor = (sent) => {
        if (sent === "positif") return "bar-positive";
        if (sent === "negatif") return "bar-negative";
        return "bar-neutral";
    };
    const fmt = (v) => Math.round(v * 100);

    return `<div class="prob-mini">
        <div class="prob-mini-row">
            <span class="prob-mini-label">Pos</span>
            <div class="prob-mini-track"><div class="prob-mini-fill bar-positive" style="width:${fmt(item.prob_pos)}%"></div></div>
            <span class="prob-mini-val">${fmt(item.prob_pos)}%</span>
        </div>
        <div class="prob-mini-row">
            <span class="prob-mini-label">Neu</span>
            <div class="prob-mini-track"><div class="prob-mini-fill bar-neutral" style="width:${fmt(item.prob_neu)}%"></div></div>
            <span class="prob-mini-val">${fmt(item.prob_neu)}%</span>
        </div>
        <div class="prob-mini-row">
            <span class="prob-mini-label">Neg</span>
            <div class="prob-mini-track"><div class="prob-mini-fill bar-negative" style="width:${fmt(item.prob_neg)}%"></div></div>
            <span class="prob-mini-val">${fmt(item.prob_neg)}%</span>
        </div>
    </div>`;
}

function openDetailsModal(id) {
    const item = globalFeedbacks.find(x => x.id === id);
    if (!item) return;

    document.getElementById("modalItemId").value   = item.id;
    document.getElementById("modalRawText").textContent = item.raw_text;
    document.getElementById("modalNotesText").value = item.admin_notes || "";
    document.getElementById("modalStatusSelect").value = item.status;

    const badgeContainer = document.getElementById("modalSentimentBadge");
    let sentClass = "sentiment-netral"; let sentLabel = "😐 Netral";
    if (item.sentiment === "positif") { sentClass = "sentiment-positif"; sentLabel = "👍 Positif"; }
    else if (item.sentiment === "negatif") { sentClass = "sentiment-negatif"; sentLabel = "👎 Negatif"; }
    badgeContainer.innerHTML = `<span class="sentiment-badge ${sentClass}">${sentLabel}</span>`;

    setBar("modalProbPosBar", "modalProbPosVal", item.prob_pos);
    setBar("modalProbNeuBar", "modalProbNeuVal", item.prob_neu);
    setBar("modalProbNegBar", "modalProbNegVal", item.prob_neg);

    document.getElementById("detailsModal").classList.remove("hidden");
}

function setBar(barId, valId, value) {
    const pct = Math.round(value * 100);
    document.getElementById(valId).textContent = pct + "%";
    document.getElementById(barId).style.width = pct + "%";
}

function closeDetailsModal() {
    document.getElementById("detailsModal").classList.add("hidden");
}

async function saveResolutionNotes() {
    const id     = document.getElementById("modalItemId").value;
    const status = document.getElementById("modalStatusSelect").value;
    const notes  = document.getElementById("modalNotesText").value.trim();

    try {
        const [sRes, nRes] = await Promise.all([
            fetch(`/api/feedbacks/${id}/status`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status })
            }),
            fetch(`/api/feedbacks/${id}/notes`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ admin_notes: notes })
            })
        ]);

        const sJson = await sRes.json();
        const nJson = await nRes.json();

        if (sJson.status === "success" && nJson.status === "success") {
            closeDetailsModal();
            showToast("✅ Aspirasi berhasil diperbarui!");
            loadDashboard();
        } else {
            alert("Gagal menyimpan perubahan.");
        }
    } catch (e) {
        console.error("Save error:", e);
        alert("Terjadi kesalahan sistem saat menyimpan.");
    }
}

async function deleteReviewEntry() {
    const id = document.getElementById("modalItemId").value;
    if (!confirm("Yakin ingin menghapus ulasan ini secara permanen?")) return;

    try {
        const response = await fetch(`/api/feedbacks/${id}`, { method: "DELETE" });
        const json = await response.json();

        if (json.status === "success") {
            closeDetailsModal();
            showToast("🗑️ Ulasan berhasil dihapus.");
            loadDashboard();
        } else {
            alert("Gagal menghapus aduan.");
        }
    } catch (e) {
        console.error("Delete error:", e);
        alert("Terjadi kesalahan saat menghapus data.");
    }
}

function showToast(msg) {
    const toast    = document.getElementById("toast");
    const toastMsg = document.getElementById("toastMsg");
    toastMsg.textContent = msg;
    toast.classList.remove("hidden");
    setTimeout(() => toast.classList.add("hidden"), 3000);
}

// Utilities
function truncate(str, n) {
    return str.length <= n ? str : str.slice(0, n) + "...";
}

function escapeHtml(str) {
    return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function debounce(func, wait) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}
