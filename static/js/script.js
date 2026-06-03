// ==========================================================================
// PORTAL SUARA MAHASISWA - FRONTEND LOGIC SYSTEM (VANILLA JS)
// ==========================================================================

document.addEventListener("DOMContentLoaded", () => {
    // Determine which page we are on
    const isStudentPage = document.getElementById("feedbackForm") !== null;
    const isAdminPage = document.getElementById("feedbackTableBody") !== null;

    if (isStudentPage) {
        initStudentPortal();
    }
    
    if (isAdminPage) {
        initAdminDashboard();
    }
});

// ==========================================================================
// A. STUDENT PORTAL LOGIC
// ==========================================================================
function initStudentPortal() {
    const feedbackForm = document.getElementById("feedbackForm");
    const reviewText = document.getElementById("reviewText");
    const charCount = document.getElementById("charCount");
    const submitBtn = document.getElementById("submitBtn");
    const btnText = submitBtn.querySelector(".btn-text");
    const spinner = submitBtn.querySelector(".spinner");
    
    const resultCard = document.getElementById("resultCard");
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
        const textLength = reviewText.value.length;
        charCount.textContent = textLength;
        
        if (textLength > 500) {
            charCount.style.color = "var(--neg-color)";
            submitBtn.disabled = true;
        } else {
            charCount.style.color = "var(--text-light)";
            submitBtn.disabled = false;
        }
    });

    // 2. Clickable Topic Suggestions Chips
    chips.forEach(chip => {
        chip.addEventListener("click", () => {
            const suggestion = chip.getAttribute("data-text");
            reviewText.value = suggestion;
            // Trigger input event to update char counter
            reviewText.dispatchEvent(new Event("input"));
            // Scroll textarea into focus
            reviewText.focus();
        });
    });

    // 3. Form Submission
    feedbackForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        
        const text = reviewText.value.trim();
        if (!text) return;

        // Show loading state
        submitBtn.disabled = true;
        btnText.classList.add("hidden");
        spinner.classList.remove("hidden");
        
        try {
            const response = await fetch("/api/submit", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ text })
            });

            const result = await response.json();
            
            if (result.status === "success") {
                // Populate Result Card
                const sentiment = result.sentiment; // 'positif', 'netral', 'negatif'
                const prob = result.probabilities;

                // Set Emoji and Label
                let labelText = "Netral";
                let emoji = "😐";
                let colorClass = "badge-neu";
                
                if (sentiment === "positif") {
                    labelText = "Positif";
                    emoji = "😊";
                    colorClass = "badge-pos";
                } else if (sentiment === "negatif") {
                    labelText = "Negatif";
                    emoji = "😔";
                    colorClass = "badge-neg";
                }

                sentimentEmoji.textContent = emoji;
                sentimentLabel.textContent = labelText;
                
                // Colorize the sentiment label
                sentimentLabel.className = "sentiment-label " + colorClass;

                // Update Confidence bars
                updateProgressBar(probPosBar, probPosVal, prob.positif);
                updateProgressBar(probNeuBar, probNeuVal, prob.netral);
                updateProgressBar(probNegBar, probNegVal, prob.negatif);

                // Show Results Card
                resultCard.classList.remove("hidden");
                
                // Smooth scroll to results
                resultCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
                
                // Clear Form
                reviewText.value = "";
                charCount.textContent = "0";
                
            } else {
                alert("Gagal melakukan analisis: " + result.message);
            }
        } catch (error) {
            console.error("Error submitting review:", error);
            alert("Terjadi kesalahan sistem saat menghubungi server.");
        } finally {
            // Restore button state
            submitBtn.disabled = false;
            btnText.classList.remove("hidden");
            spinner.classList.add("hidden");
        }
    });

    // Helper to update bars with percentage
    function updateProgressBar(barElement, textElement, value) {
        const pct = Math.round(value * 100);
        textElement.textContent = pct + "%";
        barElement.style.width = pct + "%";
    }

    // 4. Close Result Card
    closeResultBtn.addEventListener("click", () => {
        resultCard.classList.add("hidden");
    });
}


// ==========================================================================
// B. ADMIN DASHBOARD LOGIC
// ==========================================================================
// Make modal globally accessible for table actions
let globalFeedbacks = []; 
let sentimentChartObj = null;
let statusChartObj = null;

function initAdminDashboard() {
    // Elements
    const searchFilter = document.getElementById("searchFilter");
    const sentimentFilter = document.getElementById("sentimentFilter");
    const statusFilter = document.getElementById("statusFilter");
    
    // Modal Elements
    const detailsModal = document.getElementById("detailsModal");
    const closeModalBtn = document.getElementById("closeModalBtn");
    const saveChangesBtn = document.getElementById("saveChangesBtn");
    const deleteBtn = document.getElementById("deleteBtn");
    
    // Setup Action Listeners
    closeModalBtn.addEventListener("click", closeDetailsModal);
    document.querySelector(".modal-backdrop").addEventListener("click", closeDetailsModal);
    
    saveChangesBtn.addEventListener("click", saveResolutionNotes);
    deleteBtn.addEventListener("click", deleteReviewEntry);

    // Filter event listeners (real-time reload)
    searchFilter.addEventListener("input", debounce(() => {
        fetchFeedbacks();
    }, 300));
    
    sentimentFilter.addEventListener("change", fetchFeedbacks);
    statusFilter.addEventListener("change", fetchFeedbacks);

    // Initial load
    loadDashboard();
}

