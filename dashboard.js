// --- START OF FILE dashboard.js (FOR DASHBOARD - Complete with Fixes & Diagnostics) ---

// --- Configuration ---
const RETRIEVAL_WORKER_URL = 'https://patient-mode-9cfb.azelbane87.workers.dev/'; // <-- YOUR DASHBOARD RETRIEVAL URL IS HERE
const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes in milliseconds
const DEBOUNCE_DELAY = 300; // Milliseconds delay for filter debounce

const CHART_COLORS_FALLBACK = [
    'rgba(54, 162, 235, 0.7)', 'rgba(255, 99, 132, 0.7)', 'rgba(75, 192, 192, 0.7)',
    'rgba(255, 205, 86, 0.7)', 'rgba(153, 102, 255, 0.7)', 'rgba(255, 159, 64, 0.7)',
    'rgba(201, 203, 207, 0.7)', 'rgba(100, 100, 255, 0.7)', 'rgba(255, 100, 100, 0.7)'
];


// --- DOM Elements ---
const fetchDataBtn = document.getElementById('fetchDataBtn');
const secretTokenInput = document.getElementById('secretToken');
const statusEl = document.getElementById('status');
const loadingSpinner = document.getElementById('loadingSpinner'); // New
const autoRefreshCheckbox = document.getElementById('autoRefreshCheckbox'); // New
const rawEventsTbody = document.querySelector('#rawEventsTable tbody');
const totalViewsEl = document.querySelector('#totalViewsBox .value');
const uniqueDaysEl = document.querySelector('#uniqueDaysBox .value');
const topCountryEl = document.querySelector('#topCountryBox .value'); // New
const topReferrerEl = document.querySelector('#topReferrerBox .value'); // New
const themeToggleBtn = document.getElementById('themeToggleBtn');
const scrollToTopBtn = document.getElementById("scrollToTopBtn");
// Filter Elements
const filterEventTypeSelect = document.getElementById('filterEventType');
const filterKeywordInput = document.getElementById('filterKeyword');
const filterLinkTypeSelect = document.getElementById('filterLinkType');
const filterModalTypeSelect = document.getElementById('filterModalType');
const filterProjectIdInput = document.getElementById('filterProjectId');
// const filterDetailLinkTypeSelect = document.getElementById('filterDetailLinkType'); // Uncomment if using this filter

// --- Chart Instances ---
let chartInstances = {}; // Store chart instances by canvas ID

// --- Map Instance and Layer ---
let mapInstance = null;
let markerLayerGroup = null; // Will be L.markerClusterGroup now
let lightTileLayer = null;
let darkTileLayer = null;

// --- State ---
let currentRawEvents = []; // Store the last fetched events
let refreshIntervalId = null; // ID for auto-refresh interval
let debounceTimer = null; // Timer for debounce function

// --- Debounce Function ---
function debounce(func, delay) {
    return function(...args) {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            func.apply(this, args);
        }, delay);
    };
}

// --- Theme Handling (With Diagnostics) ---
function applyTheme(theme) {
    console.log(`applyTheme CALLED with theme: ${theme}`); // <<< DIAGNOSTIC LOG
    const isDark = theme === 'dark';
    console.log(` - Setting dark theme class: ${isDark}`); // <<< DIAGNOSTIC LOG
    document.body.classList.toggle('dark-theme', isDark);
    themeToggleBtn.textContent = isDark ? '☀️' : '🌙';
    themeToggleBtn.title = isDark ? 'Switch to Light Theme' : 'Switch to Dark Theme';

    // Set Chart.js global defaults based on theme
    Chart.defaults.color = isDark ? '#e0e0e0' : '#555';
    Chart.defaults.borderColor = isDark ? '#444' : '#e1e4e8';

    // Update existing charts to reflect theme changes
    Object.values(chartInstances).forEach(chart => {
        if (chart) {
            try {
                if(chart.options.scales?.x) {
                    chart.options.scales.x.grid.color = Chart.defaults.borderColor;
                    chart.options.scales.x.ticks.color = Chart.defaults.color;
                }
                if(chart.options.scales?.y) {
                    chart.options.scales.y.grid.color = Chart.defaults.borderColor;
                    chart.options.scales.y.ticks.color = Chart.defaults.color;
                }
                if(chart.options.scales?.r) {
                     chart.options.scales.r.grid.color = Chart.defaults.borderColor;
                     chart.options.scales.r.angleLines.color = Chart.defaults.borderColor;
                     chart.options.scales.r.pointLabels.color = Chart.defaults.color;
                     chart.options.scales.r.ticks.color = Chart.defaults.color;
                     chart.options.scales.r.ticks.backdropColor = isDark ? '#2c2c2c' : '#ffffff';
                }
                if (chart.options.plugins.legend) {
                     chart.options.plugins.legend.labels.color = Chart.defaults.color;
                }
                 if (chart.options.plugins.title) {
                     chart.options.plugins.title.color = Chart.defaults.color;
                 }
                chart.update('none');
            } catch (chartUpdateError) {
                console.error("Error updating chart theme:", chartUpdateError, chart.canvas.id);
            }
        }
    });

    // Switch Map Tile Layers
    if (mapInstance && lightTileLayer && darkTileLayer) {
        console.log(`Applying theme: ${theme}. Switching map tiles.`);
        try {
            if (isDark) {
                if (mapInstance.hasLayer(lightTileLayer)) { mapInstance.removeLayer(lightTileLayer); console.log("Removed light tile layer."); }
                if (!mapInstance.hasLayer(darkTileLayer)) { mapInstance.addLayer(darkTileLayer); console.log("Added dark tile layer."); }
            } else {
                if (mapInstance.hasLayer(darkTileLayer)) { mapInstance.removeLayer(darkTileLayer); console.log("Removed dark tile layer."); }
                if (!mapInstance.hasLayer(lightTileLayer)) { mapInstance.addLayer(lightTileLayer); console.log("Added light tile layer."); }
            }
        } catch (mapLayerError) { console.error("Error switching map tile layers:", mapLayerError); }
    } else { console.log("Map or tile layers not ready for theme switch yet."); }
}

