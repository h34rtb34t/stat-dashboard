// --- START OF FILE dashboard.js ---

// --- Configuration ---
// PASTE THE URL FOR YOUR *RETRIEVAL* WORKER HERE:
const RETRIEVAL_WORKER_URL = 'https://patient-mode-9cfb.azelbane87.workers.dev/'; // <-- YOUR URL IS HERE

const CHART_COLORS_CSS = [
    'var(--chart-color-1)', 'var(--chart-color-2)', 'var(--chart-color-3)',
    'var(--chart-color-4)', 'var(--chart-color-5)', 'var(--chart-color-6)',
    'var(--chart-color-7)', 'var(--chart-color-8)', 'var(--chart-color-9)'
];
const CHART_COLORS_FALLBACK = [
    'rgba(54, 162, 235, 0.7)', 'rgba(255, 99, 132, 0.7)', 'rgba(75, 192, 192, 0.7)',
    'rgba(255, 205, 86, 0.7)', 'rgba(153, 102, 255, 0.7)', 'rgba(255, 159, 64, 0.7)',
    'rgba(201, 203, 207, 0.7)', 'rgba(100, 100, 255, 0.7)', 'rgba(255, 100, 100, 0.7)'
];


// --- DOM Elements ---
const fetchDataBtn = document.getElementById('fetchDataBtn');
const secretTokenInput = document.getElementById('secretToken');
const statusEl = document.getElementById('status');
const rawEventsTbody = document.querySelector('#rawEventsTable tbody');
const totalViewsEl = document.querySelector('#totalViewsBox .value');
const uniqueDaysEl = document.querySelector('#uniqueDaysBox .value');
const themeToggleBtn = document.getElementById('themeToggleBtn');
const scrollToTopBtn = document.getElementById("scrollToTopBtn");
// Filter Elements
const filterEventTypeSelect = document.getElementById('filterEventType');
const filterKeywordInput = document.getElementById('filterKeyword');
const filterLinkTypeSelect = document.getElementById('filterLinkType');
const filterModalTypeSelect = document.getElementById('filterModalType');
const filterProjectIdInput = document.getElementById('filterProjectId');


// --- Chart Instances ---
let chartInstances = {}; // Store chart instances by canvas ID

// --- Map Instance and Layer ---
let mapInstance = null;
let markerLayerGroup = null;
let lightTileLayer = null;
let darkTileLayer = null;

// --- State ---
let currentRawEvents = []; // Store the last fetched events

// --- Theme Handling (Includes Map Layer Switching) ---
function applyTheme(theme) {
    const isDark = theme === 'dark';
    document.body.classList.toggle('dark-theme', isDark);
    themeToggleBtn.textContent = isDark ? '☀️' : '🌙';
    themeToggleBtn.title = isDark ? 'Switch to Light Theme' : 'Switch to Dark Theme';

    // Set Chart.js global defaults based on theme
    Chart.defaults.color = isDark ? '#e0e0e0' : '#555';
    Chart.defaults.borderColor = isDark ? '#444' : '#e1e4e8';

    // Update existing charts to reflect theme changes
    Object.values(chartInstances).forEach(chart => {
        if (chart) {
            try { // Add try-catch for chart updates
                chart.options.scales.x.grid.color = Chart.defaults.borderColor;
                chart.options.scales.x.ticks.color = Chart.defaults.color;
                chart.options.scales.y.grid.color = Chart.defaults.borderColor;
                chart.options.scales.y.ticks.color = Chart.defaults.color;
                if (chart.options.plugins.legend) {
                     chart.options.plugins.legend.labels.color = Chart.defaults.color;
                }
                chart.update();
            } catch (chartUpdateError) {
                console.error("Error updating chart theme:", chartUpdateError, chart.canvas.id);
            }
        }
    });

    // --- Switch Map Tile Layers ---
    if (mapInstance && lightTileLayer && darkTileLayer) { // Ensure map and layers are initialized
        console.log(`Applying theme: ${theme}. Switching map tiles.`);
        try { // Add try-catch for map layer switching
            if (isDark) {
                if (mapInstance.hasLayer(lightTileLayer)) { mapInstance.removeLayer(lightTileLayer); console.log("Removed light tile layer."); }
                if (!mapInstance.hasLayer(darkTileLayer)) { mapInstance.addLayer(darkTileLayer); console.log("Added dark tile layer."); }
            } else { // Is Light
                if (mapInstance.hasLayer(darkTileLayer)) { mapInstance.removeLayer(darkTileLayer); console.log("Removed dark tile layer."); }
                if (!mapInstance.hasLayer(lightTileLayer)) { mapInstance.addLayer(lightTileLayer); console.log("Added light tile layer."); }
            }
        } catch (mapLayerError) { console.error("Error switching map tile layers:", mapLayerError); }
    } else { console.log("Map or tile layers not ready for theme switch yet."); }
}

