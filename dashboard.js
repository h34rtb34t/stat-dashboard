// --- START OF FILE dashboard.js (FOR DASHBOARD - VERY DETAILED LOGGING) ---

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
    console.log(`%c[THEME] applyTheme CALLED with theme: ${theme}`, 'color: orange;'); // <<< DIAGNOSTIC LOG
    const isDark = theme === 'dark';
    console.log(`%c[THEME] - Setting dark theme class: ${isDark}`, 'color: orange;'); // <<< DIAGNOSTIC LOG
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
        console.log(`%c[THEME] Applying theme: ${theme}. Switching map tiles.`, 'color: orange;');
        try {
            if (isDark) {
                if (mapInstance.hasLayer(lightTileLayer)) { mapInstance.removeLayer(lightTileLayer); console.log("%c[THEME] Removed light tile layer.", 'color: orange;'); }
                if (!mapInstance.hasLayer(darkTileLayer)) { mapInstance.addLayer(darkTileLayer); console.log("%c[THEME] Added dark tile layer.", 'color: orange;'); }
            } else {
                if (mapInstance.hasLayer(darkTileLayer)) { mapInstance.removeLayer(darkTileLayer); console.log("%c[THEME] Removed dark tile layer.", 'color: orange;'); }
                if (!mapInstance.hasLayer(lightTileLayer)) { mapInstance.addLayer(lightTileLayer); console.log("%c[THEME] Added light tile layer.", 'color: orange;'); }
            }
        } catch (mapLayerError) { console.error("Error switching map tile layers:", mapLayerError); }
    } else { console.log("%c[THEME] Map or tile layers not ready for theme switch yet.", 'color: orange;'); }
}

function toggleTheme() {
    console.log("%c[THEME] toggleTheme CALLED", 'color: orange;'); // <<< DIAGNOSTIC LOG
    const currentTheme = document.body.classList.contains('dark-theme') ? 'dark' : 'light';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    console.log(`%c[THEME] - Current: ${currentTheme}, New: ${newTheme}`, 'color: orange;'); // <<< DIAGNOSTIC LOG
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
    console.log("%c[MAP] initializeMap called", 'color: purple');
    if (mapInstance) {
        console.log("%c[MAP] Map already initialized.", 'color: purple');
        return;
    }
    try {
        if (typeof L === 'undefined' || typeof L.markerClusterGroup === 'undefined') {
             console.error("[MAP] Leaflet or Leaflet.markercluster library not found.");
             statusEl.textContent = "Error: Map library or plugin not loaded.";
             return;
        }
        const mapContainer = document.getElementById('locationMap');
        if (!mapContainer) { console.error("[MAP] Map container element '#locationMap' not found."); return; }
        mapInstance = L.map('locationMap').setView([20, 0], 2);
        lightTileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors' });
        darkTileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { attribution: '© <a href="https://osm.org/copyright">OSM</a> contributors © <a href="https://carto.com/attributions">CARTO</a>', subdomains: 'abcd', maxZoom: 19 });
        const initialThemeIsDark = document.body.classList.contains('dark-theme');
        if (initialThemeIsDark) { darkTileLayer.addTo(mapInstance); } else { lightTileLayer.addTo(mapInstance); }
        markerLayerGroup = L.markerClusterGroup(); // Use MarkerClusterGroup
        markerLayerGroup.addTo(mapInstance);
        console.log("%c[MAP] Map initialized successfully with MarkerCluster.", 'color: purple');
    } catch (error) { console.error("[MAP] Error initializing map:", error); statusEl.textContent = "Error initializing map."; mapInstance = null; lightTileLayer = null; darkTileLayer = null; markerLayerGroup = null; }
}

// --- Map Rendering (Updated for MarkerCluster) ---
function renderLocationMap(events) {
    console.log("%c[MAP] renderLocationMap called", 'color: purple');
    if (!mapInstance || !markerLayerGroup) {
        console.warn("[MAP] Map or marker group not initialized/ready for rendering. Attempting init.");
        initializeMap(); // Try to initialize if not ready
        if (!mapInstance || !markerLayerGroup) {
            console.error("[MAP] Failed to initialize map/marker group for rendering.");
            return; // Exit if still not initialized
        }
    }
    console.log("%c[MAP] Clearing existing map layers.", 'color: purple');
    markerLayerGroup.clearLayers();
    let locationsAdded = 0;
    const eventsCopy = [...events]; // Avoid modifying original if needed elsewhere
    console.log(`%c[MAP] Processing ${eventsCopy.length} events for map rendering (reversed).`, 'color: purple');

    eventsCopy.reverse().forEach((event, index) => { // Reverse to show latest first potentially? (though clustering handles density)
        if (event.location?.latitude != null && event.location?.longitude != null && !isNaN(parseFloat(event.location.latitude)) && !isNaN(parseFloat(event.location.longitude))) {
            const lat = parseFloat(event.location.latitude);
            const lon = parseFloat(event.location.longitude);
            if (lat === 0 && lon === 0 && event.location.ip !== '127.0.0.1' && event.location.ip !== '::1') {
                 //console.log(`[MAP] Skipping potential invalid 0,0 coords for event index ${index}:`, event.type, event.location.ip);
                 return; // Skip likely invalid 0,0 coordinates
            }
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
            catch (markerError) { console.error(`[MAP] Error adding marker for event index ${index}: Lat=${lat}, Lon=${lon}`, markerError, event); }
        } else {
           // Optional: Log events without valid location
           // if (index < 10) console.log(`[MAP] Event index ${index} lacks valid location data:`, event);
        }
    });
    console.log(`%c[MAP] Added ${locationsAdded} markers to the cluster group.`, 'color: purple');
}

