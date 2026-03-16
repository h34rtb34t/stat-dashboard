// --- dashboard.js (Enhanced) ---
const DEBUG = false;
const RETRIEVAL_WORKER_URL = 'https://patient-mode-9cfb.azelbane87.workers.dev/';
const CHART_COLORS_FALLBACK = [
    'rgba(54, 162, 235, 0.7)', 'rgba(255, 99, 132, 0.7)', 'rgba(75, 192, 192, 0.7)',
    'rgba(255, 205, 86, 0.7)', 'rgba(153, 102, 255, 0.7)', 'rgba(255, 159, 64, 0.7)',
    'rgba(201, 203, 207, 0.7)', 'rgba(100, 100, 255, 0.7)', 'rgba(255, 100, 100, 0.7)'
];
const EVENTS_PER_PAGE = 50;
function debugLog(...args) { if (DEBUG) console.log(...args); }

// --- DOM Elements ---
const fetchDataBtn = document.getElementById('fetchDataBtn');
const secretTokenInput = document.getElementById('secretToken');
const statusEl = document.getElementById('status');
const rawEventsTbody = document.querySelector('#rawEventsTable tbody');
const totalViewsEl = document.querySelector('#totalViewsBox .value');
const uniqueDaysEl = document.querySelector('#uniqueDaysBox .value');
const uniqueVisitorsEl = document.querySelector('#uniqueVisitorsBox .value');
const bounceRateEl = document.querySelector('#bounceRateBox .value');
const avgSessionEl = document.querySelector('#avgSessionBox .value');
const themeToggleBtn = document.getElementById('themeToggleBtn');
const scrollToTopBtn = document.getElementById("scrollToTopBtn");
const filterEventTypeSelect = document.getElementById('filterEventType');
const filterKeywordInput = document.getElementById('filterKeyword');
const filterLinkTypeSelect = document.getElementById('filterLinkType');
const filterModalTypeSelect = document.getElementById('filterModalType');
const filterProjectIdInput = document.getElementById('filterProjectId');
const timeRangeFilterSelect = document.getElementById('timeRangeFilter');
const loadingSpinner = document.getElementById('loadingSpinner');
const lastUpdatedEl = document.getElementById('lastUpdated');
const exportCsvBtn = document.getElementById('exportCsvBtn');
const prevPageBtn = document.getElementById('prevPageBtn');
const nextPageBtn = document.getElementById('nextPageBtn');
const pageInfoEl = document.getElementById('pageInfo');
const mapLayerToggle = document.getElementById('mapLayerToggle');
const autoRefreshCheckbox = document.getElementById('autoRefreshCheckbox');

// --- Chart/Map/State ---
let chartInstances = {};
let mapInstance = null;
let markerLayerGroup = null;
let lightTileLayer = null;
let darkTileLayer = null;
let heatLayer = null;
let showHeatmap = false;
let currentRawEvents = [];
let currentFilteredEvents = [];
let currentPage = 1;
let autoRefreshInterval = null;

// --- Utilities ---
function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    toast.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span><span class="toast-message">${message}</span>`;
    container.appendChild(toast);
    requestAnimationFrame(() => { toast.offsetHeight; toast.classList.add('toast-visible'); });
    setTimeout(() => {
        toast.classList.remove('toast-visible');
        toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    }, duration);
}

function animateCountUp(element, targetValue, duration = 800) {
    const num = parseInt(targetValue, 10);
    if (isNaN(num) || String(num) !== String(targetValue).trim()) { element.textContent = targetValue; return; }
    const startTime = performance.now();
    function update(now) {
        const progress = Math.min((now - startTime) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        element.textContent = Math.round(num * eased);
        if (progress < 1) requestAnimationFrame(update); else element.textContent = targetValue;
    }
    requestAnimationFrame(update);
}

function showSkeletons() { document.querySelectorAll('.skeleton-chart').forEach(el => el.classList.remove('skeleton-hidden')); }
function hideSkeletons() { document.querySelectorAll('.skeleton-chart').forEach(el => el.classList.add('skeleton-hidden')); }
function hideSkeletonFor(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (canvas) { const sk = canvas.parentElement.querySelector('.skeleton-chart'); if (sk) sk.classList.add('skeleton-hidden'); }
}

function getEventDate(event) {
    if (!event) return new Date(0);
    const dateVal = event.receivedAt || event.timestamp;
    if (!dateVal) return new Date(0);
    let parsedDate = new Date(dateVal);
    if (isNaN(parsedDate.getTime()) && typeof dateVal === 'string') {
        const parts = dateVal.split(/[\s,]+/);
        if (parts.length >= 1) {
            const dateParts = parts[0].split('/');
            if (dateParts.length === 3) {
                const day = parseInt(dateParts[0], 10), month = parseInt(dateParts[1], 10) - 1, year = parseInt(dateParts[2], 10);
                let hours = 0, minutes = 0, seconds = 0;
                if (parts.length >= 2) { const tp = parts[1].split(':'); hours = parseInt(tp[0],10)||0; minutes = parseInt(tp[1],10)||0; seconds = parseInt(tp[2],10)||0; }
                const fb = new Date(year, month, day, hours, minutes, seconds);
                if (!isNaN(fb.getTime())) return fb;
            }
        }
    }
    return isNaN(parsedDate.getTime()) ? new Date(0) : parsedDate;
}

function formatLabel(key) {
    if (!key) return 'Unknown';
    return String(key).replace(/([A-Z])/g, ' $1').replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).replace(/ +/g, ' ').trim();
}

function formatDuration(ms) {
    if (ms <= 0) return '0s';
    const s = Math.floor(ms / 1000), m = Math.floor(s / 60), h = Math.floor(m / 60);
    if (h > 0) return `${h}h ${m % 60}m`;
    if (m > 0) return `${m}m ${s % 60}s`;
    return `${s}s`;
}

function analyzeSessions(events) {
    const byIp = {};
    events.forEach(e => { const ip = e.location?.ip; if (!ip) return; if (!byIp[ip]) byIp[ip] = []; byIp[ip].push(e); });
    const sessions = [], GAP = 30 * 60 * 1000;
    Object.values(byIp).forEach(ipEvts => {
        const sorted = ipEvts.sort((a, b) => getEventDate(a).getTime() - getEventDate(b).getTime());
        let sess = [sorted[0]];
        for (let i = 1; i < sorted.length; i++) {
            if (getEventDate(sorted[i]).getTime() - getEventDate(sorted[i-1]).getTime() > GAP) { sessions.push(sess); sess = [sorted[i]]; }
            else sess.push(sorted[i]);
        }
        sessions.push(sess);
    });
    const withPV = sessions.filter(s => s.some(e => e.type === 'pageview'));
    const bounced = withPV.filter(s => s.filter(e => e.type === 'pageview').length === 1);
    const bounceRate = withPV.length > 0 ? (bounced.length / withPV.length * 100) : 0;
    const multi = sessions.filter(s => s.length >= 2);
    let totalDur = 0;
    multi.forEach(s => { totalDur += getEventDate(s[s.length-1]).getTime() - getEventDate(s[0]).getTime(); });
    return { bounceRate, avgDurationMs: multi.length > 0 ? totalDur / multi.length : 0 };
}

function exportToCSV(events) {
    if (!events || events.length === 0) { showToast('No events to export', 'warning'); return; }
    const headers = ['Timestamp','Type','Page','Project','Referrer','ScreenWidth','ScreenHeight','Country','City','IP'];
    const rows = events.map(e => {
        const d = getEventDate(e);
        return [d.getTime()>0?d.toISOString():'N/A', e.type||'', e.page||'', e.projectId||e.details?.projectId||'',
            e.referrer||'', e.screenWidth||'', e.screenHeight||'', e.location?.country||'', e.location?.city||'', e.location?.ip||'']
            .map(v => `"${String(v).replace(/"/g,'""')}"`);
    });
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `dashboard_events_${new Date().toISOString().split('T')[0]}.csv`;
    a.click(); URL.revokeObjectURL(url);
    showToast(`Exported ${events.length} events`, 'success');
}

