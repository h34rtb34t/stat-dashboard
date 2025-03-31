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
// --- Store references to tile layers ---
let lightTileLayer = null;
let darkTileLayer = null;

// --- State ---
let currentRawEvents = []; // Store the last fetched events

// --- Theme Handling (MODIFIED for Map Layer Switching) ---
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
                // Switch to Dark Layer
                if (mapInstance.hasLayer(lightTileLayer)) {
                    mapInstance.removeLayer(lightTileLayer);
                    console.log("Removed light tile layer.");
                }
                if (!mapInstance.hasLayer(darkTileLayer)) {
                    mapInstance.addLayer(darkTileLayer);
                    console.log("Added dark tile layer.");
                }
            } else { // Is Light
                // Switch to Light Layer
                if (mapInstance.hasLayer(darkTileLayer)) {
                    mapInstance.removeLayer(darkTileLayer);
                    console.log("Removed dark tile layer.");
                }
                if (!mapInstance.hasLayer(lightTileLayer)) {
                    mapInstance.addLayer(lightTileLayer);
                    console.log("Added light tile layer.");
                }
            }
        } catch (mapLayerError) {
             console.error("Error switching map tile layers:", mapLayerError);
        }
    } else {
        console.log("Map or tile layers not ready for theme switch yet.");
    }
    // --- End Tile Layer Switching ---
}

function toggleTheme() {
    const currentTheme = document.body.classList.contains('dark-theme') ? 'dark' : 'light';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('dashboardTheme', newTheme);
    applyTheme(newTheme); // Apply the theme changes, including map tiles
}

// --- Scroll to Top Logic --- (Unchanged)
function handleScroll() { /* ... */ }
function goToTop() { /* ... */ }

// --- Map Initialization (MODIFIED) ---
function initializeMap() {
    if (mapInstance) return; // Initialize only once

    try {
        if (typeof L === 'undefined') {
            console.error("Leaflet library (L) not found. Map cannot be initialized.");
            statusEl.textContent = "Error: Map library not loaded.";
            return;
        }
        const mapContainer = document.getElementById('locationMap');
        if (!mapContainer) {
            console.error("Map container element '#locationMap' not found.");
            return;
        }

        mapInstance = L.map('locationMap').setView([20, 0], 2); // Center map

        // --- Define BOTH tile layers ---
        lightTileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 18,
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        });

        // Using CartoDB Dark Matter as the dark theme example
        darkTileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
	        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
	        subdomains: 'abcd', // Required by CartoDB
	        maxZoom: 19 // CartoDB supports higher zoom
        });
        // --- End defining tile layers ---

        // Determine initial theme based on body class (which should be set by initial applyTheme)
        const initialThemeIsDark = document.body.classList.contains('dark-theme');
        if (initialThemeIsDark) {
            darkTileLayer.addTo(mapInstance);
            console.log("Initialized map with dark tile layer.");
        } else {
            lightTileLayer.addTo(mapInstance);
            console.log("Initialized map with light tile layer.");
        }

        // Initialize marker layer group (this holds the blue location markers)
        markerLayerGroup = L.layerGroup().addTo(mapInstance);

        console.log("Map initialized successfully.");

    } catch (error) {
        console.error("Error initializing map:", error);
        statusEl.textContent = "Error initializing map.";
        // Reset state variables on failure
        mapInstance = null;
        lightTileLayer = null;
        darkTileLayer = null;
        markerLayerGroup = null;
    }
}

// --- Map Rendering --- (Unchanged)
function renderLocationMap(events) { /* ... */ }


// Apply saved theme and set up listeners on load (ORDER CHANGED)
document.addEventListener('DOMContentLoaded', () => {
    // --- Initialize map FIRST ---
    // This ensures mapInstance and layer variables are defined before applyTheme tries to use them
    initializeMap();

    // --- Apply initial theme AFTER map structure is ready ---
    const savedTheme = localStorage.getItem('dashboardTheme') || 'light';
    applyTheme(savedTheme); // Styles body, sets chart defaults, AND sets the correct initial map layer

    // Event Listeners
    fetchDataBtn.addEventListener('click', fetchData);
    secretTokenInput.addEventListener('keypress', function (e) { if (e.key === 'Enter') fetchData(); });
    themeToggleBtn.addEventListener('click', toggleTheme);
    window.addEventListener('scroll', handleScroll);
    scrollToTopBtn.addEventListener('click', goToTop);

    // Filter Listeners (Unchanged)
    filterEventTypeSelect.addEventListener('change', applyFiltersAndDisplayEvents);
    filterKeywordInput.addEventListener('input', applyFiltersAndDisplayEvents);
    filterLinkTypeSelect.addEventListener('change', applyFiltersAndDisplayEvents);
    filterModalTypeSelect.addEventListener('change', applyFiltersAndDisplayEvents);
    filterProjectIdInput.addEventListener('input', applyFiltersAndDisplayEvents);

    handleScroll(); // Initial check for scroll position
});