function toggleTheme() {
    const currentTheme = document.body.classList.contains('dark-theme') ? 'dark' : 'light';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
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

// --- Map Initialization ---
function initializeMap() {
    if (mapInstance) return;
    try {
        if (typeof L === 'undefined') { console.error("Leaflet library (L) not found."); statusEl.textContent = "Error: Map library not loaded."; return; }
        const mapContainer = document.getElementById('locationMap');
        if (!mapContainer) { console.error("Map container element '#locationMap' not found."); return; }
        mapInstance = L.map('locationMap').setView([20, 0], 2);
        lightTileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors' });
        darkTileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { attribution: '© <a href="https://osm.org/copyright">OSM</a> contributors © <a href="https://carto.com/attributions">CARTO</a>', subdomains: 'abcd', maxZoom: 19 });
        const initialThemeIsDark = document.body.classList.contains('dark-theme'); // Check theme AFTER applyTheme might have run
        if (initialThemeIsDark) { darkTileLayer.addTo(mapInstance); } else { lightTileLayer.addTo(mapInstance); }
        markerLayerGroup = L.layerGroup().addTo(mapInstance);
        console.log("Map initialized successfully.");
    } catch (error) { console.error("Error initializing map:", error); statusEl.textContent = "Error initializing map."; mapInstance = null; lightTileLayer = null; darkTileLayer = null; markerLayerGroup = null; }
}

// --- Map Rendering ---
function renderLocationMap(events) {
    if (!mapInstance || !markerLayerGroup) { console.warn("Map not initialized/ready for rendering."); return; }
    markerLayerGroup.clearLayers();
    let locationsAdded = 0;
    events.forEach(event => {
        if (event.location && event.location.latitude != null && event.location.longitude != null && !isNaN(parseFloat(event.location.latitude)) && !isNaN(parseFloat(event.location.longitude))) {
            const lat = parseFloat(event.location.latitude); const lon = parseFloat(event.location.longitude);
            if (lat === 0 && lon === 0) { console.log("Skipping 0,0 coords for event:", event.type); return; }
            const popupContent = `<b>Type:</b> ${event.type || 'N/A'}<br><b>Time:</b> ${event.receivedAt ? new Date(event.receivedAt).toLocaleString() : 'N/A'}<br><b>Location:</b> ${event.location.city || '?'} / ${event.location.region || '?'} / ${event.location.country || '?'}<br><b>Page:</b> ${event.page || 'N/A'}<br><b>IP Info:</b> ${event.location.ip || '?'} (${event.location.asOrganization || '?'})`;
            try { L.marker([lat, lon]).bindPopup(popupContent).addTo(markerLayerGroup); locationsAdded++; }
            catch (markerError) { console.error(`Error adding marker for event: Lat=${lat}, Lon=${lon}`, markerError, event); }
        }
    });
    console.log(`Added ${locationsAdded} markers to the map.`);
}

