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
// --- NEW: Store references to tile layers ---
let lightTileLayer = null;
let darkTileLayer = null;

// --- State ---
let currentRawEvents = []; // Store the last fetched events

// --- Theme Handling (MODIFIED) ---
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
            chart.options.scales.x.grid.color = Chart.defaults.borderColor;
            chart.options.scales.x.ticks.color = Chart.defaults.color;
            chart.options.scales.y.grid.color = Chart.defaults.borderColor;
            chart.options.scales.y.ticks.color = Chart.defaults.color;
            if (chart.options.plugins.legend) {
                 chart.options.plugins.legend.labels.color = Chart.defaults.color;
            }
            chart.update();
        }
    });

    // --- NEW: Switch Map Tile Layers ---
    if (mapInstance && lightTileLayer && darkTileLayer) { // Ensure map and layers are initialized
        console.log(`Applying theme: ${theme}. Switching map tiles.`);
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

// --- Scroll to Top Logic ---
function handleScroll() {
    const scrollThreshold = 100;
    if (document.body.scrollTop > scrollThreshold || document.documentElement.scrollTop > scrollThreshold) {
        scrollToTopBtn.classList.add('show');
    } else {
        scrollToTopBtn.classList.remove('show');
    }
}

function goToTop() {
    window.scrollTo({ top: 0 });
}

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

        // Add the default layer based on the CURRENT theme when the page loads
        // This ensures the correct tile layer shows up initially *before* applyTheme might be called again
        const initialTheme = document.body.classList.contains('dark-theme') ? 'dark' : 'light';
        if (initialTheme === 'dark') {
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

// --- Map Rendering --- (Unchanged from previous version)
function renderLocationMap(events) {
    if (!mapInstance || !markerLayerGroup) {
        console.warn("Map not initialized or marker group missing. Cannot render locations.");
        return;
    }

    markerLayerGroup.clearLayers(); // Clear previous markers from the layer

    let locationsAdded = 0;
    events.forEach(event => {
        // Check carefully for valid location data and coordinates
        if (event.location &&
            event.location.latitude != null && event.location.longitude != null &&
            !isNaN(parseFloat(event.location.latitude)) &&
            !isNaN(parseFloat(event.location.longitude)))
        {
            const lat = parseFloat(event.location.latitude);
            const lon = parseFloat(event.location.longitude);

            // Avoid plotting markers at exactly 0,0 unless it's known to be valid data
            if (lat === 0 && lon === 0) {
                console.log("Skipping potential default/invalid coordinates (0,0) for event:", event.type);
                return; // Skip this event's marker
            }

            // Construct popup content (HTML)
            const popupContent = `
                <b>Type:</b> ${event.type || 'N/A'}<br>
                <b>Time:</b> ${event.receivedAt ? new Date(event.receivedAt).toLocaleString() : 'N/A'}<br>
                <b>Location:</b> ${event.location.city || '?'} / ${event.location.region || '?'} / ${event.location.country || '?'}<br>
                <b>Page:</b> ${event.page || 'N/A'}<br>
                <b>IP Info:</b> ${event.location.ip || '?'} (${event.location.asOrganization || '?'})
            `;

            try {
                // Create marker and add it to the specific layer group
                L.marker([lat, lon])
                 .bindPopup(popupContent)
                 .addTo(markerLayerGroup);
                locationsAdded++;
            } catch (markerError) {
                 // Log errors during marker creation (e.g., invalid lat/lon range)
                 console.error(`Error adding marker for event: Lat=${lat}, Lon=${lon}`, markerError, event);
            }
        }
    });

    console.log(`Added ${locationsAdded} markers to the map.`);
    // Optional: Adjust map view to fit markers (can be jarring if locations vary wildly)
    // if (locationsAdded > 0 && markerLayerGroup.getLayers().length > 0) { ... }
}


// Apply saved theme and set up listeners on load
document.addEventListener('DOMContentLoaded', () => {
    // Apply initial theme FIRST
    const savedTheme = localStorage.getItem('dashboardTheme') || 'light';
    applyTheme(savedTheme); // This now also attempts to set the initial map layer

    // Initialize the map AFTER initial theme is set
    initializeMap(); // Defines layers and adds the correct one based on current body class

    // Event Listeners
    fetchDataBtn.addEventListener('click', fetchData);
    secretTokenInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            fetchData();
        }
    });
    themeToggleBtn.addEventListener('click', toggleTheme); // toggleTheme calls applyTheme
    window.addEventListener('scroll', handleScroll);
    scrollToTopBtn.addEventListener('click', goToTop);

    // --- Listeners for table filters (Unchanged) ---
    filterEventTypeSelect.addEventListener('change', applyFiltersAndDisplayEvents);
    filterKeywordInput.addEventListener('input', applyFiltersAndDisplayEvents);
    filterLinkTypeSelect.addEventListener('change', applyFiltersAndDisplayEvents);
    filterModalTypeSelect.addEventListener('change', applyFiltersAndDisplayEvents);
    filterProjectIdInput.addEventListener('input', applyFiltersAndDisplayEvents);

    handleScroll(); // Initial check for scroll position
});