function readUrlParams() {
    const p = new URLSearchParams(window.location.search);
    if (p.get('type') && filterEventTypeSelect) filterEventTypeSelect.value = p.get('type');
    if (p.get('keyword') && filterKeywordInput) filterKeywordInput.value = p.get('keyword');
    if (p.get('linkType') && filterLinkTypeSelect) filterLinkTypeSelect.value = p.get('linkType');
    if (p.get('modalType') && filterModalTypeSelect) filterModalTypeSelect.value = p.get('modalType');
    if (p.get('project') && filterProjectIdInput) filterProjectIdInput.value = p.get('project');
    if (p.get('timeRange') && timeRangeFilterSelect) timeRangeFilterSelect.value = p.get('timeRange');
}

function writeUrlParams() {
    const p = new URLSearchParams();
    if (filterEventTypeSelect?.value) p.set('type', filterEventTypeSelect.value);
    if (filterKeywordInput?.value) p.set('keyword', filterKeywordInput.value);
    if (filterLinkTypeSelect?.value) p.set('linkType', filterLinkTypeSelect.value);
    if (filterModalTypeSelect?.value) p.set('modalType', filterModalTypeSelect.value);
    if (filterProjectIdInput?.value) p.set('project', filterProjectIdInput.value);
    if (timeRangeFilterSelect?.value && timeRangeFilterSelect.value !== 'all') p.set('timeRange', timeRangeFilterSelect.value);
    const qs = p.toString();
    window.history.replaceState({}, '', qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
}

// --- Theme ---
function applyTheme(theme) {
    const isDark = theme === 'dark';
    document.body.classList.toggle('dark-theme', isDark);
    themeToggleBtn.textContent = isDark ? '☀️' : '🌙';
    themeToggleBtn.title = isDark ? 'Switch to Light Theme (T)' : 'Switch to Dark Theme (T)';
    Chart.defaults.color = isDark ? '#e0e0e0' : '#555';
    Chart.defaults.borderColor = isDark ? '#444' : '#e1e4e8';
    Object.values(chartInstances).forEach(chart => {
        if (!chart) return;
        try {
            if(chart.options.scales?.x) { chart.options.scales.x.grid.color = Chart.defaults.borderColor; chart.options.scales.x.ticks.color = Chart.defaults.color; }
            if(chart.options.scales?.y) { chart.options.scales.y.grid.color = Chart.defaults.borderColor; chart.options.scales.y.ticks.color = Chart.defaults.color; }
            if(chart.options.scales?.r) { chart.options.scales.r.grid.color = Chart.defaults.borderColor; chart.options.scales.r.angleLines.color = Chart.defaults.borderColor; chart.options.scales.r.pointLabels.color = Chart.defaults.color; }
            if (chart.options.plugins?.legend?.labels) chart.options.plugins.legend.labels.color = Chart.defaults.color;
            if (chart.options.plugins?.title?.text) chart.options.plugins.title.color = Chart.defaults.color;
            if (chart.options.plugins?.tooltip) {
                chart.options.plugins.tooltip.bodyColor = Chart.defaults.color;
                chart.options.plugins.tooltip.titleColor = Chart.defaults.color;
                chart.options.plugins.tooltip.backgroundColor = isDark ? 'rgba(44,44,44,0.9)' : 'rgba(255,255,255,0.9)';
                chart.options.plugins.tooltip.borderColor = Chart.defaults.borderColor;
            }
            chart.update('none');
        } catch (e) { console.warn("Error updating chart theme:", e); }
    });
    if (mapInstance && lightTileLayer && darkTileLayer) {
        try {
            if (isDark) { if (mapInstance.hasLayer(lightTileLayer)) mapInstance.removeLayer(lightTileLayer); if (!mapInstance.hasLayer(darkTileLayer)) mapInstance.addLayer(darkTileLayer); }
            else { if (mapInstance.hasLayer(darkTileLayer)) mapInstance.removeLayer(darkTileLayer); if (!mapInstance.hasLayer(lightTileLayer)) mapInstance.addLayer(lightTileLayer); }
        } catch (e) { console.warn("Error switching map tiles:", e); }
    }
}
function toggleTheme() {
    const newTheme = document.body.classList.contains('dark-theme') ? 'light' : 'dark';
    localStorage.setItem('dashboardTheme', newTheme);
    applyTheme(newTheme);
}

// --- Scroll ---
function handleScroll() {
    if (document.body.scrollTop > 100 || document.documentElement.scrollTop > 100) scrollToTopBtn.classList.add('show');
    else scrollToTopBtn.classList.remove('show');
}
function goToTop() { window.scrollTo({ top: 0 }); }

// --- Map ---
function initializeMap() {
    if (mapInstance) return;
    try {
        if (typeof L === 'undefined') { console.error("Leaflet not found."); return; }
        const mapContainer = document.getElementById('locationMap');
        if (!mapContainer) return;
        mapInstance = L.map('locationMap', { maxBounds: [[-90,-180],[90,180]], maxBoundsViscosity: 1.0, worldCopyJump: false }).setView([20,0], 2);
        lightTileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { minZoom:2, maxZoom:18, noWrap:true, attribution:'© <a href="https://www.openstreetmap.org/copyright">OSM</a>' });
        darkTileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { attribution:'© <a href="https://osm.org/copyright">OSM</a> © <a href="https://carto.com/attributions">CARTO</a>', subdomains:'abcd', minZoom:2, maxZoom:19, noWrap:true });
        if (document.body.classList.contains('dark-theme')) darkTileLayer.addTo(mapInstance); else lightTileLayer.addTo(mapInstance);
        markerLayerGroup = L.markerClusterGroup();
        markerLayerGroup.addTo(mapInstance);
        debugLog("Map initialized.");
    } catch (e) { console.error("Map init error:", e); mapInstance = null; }
}