// Apply saved theme and set up listeners on load (Includes Debug Logging)
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOMContentLoaded event fired."); // <-- LOG 1

    try { // Wrap initialization and event listener attachment in try...catch
        initializeMap(); // Initialize map FIRST
        console.log("Map initialized (or attempted)."); // <-- LOG 2

        const savedTheme = localStorage.getItem('dashboardTheme') || 'light';
        applyTheme(savedTheme); // Apply initial theme AFTER map structure is ready
        console.log("Initial theme applied."); // <-- LOG 3

        // Event Listeners
        if (fetchDataBtn) {
            fetchDataBtn.addEventListener('click', fetchData); // Ensure listener is attached
            console.log("Fetch Data button event listener ATTACHED."); // <-- LOG 4
        } else {
            console.error("Fetch Data button element NOT FOUND!");
        }

        if (secretTokenInput) {
             secretTokenInput.addEventListener('keypress', function (e) { if (e.key === 'Enter') fetchData(); });
             console.log("Secret token input listener attached.");
        } else { console.error("Secret token input element NOT FOUND!"); }

        if (themeToggleBtn) {
            themeToggleBtn.addEventListener('click', toggleTheme);
            console.log("Theme toggle button listener attached.");
        } else { console.error("Theme toggle button element NOT FOUND!"); }

        window.addEventListener('scroll', handleScroll);
        scrollToTopBtn.addEventListener('click', goToTop);
        filterEventTypeSelect.addEventListener('change', applyFiltersAndDisplayEvents);
        filterKeywordInput.addEventListener('input', applyFiltersAndDisplayEvents);
        filterLinkTypeSelect.addEventListener('change', applyFiltersAndDisplayEvents);
        filterModalTypeSelect.addEventListener('change', applyFiltersAndDisplayEvents);
        filterProjectIdInput.addEventListener('input', applyFiltersAndDisplayEvents);
        console.log("Other event listeners attached."); // <-- LOG 5

        handleScroll(); // Initial check for scroll position

    } catch (domError) {
         console.error("***** ERROR DURING DOMCONTENTLOADED EXECUTION *****", domError);
         // Display error prominently to the user if setup fails
         statusEl.textContent = `CRITICAL ERROR: Dashboard failed to initialize - ${domError.message}`;
         if (fetchDataBtn) fetchDataBtn.disabled = true; // Disable button if init fails
    }

    console.log("DOMContentLoaded handler finished."); // <-- LOG 6
});


// --- Core Fetch Function (Includes Debug Logging) ---
async function fetchData() {
    console.log("%%%%% fetchData function CALLED! %%%%%"); // <-- LOG A

    const secretToken = secretTokenInput.value.trim();
    if (!secretToken) {
        statusEl.textContent = 'Please enter the Auth Token.';
        console.log("fetchData: Exiting - No secret token.");
        return;
    }
    console.log("fetchData: Secret token found.");

    // Simplified URL check
     if (!RETRIEVAL_WORKER_URL || RETRIEVAL_WORKER_URL.includes('REPLACE') || RETRIEVAL_WORKER_URL.length < 20) {
         statusEl.textContent = 'ERROR: RETRIEVAL_WORKER_URL seems invalid or not configured in dashboard.js.';
         console.error('ERROR: Invalid RETRIEVAL_WORKER_URL detected:', RETRIEVAL_WORKER_URL);
         console.log("fetchData: Exiting - Invalid RETRIEVAL_WORKER_URL.");
         return;
     }
     console.log("fetchData: RETRIEVAL_WORKER_URL seems valid:", RETRIEVAL_WORKER_URL);


    statusEl.textContent = 'Fetching data...';
    console.log("fetchData: Disabling button.");
    fetchDataBtn.disabled = true;

    console.log("fetchData: Clearing UI elements.");
    rawEventsTbody.innerHTML = '<tr><td colspan="4">Loading...</td></tr>';
    resetSummary();
    destroyCharts(); // Destroys Chart.js instances

    if (markerLayerGroup) { markerLayerGroup.clearLayers(); console.log("fetchData: Cleared map markers."); }
    else { console.log("fetchData: Map layer group not ready for clearing (fetch)."); initializeMap(); }

    currentRawEvents = [];
    resetFilters();
    console.log("fetchData: UI cleared, preparing to fetch.");

    try {
        console.log(`fetchData: Attempting fetch from ${RETRIEVAL_WORKER_URL}...`);
        const response = await fetch(RETRIEVAL_WORKER_URL, {
            method: 'GET', headers: { 'Authorization': `Bearer ${secretToken}` }
        });
        console.log("fetchData: Fetch call completed. Status:", response.status);

        if (response.status === 401) throw new Error('Unauthorized. Check Auth Token.');
        if (response.status === 403) throw new Error('Forbidden. Check Worker CORS configuration for dashboard URL.');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        console.log("fetchData: Response OK, attempting to parse JSON...");
        const rawEvents = await response.json();
        console.log("fetchData: JSON parsed successfully.");

        if (!Array.isArray(rawEvents)) { throw new Error('Received invalid data format from worker.'); }

        statusEl.textContent = `Fetched ${rawEvents.length} recent events. Processing...`;
        console.log(`fetchData: Fetched ${rawEvents.length} events.`);
        currentRawEvents = rawEvents;

        console.log("fetchData: Populating filters...");
        populateEventTypeFilter(currentRawEvents);
        populateLinkTypeFilter(currentRawEvents);
        populateModalTypeFilter(currentRawEvents);
        console.log("fetchData: Rendering charts...");
        renderCharts(currentRawEvents); // This calls the function with detailed logs inside
        console.log("fetchData: Applying filters and displaying table...");
        applyFiltersAndDisplayEvents();
        console.log("fetchData: Calculating summary...");
        calculateAndDisplaySummary(currentRawEvents);
        console.log("fetchData: Rendering map...");
        renderLocationMap(currentRawEvents);

        statusEl.textContent = `Displayed ${currentRawEvents.length} fetched events.`;
        console.log("fetchData: Processing complete.");

    } catch (error) {
        console.error('fetchData: Error during fetch or processing:', error);
        statusEl.textContent = `Error: ${error.message}`;
        rawEventsTbody.innerHTML = `<tr><td colspan="4" style="color: red;">Error: ${error.message}</td></tr>`;
    } finally {
         console.log("fetchData: Re-enabling button in finally block.");
         fetchDataBtn.disabled = false; // Re-enable button
         console.log("fetchData: Function finished.");
    }
}