// --- Core Fetch Function (Unchanged) ---
async function fetchData() {
    const secretToken = secretTokenInput.value.trim();
    if (!secretToken) { statusEl.textContent = 'Please enter the Auth Token.'; return; }
    if (!RETRIEVAL_WORKER_URL || RETRIEVAL_WORKER_URL.includes('REPLACE') || RETRIEVAL_WORKER_URL.length < 20) {
         statusEl.textContent = 'ERROR: RETRIEVAL_WORKER_URL seems invalid or not configured in dashboard.js.';
         console.error('ERROR: Invalid RETRIEVAL_WORKER_URL detected:', RETRIEVAL_WORKER_URL); return;
    }

    statusEl.textContent = 'Fetching data...';
    fetchDataBtn.disabled = true;
    rawEventsTbody.innerHTML = '<tr><td colspan="4">Loading...</td></tr>';
    resetSummary();
    destroyCharts(); // Destroys Chart.js instances

    if (markerLayerGroup) { markerLayerGroup.clearLayers(); console.log("Cleared map markers."); }
    else { console.log("Map layer group not ready for clearing (fetch)."); initializeMap(); }

    currentRawEvents = [];
    resetFilters();

    try {
        const response = await fetch(RETRIEVAL_WORKER_URL, {
            method: 'GET', headers: { 'Authorization': `Bearer ${secretToken}` }
        });

        if (response.status === 401) throw new Error('Unauthorized. Check Auth Token.');
        if (response.status === 403) throw new Error('Forbidden. Check Worker CORS configuration.');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const rawEvents = await response.json();
        if (!Array.isArray(rawEvents)) throw new Error('Received invalid data format.');

        statusEl.textContent = `Fetched ${rawEvents.length} recent events. Processing...`;
        currentRawEvents = rawEvents;

        // Process & Display (Order should be fine)
        populateEventTypeFilter(currentRawEvents);
        populateLinkTypeFilter(currentRawEvents);
        populateModalTypeFilter(currentRawEvents);
        renderCharts(currentRawEvents); // Render Chart.js charts first
        applyFiltersAndDisplayEvents(); // Render table
        calculateAndDisplaySummary(currentRawEvents); // Calculate summary
        renderLocationMap(currentRawEvents); // Render map markers

        statusEl.textContent = `Displayed ${currentRawEvents.length} fetched events.`;

    } catch (error) {
        console.error('Error fetching or processing data:', error);
        statusEl.textContent = `Error: ${error.message}`;
        rawEventsTbody.innerHTML = `<tr><td colspan="4" style="color: red;">Error: ${error.message}</td></tr>`;
    } finally {
         fetchDataBtn.disabled = false;
    }
}

// --- Helper Functions --- (Unchanged)
function resetSummary() { /* ... */ }
function destroyCharts() { /* ... */ }

// --- Filter Functions --- (Unchanged)
function resetFilters() { /* ... */ }
function populateEventTypeFilter(events) { /* ... */ }
function populateLinkTypeFilter(events) { /* ... */ }
function populateModalTypeFilter(events) { /* ... */ }
function applyFiltersAndDisplayEvents() { /* ... */ }
function renderTableBody(events) { /* ... */ }

// --- calculateAndDisplaySummary --- (Unchanged)
function calculateAndDisplaySummary(events) { /* ... */ }

// --- aggregateData --- (Unchanged)
function aggregateData(events, filterCondition, keyExtractor, labelExtractor = null, limit = 10) { /* ... */ }