function renderLocationMap(events) {
    if (!mapInstance || !markerLayerGroup) { initializeMap(); if (!mapInstance) return; }
    markerLayerGroup.clearLayers();
    if (heatLayer && mapInstance.hasLayer(heatLayer)) mapInstance.removeLayer(heatLayer);
    const heatData = [];
    let count = 0;
    [...events].reverse().forEach(event => {
        const lat = parseFloat(event.location?.latitude), lon = parseFloat(event.location?.longitude);
        if (!isNaN(lat) && !isNaN(lon) && !(lat===0 && lon===0 && event.location?.ip !== '127.0.0.1')) {
            const page = event.page || 'N/A', type = event.type || 'N/A';
            const evDate = getEventDate(event);
            const ts = evDate.getTime() > 0 ? evDate.toLocaleString() : 'N/A';
            const city = event.location.city||'?', region = event.location.regionCode||'?', country = event.location.country||'?';
            let popup = `<b>Time:</b> ${ts}<br><b>Type:</b> ${type}<br>`;
            if (page !== 'N/A') popup += `<b>Page:</b> ${page.length>50?page.substring(0,47)+'...':page}<br>`;
            popup += `<b>Location:</b> ${city}, ${region}, ${country}`;
            try { L.marker([lat,lon]).bindPopup(popup).addTo(markerLayerGroup); count++; } catch(e) {}
            heatData.push([lat, lon, 1]);
        }
    });
    if (showHeatmap && typeof L.heatLayer === 'function') {
        heatLayer = L.heatLayer(heatData, { radius:25, blur:15, maxZoom:10 });
        heatLayer.addTo(mapInstance);
        if (mapInstance.hasLayer(markerLayerGroup)) mapInstance.removeLayer(markerLayerGroup);
    }
    debugLog(`Added ${count} markers.`);
}

function toggleHeatmap() {
    showHeatmap = !showHeatmap;
    if (!mapLayerToggle) return;
    if (showHeatmap) {
        mapLayerToggle.textContent = '📍 Markers';
        if (mapInstance && markerLayerGroup && mapInstance.hasLayer(markerLayerGroup)) mapInstance.removeLayer(markerLayerGroup);
        const timeFiltered = typeof window.applyTimeRangeFilter === 'function' ? window.applyTimeRangeFilter(currentRawEvents) : currentRawEvents;
        const heatData = [];
        timeFiltered.forEach(e => {
            const lat = parseFloat(e.location?.latitude), lon = parseFloat(e.location?.longitude);
            if (!isNaN(lat) && !isNaN(lon) && !(lat===0 && lon===0)) heatData.push([lat, lon, 1]);
        });
        if (heatLayer && mapInstance) mapInstance.removeLayer(heatLayer);
        if (typeof L !== 'undefined' && typeof L.heatLayer === 'function' && mapInstance) {
            heatLayer = L.heatLayer(heatData, { radius:25, blur:15, maxZoom:10 });
            heatLayer.addTo(mapInstance);
        }
    } else {
        mapLayerToggle.textContent = '🔥 Heatmap';
        if (heatLayer && mapInstance && mapInstance.hasLayer(heatLayer)) mapInstance.removeLayer(heatLayer);
        if (markerLayerGroup && mapInstance && !mapInstance.hasLayer(markerLayerGroup)) markerLayerGroup.addTo(mapInstance);
    }
}