// Reload everything on dashboard
function loadDashboard() {
    fetchStats();
    fetchFeedbacks();
}

// Fetch stats and render charts
async function fetchStats() {
    try {
        const response = await fetch("/api/stats");
        const json = await response.json();
        
        if (json.status === "success") {
            const stats = json.stats;
            
            // 1. Update counter cards
            document.getElementById("statTotal").textContent = stats.total;
            document.getElementById("statPositive").textContent = stats.sentiment.positif;
            document.getElementById("statNeutral").textContent = stats.sentiment.netral;
            document.getElementById("statNegative").textContent = stats.sentiment.negatif;
            
            // 2. Render/Update Sentiment Chart (Doughnut)
            renderSentimentChart(stats.sentiment);
            
            // 3. Render/Update Status Chart (Bar)
            renderStatusChart(stats.status);
            
        }
    } catch (e) {
        console.error("Failed to fetch dashboard stats", e);
    }
}

// Render Doughnut Chart for Sentiments
function renderSentimentChart(sentimentStats) {
    const ctx = document.getElementById("sentimentChart").getContext("2d");
    
    if (sentimentChartObj) {
        sentimentChartObj.destroy();
    }
    
    sentimentChartObj = new Chart(ctx, {
        type: "doughnut",
        data: {
            labels: ["Positif", "Netral", "Negatif"],
            datasets: [{
                data: [sentimentStats.positif, sentimentStats.netral, sentimentStats.negatif],
                backgroundColor: ["#10b981", "#f59e0b", "#ef4444"],
                borderWidth: 2,
                borderColor: "#ffffff"
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: "bottom",
                    labels: {
                        font: { family: "Inter", size: 12 },
                        padding: 15
                    }
                }
            },
            cutout: "70%"
        }
    });
}

// Render Horizontal Bar Chart for Statuses
function renderStatusChart(statusStats) {
    const ctx = document.getElementById("statusChart").getContext("2d");
    
    if (statusChartObj) {
        statusChartObj.destroy();
    }
    
    statusChartObj = new Chart(ctx, {
        type: "bar",
        data: {
            labels: ["Pending", "Diproses", "Selesai"],
            datasets: [{
                label: "Jumlah Aduan",
                data: [statusStats.Pending, statusStats.Diproses, statusStats.Selesai],
                backgroundColor: ["#64748b", "#3b82f6", "#10b981"],
                borderRadius: 6
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
                        font: { family: "Inter" }
                    },
                    grid: { color: "#f1f5f9" }
                },
                x: {
                    ticks: { font: { family: "Inter" } },
                    grid: { display: false }
                }
            }
        }
    });
}

// Fetch feedback items and fill the table
async function fetchFeedbacks() {
    const searchVal = document.getElementById("searchFilter").value;
    const sentVal = document.getElementById("sentimentFilter").value;
    const statusVal = document.getElementById("statusFilter").value;
    const tableBody = document.getElementById("feedbackTableBody");
    
    tableBody.innerHTML = `<tr><td colspan="6" class="table-loading">Memuat data aduan...</td></tr>`;
    
    try {
        const url = `/api/feedbacks?search=${encodeURIComponent(searchVal)}&sentiment=${sentVal}&status=${statusVal}`;
        const response = await fetch(url);
        const json = await response.json();
        
        if (json.status === "success") {
            globalFeedbacks = json.data;
            
            if (globalFeedbacks.length === 0) {
                tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:30px; color:var(--text-muted);">Tidak ada ulasan mahasiswa yang sesuai dengan filter.</td></tr>`;
                return;
            }
            
            tableBody.innerHTML = "";
            
            globalFeedbacks.forEach(item => {
                const tr = document.createElement("tr");
                
                // Format Date
                const date = new Date(item.created_at);
                const dateStr = date.toLocaleDateString("id-ID", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit"
                });
                
                // Sentiment Badge
                let sentBadge = `<span class="badge badge-sentiment badge-neu">😐 Netral</span>`;
                if (item.sentiment === "positif") {
                    sentBadge = `<span class="badge badge-sentiment badge-pos">👍 Positif</span>`;
                } else if (item.sentiment === "negatif") {
                    sentBadge = `<span class="badge badge-sentiment badge-neg">👎 Negatif</span>`;
                }
                
                // Max probability score
                const maxProb = Math.max(item.prob_pos, item.prob_neu, item.prob_neg);
                const maxProbPct = Math.round(maxProb * 100) + "%";
                
                // Status Badge
                let statusBadge = `<span class="badge badge-status status-pending">🕒 Pending</span>`;
                if (item.status === "Diproses") {
                    statusBadge = `<span class="badge badge-status status-process">⚙️ Diproses</span>`;
                } else if (item.status === "Selesai") {
                    statusBadge = `<span class="badge badge-status status-resolved">✅ Selesai</span>`;
                }
                
                tr.innerHTML = `
                    <td><strong>${dateStr}</strong></td>
                    <td class="table-text-cell" title="${item.raw_text}">${truncateString(item.raw_text, 80)}</td>
                    <td>${sentBadge}</td>
                    <td>
                        <div style="display:flex; align-items:center; gap:8px;">
                            <div class="progress-bar-bg" style="width: 60px; height: 6px;">
                                <div class="progress-bar ${item.sentiment === 'positif' ? 'bar-positive' : item.sentiment === 'negatif' ? 'bar-negative' : 'bar-neutral'}" style="width: ${maxProb * 100}%"></div>
                            </div>
                            <span style="font-size:12px; font-weight:700;">${maxProbPct}</span>
                        </div>
                    </td>
                    <td>${statusBadge}</td>
                    <td>
                        <button class="table-action-btn" onclick="openDetailsModal(${item.id})">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                            Proses
                        </button>
                    </td>
                `;
                
                tableBody.appendChild(tr);
            });
        }
    } catch (e) {
        console.error("Error loading feedbacks:", e);
        tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:30px; color:var(--neg-color);">Gagal memuat aduan mahasiswa dari server.</td></tr>`;
    }
}

