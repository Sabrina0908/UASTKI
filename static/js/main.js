document.addEventListener("DOMContentLoaded", () => {
    // Navigation
    setupNavigation();
    
    // Search Functionality
    setupSearch();
    
    // Dataset Explorer
    setupDataset();
    
    // Evaluation System
    setupEvaluation();
});

// --- NAVIGATION ---
function setupNavigation() {
    const navButtons = document.querySelectorAll(".nav-btn");
    const tabContents = document.querySelectorAll(".tab-content");
    
    navButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            const targetTab = btn.getAttribute("data-tab");
            
            navButtons.forEach(b => b.classList.remove("active"));
            tabContents.forEach(t => t.classList.remove("active"));
            
            btn.classList.add("active");
            document.getElementById(targetTab).classList.add("active");
            
            // Load dataset when switching to dataset tab for the first time
            if (targetTab === "dataset-tab" && !datasetLoaded) {
                loadDataset(1);
            }
        });
    });
}

// --- SEARCH FUNCTIONALITY ---
function setupSearch() {
    const searchForm = document.getElementById("search-form");
    const searchInput = document.getElementById("search-input");
    const clearBtn = document.getElementById("clear-search");
    
    const analysisPanel = document.getElementById("query-analysis-panel");
    const originalQueryText = document.getElementById("original-query-text");
    const expandedQueryText = document.getElementById("expanded-query-text");
    const processedQueryText = document.getElementById("processed-query-text");
    
    const resultsCountContainer = document.getElementById("results-count-container");
    const resultsCount = document.getElementById("results-count");
    const searchResultsGrid = document.getElementById("search-results-grid");
    const searchLoader = document.getElementById("search-loader");
    const searchEmptyState = document.getElementById("search-empty-state");
    
    // Clear button visibility
    searchInput.addEventListener("input", () => {
        clearBtn.style.display = searchInput.value ? "flex" : "none";
    });
    
    clearBtn.addEventListener("click", () => {
        searchInput.value = "";
        clearBtn.style.display = "none";
        searchInput.focus();
    });
    
    // Form Submit
    searchForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const query = searchInput.value.trim();
        if (!query) return;
        
        // UI reset
        searchLoader.classList.remove("hidden");
        searchEmptyState.classList.add("hidden");
        resultsCountContainer.classList.add("hidden");
        searchResultsGrid.innerHTML = "";
        analysisPanel.classList.add("hidden");
        
        // Fetch API
        fetch(`/api/search?q=${encodeURIComponent(query)}&limit=12`)
            .then(res => res.json())
            .then(data => {
                searchLoader.classList.add("hidden");
                
                if (data.status === "success") {
                    // Update analysis
                    originalQueryText.innerText = data.query;
                    expandedQueryText.innerText = data.expanded_query;
                    processedQueryText.innerText = data.cleaned_query || "[Kosong - semua kata terhapus sebagai stopword]";
                    analysisPanel.classList.remove("hidden");
                    
                    // Update results
                    resultsCount.innerText = data.count;
                    resultsCountContainer.classList.remove("hidden");
                    
                    if (data.count === 0) {
                        searchResultsGrid.innerHTML = "";
                        searchEmptyState.innerHTML = `
                            <div class="empty-icon"><i class="fa-regular fa-face-frown"></i></div>
                            <h3>Data tidak ditemukan</h3>
                            <p>Tidak ada tempat wisata dengan nilai relevansi Cosine Similarity > 0.03 untuk query "${query}". Coba kata kunci lainnya!</p>
                        `;
                        searchEmptyState.classList.remove("hidden");
                    } else {
                        renderSearchCards(data.results, searchResultsGrid);
                    }
                }
            })
            .catch(err => {
                searchLoader.classList.add("hidden");
                alert("Gagal melakukan pencarian. Pastikan server Flask berjalan.");
                console.error(err);
            });
    });
}

function renderSearchCards(results, container) {
    container.innerHTML = "";
    
    results.forEach(item => {
        const card = document.createElement("div");
        card.className = "result-card";
        
        card.innerHTML = `
            <div class="card-top">
                <span class="category-tag">${item.kategori}</span>
                <span class="score-tag" title="Cosine Similarity Score">Score: ${item.score}</span>
            </div>
            <h4>${item.nama_wisata}</h4>
            <div class="location-info">
                <i class="fa-solid fa-location-dot"></i>
                <span>${item.kota_kabupaten}, ${item.provinsi}</span>
            </div>
            <p class="description" id="desc-${item.nama_wisata.replace(/\s+/g, '-')}">${item.deskripsi}</p>
            <div class="card-bottom">
                <button class="detail-btn" data-name="${item.nama_wisata}">
                    <span>Selengkapnya</span> <i class="fa-solid fa-chevron-right"></i>
                </button>
            </div>
        `;
        
        container.appendChild(card);
        
        // Add detail expansion event listener
        const detailBtn = card.querySelector(".detail-btn");
        const descText = card.querySelector(".description");
        detailBtn.addEventListener("click", () => {
            if (descText.style.display === "block" || descText.style.webkitLineClamp === "initial") {
                descText.style.display = "-webkit-box";
                descText.style.webkitLineClamp = "4";
                detailBtn.innerHTML = `<span>Selengkapnya</span> <i class="fa-solid fa-chevron-right"></i>`;
            } else {
                descText.style.display = "block";
                descText.style.webkitLineClamp = "initial";
                detailBtn.innerHTML = `<span>Sembunyikan</span> <i class="fa-solid fa-chevron-up"></i>`;
            }
        });
    });
}