// --- DOMContentLoaded ---
document.addEventListener('DOMContentLoaded', () => {
    initializeMap();
    const savedTheme = localStorage.getItem('dashboardTheme') || 'light';
    applyTheme(savedTheme);
    secretTokenInput.value = localStorage.getItem('dashboardAuthToken') || '';
    rawEventsTbody.innerHTML = '<tr><td colspan="4" class="table-initial-msg">Click \'Fetch Data\' to load events.</td></tr>';

    function debounce(func, wait) { let t; return function(...a) { clearTimeout(t); t = setTimeout(() => func(...a), wait); }; }

    window.applyTimeRangeFilter = function(events) {
        if (!timeRangeFilterSelect) return events;
        const val = timeRangeFilterSelect.value;
        if (val === 'all') return events;
        const hours = parseInt(val, 10);
        const cutoff = new Date(); cutoff.setHours(cutoff.getHours() - hours);
        return events.filter(e => getEventDate(e).getTime() >= cutoff.getTime());
    };

    window.updateGlobalDashboard = function() {
        const filtered = window.applyTimeRangeFilter(currentRawEvents);
        renderCharts(filtered);
        calculateAndDisplaySummary(filtered);
        renderLocationMap(filtered);
        applyFiltersAndDisplayEvents();
        hideSkeletons();
    };

    fetchDataBtn.addEventListener('click', fetchData);
    secretTokenInput.addEventListener('keypress', e => { if (e.key === 'Enter') fetchData(); });
    themeToggleBtn.addEventListener('click', toggleTheme);
    window.addEventListener('scroll', handleScroll);
    scrollToTopBtn.addEventListener('click', goToTop);
    timeRangeFilterSelect.addEventListener('change', () => { window.updateGlobalDashboard(); writeUrlParams(); });
    filterEventTypeSelect.addEventListener('change', () => { applyFiltersAndDisplayEvents(); writeUrlParams(); });
    filterKeywordInput.addEventListener('input', debounce(() => { applyFiltersAndDisplayEvents(); writeUrlParams(); }, 300));
    filterLinkTypeSelect.addEventListener('change', () => { applyFiltersAndDisplayEvents(); writeUrlParams(); });
    filterModalTypeSelect.addEventListener('change', () => { applyFiltersAndDisplayEvents(); writeUrlParams(); });
    filterProjectIdInput.addEventListener('input', debounce(() => { applyFiltersAndDisplayEvents(); writeUrlParams(); }, 300));
    if (exportCsvBtn) exportCsvBtn.addEventListener('click', () => exportToCSV(currentFilteredEvents));
    if (prevPageBtn) prevPageBtn.addEventListener('click', () => { if (currentPage > 1) { currentPage--; renderPaginatedTable(); } });
    if (nextPageBtn) nextPageBtn.addEventListener('click', () => { const tp = Math.ceil(currentFilteredEvents.length / EVENTS_PER_PAGE); if (currentPage < tp) { currentPage++; renderPaginatedTable(); } });
    if (mapLayerToggle) mapLayerToggle.addEventListener('click', toggleHeatmap);
    if (autoRefreshCheckbox) autoRefreshCheckbox.addEventListener('change', () => {
        if (autoRefreshCheckbox.checked) { autoRefreshInterval = setInterval(fetchData, 5*60*1000); showToast('Auto-refresh enabled (5 min)', 'info'); }
        else { if (autoRefreshInterval) clearInterval(autoRefreshInterval); autoRefreshInterval = null; showToast('Auto-refresh disabled', 'info'); }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', e => {
        if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;
        if (e.key === 'r' || e.key === 'R') fetchData();
        if (e.key === 't' || e.key === 'T') toggleTheme();
        if (e.key === 'Escape') { const det = document.querySelector('.raw-events-details'); if (det) det.open = false; }
    });

    // Load cached data
    try {
        const cached = sessionStorage.getItem('dashboardCachedEvents');
        if (cached) {
            currentRawEvents = JSON.parse(cached);
            populateEventTypeFilter(currentRawEvents); populateLinkTypeFilter(currentRawEvents); populateModalTypeFilter(currentRawEvents);
            readUrlParams();
            window.updateGlobalDashboard();
            const cachedTime = sessionStorage.getItem('dashboardCachedTime');
            statusEl.textContent = `Showing cached data (${currentRawEvents.length} events).`;
            if (lastUpdatedEl && cachedTime) lastUpdatedEl.textContent = `Last updated: ${new Date(cachedTime).toLocaleString()}`;
            showToast('Loaded cached data', 'info');
        } else { readUrlParams(); }
    } catch(e) { readUrlParams(); debugLog("Cache load error:", e); }

    handleScroll();
    debugLog("DOM loaded, listeners attached.");
});