// Apply saved theme and set up listeners on load
document.addEventListener('DOMContentLoaded', () => {
    console.log("[INIT] DOMContentLoaded event fired.");
    initializeMap();
    const savedTheme = localStorage.getItem('dashboardTheme') || 'light';
    console.log(`[INIT] Applying saved theme: ${savedTheme}`);
    applyTheme(savedTheme);
    secretTokenInput.value = localStorage.getItem('dashboardAuthToken') || '';
    console.log("[INIT] Setting initial table message.");
    rawEventsTbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px; color: var(--secondary-text);">Click \'Fetch Data\' to load events.</td></tr>';

    // Event Listeners
    console.log("[INIT] Adding event listeners...");
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

    handleScroll(); // Initial check for scroll button
    console.log("[INIT] DOM Content Loaded setup complete.");
});

// --- Auto-Refresh Handler ---
function handleAutoRefreshToggle() {
    console.log(`[REFRESH] Auto-refresh toggled. Checked: ${autoRefreshCheckbox.checked}`);
    if (autoRefreshCheckbox.checked) {
        if (refreshIntervalId === null) {
             console.log(`[REFRESH] Starting auto-refresh. Fetching immediately.`);
             fetchData(); // Fetch immediately when turned on
             refreshIntervalId = setInterval(fetchData, REFRESH_INTERVAL);
             console.log(`[REFRESH] Auto-refresh interval set (ID: ${refreshIntervalId})`);
        } else {
            console.log(`[REFRESH] Auto-refresh already running (ID: ${refreshIntervalId})`);
        }
    } else {
        if (refreshIntervalId !== null) {
            clearInterval(refreshIntervalId);
            console.log(`[REFRESH] Auto-refresh interval cleared (ID was: ${refreshIntervalId})`);
            refreshIntervalId = null;
        } else {
             console.log(`[REFRESH] Auto-refresh was not running.`);
        }
    }
}