// --- Core Fetch Function (Unchanged from previous correction) ---
async function fetchData() {
    const secretToken = secretTokenInput.value.trim();
    if (!secretToken) {
        statusEl.textContent = 'Please enter the Auth Token.';
        return;
    }
     if (!RETRIEVAL_WORKER_URL || RETRIEVAL_WORKER_URL.includes('REPLACE') || RETRIEVAL_WORKER_URL.length < 20) {
         statusEl.textContent = 'ERROR: RETRIEVAL_WORKER_URL seems invalid or not configured in dashboard.js.';
         console.error('ERROR: Invalid RETRIEVAL_WORKER_URL detected:', RETRIEVAL_WORKER_URL);
         return;
     }

    statusEl.textContent = 'Fetching data...';
    fetchDataBtn.disabled = true;
    rawEventsTbody.innerHTML = '<tr><td colspan="4">Loading...</td></tr>';
    resetSummary();
    destroyCharts();

    if (markerLayerGroup) {
        markerLayerGroup.clearLayers();
        console.log("Cleared map markers.");
    } else {
        console.log("Map layer group not ready for clearing (fetch).");
        initializeMap(); // Attempt init again just in case
    }

    currentRawEvents = [];
    resetFilters();

    try {
        const response = await fetch(RETRIEVAL_WORKER_URL, { // Uses the variable correctly
            method: 'GET',
            headers: { 'Authorization': `Bearer ${secretToken}` }
        });

        if (response.status === 401) throw new Error('Unauthorized. Check Auth Token.');
        if (response.status === 403) throw new Error('Forbidden. Check Worker CORS configuration for dashboard URL.');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const rawEvents = await response.json();
        if (!Array.isArray(rawEvents)) {
            throw new Error('Received invalid data format from worker.');
        }
        statusEl.textContent = `Fetched ${rawEvents.length} recent events. Processing...`;
        currentRawEvents = rawEvents;

        // Process & Display Existing Components
        populateEventTypeFilter(currentRawEvents);
        populateLinkTypeFilter(currentRawEvents);
        populateModalTypeFilter(currentRawEvents);
        renderCharts(currentRawEvents);
        applyFiltersAndDisplayEvents();
        calculateAndDisplaySummary(currentRawEvents);

        // Render the location map
        renderLocationMap(currentRawEvents);

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
function resetSummary() {
    totalViewsEl.textContent = '--';
    uniqueDaysEl.textContent = '--';
}
function destroyCharts() {
    Object.values(chartInstances).forEach(chart => { if (chart) chart.destroy(); });
    chartInstances = {};
}

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

// --- renderCharts --- (Unchanged)
function renderCharts(events) { /* ... */ }

// --- renderChart --- (Unchanged)
function renderChart(canvasId, type, data, options = {}) { /* ... */ }
// --- END OF FILE dashboard.js ---