// Open Resolution Details Modal
function openDetailsModal(id) {
    const item = globalFeedbacks.find(x => x.id === id);
    if (!item) return;
    
    document.getElementById("modalItemId").value = item.id;
    document.getElementById("modalRawText").textContent = item.raw_text;
    document.getElementById("modalNotesText").value = item.admin_notes || "";
    document.getElementById("modalStatusSelect").value = item.status;
    
    // Sentiment Badge
    const badgeContainer = document.getElementById("modalSentimentBadge");
    if (item.sentiment === "positif") {
        badgeContainer.innerHTML = `<span class="badge badge-sentiment badge-pos">👍 Positif</span>`;
    } else if (item.sentiment === "negatif") {
        badgeContainer.innerHTML = `<span class="badge badge-sentiment badge-neg">👎 Negatif</span>`;
    } else {
        badgeContainer.innerHTML = `<span class="badge badge-sentiment badge-neu">😐 Netral</span>`;
    }
    
    // Probabilities Bar Update
    updateModalProbRow("modalProbPosBar", "modalProbPosVal", item.prob_pos);
    updateModalProbRow("modalProbNeuBar", "modalProbNeuVal", item.prob_neu);
    updateModalProbRow("modalProbNegBar", "modalProbNegVal", item.prob_neg);
    
    // Open Modal
    document.getElementById("detailsModal").classList.remove("hidden");
}

function updateModalProbRow(barId, valId, value) {
    const pct = Math.round(value * 100);
    document.getElementById(valId).textContent = pct + "%";
    document.getElementById(barId).style.width = pct + "%";
}

// Close Modal
function closeDetailsModal() {
    document.getElementById("detailsModal").classList.add("hidden");
}

// Save status and admin notes
async function saveResolutionNotes() {
    const id = document.getElementById("modalItemId").value;
    const status = document.getElementById("modalStatusSelect").value;
    const notes = document.getElementById("modalNotesText").value.trim();
    
    try {
        // 1. Update Status
        const statusRes = await fetch(`/api/feedbacks/${id}/status`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status })
        });
        
        // 2. Update Notes
        const notesRes = await fetch(`/api/feedbacks/${id}/notes`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ admin_notes: notes })
        });
        
        const sJson = await statusRes.json();
        const nJson = await notesRes.json();
        
        if (sJson.status === "success" && nJson.status === "success") {
            closeDetailsModal();
            showToast("Aspirasi berhasil diperbarui!");
            loadDashboard();
        } else {
            alert("Gagal menyimpan perubahan.");
        }
    } catch (e) {
        console.error("Save details error:", e);
        alert("Terjadi kesalahan sistem saat menyimpan.");
    }
}

// Delete review entry
async function deleteReviewEntry() {
    const id = document.getElementById("modalItemId").value;
    
    if (!confirm("Apakah Anda yakin ingin menghapus ulasan aduan ini secara permanen dari sistem?")) {
        return;
    }
    
    try {
        const response = await fetch(`/api/feedbacks/${id}`, {
            method: "DELETE"
        });
        
        const json = await response.json();
        
        if (json.status === "success") {
            closeDetailsModal();
            showToast("Ulasan berhasil dihapus.");
            loadDashboard();
        } else {
            alert("Gagal menghapus aduan.");
        }
    } catch (e) {
        console.error("Delete review error:", e);
        alert("Terjadi kesalahan saat menghapus data.");
    }
}

// Show Toast Alert
function showToast(msg) {
    const toast = document.getElementById("toast");
    const toastMsg = document.getElementById("toastMsg");
    
    toastMsg.textContent = msg;
    toast.classList.remove("hidden");
    
    // Auto Hide
    setTimeout(() => {
        toast.classList.add("hidden");
    }, 3000);
}

// Truncate text utility
function truncateString(str, num) {
    if (str.length <= num) return str;
    return str.slice(0, num) + "...";
}

// Debounce helper
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}