// --- Core Fetch Function (Updated for Spinner, Status, Token Save) ---
async function fetchData() {
    console.log("%c[FETCH] ------- fetchData CALLED! -------", 'color: blue; font-weight: bold;');
    if (fetchDataBtn.disabled && !autoRefreshCheckbox.checked) {
        console.warn("[FETCH] Fetch already in progress (button disabled), skipping.");
        return;
    }
    const secretToken = secretTokenInput.value.trim();
    if (!secretToken) {
        console.error("[FETCH] Auth Token missing.");
        statusEl.textContent = 'Please enter the Auth Token.';
        return;
    }
    if (!RETRIEVAL_WORKER_URL || RETRIEVAL_WORKER_URL.includes('REPLACE') || RETRIEVAL_WORKER_URL.length < 20) {
        console.error("[FETCH] RETRIEVAL_WORKER_URL invalid:", RETRIEVAL_WORKER_URL);
        statusEl.textContent = 'ERROR: RETRIEVAL_WORKER_URL seems invalid.';
        return;
    }

    console.log("[FETCH] Starting fetch process...");
    statusEl.textContent = 'Fetching data...';
    loadingSpinner.style.display = 'inline-block';
    fetchDataBtn.disabled = true;
    console.log("[FETCH] Button disabled, spinner shown.");

    console.log("[FETCH] Clearing UI elements...");
    rawEventsTbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Loading...</td></tr>';
    resetSummary();
    destroyCharts();
    if (markerLayerGroup) {
        console.log("[FETCH] Clearing map markers.");
        markerLayerGroup.clearLayers();
    } else {
        console.warn("[FETCH] Marker layer group not found, attempting map init.");
        initializeMap();
    }

    // IMPORTANT: Clear the previous raw events state
    console.log("[FETCH] Clearing currentRawEvents array.");
    currentRawEvents = [];

    try {
        console.log(`%c[FETCH] Attempting fetch from ${RETRIEVAL_WORKER_URL}...`, 'color: blue');
        const response = await fetch(RETRIEVAL_WORKER_URL, {
            method: 'GET', headers: { 'Authorization': `Bearer ${secretToken}` }
        });
        console.log(`%c[FETCH] Fetch call completed. Status: ${response.status}`, 'color: blue');

        // Check for specific HTTP errors first
        if (response.status === 401) throw new Error('Unauthorized (401). Check Auth Token.');
        if (response.status === 403) throw new Error('Forbidden (403). Check Worker CORS or Auth.');
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status} ${response.statusText}`);

        console.log("[FETCH] Processing response JSON...");
        statusEl.textContent = 'Processing data...';
        const rawEventsFromFetch = await response.json(); // Store in temp variable first

        if (!Array.isArray(rawEventsFromFetch)) {
            console.error("[FETCH] Invalid data format received:", rawEventsFromFetch);
            throw new Error('Received invalid data format from worker (expected array).');
        }

        console.log(`%c[FETCH] Received ${rawEventsFromFetch.length} raw events from fetch.`, 'color: green;');
        // --- VERY IMPORTANT LOGGING ---
        if (rawEventsFromFetch.length > 0) {
            const firstTimestamp = rawEventsFromFetch[0]?.receivedAt || rawEventsFromFetch[0]?.timestamp || 'N/A';
            const lastTimestamp = rawEventsFromFetch[rawEventsFromFetch.length - 1]?.receivedAt || rawEventsFromFetch[rawEventsFromFetch.length - 1]?.timestamp || 'N/A';
            console.log(`%c[FETCH] Timestamp of FIRST event received: ${firstTimestamp}`, 'color: green;');
            console.log(`%c[FETCH] Timestamp of LAST event received: ${lastTimestamp}`, 'color: green;');
            console.log(`%c[FETCH] First event object (sample):`, 'color: green;', JSON.stringify(rawEventsFromFetch[0], null, 2));
        } else {
            console.log(`%c[FETCH] Received an empty array.`, 'color: green;');
        }
        // --- END VERY IMPORTANT LOGGING ---

        // Assign to global state *after* logging
        currentRawEvents = rawEventsFromFetch;
        console.log(`%c[FETCH] Assigned ${currentRawEvents.length} events to currentRawEvents state.`, 'color: green;');

        localStorage.setItem('dashboardAuthToken', secretToken);
        console.log("[FETCH] Auth token saved to localStorage.");

        console.log("[FETCH] Populating filters...");
        statusEl.textContent = 'Populating filters...';
        resetFilters(); // Ensure filters are reset BEFORE populating
        populateEventTypeFilter(currentRawEvents);
        populateModalTypeFilter(currentRawEvents);
        // populateDetailLinkTypeFilter(currentRawEvents);

        console.log("[FETCH] Rendering charts...");
        statusEl.textContent = 'Rendering charts...';
        renderCharts(currentRawEvents); // Use the global currentRawEvents

        console.log("[FETCH] Applying filters and rendering table...");
        statusEl.textContent = 'Rendering table...';
        applyFiltersAndDisplayEvents(); // Uses the global currentRawEvents

        console.log("[FETCH] Calculating summary...");
        statusEl.textContent = 'Calculating summary...';
        calculateAndDisplaySummary(currentRawEvents); // Use the global currentRawEvents

        console.log("[FETCH] Rendering map...");
        statusEl.textContent = 'Rendering map...';
        renderLocationMap(currentRawEvents); // Use the global currentRawEvents

        statusEl.textContent = `Dashboard updated with ${currentRawEvents.length} fetched events.`;
        console.log("%c[FETCH] ------- fetchData COMPLETE -------", 'color: blue; font-weight: bold;');

    } catch (error) {
        console.error('%c[FETCH] Error during fetch or processing:', 'color: red;', error);
        statusEl.textContent = `Error: ${error.message}`;
        rawEventsTbody.innerHTML = `<tr><td colspan="4" style="color: red; text-align:center;">Error: ${error.message}</td></tr>`;
        console.log("[FETCH] Destroying charts due to error.");
        destroyCharts();
        if(markerLayerGroup) markerLayerGroup.clearLayers();
        console.log("[FETCH] Displaying error messages on charts.");
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
         console.log("[FETCH] Finally block: Hiding spinner, enabling button.");
         loadingSpinner.style.display = 'none';
         fetchDataBtn.disabled = false;
    }
}


// --- Helper Functions ---
function resetSummary() {
    console.log("[UI] Resetting summary boxes.");
    totalViewsEl.textContent = '--'; uniqueDaysEl.textContent = '--';
    if(topCountryEl) topCountryEl.textContent = '--'; if(topReferrerEl) topReferrerEl.textContent = '--';
}
function destroyCharts() {
    console.log("[CHARTS] Destroying existing chart instances.");
    Object.entries(chartInstances).forEach(([id, chart]) => {
        if (chart) {
            console.log(`[CHARTS] - Destroying chart: ${id}`);
            chart.destroy();
        }
    });
    chartInstances = {};
}
function formatLabel(key) {
       // Keep this simple for now
       if (!key) return 'Unknown';
       return String(key).replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}


// --- Filter Functions ---
function resetFilters() {
    console.log("[FILTERS] Resetting filter controls.");
    if(filterEventTypeSelect) filterEventTypeSelect.innerHTML = '<option value="">All Types</option>';
    if(filterKeywordInput) filterKeywordInput.value = '';
    if(filterLinkTypeSelect) {
        filterLinkTypeSelect.innerHTML = '<option value="">All Link Dest. Types</option>';
        // Add options back if they were static
        const staticOptions = ["internal", "external", "anchor", "nohref"];
        staticOptions.forEach(val => {
            const option = document.createElement('option');
            option.value = val;
            option.textContent = val.charAt(0).toUpperCase() + val.slice(1);
            filterLinkTypeSelect.appendChild(option);
        });
         filterLinkTypeSelect.value = ''; // Ensure default is selected
    }
    if(filterModalTypeSelect) filterModalTypeSelect.innerHTML = '<option value="">All Modal IDs/Types</option>';
    if(filterProjectIdInput) filterProjectIdInput.value = '';
    // if(filterDetailLinkTypeSelect) filterDetailLinkTypeSelect.innerHTML = '<option value="">All Link Detail Types</option>';
 }

 function populateEventTypeFilter(events) {
    if(!filterEventTypeSelect) return;
    console.log(`[FILTERS] Populating event type filter from ${events.length} events.`);
    const types = new Set(events.map(e => e.type || 'Unknown').filter(t => t));
    filterEventTypeSelect.innerHTML = '<option value="">All Types</option>'; // Reset first
    [...types].sort().forEach(type => { const option = document.createElement('option'); option.value = type; option.textContent = formatLabel(type); filterEventTypeSelect.appendChild(option); });
    console.log(`[FILTERS] Added ${types.size} event types to filter.`);
}

 function populateModalTypeFilter(events) {
    if(!filterModalTypeSelect) return;
    console.log(`[FILTERS] Populating modal type filter from ${events.length} events.`);
    const modalIds = new Set();
    events.filter(e => e.type === 'modal_open').forEach(e => {
        if (e.details?.modalId) modalIds.add(e.details.modalId);
        else if (e.modalId || e.modalType) modalIds.add(e.modalId || e.modalType); // Fallback
    });
    filterModalTypeSelect.innerHTML = '<option value="">All Modal IDs/Types</option>'; // Reset first
    [...modalIds].sort().forEach(id => { if(id){ const option = document.createElement('option'); option.value = id; option.textContent = formatLabel(id); filterModalTypeSelect.appendChild(option); } });
    console.log(`[FILTERS] Added ${modalIds.size} modal IDs/Types to filter.`);
}

// function populateDetailLinkTypeFilter(events) { /* ... function definition if needed ... */ }

// --- Apply Filters ---
function applyFiltersAndDisplayEvents() {
    console.log("%c[FILTERS] applyFiltersAndDisplayEvents called", 'color: green; font-style: italic;');
    // Log current filter values
    const selectedEventType = filterEventTypeSelect?.value || '';
    const keyword = filterKeywordInput?.value.trim().toLowerCase() || '';
    const selectedModalId = filterModalTypeSelect?.value || '';
    const projectIdKeyword = filterProjectIdInput?.value.trim().toLowerCase() || '';
    const selectedLinkType = filterLinkTypeSelect?.value || '';
    console.log(`%c[FILTERS] Current Filter Values:`, 'color: green; font-style: italic;');
    console.log(`%c  - Event Type: '${selectedEventType}'`, 'color: green; font-style: italic;');
    console.log(`%c  - Keyword: '${keyword}'`, 'color: green; font-style: italic;');
    console.log(`%c  - Modal ID: '${selectedModalId}'`, 'color: green; font-style: italic;');
    console.log(`%c  - Project Keyword: '${projectIdKeyword}'`, 'color: green; font-style: italic;');
    console.log(`%c  - Link Dest Type: '${selectedLinkType}'`, 'color: green; font-style: italic;');

    console.log(`%c[FILTERS] Filtering ${currentRawEvents.length} raw events stored in 'currentRawEvents'.`, 'color: green; font-style: italic;');
    if (currentRawEvents.length > 0) {
         const firstTimestamp = currentRawEvents[0]?.receivedAt || currentRawEvents[0]?.timestamp || 'N/A';
         console.log(`%c[FILTERS] Timestamp of first event in currentRawEvents before sort: ${firstTimestamp}`, 'color: green; font-style: italic;');
    }

    // Sort BEFORE filtering might be slightly better if expecting user interaction? Or sort AFTER filtering? Let's sort first.
    // IMPORTANT: Sort a COPY, don't modify currentRawEvents directly here if other functions rely on original order?
    // Let's sort a copy.
    const sortedEvents = [...currentRawEvents].sort((a, b) => {
        const dateA = new Date(a.receivedAt || 0);
        const dateB = new Date(b.receivedAt || 0);
        return dateB - dateA; // Newest first
    });
     console.log(`%c[FILTERS] Sorted ${sortedEvents.length} events.`, 'color: green; font-style: italic;');
     if (sortedEvents.length > 0) {
         const firstSortedTimestamp = sortedEvents[0]?.receivedAt || sortedEvents[0]?.timestamp || 'N/A';
         console.log(`%c[FILTERS] Timestamp of first event AFTER sort (should be newest): ${firstSortedTimestamp}`, 'color: green; font-style: italic;');
     }


    const filteredEvents = sortedEvents.filter(event => {
        // Check Event Type
        if (selectedEventType && (event.type || 'Unknown') !== selectedEventType) return false;

        // Check Modal ID
        if (selectedModalId) {
            const eventModalId = event.details?.modalId || event.modalId || event.modalType;
            if (event.type !== 'modal_open' || eventModalId !== selectedModalId) return false;
        }

        // Check Link Destination Type
        if (selectedLinkType && event.type !== 'link_click' && event.type !== 'anchor_click') return false; // Only apply to link clicks
        if (selectedLinkType && (!event.details?.linkType || event.details.linkType !== selectedLinkType)) return false;


        // Check Project ID Keyword
        const projId = event.projectId || event.details?.projectId || event.details?.context || event.details?.trackId || '';
        if (projectIdKeyword && !String(projId).toLowerCase().includes(projectIdKeyword)) return false;

        // Check General Keyword
        if (keyword) {
             const timestampStr = event.receivedAt ? new Date(event.receivedAt).toLocaleString().toLowerCase() : '';
             const typeStr = (event.type || '').toLowerCase();
             const pageStr = (event.page || '').toLowerCase();
             let searchString = `${timestampStr} ${typeStr} ${pageStr}`;
             try {
                 // Include more details in search
                 const detailsStr = event.details ? JSON.stringify(event.details).toLowerCase() : '';
                 const locationStr = event.location ? `${event.location.city || ''} ${event.location.regionCode || ''} ${event.location.country || ''} ${event.location.ip || ''} ${event.location.asOrganization || ''}`.toLowerCase() : '';
                 const screenStr = event.screenWidth ? `${event.screenWidth}x${event.screenHeight}`.toLowerCase() : '';
                 const referrerStr = (event.referrer || '').toLowerCase();
                 searchString += ` ${detailsStr} ${locationStr} ${screenStr} ${referrerStr}`;
                 if(projId) searchString += ` ${String(projId).toLowerCase()}`; // Ensure project ID is searchable by keyword too

             } catch (e) { console.warn("[FILTERS] Error stringifying details/location for keyword search:", e) }

             if (!searchString.includes(keyword)) return false;
        }

        // If passed all filters
        return true;
    });

    console.log(`%c[FILTERS] Filtered down to ${filteredEvents.length} events.`, 'color: green; font-style: italic;');
    if (filteredEvents.length > 0) {
        const firstFilteredTimestamp = filteredEvents[0]?.receivedAt || filteredEvents[0]?.timestamp || 'N/A';
        console.log(`%c[FILTERS] Timestamp of first event AFTER filtering: ${firstFilteredTimestamp}`, 'color: green; font-style: italic;');
    } else {
        console.log(`%c[FILTERS] No events matched the filters.`, 'color: green; font-style: italic;');
    }

    // Pass the final filtered list to the render function
    renderTableBody(filteredEvents);
}


// --- Render Table Body ---
function renderTableBody(eventsToRender) { // Renamed variable for clarity
    console.log(`%c[RENDER] renderTableBody called with ${eventsToRender.length} events.`, 'color: brown;');
     if (eventsToRender.length > 0) {
        const firstRenderTimestamp = eventsToRender[0]?.receivedAt || eventsToRender[0]?.timestamp || 'N/A';
        console.log(`%c[RENDER] Timestamp of first event passed to renderTableBody: ${firstRenderTimestamp}`, 'color: brown;');
    }

    console.log("[RENDER] Clearing table body (tbody innerHTML).");
    rawEventsTbody.innerHTML = ''; // Clear previous entries

    if (eventsToRender.length === 0) {
        console.log("[RENDER] No events to render, adding 'No events match' message.");
        rawEventsTbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">No events match the current filters.</td></tr>';
        return;
    }

    console.log(`[RENDER] Starting loop to add ${eventsToRender.length} rows.`);
    let rowsAdded = 0;
    eventsToRender.forEach((event, index) => {
        try {
            const row = rawEventsTbody.insertRow();
            row.insertCell().textContent = event.receivedAt ? new Date(event.receivedAt).toLocaleString() : 'N/A';
            row.insertCell().textContent = event.type || 'N/A';

            const pageCell = row.insertCell();
            const pageUrl = event.page || 'N/A';
            pageCell.textContent = pageUrl.length > 60 ? pageUrl.substring(0, 57) + '...' : pageUrl;
            pageCell.title = pageUrl; // Add full URL as tooltip

            const detailsCell = row.insertCell();
            const detailsToShow = { ...event };
            // Clean up top-level keys we already display or don't need in details <pre>
            delete detailsToShow.receivedAt;
            delete detailsToShow.type;
            delete detailsToShow.page;
            delete detailsToShow.clientTimestamp; // Usually redundant if receivedAt is good
            delete detailsToShow.timestamp; // Usually redundant

            let content = '';
            // Add key info first if available
            if (event.location) { content += `Loc: ${event.location.city || '?'} / ${event.location.country || '?'} (IP: ${event.location.ip || '?'})\nOrg: ${event.location.asOrganization || '?'}\n`; delete detailsToShow.location;}
            if(event.screenWidth) { content += `Screen: ${event.screenWidth}x${event.screenHeight}\n`; delete detailsToShow.screenWidth; delete detailsToShow.screenHeight; }
            if(event.referrer) { content += `Referrer: ${event.referrer}\n`; delete detailsToShow.referrer;}
            if(event.projectId) { content += `Project: ${event.projectId}\n`; delete detailsToShow.projectId; }

            // Separate primary info from the raw 'details' object
            const remainingDetails = detailsToShow.details || {};
            delete detailsToShow.details; // Remove the nested details object from the top level display

            // Add any other remaining top-level keys
            Object.keys(detailsToShow).forEach(key => {
                 if (typeof detailsToShow[key] !== 'object' || detailsToShow[key] === null) { // Display simple values
                     content += `${key}: ${detailsToShow[key]}\n`;
                 } else { // Put objects back into remainingDetails if not already handled
                    if (!remainingDetails[key]) remainingDetails[key] = detailsToShow[key];
                 }
             });


            // Add separator if we have both primary info and details obj
            if (content && Object.keys(remainingDetails).length > 0) {
                 content += '----\nDetails Obj:\n';
            } else if (!content && Object.keys(remainingDetails).length > 0) {
                 content += 'Details Obj:\n';
            }

            // Add the stringified details object
            if (Object.keys(remainingDetails).length > 0) {
                 try { content += JSON.stringify(remainingDetails, null, 2); }
                 catch (e) { content += "Error stringifying details object"; }
            } else if (!content) { // If no primary info AND no details obj
                 content = '-- No Details --';
            }

            // Use innerText for the pre to prevent XSS, though JSON.stringify helps
            const pre = document.createElement('pre');
            pre.innerText = content;
            detailsCell.appendChild(pre);
            rowsAdded++;

            // Log the first row added
            // if (index === 0) {
            //      console.log("[RENDER] Added first row:", row.innerText.substring(0, 200) + "...");
            // }

        } catch(renderError) {
            console.error(`[RENDER] Error rendering row for event index ${index}:`, renderError, event);
            // Optionally add an error row to the table
             try {
                const errRow = rawEventsTbody.insertRow();
                const errCell = errRow.insertCell();
                errCell.colSpan = 4;
                errCell.style.color = 'red';
                errCell.textContent = `Error rendering event: ${event?.receivedAt || event?.timestamp || 'Unknown'}`;
             } catch {}
        }
    });
     console.log(`%c[RENDER] Finished loop, added ${rowsAdded} rows to the table.`, 'color: brown;');
}


// --- calculateAndDisplaySummary (Updated for New Boxes) ---
function calculateAndDisplaySummary(events) {
     console.log(`[SUMMARY] Calculating summary from ${events.length} events.`);
     const pageViews = events.filter(e => e.type === 'pageview');
     totalViewsEl.textContent = pageViews.length;
     const uniqueDays = new Set(pageViews.map(e => { try { const dateStr = e.receivedAt || e.timestamp; if (!dateStr) return null; return new Date(dateStr).toLocaleDateString(); } catch (err) { return null; } }).filter(d => d !== null));
     uniqueDaysEl.textContent = uniqueDays.size;
     if (topCountryEl) {
         const countries = events.filter(e => e.location?.country).reduce((acc, e) => { const country = e.location.country; acc[country] = (acc[country] || 0) + 1; return acc; }, {});
         const sortedCountries = Object.entries(countries).sort(([, countA], [, countB]) => countB - countA);
         topCountryEl.textContent = sortedCountries.length > 0 ? `${sortedCountries[0][0]} (${sortedCountries[0][1]})` : '--';
         console.log(`[SUMMARY] Top Country: ${topCountryEl.textContent}`);
     }
      if (topReferrerEl) {
          const referrers = events.filter(e => e.referrer && !e.referrer.includes(window.location.hostname) && !e.referrer.startsWith('android-app://') && !e.referrer.startsWith('ios-app://') && e.referrer !== '(direct)').reduce((acc, e) => { try { const url = new URL(e.referrer); const domain = url.hostname.replace(/^www\./, ''); acc[domain] = (acc[domain] || 0) + 1; } catch (err) { /* ignore invalid URLs for top ref */ } return acc; }, {});
          const sortedReferrers = Object.entries(referrers).sort(([, countA], [, countB]) => countB - countA);
          if (sortedReferrers.length > 0) {
             const topRef = sortedReferrers[0][0]; const topRefCount = sortedReferrers[0][1];
             topReferrerEl.textContent = topRef.length > 20 ? `${topRef.substring(0, 17)}... (${topRefCount})` : `${topRef} (${topRefCount})`;
             topReferrerEl.title = topRef; // Full referrer on hover
          } else { topReferrerEl.textContent = '--'; topReferrerEl.title = ''; }
          console.log(`[SUMMARY] Top Referrer: ${topReferrerEl.textContent}`);
      }
      console.log("[SUMMARY] Summary calculation complete.");
}

// --- aggregateData (Improved Error Handling) ---
function aggregateData(events, filterCondition, keyExtractor, labelExtractor = formatLabel, limit = 10) {
    // console.log(`--- aggregateData called for filter: ${filterCondition.toString().substring(0,50)} | key: ${keyExtractor.toString().substring(0,50)}`); // Keep less verbose for now
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
    // console.log(`--- aggregateData finished. Labels: ${labels.length}, Data points: ${data.length}`);
    return { labels, data };
}

// --- *** START renderCharts Definition *** ---
function renderCharts(events) {
    console.log("%c[CHARTS] --- Starting renderCharts ---", 'color: teal');
    if (!events || events.length === 0) {
        console.warn("[CHARTS] No events passed to renderCharts. Handling empty charts.");
        handleEmptyChart('pageViewsChart', 'No data available.');
        handleEmptyChart('projectInteractionsChart', 'No data available.');
        handleEmptyChart('linkTypesChart', 'No data available.');
        handleEmptyChart('clickTypesChart', 'No data available.');
        handleEmptyChart('modalOpensChart', 'No data available.');
        handleEmptyChart('eventTypesChart', 'No data available.');
        handleEmptyChart('screenWidthChart', 'No data available.');
        return;
    }
     console.log(`%c[CHARTS] Rendering charts with ${events.length} events.`, 'color: teal');
     if (events.length > 0) {
        const firstChartTimestamp = events[0]?.receivedAt || events[0]?.timestamp || 'N/A';
        console.log(`%c[CHARTS] Timestamp of first event passed to renderCharts: ${firstChartTimestamp}`, 'color: teal;');
    }

    const colors = CHART_COLORS_FALLBACK; // Use fallback colors

    try {
        // 1. Page Views Over Time
        console.log("[CHARTS] Processing Chart 1: Page Views Over Time");
        const viewsByDate = events.filter(e => e.type === 'pageview' && (e.receivedAt || e.timestamp)).reduce((acc, event) => { try { const date = new Date(event.receivedAt || event.timestamp).toISOString().split('T')[0]; acc[date] = (acc[date] || 0) + 1; } catch(e) {} return acc; }, {});
        const sortedDates = Object.keys(viewsByDate).sort();
        const pageViewData = sortedDates.map(date => viewsByDate[date]);
        console.log("[CHARTS] Page Views - Dates:", sortedDates.length, "Data Points:", pageViewData.length);
        if (sortedDates.length > 0) { renderChart('pageViewsChart', 'line', { labels: sortedDates, datasets: [{ label: 'Page Views', data: pageViewData, borderColor: colors[0], backgroundColor: colors[0].replace('0.7', '0.2'), tension: 0.1, fill: true }] }, { scales: { x: { type: 'time', time: { unit: 'day', tooltipFormat: 'PP' } }, y: { beginAtZero: true, suggestedMax: Math.max(5, ...pageViewData) + 3, ticks: { precision: 0 } } } }); }
        else { handleEmptyChart('pageViewsChart', 'No page view data.'); }

        // 2. Project Interactions
        console.log("[CHARTS] Processing Chart 2: Project Interactions");
        const projectAggData = aggregateData( events, e => e.projectId || e.details?.projectId || e.details?.context || e.details?.trackId, e => e.projectId || e.details?.projectId || e.details?.trackId || e.details?.context || 'Unknown Project', formatLabel, 10 );
        console.log("[CHARTS] Project Interactions - Labels:", projectAggData.labels.length, "Data:", projectAggData.data.length);
        if (projectAggData.labels.length > 0) { renderChart('projectInteractionsChart', 'bar', { labels: projectAggData.labels, datasets: [{ label: 'Interactions', data: projectAggData.data, backgroundColor: colors[1] }] }, { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { ticks: { precision: 0 }}}}); }
        else { handleEmptyChart('projectInteractionsChart', 'No project interaction data.'); }

        // 3. Link Click Destinations
        console.log("[CHARTS] Processing Chart 3: Link Click Destinations");
        const linkDestAggData = aggregateData( events, e => (e.type === 'link_click' || e.type === 'anchor_click') && e.details?.linkType, e => e.details.linkType, formatLabel, 10 );
        console.log("[CHARTS] Link Destinations - Labels:", linkDestAggData.labels.length, "Data:", linkDestAggData.data.length);
         if (linkDestAggData.labels.length > 0) { renderChart('linkTypesChart', 'doughnut', { labels: linkDestAggData.labels, datasets: [{ label: 'Link Types', data: linkDestAggData.data, backgroundColor: colors.slice(2), hoverOffset: 4 }] }, { plugins: { legend: { position: 'bottom' } } }); }
         else { handleEmptyChart('linkTypesChart', 'No link click data.'); }

         // 4. Interaction Click Types
         console.log("[CHARTS] Processing Chart 4: Interaction Click Types");
         const clickTypesAggData = aggregateData( events, e => ['link_click', 'anchor_click', 'button_click', 'project_click', 'generic_click', 'publication_click', 'project_card_area_click', 'tracked_element_click'].includes(e.type), e => e.type, formatLabel, 10 );
         console.log("[CHARTS] Click Types - Labels:", clickTypesAggData.labels.length, "Data:", clickTypesAggData.data.length);
          if (clickTypesAggData.labels.length > 0) { renderChart('clickTypesChart', 'pie', { labels: clickTypesAggData.labels, datasets: [{ label: 'Click Types', data: clickTypesAggData.data, backgroundColor: colors.slice(3), hoverOffset: 4 }] }, { plugins: { legend: { position: 'bottom' } } }); }
          else { handleEmptyChart('clickTypesChart', 'No click type data.'); }

        // 5. Modal Opens
        console.log("[CHARTS] Processing Chart 5: Modal Opens");
        const modalAggData = aggregateData( events, e => e.type === 'modal_open' && (e.details?.modalId || e.modalId || e.modalType), e => e.details?.modalId || e.modalId || e.modalType, formatLabel, 10 );
        console.log("[CHARTS] Modal Opens - Labels:", modalAggData.labels.length, "Data:", modalAggData.data.length);
        if (modalAggData.labels.length > 0) { renderChart('modalOpensChart', 'pie', { labels: modalAggData.labels, datasets: [{ label: 'Modal Opens', data: modalAggData.data, backgroundColor: colors.slice(1).reverse(), hoverOffset: 4 }] }, { plugins: { legend: { position: 'bottom' } } }); }
        else { handleEmptyChart('modalOpensChart', 'No modal open data.'); }

        // 6. Event Types Distribution
        console.log("[CHARTS] Processing Chart 6: Event Types Distribution");
        const eventTypeAggData = aggregateData( events, e => true, event => event.type || 'Unknown Type', formatLabel, 15 );
        console.log("[CHARTS] Event Types - Labels:", eventTypeAggData.labels.length, "Data:", eventTypeAggData.data.length);
         if (eventTypeAggData.labels.length > 0) { renderChart('eventTypesChart', 'bar', { labels: eventTypeAggData.labels, datasets: [{ label: 'Event Count', data: eventTypeAggData.data, backgroundColor: colors[4] }] }, { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { ticks: { precision: 0 }}}}); }
         else { handleEmptyChart('eventTypesChart', 'No event data available.'); }

        // 7. Screen Width Distribution
        console.log("[CHARTS] Processing Chart 7: Screen Width Distribution");
         const screenWidthAggData = aggregateData( events, event => event.screenWidth != null && !isNaN(parseInt(event.screenWidth, 10)) && parseInt(event.screenWidth, 10) > 0, event => { const width = parseInt(event.screenWidth, 10); if (width <= 480) return '<= 480px (Mobile)'; if (width <= 768) return '481-768px (Tablet)'; if (width <= 1024) return '769-1024px (Sm Laptop)'; if (width <= 1440) return '1025-1440px (Desktop)'; return '> 1440px (Lrg Desktop)'; }, null, 8 );
         console.log("[CHARTS] Screen Width - Labels:", screenWidthAggData.labels.length, "Data:", screenWidthAggData.data.length);
         if (screenWidthAggData.labels.length > 0) { renderChart('screenWidthChart', 'doughnut', { labels: screenWidthAggData.labels, datasets: [{ label: 'Screen Widths', data: screenWidthAggData.data, backgroundColor: colors.slice(5), hoverOffset: 4 }] }, { plugins: { legend: { position: 'bottom' } } }); }
         else { handleEmptyChart('screenWidthChart', 'No screen width data.'); }

    } catch (renderChartsError) {
        console.error("%c[CHARTS] Error during renderCharts function execution:", 'color: red;', renderChartsError);
        statusEl.textContent = `Error rendering charts: ${renderChartsError.message}`;
         handleEmptyChart('pageViewsChart', 'Chart Render Error');
         handleEmptyChart('projectInteractionsChart', 'Chart Render Error');
         handleEmptyChart('linkTypesChart', 'Chart Render Error');
         handleEmptyChart('clickTypesChart', 'Chart Render Error');
         handleEmptyChart('modalOpensChart', 'Chart Render Error');
         handleEmptyChart('eventTypesChart', 'Chart Render Error');
         handleEmptyChart('screenWidthChart', 'Chart Render Error');
    } finally {
         console.log("%c[CHARTS] --- Finished renderCharts ---", 'color: teal');
    }
}
// --- *** END renderCharts Definition *** ---


// --- handleEmptyChart ---
function handleEmptyChart(canvasId, message) {
    console.log(`[CHARTS] Handling empty chart: ${canvasId} - "${message}"`);
    const canvas = document.getElementById(canvasId);
    if (!canvas) { console.warn(`[CHARTS] Canvas not found for empty message: ${canvasId}`); return;}
    // Destroy existing chart if it exists
    if (chartInstances[canvasId]) {
        console.log(`[CHARTS] Destroying existing chart instance for ${canvasId}`);
        chartInstances[canvasId].destroy();
        delete chartInstances[canvasId];
    }
    // Draw message on canvas
    const ctx = canvas.getContext('2d');
    if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear previous content
        ctx.save();
        ctx.font = '16px Arial';
        ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--secondary-text').trim() || '#888'; // Use theme color
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(message, canvas.width / 2, canvas.height / 2);
        ctx.restore();
         console.log(`[CHARTS] Displayed empty message on ${canvasId}`);
    } else {
        console.error(`[CHARTS] Failed to get 2D context for ${canvasId}`);
    }
}


// --- renderChart (With Diagnostics) ---
function renderChart(canvasId, type, data, options = {}) {
    console.log(`%c[CHARTS] Attempting to render chart: ${canvasId}`, 'color: teal;');
    const canvas = document.getElementById(canvasId);
    if (!canvas) { console.error(`[CHARTS] Canvas element with ID "${canvasId}" not found.`); return; }
    const ctx = canvas.getContext('2d');
    if (!ctx) { console.error(`[CHARTS] Failed to get 2D context for canvas "${canvasId}".`); return; }

    // Destroy existing chart instance before creating a new one
    if (chartInstances[canvasId]) {
         console.log(`[CHARTS] Destroying previous chart instance for ${canvasId} before re-rendering.`);
         chartInstances[canvasId].destroy();
         delete chartInstances[canvasId]; // Remove reference
    }

    // Base options applying theme defaults
    const isDark = document.body.classList.contains('dark-theme');
    const defaultColor = isDark ? '#e0e0e0' : '#555';
    const defaultBorderColor = isDark ? '#444' : '#e1e4e8';
    const tooltipBgColor = isDark ? 'rgba(44, 44, 44, 0.9)' : 'rgba(255, 255, 255, 0.9)';

    const baseOptions = {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 400 },
        plugins: {
            legend: { labels: { color: defaultColor } },
            title: { display: false, color: defaultColor }, // Assuming h2 handles title
            tooltip: {
                bodyColor: defaultColor,
                titleColor: defaultColor,
                backgroundColor: tooltipBgColor,
                borderColor: defaultBorderColor,
                borderWidth: 1
            }
        },
        scales: { // Apply defaults, specific charts can override
            x: { grid: { color: defaultBorderColor }, ticks: { color: defaultColor } },
            y: { grid: { color: defaultBorderColor }, ticks: { color: defaultColor } },
            r: { // Defaults for radar/polar
                grid: { color: defaultBorderColor },
                angleLines: { color: defaultBorderColor },
                pointLabels: { color: defaultColor },
                ticks: { color: defaultColor, backdropColor: isDark ? '#2c2c2c' : '#ffffff' }
            }
        }
    };

    // Simple deep merge (replace arrays, merge objects) - adjust if needed
    function mergeDeep(target, source) {
        for (const key in source) {
            if (source[key] instanceof Object && key in target && target[key] instanceof Object) {
                if (!(source[key] instanceof Array) && !(target[key] instanceof Array)) {
                    mergeDeep(target[key], source[key]);
                } else {
                    target[key] = source[key]; // Replace arrays/different object types
                }
            } else {
                target[key] = source[key];
            }
        }
        return target;
    }

    const mergedOptions = mergeDeep(JSON.parse(JSON.stringify(baseOptions)), options); // Merge custom options into base

    // console.log(`%c[CHARTS]  - Type: ${type}`, 'color: teal;');
    // const labels = data?.labels ?? 'N/A'; const datasetData = data?.datasets?.[0]?.data ?? 'N/A';
    // console.log(`%c[CHARTS]  - Data Labels Count: ${Array.isArray(labels) ? labels.length : labels}`, 'color: teal;');
    // console.log(`%c[CHARTS]  - First Dataset Points Count: ${Array.isArray(datasetData) ? datasetData.length : datasetData}`, 'color: teal;');
    // try { console.log(`%c[CHARTS]  - Merged Options:`, 'color: teal;', JSON.stringify(mergedOptions, null, 2).substring(0, 500) + "..."); } catch { console.log("[CHARTS]  - Merged Options: (Could not stringify)"); }

    try {
        console.log(`%c[CHARTS] Creating NEW Chart instance for ${canvasId}`, 'color: teal;');
        chartInstances[canvasId] = new Chart(ctx, { type, data, options: mergedOptions });
        console.log(`%c[CHARTS] Chart instance CREATED successfully for ${canvasId}`, 'color: teal;');
    }
    catch (chartError) {
        console.error(`%c[CHARTS] Error creating Chart.js instance for ${canvasId}:`, 'color: red;', chartError);
        statusEl.textContent = `Error rendering chart ${canvasId}`;
        // Display error on canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.save(); ctx.font = '14px Arial'; ctx.fillStyle = 'red'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(`Chart Error: ${chartError.message.substring(0, 100)}`, canvas.width / 2, canvas.height / 2); ctx.restore();
    }
}
// --- END OF FILE dashboard.js (FOR DASHBOARD - VERY DETAILED LOGGING) ---