// --- DATASET EXPLORER ---
let datasetLoaded = false;
let currentDatasetPage = 1;
let totalDatasetPages = 1;
let currentCategory = "";
let currentSearch = "";
let categoriesPopulated = false;

function setupDataset() {
    const searchInput = document.getElementById("dataset-search");
    const categorySelect = document.getElementById("dataset-category-filter");
    const prevBtn = document.getElementById("prev-page-btn");
    const nextBtn = document.getElementById("next-page-btn");
    
    // Pagination buttons click
    prevBtn.addEventListener("click", () => {
        if (currentDatasetPage > 1) {
            loadDataset(currentDatasetPage - 1);
        }
    });
    
    nextBtn.addEventListener("click", () => {
        if (currentDatasetPage < totalDatasetPages) {
            loadDataset(currentDatasetPage + 1);
        }
    });
    
    // Filters change
    categorySelect.addEventListener("change", (e) => {
        currentCategory = e.target.value;
        loadDataset(1);
    });
    
    // Search input with Debounce (300ms)
    let searchTimeout;
    searchInput.addEventListener("input", (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            currentSearch = e.target.value;
            loadDataset(1);
        }, 300);
    });
}

function loadDataset(page) {
    const tableBody = document.getElementById("dataset-table-body");
    const tableLoader = document.getElementById("table-loader");
    const currentPageSpan = document.getElementById("current-page");
    const totalPagesSpan = document.getElementById("total-pages");
    const prevBtn = document.getElementById("prev-page-btn");
    const nextBtn = document.getElementById("next-page-btn");
    const totalCountSpan = document.getElementById("total-dataset-count");
    
    tableLoader.classList.remove("hidden");
    tableBody.innerHTML = "";
    
    let url = `/api/dataset?page=${page}&limit=8`;
    if (currentCategory) url += `&category=${encodeURIComponent(currentCategory)}`;
    if (currentSearch) url += `&search=${encodeURIComponent(currentSearch)}`;
    
    fetch(url)
        .then(res => res.json())
        .then(data => {
            tableLoader.classList.add("hidden");
            
            if (data.status === "success") {
                datasetLoaded = true;
                currentDatasetPage = data.page;
                totalDatasetPages = data.total_pages;
                
                // Update pagination info
                currentPageSpan.innerText = currentDatasetPage;
                totalPagesSpan.innerText = totalDatasetPages || 1;
                totalCountSpan.innerText = data.total_records;
                
                prevBtn.disabled = currentDatasetPage <= 1;
                nextBtn.disabled = currentDatasetPage >= totalDatasetPages;
                
                // Populate category filter once
                if (!categoriesPopulated) {
                    const select = document.getElementById("dataset-category-filter");
                    data.categories.forEach(cat => {
                        const opt = document.createElement("option");
                        opt.value = cat;
                        opt.innerText = cat;
                        select.appendChild(opt);
                    });
                    categoriesPopulated = true;
                }
                
                // Populate rows
                if (data.records.length === 0) {
                    tableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 3rem;">Tidak ada data pariwisata yang cocok dengan filter pencarian.</td></tr>`;
                } else {
                    renderDatasetRows(data.records, tableBody, (page - 1) * 8);
                }
            }
        })
        .catch(err => {
            tableLoader.classList.add("hidden");
            console.error(err);
        });
}

function renderDatasetRows(records, tbody, startIndex) {
    records.forEach((record, idx) => {
        const tr = document.createElement("tr");
        
        tr.innerHTML = `
            <td>${startIndex + idx + 1}</td>
            <td style="font-weight: 600; color: #ffffff;">${record.nama_wisata}</td>
            <td><span class="badge-cat">${record.kategori}</span></td>
            <td>
                <div class="badge-loc">
                    <span class="city">${record.kota_kabupaten}</span>
                    <span class="prov">${record.provinsi}</span>
                </div>
            </td>
            <td class="desc-cell">${record.deskripsi}</td>
        `;
        
        tbody.appendChild(tr);
    });
}

// --- EVALUATION SYSTEM ---
let globalEvalData = null;