// --- renderCharts --- (Unchanged - Renders Chart.js) ---
function renderCharts(events) {
    console.log("Attempting to render charts..."); // Add log
    const colors = CHART_COLORS_FALLBACK;

    try { // Wrap chart rendering logic in try-catch
        // 1. Page Views Over Time
        const viewsByDate = events.filter(e => e.type === 'pageview' && e.receivedAt).reduce((acc, event) => { try { const date = new Date(event.receivedAt).toISOString().split('T')[0]; acc[date] = (acc[date] || 0) + 1; } catch(e) {} return acc; }, {});
        const sortedDates = Object.keys(viewsByDate).sort();
        const pageViewData = sortedDates.map(date => viewsByDate[date]);
        renderChart('pageViewsChart', 'line', { labels: sortedDates, datasets: [{ label: 'Page Views', data: pageViewData, borderColor: colors[0], backgroundColor: colors[0].replace('0.7', '0.2'), tension: 0.1, fill: true }] }, { scales: { x: { type: 'time', time: { unit: 'day', tooltipFormat: 'PP' } }, y: { beginAtZero: true, suggestedMax: Math.max(0, ...pageViewData) + 3 } } });

        // 2. Project Interactions
        const { labels: projectLabels, data: projectData } = aggregateData( events, e => e.type === 'project_click' || ((e.type === 'modal_open' || e.type === 'image_view') && (e.context || e.projectId)), e => e.projectId || e.context || 'Unknown Project', null, 10 );
        renderChart('projectInteractionsChart', 'bar', { labels: projectLabels, datasets: [{ label: 'Interactions', data: projectData, backgroundColor: colors[1] }] }, { indexAxis: 'y', scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: {} }, plugins: { legend: { display: false } } });

        // 3. Link Click Types
        const { labels: linkLabels, data: linkData } = aggregateData( events, e => e.type === 'link_click', event => event.linkType || 'Unknown', key => key.replace(/_/g, ' ').replace('link', '').trim().toUpperCase(), 10 );
        renderChart('linkTypesChart', 'doughnut', { labels: linkLabels, datasets: [{ label: 'Link Types', data: linkData, backgroundColor: colors.slice(2), hoverOffset: 4 }] }, { plugins: { legend: { position: 'bottom' } } });

        // 4. Modal Opens
        const { labels: modalLabels, data: modalData } = aggregateData( events, e => e.type === 'modal_open', event => event.modalType || event.modalId || 'Unknown', key => key.replace(/_/g, ' ').replace('modal', '').trim().toUpperCase(), 10 );
        renderChart('modalOpensChart', 'pie', { labels: modalLabels, datasets: [{ label: 'Modal Opens', data: modalData, backgroundColor: colors.slice(1).reverse(), hoverOffset: 4 }] }, { plugins: { legend: { position: 'bottom' } } });

        // 5. Event Types Distribution
        const { labels: eventTypeLabels, data: eventTypeData } = aggregateData( events, e => true, event => event.type || 'Unknown Type', key => key.replace(/_/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '), 12 );
        renderChart('eventTypesChart', 'bar', { labels: eventTypeLabels, datasets: [{ label: 'Event Count', data: eventTypeData, backgroundColor: colors[4] }] }, { indexAxis: 'y', scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: {} }, plugins: { legend: { display: false } } });

        // 6. Screen Width Distribution
        const screenWidthCanvas = document.getElementById('screenWidthChart');
        if (screenWidthCanvas) {
            const screenWidthCtx = screenWidthCanvas.getContext('2d');
            screenWidthCtx.clearRect(0, 0, screenWidthCanvas.width, screenWidthCanvas.height);
            const { labels: screenWidthLabels, data: screenWidthData } = aggregateData( events, event => event.screenWidth != null && !isNaN(parseInt(event.screenWidth, 10)) && parseInt(event.screenWidth, 10) > 0, event => { const width = parseInt(event.screenWidth, 10); if (width <= 480) return '<= 480px (Mobile)'; if (width <= 768) return '481-768px (Tablet)'; if (width <= 1024) return '769-1024px (Sm Laptop)'; if (width <= 1440) return '1025-1440px (Desktop)'; return '> 1440px (Lrg Desktop)'; }, null, 8 );
            if (screenWidthLabels.length > 0) {
                renderChart('screenWidthChart', 'doughnut', { labels: screenWidthLabels, datasets: [{ label: 'Screen Widths', data: screenWidthData, backgroundColor: colors.slice(3), hoverOffset: 4 }] }, { plugins: { legend: { position: 'bottom' } } });
            } else {
                screenWidthCtx.font = '16px Arial'; screenWidthCtx.fillStyle = getComputedStyle(document.body).getPropertyValue('--secondary-text').trim() || '#888'; screenWidthCtx.textAlign = 'center'; screenWidthCtx.fillText('No screen width data available.', screenWidthCanvas.width / 2, screenWidthCanvas.height / 2);
            }
        }
        console.log("Finished rendering charts."); // Add log
    } catch (renderChartsError) {
        console.error("Error during renderCharts function:", renderChartsError);
        statusEl.textContent = `Error rendering charts: ${renderChartsError.message}`; // Show error to user
    }
}

// --- renderChart --- (Unchanged - Renders Chart.js) ---
function renderChart(canvasId, type, data, options = {}) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) { console.error(`Canvas element with ID "${canvasId}" not found.`); return; }
    const ctx = canvas.getContext('2d');
    if (!ctx) { console.error(`Failed to get 2D context for canvas "${canvasId}".`); return; }

    const baseOptions = { scales: { x: { grid: { color: Chart.defaults.borderColor }, ticks: { color: Chart.defaults.color } }, y: { grid: { color: Chart.defaults.borderColor }, ticks: { color: Chart.defaults.color } } }, plugins: { legend: { labels: { color: Chart.defaults.color } } } };
    function mergeDeep(target, source) { for (const key in source) { if (source[key] instanceof Object && key in target && target[key] instanceof Object) { mergeDeep(target[key], source[key]); } else { target[key] = source[key]; } } return target; }
    const defaultOptions = { responsive: true, maintainAspectRatio: false };
    const mergedOptions = mergeDeep(mergeDeep({ ...defaultOptions }, baseOptions), options);

    if (chartInstances[canvasId]) { chartInstances[canvasId].destroy(); }

    try {
        chartInstances[canvasId] = new Chart(ctx, { type, data, options: mergedOptions });
    } catch (chartError) {
        console.error(`Error creating Chart.js instance for ${canvasId}:`, chartError);
        ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.font = '16px Arial'; ctx.fillStyle = 'red'; ctx.textAlign = 'center'; ctx.fillText(`Chart Error: ${chartError.message}`, canvas.width / 2, canvas.height / 2);
    }
}
// --- END OF FILE dashboard.js ---