// --- Fetch ---
async function fetchData() {
    debugLog("fetchData called");
    const secretToken = secretTokenInput.value.trim();
    if (!secretToken) { statusEl.textContent = 'Please enter the Auth Token.'; showToast('Auth token required', 'warning'); return; }
    localStorage.setItem('dashboardAuthToken', secretToken);
    if (!RETRIEVAL_WORKER_URL || RETRIEVAL_WORKER_URL.includes('REPLACE') || RETRIEVAL_WORKER_URL.length < 20) {
        statusEl.textContent = 'ERROR: Worker URL not configured.'; showToast('Worker URL invalid', 'error'); return;
    }
    statusEl.textContent = 'Fetching data...';
    fetchDataBtn.disabled = true;
    if (loadingSpinner) loadingSpinner.classList.remove('hidden-el');
    showSkeletons();
    rawEventsTbody.innerHTML = '<tr><td colspan="4" class="table-initial-msg">Loading...</td></tr>';
    resetSummary();
    destroyCharts();
    if (markerLayerGroup) markerLayerGroup.clearLayers();
    else initializeMap();
    currentRawEvents = [];

    try {
        const response = await fetch(RETRIEVAL_WORKER_URL, { method: 'GET', headers: { 'Authorization': `Bearer ${secretToken}` } });
        if (response.status === 401) throw new Error('Unauthorized. Check Auth Token.');
        if (response.status === 403) throw new Error('Forbidden. Check Worker CORS or Auth.');
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status} ${response.statusText || ''}`);
        const rawEvents = await response.json();
        if (!Array.isArray(rawEvents)) throw new Error('Invalid data format (expected array).');

        statusEl.textContent = `Fetched ${rawEvents.length} events. Processing...`;
        currentRawEvents = rawEvents;

        // Cache
        try { sessionStorage.setItem('dashboardCachedEvents', JSON.stringify(rawEvents)); sessionStorage.setItem('dashboardCachedTime', new Date().toISOString()); } catch(e) {}

        resetFilters();
        populateEventTypeFilter(currentRawEvents);
        populateLinkTypeFilter(currentRawEvents);
        populateModalTypeFilter(currentRawEvents);
        readUrlParams();
        if (typeof window.updateGlobalDashboard === 'function') window.updateGlobalDashboard();
        else { renderCharts(currentRawEvents); applyFiltersAndDisplayEvents(); calculateAndDisplaySummary(currentRawEvents); renderLocationMap(currentRawEvents); hideSkeletons(); }

        statusEl.textContent = `Displayed ${currentRawEvents.length} events.`;
        if (lastUpdatedEl) lastUpdatedEl.textContent = `Last updated: ${new Date().toLocaleString()}`;
        showToast(`Loaded ${currentRawEvents.length} events`, 'success');
    } catch (error) {
        console.error('fetchData error:', error);
        statusEl.textContent = `Error: ${error.message}`;
        rawEventsTbody.innerHTML = `<tr><td colspan="4" style="color:red;text-align:center;">Error: ${error.message}</td></tr>`;
        destroyCharts(); if(markerLayerGroup) markerLayerGroup.clearLayers();
        ['pageViewsChart','hourlyActivityChart','projectInteractionsChart','linkTypesChart','clickTypesChart','modalOpensChart','eventTypesChart','screenWidthChart','deviceTypeChart'].forEach(id => handleEmptyChart(id, `Error: ${error.message}`));
        hideSkeletons();
        showToast(`Error: ${error.message}`, 'error', 5000);
    } finally {
        fetchDataBtn.disabled = false;
        if (loadingSpinner) loadingSpinner.classList.add('hidden-el');
    }
}

// --- Helpers ---
function resetSummary() {
    [totalViewsEl, uniqueDaysEl, uniqueVisitorsEl, bounceRateEl, avgSessionEl].forEach(el => { if(el) el.textContent = '--'; });
    const topPageEl = document.querySelector('#topPageBox .value');
    const topCountryEl = document.querySelector('#topCountryBox .value');
    const topReferrerEl = document.querySelector('#topReferrerBox .value');
    [topPageEl, topCountryEl, topReferrerEl].forEach(el => { if(el) el.textContent = '--'; });
}
function destroyCharts() { Object.values(chartInstances).forEach(c => { if(c) c.destroy(); }); chartInstances = {}; }

// --- Filters ---
function resetFilters() {
    filterEventTypeSelect.innerHTML = '<option value="">All Types</option>';
    filterKeywordInput.value = '';
    filterLinkTypeSelect.innerHTML = '<option value="">All Link Dest. Types</option>';
    filterModalTypeSelect.innerHTML = '<option value="">All Modal IDs/Types</option>';
    filterProjectIdInput.value = '';
}
function populateEventTypeFilter(events) {
    const types = new Set(events.map(e => e.type).filter(t => t));
    filterEventTypeSelect.innerHTML = '<option value="">All Types</option>';
    [...types].sort().forEach(type => { const o = document.createElement('option'); o.value = type; o.textContent = formatLabel(type); filterEventTypeSelect.appendChild(o); });
}
function populateLinkTypeFilter(events) {
    const types = new Set(events.filter(e => (e.type === 'link_click' || e.type === 'anchor_click') && e.details?.linkType).map(e => e.details.linkType));
    filterLinkTypeSelect.innerHTML = '<option value="">All Link Dest. Types</option>';
    [...types].sort().forEach(type => { const o = document.createElement('option'); o.value = type; o.textContent = formatLabel(type); filterLinkTypeSelect.appendChild(o); });
}
function populateModalTypeFilter(events) {
    const ids = new Set(events.filter(e => e.type === 'modal_open' && e.details?.modalId).map(e => e.details.modalId));
    filterModalTypeSelect.innerHTML = '<option value="">All Modal IDs/Types</option>';
    [...ids].sort().forEach(id => { const o = document.createElement('option'); o.value = id; o.textContent = formatLabel(id); filterModalTypeSelect.appendChild(o); });
}

function applyFiltersAndDisplayEvents() {
    const selectedType = filterEventTypeSelect.value, keyword = filterKeywordInput.value.trim().toLowerCase();
    const selectedLink = filterLinkTypeSelect.value, selectedModal = filterModalTypeSelect.value;
    const projKw = filterProjectIdInput.value.trim().toLowerCase();
    const timeFiltered = typeof window.applyTimeRangeFilter === 'function' ? window.applyTimeRangeFilter(currentRawEvents) : currentRawEvents;
    const sorted = [...timeFiltered].sort((a,b) => getEventDate(b).getTime() - getEventDate(a).getTime());

    currentFilteredEvents = sorted.filter(event => {
        if (selectedType && (event.type || 'Unknown') !== selectedType) return false;
        if (selectedLink && event.details?.linkType !== selectedLink) return false;
        if (selectedModal && !(event.type === 'modal_open' && event.details?.modalId === selectedModal)) return false;
        const projId = String(event.projectId || event.details?.projectId || event.details?.context || '').toLowerCase();
        if (projKw && !projId.includes(projKw)) return false;
        if (keyword) {
            const evDate = getEventDate(event);
            const ts = evDate.getTime() > 0 ? evDate.toLocaleString().toLowerCase() : '';
            const locStr = event.location ? `${event.location.city||''} ${event.location.regionCode||''} ${event.location.country||''} ${event.location.ip||''}`.toLowerCase() : '';
            let detStr = ''; try { if (event.details && Object.keys(event.details).length > 0) detStr = JSON.stringify(event.details).toLowerCase(); } catch(e) {}
            if (!`${ts} ${(event.type||'').toLowerCase()} ${(event.page||'').toLowerCase()} ${locStr} ${detStr}`.includes(keyword)) return false;
        }
        return true;
    });
    currentPage = 1;
    renderPaginatedTable();
}

function renderPaginatedTable() {
    const total = currentFilteredEvents.length;
    const totalPages = Math.max(1, Math.ceil(total / EVENTS_PER_PAGE));
    if (currentPage > totalPages) currentPage = totalPages;
    const start = (currentPage - 1) * EVENTS_PER_PAGE;
    const pageEvents = currentFilteredEvents.slice(start, start + EVENTS_PER_PAGE);
    renderTableBody(pageEvents);
    if (prevPageBtn) prevPageBtn.disabled = currentPage <= 1;
    if (nextPageBtn) nextPageBtn.disabled = currentPage >= totalPages;
    if (pageInfoEl) pageInfoEl.textContent = `Page ${currentPage} of ${totalPages} (${total} events)`;
}

function renderTableBody(events) {
    rawEventsTbody.innerHTML = '';
    if (events.length === 0) {
        rawEventsTbody.innerHTML = '<tr><td colspan="4" class="table-initial-msg">No events match the current filters.</td></tr>';
        return;
    }
    events.forEach(event => {
        const row = rawEventsTbody.insertRow();
        const evDate = getEventDate(event);
        row.insertCell().textContent = evDate.getTime() > 0 ? evDate.toLocaleString() : 'N/A';
        row.insertCell().textContent = formatLabel(event.type || 'N/A');
        const pageCell = row.insertCell();
        const pageUrl = event.page || 'N/A';
        pageCell.textContent = pageUrl.length > 60 ? pageUrl.substring(0, 57) + '...' : pageUrl;
        pageCell.title = pageUrl;
        const detailsCell = row.insertCell();
        const d = { ...event }; delete d.receivedAt; delete d.timestamp; delete d.type; delete d.page;
        let summary = '';
        if (event.location) summary += `Loc: ${event.location.city||'?'} / ${event.location.country||'?'} (IP: ${event.location.ip||'?'})\nOrg: ${event.location.asOrganization||'?'}\n`;
        if (event.screenWidth) summary += `Screen: ${event.screenWidth}x${event.screenHeight}\n`;
        if (event.referrer && event.referrer !== "(direct)") summary += `Referrer: ${event.referrer.length>50?event.referrer.substring(0,47)+'...':event.referrer}\n`;
        if (event.projectId) { summary += `Project: ${event.projectId}\n`; delete d.projectId; }
        if (summary) summary += '----\n';
        delete d.location; delete d.screenWidth; delete d.screenHeight; delete d.referrer;
        let json = '';
        if (Object.keys(d).length > 0) { try { json = JSON.stringify(d, null, 2); } catch(e) { json = 'Error'; } }
        detailsCell.innerHTML = `<pre>${summary}${json}</pre>`;
    });
}

// --- Summary ---
function calculateAndDisplaySummary(events) {
    const pageViews = events.filter(e => e.type === 'pageview');
    animateCountUp(totalViewsEl, String(pageViews.length));
    const uniqueDays = new Set(pageViews.map(e => { try { const d = getEventDate(e); return d.getTime()===0?null:d.toLocaleDateString(); } catch(e){return null;} }).filter(Boolean));
    animateCountUp(uniqueDaysEl, String(uniqueDays.size));

    // Unique visitors
    const uniqueIPs = new Set(events.filter(e => e.location?.ip).map(e => e.location.ip));
    if (uniqueVisitorsEl) animateCountUp(uniqueVisitorsEl, String(uniqueIPs.size));

    // Bounce rate & avg session
    const sessionData = analyzeSessions(events);
    if (bounceRateEl) bounceRateEl.textContent = sessionData.bounceRate > 0 ? `${sessionData.bounceRate.toFixed(1)}%` : '--';
    if (avgSessionEl) avgSessionEl.textContent = sessionData.avgDurationMs > 0 ? formatDuration(sessionData.avgDurationMs) : '--';

    // Top Page
    const topPageEl = document.querySelector('#topPageBox .value');
    if (topPageEl) {
        const pages = pageViews.filter(e=>e.page).reduce((acc,e) => {
            let path = e.page; try { const u = new URL(e.page); path = u.pathname==='/'&&u.hash?u.hash:u.pathname+u.hash; } catch(e){}
            acc[path] = (acc[path]||0)+1; return acc;
        }, {});
        const sorted = Object.entries(pages).sort(([,a],[,b])=>b-a);
        if (sorted.length > 0) { topPageEl.textContent = sorted[0][0].length>20?`${sorted[0][0].substring(0,17)}... (${sorted[0][1]})`:`${sorted[0][0]} (${sorted[0][1]})`; topPageEl.title = sorted[0][0]; }
        else { topPageEl.textContent = '--'; }
    }

    // Top Country
    const topCountryEl = document.querySelector('#topCountryBox .value');
    if (topCountryEl) {
        const countries = events.filter(e=>e.location?.country).reduce((acc,e) => { acc[e.location.country]=(acc[e.location.country]||0)+1; return acc; }, {});
        const sorted = Object.entries(countries).sort(([,a],[,b])=>b-a);
        topCountryEl.textContent = sorted.length>0?`${sorted[0][0]} (${sorted[0][1]})`:'--';
    }

    // Top Referrer
    const topReferrerEl = document.querySelector('#topReferrerBox .value');
    if (topReferrerEl) {
        const refs = events.filter(e=>e.referrer&&e.referrer!=='(direct)'&&e.referrer.trim()!=='').reduce((acc,e) => {
            try { const u = new URL(e.referrer); const d = u.hostname.replace(/^www\./,''); acc[d]=(acc[d]||0)+1; } catch(e) { acc['(Other)']=(acc['(Other)']||0)+1; }
            return acc;
        }, {});
        const sorted = Object.entries(refs).sort(([,a],[,b])=>b-a);
        if (sorted.length>0) { const r=sorted[0][0],c=sorted[0][1]; topReferrerEl.textContent = r.length>20?`${r.substring(0,17)}... (${c})`:`${r} (${c})`; topReferrerEl.title=r; }
        else topReferrerEl.textContent = '--';
    }
}

// --- Aggregation ---
function aggregateData(events, filterCond, keyExtract, labelExtract = formatLabel, limit = 10) {
    let labels = [], data = [];
    try {
        let filtered = []; try { filtered = events.filter(filterCond); } catch(e) { return {labels:[],data:[]}; }
        if (filtered.length === 0) return {labels:[],data:[]};
        let keys = [];
        filtered.forEach((ev,i) => { try { keys.push(keyExtract(ev)); } catch(e) { keys.push(null); } });
        const valid = keys.filter(v => v!=null && String(v).trim()!=='');
        if (valid.length === 0) return {labels:[],data:[]};
        const agg = valid.reduce((acc,v) => { const k=String(v).substring(0,100); acc[k]=(acc[k]||0)+1; return acc; }, {});
        const sorted = Object.entries(agg).sort(([,a],[,b])=>b-a).slice(0,limit);
        labels = sorted.map(([k])=>{ try{return labelExtract?labelExtract(k):k;} catch(e){return k;} });
        data = sorted.map(([,c])=>c);
    } catch(e) { console.error("aggregateData error:", e); return {labels:[],data:[]}; }
    return {labels, data};
}

// --- Render Charts ---
function renderCharts(events) {
    debugLog("--- renderCharts ---");
    const colors = CHART_COLORS_FALLBACK;
    try {
        // 1. Page Views Over Time
        const viewsByDate = events.filter(e=>e.type==='pageview'&&(e.receivedAt||e.timestamp)).reduce((acc,e) => {
            try { const d=getEventDate(e); if(d.getTime()===0) return acc; acc[d.toISOString().split('T')[0]]=(acc[d.toISOString().split('T')[0]]||0)+1; } catch(e){}
            return acc;
        }, {});
        const sortedDates = Object.keys(viewsByDate).sort();
        if (sortedDates.length > 0) {
            renderChart('pageViewsChart','line',{labels:sortedDates,datasets:[{label:'Page Views',data:sortedDates.map(d=>viewsByDate[d]),borderColor:colors[0],backgroundColor:colors[0].replace('0.7','0.2'),tension:0.1,fill:true}]},
            {scales:{x:{type:'time',time:{unit:'day',tooltipFormat:'PP'}},y:{beginAtZero:true,ticks:{precision:0}}}});
        } else handleEmptyChart('pageViewsChart','No page view data.');

        // 2. Hourly Activity
        const hourCounts = new Array(24).fill(0);
        events.forEach(e => { const d=getEventDate(e); if(d.getTime()>0) hourCounts[d.getUTCHours()]++; });
        const hourLabels = Array.from({length:24},(_,i)=>`${String(i).padStart(2,'0')}:00`);
        if (hourCounts.some(v=>v>0)) {
            renderChart('hourlyActivityChart','bar',{labels:hourLabels,datasets:[{label:'Events',data:hourCounts,backgroundColor:colors[2],borderRadius:3}]},
            {scales:{y:{beginAtZero:true,ticks:{precision:0}}},plugins:{legend:{display:false}}});
        } else handleEmptyChart('hourlyActivityChart','No activity data.');

        // 3. Project Interactions
        const projData = aggregateData(events, e=>e.type==='project_click'||!!(e.projectId||e.details?.projectId||e.details?.context), e=>e.projectId||e.details?.projectId||e.details?.context||'Unknown', formatLabel, 10);
        if (projData?.labels?.length > 0) renderChart('projectInteractionsChart','bar',{labels:projData.labels,datasets:[{label:'Interactions',data:projData.data,backgroundColor:colors[1]}]},{indexAxis:'y',scales:{x:{ticks:{precision:0}}},plugins:{legend:{display:false}}});
        else handleEmptyChart('projectInteractionsChart','No project data.');

        // 4. Link Click Destinations
        const linkData = aggregateData(events, e=>e.type==='link_click'||e.type==='anchor_click', e=>e.details?.linkType||'Unknown', formatLabel, 10);
        if (linkData?.labels?.length > 0) renderChart('linkTypesChart','doughnut',{labels:linkData.labels,datasets:[{label:'Link Types',data:linkData.data,backgroundColor:colors.slice(2),hoverOffset:4}]},{plugins:{legend:{position:'bottom'}}});
        else handleEmptyChart('linkTypesChart','No link click data.');

        // 5. Click Types
        const clickTypes = ['anchor_click','button_click','project_click','generic_click'];
        const clickData = aggregateData(events, e=>clickTypes.includes(e.type), e=>e.type, formatLabel, 10);
        if (clickData?.labels?.length > 0) renderChart('clickTypesChart','pie',{labels:clickData.labels,datasets:[{label:'Click Types',data:clickData.data,backgroundColor:colors.slice(3),hoverOffset:4}]},{plugins:{legend:{position:'bottom'}}});
        else handleEmptyChart('clickTypesChart','No click data.');

        // 6. Modal Opens
        const modalData = aggregateData(events, e=>e.type==='modal_open', e=>e.details?.modalId||'Unknown', formatLabel, 10);
        if (modalData?.labels?.length > 0) renderChart('modalOpensChart','pie',{labels:modalData.labels,datasets:[{label:'Modal Opens',data:modalData.data,backgroundColor:colors.slice(1).reverse(),hoverOffset:4}]},{plugins:{legend:{position:'bottom'}}});
        else handleEmptyChart('modalOpensChart','No modal data.');

        // 7. Event Types
        const evtData = aggregateData(events, ()=>true, e=>e.type||'Unknown', formatLabel, 15);
        if (evtData?.labels?.length > 0) renderChart('eventTypesChart','bar',{labels:evtData.labels,datasets:[{label:'Count',data:evtData.data,backgroundColor:colors[4]}]},{indexAxis:'y',scales:{x:{ticks:{precision:0}}},plugins:{legend:{display:false}}});
        else handleEmptyChart('eventTypesChart','No event data.');

        // 8. Screen Width
        const swData = aggregateData(events, e=>e.screenWidth!=null&&parseInt(e.screenWidth,10)>0, e=>{const w=parseInt(e.screenWidth,10);if(w<=480)return'≤480 Mobile';if(w<=768)return'481-768 Tablet';if(w<=1024)return'769-1024 Laptop';if(w<=1440)return'1025-1440 Desktop';return'>1440 Large';}, null, 8);
        if (swData?.labels?.length > 0) renderChart('screenWidthChart','doughnut',{labels:swData.labels,datasets:[{label:'Screen',data:swData.data,backgroundColor:colors.slice(5),hoverOffset:4}]},{plugins:{legend:{position:'bottom'}}});
        else handleEmptyChart('screenWidthChart','No screen data.');

        // 9. Device Type
        const dev = {Desktop:0,Tablet:0,Mobile:0};
        events.forEach(e=>{if(e.screenWidth){const w=parseInt(e.screenWidth,10);if(w>=1024)dev.Desktop++;else if(w>=768)dev.Tablet++;else dev.Mobile++;}});
        if (dev.Desktop>0||dev.Tablet>0||dev.Mobile>0) renderChart('deviceTypeChart','doughnut',{labels:['Desktop (≥1024)','Tablet (≥768)','Mobile (<768)'],datasets:[{label:'Devices',data:[dev.Desktop,dev.Tablet,dev.Mobile],backgroundColor:colors.slice(3,6),hoverOffset:4}]},{plugins:{legend:{position:'bottom'}}});
        else handleEmptyChart('deviceTypeChart','No device data.');

    } catch(e) {
        console.error("renderCharts error:", e);
        ['pageViewsChart','hourlyActivityChart','projectInteractionsChart','linkTypesChart','clickTypesChart','modalOpensChart','eventTypesChart','screenWidthChart','deviceTypeChart'].forEach(id=>handleEmptyChart(id,'Render Error'));
    } finally { debugLog("--- renderCharts done ---"); }
}

// --- Empty Chart ---
function handleEmptyChart(canvasId, message) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    if (chartInstances[canvasId]) { try { chartInstances[canvasId].destroy(); } catch(e){} delete chartInstances[canvasId]; }
    hideSkeletonFor(canvasId);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    // Draw icon
    const cx = canvas.width/2, cy = canvas.height/2 - 15;
    ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--secondary-text').trim() || '#888';
    ctx.globalAlpha = 0.25;
    ctx.fillRect(cx-30,cy-5,12,25); ctx.fillRect(cx-14,cy-15,12,35); ctx.fillRect(cx+2,cy-25,12,45); ctx.fillRect(cx+18,cy-10,12,30);
    ctx.globalAlpha = 1;
    ctx.font = '14px system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(message, canvas.width/2, cy + 40);
    ctx.restore();
}

// --- Render Chart ---
function renderChart(canvasId, type, data, options = {}) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    hideSkeletonFor(canvasId);
    if (chartInstances[canvasId]) { try { chartInstances[canvasId].destroy(); } catch(e){} delete chartInstances[canvasId]; }
    const isDark = document.body.classList.contains('dark-theme');
    const baseOpts = {
        scales: { x:{grid:{color:Chart.defaults.borderColor},ticks:{color:Chart.defaults.color}}, y:{grid:{color:Chart.defaults.borderColor},ticks:{color:Chart.defaults.color}} },
        plugins: { legend:{labels:{color:Chart.defaults.color}}, tooltip:{bodyColor:Chart.defaults.color,titleColor:Chart.defaults.color,backgroundColor:isDark?'rgba(44,44,44,0.9)':'rgba(255,255,255,0.9)',borderColor:Chart.defaults.borderColor,borderWidth:1} }
    };
    function mergeDeep(t,s){for(const k in s){if(s.hasOwnProperty(k)){if(s[k] instanceof Object&&!(s[k] instanceof Array)&&t[k] instanceof Object&&!(t[k] instanceof Array))mergeDeep(t[k],s[k]);else t[k]=s[k];}}return t;}
    const merged = mergeDeep(mergeDeep({responsive:true,maintainAspectRatio:false,animation:{duration:400}}, baseOpts), options);
    try { chartInstances[canvasId] = new Chart(ctx, {type, data, options: merged}); }
    catch(e) { console.error(`Chart error ${canvasId}:`, e); ctx.clearRect(0,0,canvas.width,canvas.height); ctx.fillStyle='red'; ctx.textAlign='center'; ctx.fillText(`Error: ${e.message.substring(0,80)}`,canvas.width/2,canvas.height/2); }
}
// --- END ---