function toggleTheme() {
    console.log("toggleTheme CALLED"); // <<< DIAGNOSTIC LOG
    const currentTheme = document.body.classList.contains('dark-theme') ? 'dark' : 'light';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    console.log(` - Current: ${currentTheme}, New: ${newTheme}`); // <<< DIAGNOSTIC LOG
    localStorage.setItem('dashboardTheme', newTheme);
    applyTheme(newTheme);
}

// --- Scroll to Top Logic ---
function handleScroll() {
    const scrollThreshold = 100;
    if (document.body.scrollTop > scrollThreshold || document.documentElement.scrollTop > scrollThreshold) { scrollToTopBtn.classList.add('show'); }
    else { scrollToTopBtn.classList.remove('show'); }
}
function goToTop() { window.scrollTo({ top: 0 }); }

// --- Map Initialization (Updated for MarkerCluster) ---
function initializeMap() {
    if (mapInstance) return;
    try {
        if (typeof L === 'undefined' || typeof L.markerClusterGroup === 'undefined') {
             console.error("Leaflet or Leaflet.markercluster library not found.");
             statusEl.textContent = "Error: Map library or plugin not loaded.";
             return;
        }
        const mapContainer = document.getElementById('locationMap');
        if (!mapContainer) { console.error("Map container element '#locationMap' not found."); return; }
        mapInstance = L.map('locationMap').setView([20, 0], 2);
        lightTileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors' });
        darkTileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { attribution: '© <a href="https://osm.org/copyright">OSM</a> contributors © <a href="https://carto.com/attributions">CARTO</a>', subdomains: 'abcd', maxZoom: 19 });
        const initialThemeIsDark = document.body.classList.contains('dark-theme');
        if (initialThemeIsDark) { darkTileLayer.addTo(mapInstance); } else { lightTileLayer.addTo(mapInstance); }
        markerLayerGroup = L.markerClusterGroup(); // Use MarkerClusterGroup
        markerLayerGroup.addTo(mapInstance);
        console.log("Map initialized successfully with MarkerCluster.");
    } catch (error) { console.error("Error initializing map:", error); statusEl.textContent = "Error initializing map."; mapInstance = null; lightTileLayer = null; darkTileLayer = null; markerLayerGroup = null; }
}

// --- Map Rendering (Updated for MarkerCluster) ---
function renderLocationMap(events) {
    if (!mapInstance || !markerLayerGroup) { console.warn("Map or marker group not initialized/ready for rendering."); initializeMap(); return; }
    markerLayerGroup.clearLayers();
    let locationsAdded = 0;
    [...events].reverse().forEach(event => {
        if (event.location?.latitude != null && event.location?.longitude != null && !isNaN(parseFloat(event.location.latitude)) && !isNaN(parseFloat(event.location.longitude))) {
            const lat = parseFloat(event.location.latitude);
            const lon = parseFloat(event.location.longitude);
            if (lat === 0 && lon === 0 && event.location.ip !== '127.0.0.1') { console.log("Skipping potential invalid 0,0 coords for event:", event.type, event.location.ip); return; }
             const page = event.page || 'N/A';
             const type = event.type || 'N/A';
             const projectId = event.projectId || event.details?.projectId || event.details?.context || 'N/A';
             const timestamp = event.receivedAt ? new Date(event.receivedAt).toLocaleString() : 'N/A';
             const city = event.location.city || '?';
             const region = event.location.regionCode || event.location.region || '?';
             const country = event.location.country || '?';
             const ipInfo = `${event.location.ip || '?'} (${event.location.asOrganization || '?'})`;
             const popupContent = `
                <b>Time:</b> ${timestamp}<br>
                <b>Type:</b> ${type}<br>
                <b>Page:</b> ${page.length > 50 ? page.substring(0, 47) + '...' : page}<br>
                ${projectId !== 'N/A' ? `<b>Project:</b> ${projectId}<br>` : ''}
                <b>Location:</b> ${city}, ${region}, ${country}<br>
                <b>IP Info:</b> ${ipInfo}
             `;
            try {
                const marker = L.marker([lat, lon]).bindPopup(popupContent);
                markerLayerGroup.addLayer(marker); // Add to ClusterGroup
                locationsAdded++;
            }
            catch (markerError) { console.error(`Error adding marker for event: Lat=${lat}, Lon=${lon}`, markerError, event); }
        }
    });
    console.log(`Added ${locationsAdded} markers to the cluster group.`);
}