// --- Helper Functions ---
function resetSummary() { totalViewsEl.textContent = '--'; uniqueDaysEl.textContent = '--'; }
function destroyCharts() { Object.values(chartInstances).forEach(chart => { if (chart) chart.destroy(); }); chartInstances = {}; }

// --- Filter Functions ---
function resetFilters() { filterEventTypeSelect.innerHTML = '<option value="">All Types</option>'; filterKeywordInput.value = ''; filterLinkTypeSelect.innerHTML = '<option value="">All Link Types</option>'; filterModalTypeSelect.innerHTML = '<option value="">All Modal Types/IDs</option>'; filterProjectIdInput.value = ''; }
function populateEventTypeFilter(events) { const types = new Set(events.map(e => e.type || 'Unknown').filter(t => t)); filterEventTypeSelect.innerHTML = '<option value="">All Types</option>'; types.forEach(type => { const option = document.createElement('option'); option.value = type; option.textContent = type.replace(/_/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '); filterEventTypeSelect.appendChild(option); }); }
function populateLinkTypeFilter(events) { const linkTypes = new Set( events.filter(e => e.linkType).map(e => e.linkType) ); filterLinkTypeSelect.innerHTML = '<option value="">All Link Types</option>'; linkTypes.forEach(type => { if (type) { const option = document.createElement('option'); option.value = type; option.textContent = type.replace(/_/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '); filterLinkTypeSelect.appendChild(option); } }); }
function populateModalTypeFilter(events) { const modalTypes = new Set( events.filter(e => e.type === 'modal_open' && (e.modalType || e.modalId)).flatMap(e => [e.modalType, e.modalId]).filter(Boolean) ); filterModalTypeSelect.innerHTML = '<option value="">All Modal Types/IDs</option>'; modalTypes.forEach(type => { const option = document.createElement('option'); option.value = type; option.textContent = type.replace(/_/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '); filterModalTypeSelect.appendChild(option); }); }
function applyFiltersAndDisplayEvents() { const selectedEventType = filterEventTypeSelect.value; const keyword = filterKeywordInput.value.trim().toLowerCase(); const selectedLinkType = filterLinkTypeSelect.value; const selectedModalType = filterModalTypeSelect.value; const projectIdKeyword = filterProjectIdInput.value.trim().toLowerCase(); const sortedEvents = [...currentRawEvents].sort((a, b) => new Date(b.receivedAt || 0) - new Date(a.receivedAt || 0)); let filteredEvents = sortedEvents; if (selectedEventType) { filteredEvents = filteredEvents.filter(event => (event.type || 'Unknown') === selectedEventType); } if (selectedLinkType) { filteredEvents = filteredEvents.filter(event => event.linkType === selectedLinkType); } if (selectedModalType) { filteredEvents = filteredEvents.filter(event => event.modalType === selectedModalType || event.modalId === selectedModalType); } if (projectIdKeyword) { filteredEvents = filteredEvents.filter(event => (event.projectId && String(event.projectId).toLowerCase().includes(projectIdKeyword)) || (event.context && String(event.context).toLowerCase().includes(projectIdKeyword)) ); } if (keyword) { filteredEvents = filteredEvents.filter(event => { const timestampStr = event.receivedAt ? new Date(event.receivedAt).toLocaleString().toLowerCase() : ''; const typeStr = (event.type || '').toLowerCase(); const pageStr = (event.page || '').toLowerCase(); let detailsStr = ''; try { const details = { ...event }; ['receivedAt', 'timestamp', 'type', 'page', 'screenWidth', 'screenHeight', 'location', 'linkType', 'modalType', 'modalId', 'projectId', 'context'].forEach(k => delete details[k]); if (Object.keys(details).length > 0) { detailsStr = JSON.stringify(details).toLowerCase(); } } catch (e) { /* ignore */ } return timestampStr.includes(keyword) || typeStr.includes(keyword) || pageStr.includes(keyword) || detailsStr.includes(keyword); }); } renderTableBody(filteredEvents); }
function renderTableBody(events) { rawEventsTbody.innerHTML = ''; if (events.length === 0) { rawEventsTbody.innerHTML = '<tr><td colspan="4">No events match the current filters.</td></tr>'; return; } events.forEach(event => { const row = rawEventsTbody.insertRow(); row.insertCell().textContent = event.receivedAt ? new Date(event.receivedAt).toLocaleString() : 'N/A'; row.insertCell().textContent = event.type || 'N/A'; row.insertCell().textContent = event.page || 'N/A'; const detailsCell = row.insertCell(); const details = { ...event }; ['receivedAt', 'timestamp', 'type', 'page', 'screenWidth', 'screenHeight', 'location'].forEach(k => delete details[k]); let locationSummary = ''; if (event.location) { locationSummary = `(Loc: ${event.location.city || '?'}, ${event.location.regionCode || '?'} ${event.location.country || '?'})\n`; } detailsCell.innerHTML = `<pre>${locationSummary}${Object.keys(details).length > 0 ? JSON.stringify(details, null, 2) : '--'}</pre>`; }); }

// --- calculateAndDisplaySummary ---
function calculateAndDisplaySummary(events) { const pageViews = events.filter(e => e.type === 'pageview'); totalViewsEl.textContent = pageViews.length; const uniqueDays = new Set(pageViews.map(e => { try { return new Date(e.receivedAt || e.timestamp).toLocaleDateString(); } catch (err) { return null; } }).filter(d => d !== null)); uniqueDaysEl.textContent = uniqueDays.size; }

// --- aggregateData (Includes safety return) ---
function aggregateData(events, filterCondition, keyExtractor, labelExtractor = null, limit = 10) {
    console.log(`--- aggregateData called for: ${keyExtractor.toString().substring(0, 80)}...`);
    let labels = []; let data = [];
    try {
        const filteredEvents = events.filter(filterCondition); console.log(`  aggregateData: Filtered events count: ${filteredEvents.length}`);
        const extractedKeys = filteredEvents.map(keyExtractor); console.log(`  aggregateData: Extracted keys count (raw): ${extractedKeys.length}`);
        const validKeys = extractedKeys.filter(value => value !== null && value !== undefined && value !== ''); console.log(`  aggregateData: Valid keys count (non-empty): ${validKeys.length}`);
        const aggregation = validKeys.reduce((acc, value) => { const key = String(value).substring(0, 50); acc[key] = (acc[key] || 0) + 1; return acc; }, {}); console.log(`  aggregateData: Aggregation counts object:`, aggregation);
        const sortedEntries = Object.entries(aggregation).sort(([, countA], [, countB]) => countB - countA).slice(0, limit); console.log(`  aggregateData: Sorted/Limited entries:`, sortedEntries);
        labels = sortedEntries.map(([key]) => labelExtractor ? labelExtractor(key) : key);
        data = sortedEntries.map(([, count]) => count);
        console.log(`  aggregateData: Final labels/data counts: ${labels.length}/${data.length}`);
    } catch (error) { console.error(`  !!! Error inside aggregateData !!!`, error); console.error(`  aggregateData error context: filterCondition=${filterCondition.toString()}, keyExtractor=${keyExtractor.toString()}`); return { labels: [], data: [] }; }
    return { labels, data };
}


// --- renderCharts (Chart #3 Logic Updated) ---
function renderCharts(events) {
    console.log("--- Starting renderCharts ---");
    const colors = CHART_COLORS_FALLBACK;

    try {
        // 1. Page Views Over Time
        console.log("Processing Chart 1: Page Views Over Time");
        const viewsByDate = events.filter(e => e.type === 'pageview' && e.receivedAt).reduce((acc, event) => { try { const date = new Date(event.receivedAt).toISOString().split('T')[0]; acc[date] = (acc[date] || 0) + 1; } catch(e) {} return acc; }, {});
        const sortedDates = Object.keys(viewsByDate).sort(); const pageViewData = sortedDates.map(date => viewsByDate[date]);
        console.log("Page View Data:", { labels: sortedDates.length, data: pageViewData.length });
        renderChart('pageViewsChart', 'line', { labels: sortedDates, datasets: [{ label: 'Page Views', data: pageViewData, borderColor: colors[0], backgroundColor: colors[0].replace('0.7', '0.2'), tension: 0.1, fill: true }] }, { scales: { x: { type: 'time', time: { unit: 'day', tooltipFormat: 'PP' } }, y: { beginAtZero: true, suggestedMax: Math.max(0, ...pageViewData) + 3 } } });
        console.log("Finished Chart 1");

        // 2. Project Interactions
        console.log("Processing Chart 2: Project Interactions"); console.log(" -> Calling aggregateData for Project Interactions...");
        const projectAggData = aggregateData( events, e => e.type === 'project_click' || ((e.type === 'modal_open' || e.type === 'image_view') && (e.context || e.projectId)), e => e.projectId || e.context || 'Unknown Project', null, 10 );
        console.log(" <- Returned from aggregateData for Project Interactions:", projectAggData);
        if (projectAggData && Array.isArray(projectAggData.labels) && Array.isArray(projectAggData.data)) { const { labels: projectLabels, data: projectData } = projectAggData; console.log("Aggregated data for Project Interactions:", { labels: projectLabels, data: projectData }); if (projectLabels.length > 0) { renderChart('projectInteractionsChart', 'bar', { labels: projectLabels, datasets: [{ label: 'Interactions', data: projectData, backgroundColor: colors[1] }] }, { indexAxis: 'y', scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: {} }, plugins: { legend: { display: false } } }); console.log("Finished Chart 2"); } else { handleEmptyChart('projectInteractionsChart', 'No interaction data available.'); } } else { console.error("aggregateData for Project Interactions returned invalid data:", projectAggData); handleEmptyChart('projectInteractionsChart', 'Error aggregating data.');}

        // 3. Link Clicks per Project (MODIFIED)
        console.log("Processing Chart 3: Link Clicks per Project"); console.log(" -> Calling aggregateData for Project Link Clicks...");
        const projectLinkAggData = aggregateData( events, e => e.type === 'link_click' && e.context && e.context !== 'undefined' && e.context !== '', event => event.context, key => String(key).replace(/-/g, ' ').toUpperCase(), 10 );
        console.log(" <- Returned from aggregateData for Project Link Clicks:", projectLinkAggData);
        if (projectLinkAggData && Array.isArray(projectLinkAggData.labels) && Array.isArray(projectLinkAggData.data)) { const { labels: projectLinkLabels, data: projectLinkData } = projectLinkAggData; console.log("Aggregated data for Project Link Clicks:", { labels: projectLinkLabels, data: projectLinkData }); if (projectLinkLabels.length > 0) { renderChart('linkTypesChart', 'bar', { labels: projectLinkLabels, datasets: [{ label: 'Link Clicks', data: projectLinkData, backgroundColor: CHART_COLORS_FALLBACK[2], }] }, { indexAxis: 'y', scales: { x: { beginAtZero: true, ticks: { precision: 0 } }, y: {} }, plugins: { legend: { display: false }, tooltip: { displayColors: false } } }); console.log("Finished Chart 3 (Link Clicks per Project)"); } else { handleEmptyChart('linkTypesChart', 'No project-specific link clicks found.'); } } else { console.error("aggregateData for Project Link Clicks returned invalid data:", projectLinkAggData); handleEmptyChart('linkTypesChart', 'Error aggregating project link data.');}

        // 4. Modal Opens
        console.log("Processing Chart 4: Modal Opens"); console.log(" -> Calling aggregateData for Modal Opens...");
        const modalAggData = aggregateData( events, e => e.type === 'modal_open', event => event.modalType || event.modalId || 'Unknown', key => key.replace(/_/g, ' ').replace('modal', '').trim().toUpperCase(), 10 );
        console.log(" <- Returned from aggregateData for Modal Opens:", modalAggData);
        if (modalAggData && Array.isArray(modalAggData.labels) && Array.isArray(modalAggData.data)) { const { labels: modalLabels, data: modalData } = modalAggData; console.log("Aggregated data for Modal Opens:", { labels: modalLabels, data: modalData }); if (modalLabels.length > 0) { renderChart('modalOpensChart', 'pie', { labels: modalLabels, datasets: [{ label: 'Modal Opens', data: modalData, backgroundColor: colors.slice(1).reverse(), hoverOffset: 4 }] }, { plugins: { legend: { position: 'bottom' } } }); console.log("Finished Chart 4"); } else { handleEmptyChart('modalOpensChart', 'No modal open data available.'); } } else { console.error("aggregateData for Modal Opens returned invalid data:", modalAggData); handleEmptyChart('modalOpensChart', 'Error aggregating data.');}

        // 5. Event Types Distribution
        console.log("Processing Chart 5: Event Types Distribution"); console.log(" -> Calling aggregateData for Event Types...");
        const eventTypeAggData = aggregateData( events, e => true, event => event.type || 'Unknown Type', key => key.replace(/_/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '), 12 );
        console.log(" <- Returned from aggregateData for Event Types:", eventTypeAggData);
        if (eventTypeAggData && Array.isArray(eventTypeAggData.labels) && Array.isArray(eventTypeAggData.data)) { const { labels: eventTypeLabels, data: eventTypeData } = eventTypeAggData; console.log("Aggregated data for Event Types:", { labels: eventTypeLabels, data: eventTypeData }); if (eventTypeLabels.length > 0) { renderChart('eventTypesChart', 'bar', { labels: eventTypeLabels, datasets: [{ label: 'Event Count', data: eventTypeData, backgroundColor: colors[4] }] }, { indexAxis: 'y', scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: {} }, plugins: { legend: { display: false } } }); console.log("Finished Chart 5"); } else { handleEmptyChart('eventTypesChart', 'No event data available.'); } } else { console.error("aggregateData for Event Types returned invalid data:", eventTypeAggData); handleEmptyChart('eventTypesChart', 'Error aggregating data.');}

        // 6. Screen Width Distribution
        console.log("Processing Chart 6: Screen Width Distribution");
        const screenWidthCanvas = document.getElementById('screenWidthChart');
        if (screenWidthCanvas) { console.log(" -> Calling aggregateData for Screen Width..."); const screenWidthAggData = aggregateData( events, event => event.screenWidth != null && !isNaN(parseInt(event.screenWidth, 10)) && parseInt(event.screenWidth, 10) > 0, event => { const width = parseInt(event.screenWidth, 10); if (width <= 480) return '<= 480px (Mobile)'; if (width <= 768) return '481-768px (Tablet)'; if (width <= 1024) return '769-1024px (Sm Laptop)'; if (width <= 1440) return '1025-1440px (Desktop)'; return '> 1440px (Lrg Desktop)'; }, null, 8 ); console.log(" <- Returned from aggregateData for Screen Width:", screenWidthAggData); if (screenWidthAggData && Array.isArray(screenWidthAggData.labels) && Array.isArray(screenWidthAggData.data)) { const { labels: screenWidthLabels, data: screenWidthData } = screenWidthAggData; console.log("Aggregated data for Screen Width:", { labels: screenWidthLabels, data: screenWidthData }); if (screenWidthLabels.length > 0) { renderChart('screenWidthChart', 'doughnut', { labels: screenWidthLabels, datasets: [{ label: 'Screen Widths', data: screenWidthData, backgroundColor: colors.slice(3), hoverOffset: 4 }] }, { plugins: { legend: { position: 'bottom' } } }); console.log("Finished Chart 6"); } else { handleEmptyChart('screenWidthChart', 'No screen width data available.'); } } else { console.error("aggregateData for Screen Width returned invalid data:", screenWidthAggData); handleEmptyChart('screenWidthChart', 'Error aggregating data.');} } else { console.error("Canvas element #screenWidthChart not found."); }

    } catch (renderChartsError) {
        console.error("Error during renderCharts function execution:", renderChartsError);
        statusEl.textContent = `Error rendering charts: ${renderChartsError.message}`;
    } finally {
         console.log("--- Finished renderCharts ---");
    }
}

// Helper function to handle empty chart state
function handleEmptyChart(canvasId, message) {
    console.log(`Handling empty chart: ${canvasId} - ${message}`);
    const canvas = document.getElementById(canvasId);
    if (canvas) { if (chartInstances[canvasId]) { chartInstances[canvasId].destroy(); delete chartInstances[canvasId]; } const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.font = '16px Arial'; ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--secondary-text').trim() || '#888'; ctx.textAlign = 'center'; ctx.fillText(message, canvas.width / 2, canvas.height / 2); }
}

// --- renderChart ---
function renderChart(canvasId, type, data, options = {}) {
    const canvas = document.getElementById(canvasId); if (!canvas) { console.error(`Canvas element with ID "${canvasId}" not found.`); return; } const ctx = canvas.getContext('2d'); if (!ctx) { console.error(`Failed to get 2D context for canvas "${canvasId}".`); return; }
    const baseOptions = { scales: { x: { grid: { color: Chart.defaults.borderColor }, ticks: { color: Chart.defaults.color } }, y: { grid: { color: Chart.defaults.borderColor }, ticks: { color: Chart.defaults.color } } }, plugins: { legend: { labels: { color: Chart.defaults.color } } } }; function mergeDeep(target, source) { for (const key in source) { if (source[key] instanceof Object && key in target && target[key] instanceof Object) { mergeDeep(target[key], source[key]); } else { target[key] = source[key]; } } return target; } const defaultOptions = { responsive: true, maintainAspectRatio: false }; const mergedOptions = mergeDeep(mergeDeep({ ...defaultOptions }, baseOptions), options);
    if (chartInstances[canvasId]) { chartInstances[canvasId].destroy(); }
    try { console.log(`Rendering chart: ${canvasId}`); chartInstances[canvasId] = new Chart(ctx, { type, data, options: mergedOptions }); }
    catch (chartError) { console.error(`Error creating Chart.js instance for ${canvasId}:`, chartError); statusEl.textContent = `Error rendering chart ${canvasId}`; ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.font = '16px Arial'; ctx.fillStyle = 'red'; ctx.textAlign = 'center'; ctx.fillText(`Chart Error: ${chartError.message}`, canvas.width / 2, canvas.height / 2); }
}
// --- END OF FILE dashboard.js ---