function setupEvaluation() {
    const runEvalBtn = document.getElementById("run-eval-btn");
    const evalEmptyState = document.getElementById("eval-empty-state");
    const evalLoader = document.getElementById("eval-loader");
    const evalSummaryGrid = document.getElementById("eval-summary-grid");
    const evalDetailsContainer = document.getElementById("eval-details-container");
    
    runEvalBtn.addEventListener("click", () => {
        evalEmptyState.classList.add("hidden");
        evalSummaryGrid.classList.add("hidden");
        evalDetailsContainer.classList.add("hidden");
        evalLoader.classList.remove("hidden");
        
        fetch("/api/evaluate")
            .then(res => res.json())
            .then(data => {
                evalLoader.classList.add("hidden");
                
                if (data.status === "success") {
                    globalEvalData = data.results;
                    
                    // Update Summary
                    document.getElementById("avg-p3").innerText = data.averages.precision_at_3.toFixed(2);
                    document.getElementById("avg-p5").innerText = data.averages.precision_at_5.toFixed(2);
                    document.getElementById("avg-p10").innerText = data.averages.precision_at_10.toFixed(2);
                    
                    evalSummaryGrid.classList.remove("hidden");
                    
                    // Render details table
                    renderEvalTable(data.results);
                    evalDetailsContainer.classList.remove("hidden");
                }
            })
            .catch(err => {
                evalLoader.classList.add("hidden");
                alert("Gagal melakukan evaluasi. Pastikan server Flask berjalan.");
                console.error(err);
            });
    });
}

function renderEvalTable(results) {
    const tableBody = document.getElementById("eval-table-body");
    tableBody.innerHTML = "";
    
    results.forEach((row, idx) => {
        const tr = document.createElement("tr");
        tr.setAttribute("data-index", idx);
        
        const p3Class = getPrecisionClass(row.precision_at_3);
        const p5Class = getPrecisionClass(row.precision_at_5);
        const p10Class = getPrecisionClass(row.precision_at_10);
        
        tr.innerHTML = `
            <td style="font-weight: 500; color: #ffffff;">"${row.query}"</td>
            <td class="center"><span class="precision-val ${p3Class}">${row.precision_at_3.toFixed(1)}</span></td>
            <td class="center"><span class="precision-val ${p5Class}">${row.precision_at_5.toFixed(1)}</span></td>
            <td class="center"><span class="precision-val ${p10Class}">${row.precision_at_10.toFixed(1)}</span></td>
            <td class="right">
                <button class="inspect-btn">Inspeksi <i class="fa-solid fa-arrow-right-long"></i></button>
            </td>
        `;
        
        tr.addEventListener("click", () => {
            // Remove active class from all rows
            document.querySelectorAll("#eval-table-body tr").forEach(r => r.classList.remove("active"));
            tr.classList.add("active");
            
            inspectQueryDetails(row);
        });
        
        tableBody.appendChild(tr);
    });
}

function getPrecisionClass(val) {
    if (val >= 0.8) return "high";
    if (val >= 0.4) return "mid";
    return "low";
}

function inspectQueryDetails(row) {
    const inspectorEmpty = document.querySelector(".inspector-empty");
    const inspectorContent = document.getElementById("inspector-content");
    
    inspectorEmpty.classList.add("hidden");
    inspectorContent.classList.remove("hidden");
    
    // Set query title and score
    document.getElementById("inspector-query-title").innerText = `Query: "${row.query}"`;
    document.getElementById("inspector-query-p10").innerText = `P@10: ${row.precision_at_10.toFixed(2)}`;
    
    // Set ground truth tags
    const truthContainer = document.getElementById("inspector-truth-tags");
    truthContainer.innerHTML = "";
    row.truth.forEach(t => {
        const span = document.createElement("span");
        span.className = "truth-tag";
        span.innerText = t;
        truthContainer.appendChild(span);
    });
    
    // Set retrieved list
    const list = document.getElementById("inspector-retrieved-list");
    list.innerHTML = "";
    
    if (row.retrieved.length === 0) {
        list.innerHTML = `<li style="list-style: none; color: var(--text-muted); text-align: center; padding-top: 2rem;">Tidak ada dokumen yang ter-retrieve.</li>`;
        return;
    }
    
    row.retrieved.forEach(doc => {
        const li = document.createElement("li");
        li.className = `retrieved-item ${doc.relevant ? 'relevant' : ''}`;
        
        li.innerHTML = `
            <div>
                <span class="doc-name">${doc.nama_wisata}</span>
                <span class="doc-meta">(${doc.kota}, Score: ${doc.score})</span>
            </div>
            <span class="inspect-badge ${doc.relevant ? 'rel' : 'nrel'}">
                ${doc.relevant ? '<i class="fa-solid fa-check"></i> Rel' : '<i class="fa-solid fa-xmark"></i> Irrel'}
            </span>
        `;
        
        list.appendChild(li);
    });
}