// Apply saved theme and set up listeners on load
document.addEventListener('DOMContentLoaded', () => {
    initializeMap();
    const savedTheme = localStorage.getItem('dashboardTheme') || 'light';
    applyTheme(savedTheme);
    secretTokenInput.value = localStorage.getItem('dashboardAuthToken') || '';
    rawEventsTbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px; color: var(--secondary-text);">Click \'Fetch Data\' to load events.</td></tr>';

    // Event Listeners
    fetchDataBtn.addEventListener('click', fetchData);
    secretTokenInput.addEventListener('keypress', function (e) { if (e.key === 'Enter') fetchData(); });
    themeToggleBtn.addEventListener('click', toggleTheme);
    window.addEventListener('scroll', handleScroll);
    scrollToTopBtn.addEventListener('click', goToTop);

    // Filters - Apply debounce to text inputs
    const debouncedFilter = debounce(applyFiltersAndDisplayEvents, DEBOUNCE_DELAY);
    filterEventTypeSelect.addEventListener('change', applyFiltersAndDisplayEvents);
    filterKeywordInput.addEventListener('input', debouncedFilter);
    if(filterLinkTypeSelect) filterLinkTypeSelect.addEventListener('change', applyFiltersAndDisplayEvents);
    filterModalTypeSelect.addEventListener('change', applyFiltersAndDisplayEvents);
    filterProjectIdInput.addEventListener('input', debouncedFilter);
    // if(filterDetailLinkTypeSelect) filterDetailLinkTypeSelect.addEventListener('change', applyFiltersAndDisplayEvents);

    // Auto-Refresh Listener
    autoRefreshCheckbox.addEventListener('change', handleAutoRefreshToggle);

    handleScroll();
    console.log("DOM Content Loaded, event listeners attached.");
});

// --- Auto-Refresh Handler ---
function handleAutoRefreshToggle() {
    if (autoRefreshCheckbox.checked) {
        if (refreshIntervalId === null) {
             fetchData();
             refreshIntervalId = setInterval(fetchData, REFRESH_INTERVAL);
             console.log(`Auto-refresh started (Interval ID: ${refreshIntervalId})`);
        }
    } else {
        if (refreshIntervalId !== null) {
            clearInterval(refreshIntervalId);
            refreshIntervalId = null;
            console.log("Auto-refresh stopped.");
        }
    }
}


// --- Core Fetch Function (Updated for Spinner, Status, Token Save) ---
async function fetchData() {
    console.log("fetchData function CALLED!");
    if (fetchDataBtn.disabled && !autoRefreshCheckbox.checked) {
        console.log("fetchData: Fetch already in progress, skipping.");
        return;
    }
    const secretToken = secretTokenInput.value.trim();
    if (!secretToken) { statusEl.textContent = 'Please enter the Auth Token.'; return; }
    if (!RETRIEVAL_WORKER_URL || RETRIEVAL_WORKER_URL.includes('REPLACE') || RETRIEVAL_WORKER_URL.length < 20) {
        statusEl.textContent = 'ERROR: RETRIEVAL_WORKER_URL seems invalid.'; return;
    }

    statusEl.textContent = 'Fetching data...';
    loadingSpinner.style.display = 'inline-block';
    fetchDataBtn.disabled = true;
    console.log("fetchData: Disabling button, showing spinner.");

    rawEventsTbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Loading...</td></tr>';
    resetSummary();
    destroyCharts();
    if (markerLayerGroup) { markerLayerGroup.clearLayers(); } else { initializeMap(); }

    currentRawEvents = [];
    console.log("fetchData: UI cleared, preparing to fetch.");

    try {
        console.log(`fetchData: Attempting fetch from ${RETRIEVAL_WORKER_URL}...`);
        const response = await fetch(RETRIEVAL_WORKER_URL, {
            method: 'GET', headers: { 'Authorization': `Bearer ${secretToken}` }
        });
        console.log("fetchData: Fetch call completed. Status:", response.status);

        // Check for specific HTTP errors first
        if (response.status === 401) throw new Error('Unauthorized. Check Auth Token.');
        if (response.status === 403) throw new Error('Forbidden. Check Worker CORS or Auth.');
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status} ${response.statusText}`); // More specific HTTP error

        statusEl.textContent = 'Processing data...';
        const rawEvents = await response.json();
        if (!Array.isArray(rawEvents)) { throw new Error('Received invalid data format from worker.'); }

        statusEl.textContent = `Fetched ${rawEvents.length} recent events. Processing...`;
        console.log(`fetchData: Fetched ${rawEvents.length} events.`);
        currentRawEvents = rawEvents;
        localStorage.setItem('dashboardAuthToken', secretToken);
        console.log("fetchData: Auth token saved to localStorage.");

        statusEl.textContent = 'Populating filters...';
        resetFilters();
        populateEventTypeFilter(currentRawEvents);
        populateModalTypeFilter(currentRawEvents);
        // populateDetailLinkTypeFilter(currentRawEvents); // Uncomment if using this filter

        statusEl.textContent = 'Rendering charts...';
        // *** Ensure renderCharts exists and is called ***
        renderCharts(currentRawEvents);

        statusEl.textContent = 'Rendering table...';
        applyFiltersAndDisplayEvents();

        statusEl.textContent = 'Calculating summary...';
        calculateAndDisplaySummary(currentRawEvents);

        statusEl.textContent = 'Rendering map...';
        renderLocationMap(currentRawEvents);

        statusEl.textContent = `Displayed ${currentRawEvents.length} fetched events.`;
        console.log("fetchData: Processing complete.");

    } catch (error) {
        console.error('fetchData: Error during fetch or processing:', error);
        statusEl.textContent = `Error: ${error.message}`;
        rawEventsTbody.innerHTML = `<tr><td colspan="4" style="color: red; text-align:center;">Error: ${error.message}</td></tr>`;
        destroyCharts();
        if(markerLayerGroup) markerLayerGroup.clearLayers();
        // Display error messages on charts
        handleEmptyChart('pageViewsChart', 'Error fetching data');
        handleEmptyChart('projectInteractionsChart', 'Error fetching data');
        handleEmptyChart('linkTypesChart', 'Error fetching data');
        handleEmptyChart('clickTypesChart', 'Error fetching data');
        handleEmptyChart('modalOpensChart', 'Error fetching data');
        handleEmptyChart('eventTypesChart', 'Error fetching data');
        handleEmptyChart('screenWidthChart', 'Error fetching data');
         if(topCountryEl) topCountryEl.textContent = 'Error';
         if(topReferrerEl) topReferrerEl.textContent = 'Error';
    } finally {
         loadingSpinner.style.display = 'none';
         fetchDataBtn.disabled = false;
         console.log("fetchData: Re-enabling button, hiding spinner in finally block.");
         console.log("fetchData: Function finished.");
    }
}


// --- Helper Functions ---
function resetSummary() {
    totalViewsEl.textContent = '--'; uniqueDaysEl.textContent = '--';
    if(topCountryEl) topCountryEl.textContent = '--'; if(topReferrerEl) topReferrerEl.textContent = '--';
}
function destroyCharts() { Object.values(chartInstances).forEach(chart => { if (chart) chart.destroy(); }); chartInstances = {}; }
function formatLabel(key) {
       if (!key) return 'Unknown';
       return String(key).replace(/([A-Z])/g, ' $1').replace(/[_-]/g, ' ').replace(/\b\w/g, char => char.toUpperCase()).replace(/ +/g, ' ').trim();
}


// --- Filter Functions ---
function resetFilters() {
    if(filterEventTypeSelect) filterEventTypeSelect.innerHTML = '<option value="">All Types</option>';
    if(filterKeywordInput) filterKeywordInput.value = '';
    if(filterLinkTypeSelect) filterLinkTypeSelect.innerHTML = '<option value="">All Link Dest. Types</option>'; // Updated label
    if(filterModalTypeSelect) filterModalTypeSelect.innerHTML = '<option value="">All Modal IDs/Types</option>';
    if(filterProjectIdInput) filterProjectIdInput.value = '';
    // if(filterDetailLinkTypeSelect) filterDetailLinkTypeSelect.innerHTML = '<option value="">All Link Detail Types</option>';
 }

 function populateEventTypeFilter(events) {
    if(!filterEventTypeSelect) return;
    const types = new Set(events.map(e => e.type || 'Unknown').filter(t => t));
    filterEventTypeSelect.innerHTML = '<option value="">All Types</option>';
    [...types].sort().forEach(type => { const option = document.createElement('option'); option.value = type; option.textContent = formatLabel(type); filterEventTypeSelect.appendChild(option); });
}

 function populateModalTypeFilter(events) {
    if(!filterModalTypeSelect) return;
    const modalIds = new Set();
    events.filter(e => e.type === 'modal_open').forEach(e => {
        if (e.details?.modalId) modalIds.add(e.details.modalId);
        else if (e.modalId || e.modalType) modalIds.add(e.modalId || e.modalType); // Fallback
    });
    filterModalTypeSelect.innerHTML = '<option value="">All Modal IDs/Types</option>';
    [...modalIds].sort().forEach(id => { if(id){ const option = document.createElement('option'); option.value = id; option.textContent = formatLabel(id); filterModalTypeSelect.appendChild(option); } });
}

// function populateDetailLinkTypeFilter(events) { /* ... function definition if needed ... */ }

// --- Apply Filters ---
function applyFiltersAndDisplayEvents() {
    const selectedEventType = filterEventTypeSelect?.value || '';
    const keyword = filterKeywordInput?.value.trim().toLowerCase() || '';
    const selectedModalId = filterModalTypeSelect?.value || '';
    const projectIdKeyword = filterProjectIdInput?.value.trim().toLowerCase() || '';
    const selectedLinkType = filterLinkTypeSelect?.value || ''; // Use the Dest. Type filter

    const sortedEvents = [...currentRawEvents].sort((a, b) => new Date(b.receivedAt || 0) - new Date(a.receivedAt || 0));

    const filteredEvents = sortedEvents.filter(event => {
        if (selectedEventType && (event.type || 'Unknown') !== selectedEventType) return false;
        if (selectedModalId && !( (event.type === 'modal_open' && event.details?.modalId === selectedModalId) || (event.type === 'modal_open' && !event.details?.modalId && (event.modalId === selectedModalId || event.modalType === selectedModalId)) )) return false;
        // Filter by Link Destination Type (internal/external/anchor) using details.linkType
        if (selectedLinkType && !(event.details?.linkType === selectedLinkType)) return false;
        const projId = event.projectId || event.details?.projectId || event.details?.context || event.details?.trackId || '';
        if (projectIdKeyword && !String(projId).toLowerCase().includes(projectIdKeyword)) return false;
        if (keyword) {
             const timestampStr = event.receivedAt ? new Date(event.receivedAt).toLocaleString().toLowerCase() : '';
             const typeStr = (event.type || '').toLowerCase();
             const pageStr = (event.page || '').toLowerCase();
             let searchString = `${timestampStr} ${typeStr} ${pageStr}`;
             try {
                 if(event.details && Object.keys(event.details).length > 0) { searchString += ` ${JSON.stringify(event.details).toLowerCase()}`; }
                 if(event.location) { searchString += ` ${event.location.city || ''} ${event.location.regionCode || ''} ${event.location.country || ''} ${event.location.ip || ''} ${event.location.asOrganization || ''}`.toLowerCase(); }
             } catch (e) { /* ignore */ }
             if (!searchString.includes(keyword)) return false;
        }
        return true;
    });
    renderTableBody(filteredEvents);
}


// --- Render Table Body ---
function renderTableBody(events) {
    rawEventsTbody.innerHTML = '';
    if (events.length === 0) {
        rawEventsTbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">No events match the current filters.</td></tr>';
        return;
    }
    events.forEach(event => {
        const row = rawEventsTbody.insertRow();
        row.insertCell().textContent = event.receivedAt ? new Date(event.receivedAt).toLocaleString() : 'N/A';
        row.insertCell().textContent = event.type || 'N/A';
        const pageCell = row.insertCell();
        const pageUrl = event.page || 'N/A';
        pageCell.textContent = pageUrl.length > 60 ? pageUrl.substring(0, 57) + '...' : pageUrl;
        pageCell.title = pageUrl;

        const detailsCell = row.insertCell();
        const detailsToShow = { ...event };
        delete detailsToShow.receivedAt; delete detailsToShow.type; delete detailsToShow.page;

        let content = '';
        if (event.location) { content += `Loc: ${event.location.city || '?'} / ${event.location.country || '?'} (IP: ${event.location.ip || '?'})\nOrg: ${event.location.asOrganization || '?'}\n`; }
        if(event.screenWidth) { content += `Screen: ${event.screenWidth}x${event.screenHeight}\n`; }
        if(event.referrer) { content += `Referrer: ${event.referrer}\n`; }
        if(event.projectId) { content += `Project: ${event.projectId}\n`; }
        content += '----\n';

        const remainingDetails = detailsToShow.details || {};
        Object.keys(detailsToShow).forEach(key => { if (key !== 'details' && key !== 'location' && key !== 'projectId') { remainingDetails[key] = detailsToShow[key]; } });

        if (Object.keys(remainingDetails).length > 0) { try { content += JSON.stringify(remainingDetails, null, 2); } catch (e) { content += "Error stringifying details"; } }
        else if (content.endsWith('----\n')) { content = content.replace('----\n', '-- No Details --'); }
        else if (!content.includes('\n')) { content += '-- No Details --'; }

        detailsCell.innerHTML = `<pre>${content}</pre>`;
    });
}


// --- calculateAndDisplaySummary (Updated for New Boxes) ---
function calculateAndDisplaySummary(events) {
     const pageViews = events.filter(e => e.type === 'pageview');
     totalViewsEl.textContent = pageViews.length;
     const uniqueDays = new Set(pageViews.map(e => { try { const dateStr = e.receivedAt || e.timestamp; if (!dateStr) return null; return new Date(dateStr).toLocaleDateString(); } catch (err) { return null; } }).filter(d => d !== null));
     uniqueDaysEl.textContent = uniqueDays.size;
     if (topCountryEl) {
         const countries = events.filter(e => e.location?.country).reduce((acc, e) => { const country = e.location.country; acc[country] = (acc[country] || 0) + 1; return acc; }, {});
         const sortedCountries = Object.entries(countries).sort(([, countA], [, countB]) => countB - countA);
         topCountryEl.textContent = sortedCountries.length > 0 ? `${sortedCountries[0][0]} (${sortedCountries[0][1]})` : '--';
     }
      if (topReferrerEl) {
          const referrers = events.filter(e => e.referrer && !e.referrer.includes(window.location.hostname) && !e.referrer.startsWith('android-app://') && !e.referrer.startsWith('ios-app://') && e.referrer !== '(direct)').reduce((acc, e) => { try { const url = new URL(e.referrer); const domain = url.hostname.replace(/^www\./, ''); acc[domain] = (acc[domain] || 0) + 1; } catch (err) { acc['(Invalid/Other)'] = (acc['(Invalid/Other)'] || 0) + 1; } return acc; }, {});
          const sortedReferrers = Object.entries(referrers).sort(([, countA], [, countB]) => countB - countA);
          if (sortedReferrers.length > 0) {
             const topRef = sortedReferrers[0][0]; const topRefCount = sortedReferrers[0][1];
             topReferrerEl.textContent = topRef.length > 20 ? `${topRef.substring(0, 17)}... (${topRefCount})` : `${topRef} (${topRefCount})`;
             topReferrerEl.title = topRef;
          } else { topReferrerEl.textContent = '--'; topReferrerEl.title = ''; }
      }
}

// --- aggregateData (Improved Error Handling) ---
function aggregateData(events, filterCondition, keyExtractor, labelExtractor = formatLabel, limit = 10) {
    console.log(`--- aggregateData called for filter: ${filterCondition.toString().substring(0,50)} | key: ${keyExtractor.toString().substring(0,50)}`);
    let labels = []; let data = [];
    try {
        let filteredEvents = [];
        try { filteredEvents = events.filter(filterCondition); }
        catch (filterError) { console.error("!! Error DURING filterCondition execution:", filterError); return { labels: [], data: [] }; }

        let extractedKeys = [];
        filteredEvents.forEach((event, index) => { try { extractedKeys.push(keyExtractor(event)); } catch (extractError) { console.warn(`!! Error DURING keyExtractor execution (event index ${index}):`, extractError, "for event:", JSON.stringify(event).substring(0, 200)); extractedKeys.push(null); } });

        const validKeys = extractedKeys.filter(value => value !== null && value !== undefined && String(value).trim() !== '');
        if (validKeys.length === 0) { return { labels: [], data: [] }; }

        const aggregation = validKeys.reduce((acc, value) => { const key = String(value).substring(0, 100); acc[key] = (acc[key] || 0) + 1; return acc; }, {});
        const sortedEntries = Object.entries(aggregation).sort(([, countA], [, countB]) => countB - countA).slice(0, limit);

        labels = sortedEntries.map(([key]) => { try { return labelExtractor ? labelExtractor(key) : key; } catch (labelError) { console.warn("!! Error DURING labelExtractor execution:", labelError, "for key:", key); return key; } });
        data = sortedEntries.map(([, count]) => count);
    } catch (error) { console.error(`!!! UNEXPECTED Error inside aggregateData !!!`, error); return { labels: [], data: [] }; }
    return { labels, data };
}

// --- *** START renderCharts Definition *** ---
function renderCharts(events) {
    console.log("--- Starting renderCharts (With Diagnostics) ---");
    const colors = CHART_COLORS_FALLBACK;

    try {
        // 1. Page Views Over Time
        console.log("Processing Chart 1: Page Views Over Time");
        const viewsByDate = events.filter(e => e.type === 'pageview' && (e.receivedAt || e.timestamp)).reduce((acc, event) => { try { const date = new Date(event.receivedAt || event.timestamp).toISOString().split('T')[0]; acc[date] = (acc[date] || 0) + 1; } catch(e) {} return acc; }, {});
        const sortedDates = Object.keys(viewsByDate).sort();
        const pageViewData = sortedDates.map(date => viewsByDate[date]);
        console.log(">>> Page Views - Dates:", sortedDates.length, "Data Points:", pageViewData.length);
        if (sortedDates.length > 0) { renderChart('pageViewsChart', 'line', { labels: sortedDates, datasets: [{ label: 'Page Views', data: pageViewData, borderColor: colors[0], backgroundColor: colors[0].replace('0.7', '0.2'), tension: 0.1, fill: true }] }, { scales: { x: { type: 'time', time: { unit: 'day', tooltipFormat: 'PP' } }, y: { beginAtZero: true, suggestedMax: Math.max(5, ...pageViewData) + 3, ticks: { precision: 0 } } } }); }
        else { handleEmptyChart('pageViewsChart', 'No page view data.'); }
        console.log("Finished Chart 1");

        // 2. Project Interactions
        console.log("Processing Chart 2: Project Interactions");
        const projectAggData = aggregateData( events, e => e.projectId || e.details?.projectId || e.details?.context || e.details?.trackId, e => e.projectId || e.details?.projectId || e.details?.trackId || e.details?.context || 'Unknown Project', formatLabel, 10 );
        console.log(">>> Project Interactions - Aggregated Data:", JSON.stringify(projectAggData));
        if (projectAggData.labels.length > 0) { renderChart('projectInteractionsChart', 'bar', { labels: projectAggData.labels, datasets: [{ label: 'Interactions', data: projectAggData.data, backgroundColor: colors[1] }] }, { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { ticks: { precision: 0 }}}}); }
        else { handleEmptyChart('projectInteractionsChart', 'No project interaction data.'); }
        console.log("Finished Chart 2");

        // 3. Link Click Destinations
        console.log("Processing Chart 3: Link Click Destinations");
        const linkDestAggData = aggregateData( events, e => (e.type === 'link_click' || e.type === 'anchor_click') && e.details?.linkType, e => e.details.linkType, formatLabel, 10 );
        console.log(">>> Link Destinations - Aggregated Data:", JSON.stringify(linkDestAggData));
         if (linkDestAggData.labels.length > 0) { renderChart('linkTypesChart', 'doughnut', { labels: linkDestAggData.labels, datasets: [{ label: 'Link Types', data: linkDestAggData.data, backgroundColor: colors.slice(2), hoverOffset: 4 }] }, { plugins: { legend: { position: 'bottom' } } }); }
         else { handleEmptyChart('linkTypesChart', 'No link click data.'); }
        console.log("Finished Chart 3");

         // 4. Interaction Click Types
         console.log("Processing Chart 4: Interaction Click Types");
         const clickTypesAggData = aggregateData( events, e => ['link_click', 'anchor_click', 'button_click', 'project_click', 'generic_click', 'publication_click', 'project_card_area_click', 'tracked_element_click'].includes(e.type), e => e.type, formatLabel, 10 );
         console.log(">>> Click Types - Aggregated Data:", JSON.stringify(clickTypesAggData));
          if (clickTypesAggData.labels.length > 0) { renderChart('clickTypesChart', 'pie', { labels: clickTypesAggData.labels, datasets: [{ label: 'Click Types', data: clickTypesAggData.data, backgroundColor: colors.slice(3), hoverOffset: 4 }] }, { plugins: { legend: { position: 'bottom' } } }); }
          else { handleEmptyChart('clickTypesChart', 'No click type data.'); }
         console.log("Finished Chart 4");

        // 5. Modal Opens
        console.log("Processing Chart 5: Modal Opens");
        const modalAggData = aggregateData( events, e => e.type === 'modal_open' && (e.details?.modalId || e.modalId || e.modalType), e => e.details?.modalId || e.modalId || e.modalType, formatLabel, 10 );
        console.log(">>> Modal Opens - Aggregated Data:", JSON.stringify(modalAggData));
        if (modalAggData.labels.length > 0) { renderChart('modalOpensChart', 'pie', { labels: modalAggData.labels, datasets: [{ label: 'Modal Opens', data: modalAggData.data, backgroundColor: colors.slice(1).reverse(), hoverOffset: 4 }] }, { plugins: { legend: { position: 'bottom' } } }); }
        else { handleEmptyChart('modalOpensChart', 'No modal open data.'); }
        console.log("Finished Chart 5");

        // 6. Event Types Distribution
        console.log("Processing Chart 6: Event Types Distribution");
        const eventTypeAggData = aggregateData( events, e => true, event => event.type || 'Unknown Type', formatLabel, 15 );
        console.log(">>> Event Types - Aggregated Data:", JSON.stringify(eventTypeAggData));
         if (eventTypeAggData.labels.length > 0) { renderChart('eventTypesChart', 'bar', { labels: eventTypeAggData.labels, datasets: [{ label: 'Event Count', data: eventTypeAggData.data, backgroundColor: colors[4] }] }, { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { ticks: { precision: 0 }}}}); }
         else { handleEmptyChart('eventTypesChart', 'No event data available.'); }
        console.log("Finished Chart 6");

        // 7. Screen Width Distribution
        console.log("Processing Chart 7: Screen Width Distribution");
         const screenWidthAggData = aggregateData( events, event => event.screenWidth != null && !isNaN(parseInt(event.screenWidth, 10)) && parseInt(event.screenWidth, 10) > 0, event => { const width = parseInt(event.screenWidth, 10); if (width <= 480) return '<= 480px (Mobile)'; if (width <= 768) return '481-768px (Tablet)'; if (width <= 1024) return '769-1024px (Sm Laptop)'; if (width <= 1440) return '1025-1440px (Desktop)'; return '> 1440px (Lrg Desktop)'; }, null, 8 );
         console.log(">>> Screen Width - Aggregated Data:", JSON.stringify(screenWidthAggData));
         if (screenWidthAggData.labels.length > 0) { renderChart('screenWidthChart', 'doughnut', { labels: screenWidthAggData.labels, datasets: [{ label: 'Screen Widths', data: screenWidthAggData.data, backgroundColor: colors.slice(5), hoverOffset: 4 }] }, { plugins: { legend: { position: 'bottom' } } }); }
         else { handleEmptyChart('screenWidthChart', 'No screen width data.'); }
        console.log("Finished Chart 7");

    } catch (renderChartsError) {
        console.error("Error during renderCharts function execution:", renderChartsError);
        statusEl.textContent = `Error rendering charts: ${renderChartsError.message}`;
         handleEmptyChart('pageViewsChart', 'Chart Render Error');
         handleEmptyChart('projectInteractionsChart', 'Chart Render Error');
         handleEmptyChart('linkTypesChart', 'Chart Render Error');
         handleEmptyChart('clickTypesChart', 'Chart Render Error');
         handleEmptyChart('modalOpensChart', 'Chart Render Error');
         handleEmptyChart('eventTypesChart', 'Chart Render Error');
         handleEmptyChart('screenWidthChart', 'Chart Render Error');
    } finally {
         console.log("--- Finished renderCharts (With Diagnostics) ---");
    }
}
// --- *** END renderCharts Definition *** ---


// --- handleEmptyChart ---
function handleEmptyChart(canvasId, message) {
    console.log(`Handling empty chart: ${canvasId} - ${message}`);
    const canvas = document.getElementById(canvasId);
    if (!canvas) { console.warn(`Canvas not found for empty message: ${canvasId}`); return;}
    if (chartInstances[canvasId]) { chartInstances[canvasId].destroy(); delete chartInstances[canvasId]; }
    const ctx = canvas.getContext('2d');
    if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.font = '16px Arial';
        ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--secondary-text').trim() || '#888';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(message, canvas.width / 2, canvas.height / 2);
        ctx.restore();
    }
}


// --- renderChart (With Diagnostics) ---
function renderChart(canvasId, type, data, options = {}) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) { console.error(`Canvas element with ID "${canvasId}" not found.`); return; }
    const ctx = canvas.getContext('2d');
    if (!ctx) { console.error(`Failed to get 2D context for canvas "${canvasId}".`); return; }

    const baseOptions = { plugins: { legend: { labels: {} }, tooltip: { bodyColor: Chart.defaults.color, titleColor: Chart.defaults.color, backgroundColor: document.body.classList.contains('dark-theme') ? 'rgba(44, 44, 44, 0.9)' : 'rgba(255, 255, 255, 0.9)', borderColor: Chart.defaults.borderColor, borderWidth: 1 } } };
    function mergeDeep(target, source) { for(const key in source){if(source[key]instanceof Object && key in target && target[key]instanceof Object){if(!(source[key]instanceof Array)&&!(target[key]instanceof Array)){mergeDeep(target[key],source[key]);}else{target[key]=source[key];}}else{target[key]=source[key];}}return target; } // Simple merge
    const defaultOptions = { responsive: true, maintainAspectRatio: false, animation: { duration: 400 } };
    const mergedOptions = mergeDeep(mergeDeep({ ...defaultOptions }, baseOptions), options);

    console.log(`Rendering chart: ${canvasId}`);
    console.log(`  - Type: ${type}`);
    const labels = data?.labels ?? 'N/A'; const datasetData = data?.datasets?.[0]?.data ?? 'N/A';
    console.log(`  - Data Labels Count:`, Array.isArray(labels) ? labels.length : labels);
    console.log(`  - First Dataset Points Count:`, Array.isArray(datasetData) ? datasetData.length : datasetData);
    try { console.log(`  - Merged Options:`, JSON.stringify(mergedOptions, null, 2).substring(0, 500) + "..."); } catch { console.log("  - Merged Options: (Could not stringify)"); }

    if (chartInstances[canvasId]) { chartInstances[canvasId].destroy(); }

    try {
        chartInstances[canvasId] = new Chart(ctx, { type, data, options: mergedOptions });
        console.log(`  - Chart instance CREATED for ${canvasId}`);
    }
    catch (chartError) {
        console.error(`Error creating Chart.js instance for ${canvasId}:`, chartError);
        statusEl.textContent = `Error rendering chart ${canvasId}`;
        ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.save(); ctx.font = '14px Arial'; ctx.fillStyle = 'red'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(`Chart Error: ${chartError.message.substring(0, 100)}`, canvas.width / 2, canvas.height / 2); ctx.restore();
    }
}
// --- END OF FILE dashboard.js (FOR DASHBOARD - Complete with Fixes & Diagnostics) ---
