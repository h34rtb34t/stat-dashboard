// --- START OF FILE dashboard.js ---

// --- Configuration ---
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

// --- Theme Handling ---
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
                // Update scales if they exist
                if(chart.options.scales?.x) {
                    chart.options.scales.x.grid.color = Chart.defaults.borderColor;
                    chart.options.scales.x.ticks.color = Chart.defaults.color;
                }
                 if(chart.options.scales?.y) {
                    chart.options.scales.y.grid.color = Chart.defaults.borderColor;
                    chart.options.scales.y.ticks.color = Chart.defaults.color;
                }
                 if(chart.options.scales?.r) { // For radar/polar charts if added later
                     chart.options.scales.r.grid.color = Chart.defaults.borderColor;
                     chart.options.scales.r.angleLines.color = Chart.defaults.borderColor;
                     chart.options.scales.r.pointLabels.color = Chart.defaults.color;
                     chart.options.scales.r.ticks.color = Chart.defaults.color;
                     chart.options.scales.r.ticks.backdropColor = isDark ? '#2c2c2c' : '#ffffff'; // Adjust backdrop for ticks
                 }
                // Update legend if it exists
                if (chart.options.plugins?.legend?.labels) {
                     chart.options.plugins.legend.labels.color = Chart.defaults.color;
                }
                 // Update title if it exists
                 if (chart.options.plugins?.title?.text) { // Check if title plugin and text exist
                     chart.options.plugins.title.color = Chart.defaults.color;
                 }
                 // Update tooltips (already handled in renderChart, but good practice)
                 if (chart.options.plugins?.tooltip) {
                     chart.options.plugins.tooltip.bodyColor = Chart.defaults.color;
                     chart.options.plugins.tooltip.titleColor = Chart.defaults.color;
                     chart.options.plugins.tooltip.backgroundColor = isDark ? 'rgba(44, 44, 44, 0.9)' : 'rgba(255, 255, 255, 0.9)';
                     chart.options.plugins.tooltip.borderColor = Chart.defaults.borderColor;
                 }

                chart.update('none'); // Use 'none' to prevent animation during theme change
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
        // Also check for MarkerCluster explicitly if you intend to use it later
        if (typeof L === 'undefined' /* || typeof L.markerClusterGroup === 'undefined' */) {
             console.error("Leaflet library (L) not found."); // Update error if using MarkerCluster
             statusEl.textContent = "Error: Map library not loaded.";
             return;
        }
        const mapContainer = document.getElementById('locationMap');
        if (!mapContainer) { console.error("Map container element '#locationMap' not found."); return; }
        mapInstance = L.map('locationMap').setView([20, 0], 2);
        lightTileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors' });
        darkTileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { attribution: '© <a href="https://osm.org/copyright">OSM</a> contributors © <a href="https://carto.com/attributions">CARTO</a>', subdomains: 'abcd', maxZoom: 19 });
        const initialThemeIsDark = document.body.classList.contains('dark-theme');
        if (initialThemeIsDark) { darkTileLayer.addTo(mapInstance); } else { lightTileLayer.addTo(mapInstance); }
        // Replace LayerGroup with MarkerClusterGroup if needed:
        // markerLayerGroup = L.markerClusterGroup();
        markerLayerGroup = L.layerGroup(); // Keeping LayerGroup for now as per original code
        markerLayerGroup.addTo(mapInstance);
        console.log("Map initialized successfully.");
    } catch (error) { console.error("Error initializing map:", error); statusEl.textContent = "Error initializing map."; mapInstance = null; lightTileLayer = null; darkTileLayer = null; markerLayerGroup = null; }
}

// --- Map Rendering ---
function renderLocationMap(events) {
    if (!mapInstance || !markerLayerGroup) { console.warn("Map or layer group not initialized/ready for rendering."); initializeMap(); return; } // Attempt init if needed
    markerLayerGroup.clearLayers();
    let locationsAdded = 0;
    // Iterate in reverse to show latest markers potentially on top if not clustering
    [...events].reverse().forEach(event => {
        // Check for valid latitude and longitude more robustly
        const lat = parseFloat(event.location?.latitude);
        const lon = parseFloat(event.location?.longitude);
         if (!isNaN(lat) && !isNaN(lon)) {
             // Optionally skip exact 0,0 unless it's explicitly local like 127.0.0.1
            if (lat === 0 && lon === 0 && event.location?.ip !== '127.0.0.1') {
                 console.log("Skipping potential invalid 0,0 coords for event:", event.type, event.location?.ip);
                 return; // Use return to skip this event's marker
             }
             const page = event.page || 'N/A';
             const type = event.type || 'N/A';
             const projectId = event.projectId || event.details?.projectId || event.details?.context || 'N/A'; // Extract project ID better
             const timestamp = event.receivedAt ? new Date(event.receivedAt).toLocaleString() : 'N/A';
             const city = event.location.city || '?';
             const region = event.location.regionCode || event.location.region || '?'; // Prefer region code
             const country = event.location.country || '?';
             const ipInfo = `${event.location.ip || '?'} (${event.location.asOrganization || '?'})`;

             // Build popup content dynamically
             let popupContent = `<b>Time:</b> ${timestamp}<br><b>Type:</b> ${type}<br>`;
             if (page !== 'N/A') popupContent += `<b>Page:</b> ${page.length > 50 ? page.substring(0, 47)+'...' : page}<br>`; // Truncate long pages
             if (projectId !== 'N/A') popupContent += `<b>Project:</b> ${projectId}<br>`;
             popupContent += `<b>Location:</b> ${city}, ${region}, ${country}<br><b>IP Info:</b> ${ipInfo}`;

             try {
                 const marker = L.marker([lat, lon]).bindPopup(popupContent);
                 // If using MarkerCluster: markerLayerGroup.addLayer(marker);
                 marker.addTo(markerLayerGroup); // Add to regular LayerGroup
                 locationsAdded++;
             }
             catch (markerError) { console.error(`Error adding marker for event: Lat=${lat}, Lon=${lon}`, markerError, event); }
        }
    });
    console.log(`Added ${locationsAdded} markers to the map layer group.`);
}

// Apply saved theme and set up listeners on load
document.addEventListener('DOMContentLoaded', () => {
    initializeMap(); // Initialize map FIRST
    const savedTheme = localStorage.getItem('dashboardTheme') || 'light';
    applyTheme(savedTheme); // Apply initial theme AFTER map structure is ready

    // Retrieve potentially saved token
    secretTokenInput.value = localStorage.getItem('dashboardAuthToken') || '';

    // Initial table message
    rawEventsTbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px; color: var(--secondary-text);">Click \'Fetch Data\' to load events.</td></tr>';

    // Event Listeners
    fetchDataBtn.addEventListener('click', fetchData); // Ensure listener is attached
    secretTokenInput.addEventListener('keypress', function (e) { if (e.key === 'Enter') fetchData(); });
    themeToggleBtn.addEventListener('click', toggleTheme);
    window.addEventListener('scroll', handleScroll);
    scrollToTopBtn.addEventListener('click', goToTop);
    filterEventTypeSelect.addEventListener('change', applyFiltersAndDisplayEvents);
    filterKeywordInput.addEventListener('input', applyFiltersAndDisplayEvents); // Consider debouncing this
    filterLinkTypeSelect.addEventListener('change', applyFiltersAndDisplayEvents);
    filterModalTypeSelect.addEventListener('change', applyFiltersAndDisplayEvents);
    filterProjectIdInput.addEventListener('input', applyFiltersAndDisplayEvents); // Consider debouncing this
    handleScroll(); // Initial check for scroll button visibility
    console.log("DOM Content Loaded, event listeners attached."); // Log listener setup
});

// --- Core Fetch Function (ADDED DETAILED ENTRY/EXIT LOGGING) ---
async function fetchData() {
    console.log("fetchData function CALLED!"); // <-- Log entry

    const secretToken = secretTokenInput.value.trim();
    if (!secretToken) {
        statusEl.textContent = 'Please enter the Auth Token.';
        console.log("fetchData: Exiting - No secret token."); // <-- Log exit reason
        return;
    }
    console.log("fetchData: Secret token found.");

    // Store token on successful fetch attempt start
    localStorage.setItem('dashboardAuthToken', secretToken);
    console.log("fetchData: Auth token saved to localStorage.");

    // Simplified URL check
     if (!RETRIEVAL_WORKER_URL || RETRIEVAL_WORKER_URL.includes('REPLACE') || RETRIEVAL_WORKER_URL.length < 20) {
         statusEl.textContent = 'ERROR: RETRIEVAL_WORKER_URL seems invalid or not configured in dashboard.js.';
         console.error('ERROR: Invalid RETRIEVAL_WORKER_URL detected:', RETRIEVAL_WORKER_URL);
         console.log("fetchData: Exiting - Invalid RETRIEVAL_WORKER_URL."); // <-- Log exit reason
         return;
     }
     console.log("fetchData: RETRIEVAL_WORKER_URL seems valid:", RETRIEVAL_WORKER_URL);


    statusEl.textContent = 'Fetching data...';
    console.log("fetchData: Disabling button.");
    fetchDataBtn.disabled = true; // Prevent multiple clicks

    console.log("fetchData: Clearing UI elements (table, summary, charts, map).");
    rawEventsTbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Loading...</td></tr>'; // Add loading state to table
    resetSummary();
    destroyCharts(); // Destroys Chart.js instances

    if (markerLayerGroup) { markerLayerGroup.clearLayers(); console.log("fetchData: Cleared map markers."); }
    else { console.log("fetchData: Map layer group not ready for clearing (fetch)."); initializeMap(); } // Ensure map is init'd if somehow not ready

    currentRawEvents = []; // Clear previous data
    // Don't reset filters here, allow user to keep filters between fetches
    // resetFilters(); // Removed from here
    console.log("fetchData: UI cleared, preparing to fetch.");

    try {
        console.log(`fetchData: Attempting fetch from ${RETRIEVAL_WORKER_URL}...`); // <-- Log before fetch
        const response = await fetch(RETRIEVAL_WORKER_URL, {
            method: 'GET', headers: { 'Authorization': `Bearer ${secretToken}` }
        });
        console.log("fetchData: Fetch call completed. Status:", response.status); // <-- Log after fetch

        // Check for specific HTTP errors first
        if (response.status === 401) throw new Error('Unauthorized. Check Auth Token.');
        if (response.status === 403) throw new Error('Forbidden. Check Worker CORS or Auth.');
        // Generic check for other non-successful statuses
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status} ${response.statusText || ''}`); // Include statusText

        console.log("fetchData: Response OK, attempting to parse JSON...");
        const rawEvents = await response.json();
        console.log("fetchData: JSON parsed successfully.");

        // Validate the structure of the response
        if (!Array.isArray(rawEvents)) {
            console.error("Received non-array data:", rawEvents);
            throw new Error('Received invalid data format from worker (expected an array).');
        }

        statusEl.textContent = `Fetched ${rawEvents.length} recent events. Processing...`;
        console.log(`fetchData: Fetched ${rawEvents.length} events.`);
        currentRawEvents = rawEvents; // Store the new events

        console.log("fetchData: Populating filter options based on new data...");
        // Reset and populate filters based on the *newly fetched* data
        resetFilters(); // Reset filters *before* populating
        populateEventTypeFilter(currentRawEvents);
        populateLinkTypeFilter(currentRawEvents); // Ensure this uses details.linkType
        populateModalTypeFilter(currentRawEvents); // Ensure this uses details.modalId

        console.log("fetchData: Rendering charts...");
        renderCharts(currentRawEvents); // Render charts with the new data
        console.log("fetchData: Applying filters and displaying table...");
        applyFiltersAndDisplayEvents(); // Apply current filter selections to the new data
        console.log("fetchData: Calculating summary...");
        calculateAndDisplaySummary(currentRawEvents); // Calculate summary from new data
        console.log("fetchData: Rendering map...");
        renderLocationMap(currentRawEvents); // Render map with new data

        statusEl.textContent = `Displayed ${currentRawEvents.length} fetched events.`;
        console.log("fetchData: Processing complete.");

    } catch (error) {
        console.error('fetchData: Error during fetch or processing:', error); // <-- Log any error caught
        statusEl.textContent = `Error: ${error.message}`;
        // Provide a more informative error message in the table
        rawEventsTbody.innerHTML = `<tr><td colspan="4" style="color: red; text-align:center;">Error fetching/processing data: ${error.message}</td></tr>`;
        // Optionally clear charts/map on error too
        destroyCharts();
        if(markerLayerGroup) markerLayerGroup.clearLayers();
        // Display error messages on charts explicitly
        handleEmptyChart('pageViewsChart', `Error: ${error.message}`);
        handleEmptyChart('projectInteractionsChart', `Error: ${error.message}`);
        handleEmptyChart('linkTypesChart', `Error: ${error.message}`);
        handleEmptyChart('clickTypesChart', `Error: ${error.message}`);
        handleEmptyChart('modalOpensChart', `Error: ${error.message}`);
        handleEmptyChart('eventTypesChart', `Error: ${error.message}`);
        handleEmptyChart('screenWidthChart', `Error: ${error.message}`);

    } finally {
         console.log("fetchData: Re-enabling button in finally block."); // <-- Log before re-enabling
         fetchDataBtn.disabled = false; // Re-enable button
         console.log("fetchData: Function finished.");
    }
}


// --- Helper Functions ---
function resetSummary() { totalViewsEl.textContent = '--'; uniqueDaysEl.textContent = '--'; }
function destroyCharts() { Object.values(chartInstances).forEach(chart => { if (chart) chart.destroy(); }); chartInstances = {}; }
// Helper to format labels (e.g., snake_case to Title Case)
function formatLabel(key) {
    if (!key) return 'Unknown';
    // Improved formatting: handle camelCase as well
    return String(key)
        .replace(/([A-Z])/g, ' $1') // Add space before uppercase letters
        .replace(/[_-]/g, ' ') // Replace underscores/hyphens with spaces
        .replace(/\b\w/g, char => char.toUpperCase()) // Capitalize first letter of each word
        .replace(/ +/g, ' ') // Collapse multiple spaces
        .trim(); // Remove leading/trailing spaces
}


// --- Filter Functions ---
function resetFilters() {
    filterEventTypeSelect.innerHTML = '<option value="">All Types</option>';
    filterKeywordInput.value = '';
    filterLinkTypeSelect.innerHTML = '<option value="">All Link Dest. Types</option>'; // Updated label
    filterModalTypeSelect.innerHTML = '<option value="">All Modal IDs/Types</option>'; // Updated label
    filterProjectIdInput.value = '';
 }

function populateEventTypeFilter(events) {
    // Add only unique, non-empty types
    const types = new Set(events.map(e => e.type).filter(t => t));
    // Keep previous selection if possible? For now, reset fully.
    filterEventTypeSelect.innerHTML = '<option value="">All Types</option>';
    // Sort alphabetically for consistency
    [...types].sort().forEach(type => {
        const option = document.createElement('option');
        option.value = type;
        option.textContent = formatLabel(type); // Use helper
        filterEventTypeSelect.appendChild(option);
    });
}

function populateLinkTypeFilter(events) {
    // Extract linkType specifically from details of relevant events
    const linkTypes = new Set(
        events
            .filter(e => (e.type === 'link_click' || e.type === 'anchor_click') && e.details?.linkType)
            .map(e => e.details.linkType)
    );
    filterLinkTypeSelect.innerHTML = '<option value="">All Link Dest. Types</option>';
    // Add standard options even if not present in current data? Optional.
    // const standardLinkTypes = ['internal', 'external', 'anchor', 'nohref'];
    // standardLinkTypes.forEach(type => { /* add option */ });
    [...linkTypes].sort().forEach(type => {
        const option = document.createElement('option');
        option.value = type;
        option.textContent = formatLabel(type);
        filterLinkTypeSelect.appendChild(option);
    });
}

function populateModalTypeFilter(events) {
    // Extract modalId specifically from details of modal_open events
    const modalIds = new Set(
        events
            .filter(e => e.type === 'modal_open' && e.details?.modalId)
            .map(e => e.details.modalId)
    );
    filterModalTypeSelect.innerHTML = '<option value="">All Modal IDs/Types</option>';
    [...modalIds].sort().forEach(id => {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = formatLabel(id);
        filterModalTypeSelect.appendChild(option);
    });
}

function applyFiltersAndDisplayEvents() {
    const selectedEventType = filterEventTypeSelect.value;
    const keyword = filterKeywordInput.value.trim().toLowerCase();
    const selectedLinkType = filterLinkTypeSelect.value; // Based on details.linkType
    const selectedModalId = filterModalTypeSelect.value; // Based on details.modalId
    const projectIdKeyword = filterProjectIdInput.value.trim().toLowerCase();

    // Sort events by timestamp descending (most recent first)
    const sortedEvents = [...currentRawEvents].sort((a, b) => {
        const dateA = new Date(a.receivedAt || 0);
        const dateB = new Date(b.receivedAt || 0);
        return dateB - dateA; // Descending order
    });

    let filteredEvents = sortedEvents.filter(event => {
        // Event Type Filter
        if (selectedEventType && (event.type || 'Unknown') !== selectedEventType) return false;

        // Link Destination Type Filter (checks details.linkType)
        if (selectedLinkType && event.details?.linkType !== selectedLinkType) {
            // Special case: if filtering for 'anchor', also include 'anchor_click' type
            // This might be too specific, depends on tracking logic. Removing for now.
            // if (!(selectedLinkType === 'anchor' && event.type === 'anchor_click')) {
            //     return false;
            // }
            return false; // Simpler: filter only on details.linkType if selected
        }

        // Modal ID Filter (checks details.modalId for modal_open events)
        if (selectedModalId && !(event.type === 'modal_open' && event.details?.modalId === selectedModalId)) {
             return false;
        }

        // Project ID Filter (checks top-level projectId first, then details)
         const projId = String(event.projectId || event.details?.projectId || event.details?.context || '').toLowerCase();
         if (projectIdKeyword && !projId.includes(projectIdKeyword)) return false;

        // General Keyword Search
        if (keyword) {
             const timestampStr = event.receivedAt ? new Date(event.receivedAt).toLocaleString().toLowerCase() : '';
             const typeStr = (event.type || '').toLowerCase();
             const pageStr = (event.page || '').toLowerCase();
             // Include location data in search
             const locStr = event.location ? `${event.location.city || ''} ${event.location.regionCode || ''} ${event.location.country || ''} ${event.location.ip || ''} ${event.location.asOrganization || ''}`.toLowerCase() : '';

             // Safely stringify details, excluding known top-level fields already searched
             let detailsStr = '';
             try {
                 const detailsToSearch = { ...event.details };
                 // Optionally remove fields already covered if needed
                 // delete detailsToSearch.linkType; delete detailsToSearch.modalId; etc.
                 if (Object.keys(detailsToSearch).length > 0) {
                     detailsStr = JSON.stringify(detailsToSearch).toLowerCase();
                 }
             } catch (e) { /* ignore stringify errors */ }

             const searchString = `${timestampStr} ${typeStr} ${pageStr} ${locStr} ${detailsStr}`;
             if (!searchString.includes(keyword)) return false;
        }

        return true; // Event passes all filters
    });

    renderTableBody(filteredEvents);
}


function renderTableBody(events) {
    rawEventsTbody.innerHTML = ''; // Clear existing rows
    if (events.length === 0) {
        rawEventsTbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--secondary-text);">No events match the current filters.</td></tr>';
        return;
    }
    events.forEach(event => {
        const row = rawEventsTbody.insertRow();

        row.insertCell().textContent = event.receivedAt ? new Date(event.receivedAt).toLocaleString() : 'N/A';
        row.insertCell().textContent = formatLabel(event.type || 'N/A'); // Format type nicely

        // Add title attribute for full URL on hover
        const pageCell = row.insertCell();
        const pageUrl = event.page || 'N/A';
        pageCell.textContent = pageUrl.length > 60 ? pageUrl.substring(0, 57) + '...' : pageUrl; // Truncate long URLs visually
        pageCell.title = pageUrl; // Show full URL on hover

        const detailsCell = row.insertCell();
        const detailsToShow = { ...event }; // Copy event data

        // Remove top-level fields already displayed in other columns
        delete detailsToShow.receivedAt;
        delete detailsToShow.timestamp; // Often redundant with receivedAt
        delete detailsToShow.type;
        delete detailsToShow.page;

        // Prepare a readable summary string
        let contentSummary = '';
        if (event.location) {
             contentSummary += `Loc: ${event.location.city || '?'} / ${event.location.country || '?'} (IP: ${event.location.ip || '?'})\nOrg: ${event.location.asOrganization || '?'}\n`;
        }
        if(event.screenWidth) {
            contentSummary += `Screen: ${event.screenWidth}x${event.screenHeight}\n`;
        }
        if(event.referrer && event.referrer !== "(direct)") { // Avoid showing empty/direct referrers unless needed
            contentSummary += `Referrer: ${event.referrer.length > 50 ? event.referrer.substring(0, 47)+'...' : event.referrer}\n`;
        }
        if(event.projectId) { // Show top-level projectId if present
             contentSummary += `Project: ${event.projectId}\n`;
             delete detailsToShow.projectId; // Don't repeat in JSON if shown here
        }
        if (contentSummary) contentSummary += '----\n'; // Separator

        // Stringify remaining details (including the nested 'details' object)
        let detailsJson = '-- No Extra Details --';
        // Ensure we don't stringify if detailsToShow is empty after deletions
        const remainingKeys = Object.keys(detailsToShow);
        if (remainingKeys.length > 0) {
             try {
                 // Don't stringify location again if it was summarized
                 if (detailsToShow.location) delete detailsToShow.location;
                 if (detailsToShow.screenWidth) delete detailsToShow.screenWidth;
                 if (detailsToShow.screenHeight) delete detailsToShow.screenHeight;
                 if (detailsToShow.referrer) delete detailsToShow.referrer;

                 if (Object.keys(detailsToShow).length > 0) {
                    detailsJson = JSON.stringify(detailsToShow, null, 2);
                 } else if (!contentSummary) { // Only show 'No Extra Details' if there's no summary either
                    detailsJson = '-- No Details --';
                 } else {
                     detailsJson = ''; // Avoid showing '-- No Extra Details --' if summary exists
                 }

             } catch (e) {
                 detailsJson = "Error stringifying details";
             }
        } else if (!contentSummary) {
             detailsJson = '-- No Details --';
        } else {
            detailsJson = ''; // Avoid showing '-- No Details --' if summary exists
        }

        // Combine summary and JSON in <pre> tag
        detailsCell.innerHTML = `<pre>${contentSummary}${detailsJson}</pre>`;
    });
}


// --- calculateAndDisplaySummary ---
function calculateAndDisplaySummary(events) {
    const pageViews = events.filter(e => e.type === 'pageview');
    totalViewsEl.textContent = pageViews.length;
    // Calculate unique days based on pageviews only
    const uniqueDays = new Set(pageViews.map(e => {
        try {
            const dateStr = e.receivedAt || e.timestamp; // Prefer receivedAt
            if (!dateStr) return null;
            return new Date(dateStr).toLocaleDateString(); // Get YYYY-MM-DD or similar
        } catch (err) { return null; }
    }).filter(d => d !== null)); // Filter out invalid dates
    uniqueDaysEl.textContent = uniqueDays.size;

    // Add Top Country & Top Referrer calculation if elements exist
    const topCountryEl = document.querySelector('#topCountryBox .value');
    const topReferrerEl = document.querySelector('#topReferrerBox .value');

     if (topCountryEl) {
         // Aggregate country counts from location data
         const countries = events
             .filter(e => e.location?.country) // Ensure location and country exist
             .reduce((acc, e) => {
                 const country = e.location.country;
                 acc[country] = (acc[country] || 0) + 1;
                 return acc;
             }, {});
         // Find the country with the highest count
         const sortedCountries = Object.entries(countries).sort(([, countA], [, countB]) => countB - countA);
         topCountryEl.textContent = sortedCountries.length > 0 ? `${sortedCountries[0][0]} (${sortedCountries[0][1]})` : '--';
         topCountryEl.title = sortedCountries.length > 0 ? `${sortedCountries[0][0]}` : ''; // Add title attribute
     }

      if (topReferrerEl) {
          // Aggregate external referrers
          const referrers = events
              .filter(e => e.referrer && !e.referrer.includes(window.location.hostname) && !e.referrer.startsWith('android-app://') && !e.referrer.startsWith('ios-app://') && e.referrer !== '(direct)' && e.referrer.trim() !== '')
              .reduce((acc, e) => {
                   try {
                       const url = new URL(e.referrer);
                       const domain = url.hostname.replace(/^www\./, ''); // Extract domain, remove www.
                       acc[domain] = (acc[domain] || 0) + 1;
                   } catch (err) {
                       // Handle invalid URLs or other referrers
                       acc['(Other/Invalid)'] = (acc['(Other/Invalid)'] || 0) + 1;
                   }
                   return acc;
               }, {});
           const sortedReferrers = Object.entries(referrers).sort(([, countA], [, countB]) => countB - countA);

           if (sortedReferrers.length > 0) {
              const topRef = sortedReferrers[0][0];
              const topRefCount = sortedReferrers[0][1];
              // Truncate long domain names visually
              topReferrerEl.textContent = topRef.length > 20 ? `${topRef.substring(0, 17)}... (${topRefCount})` : `${topRef} (${topRefCount})`;
              topReferrerEl.title = topRef; // Show full referrer on hover
           } else {
              topReferrerEl.textContent = '--';
              topReferrerEl.title = '';
           }
      }
}

// --- aggregateData (Includes previous safety return) ---
function aggregateData(events, filterCondition, keyExtractor, labelExtractor = formatLabel, limit = 10) { // Use formatLabel as default
    console.log(`--- aggregateData called for filter: ${filterCondition.toString().substring(0,50)} | key: ${keyExtractor.toString().substring(0,50)}`);
    let labels = []; let data = [];
    try {
        let filteredEvents = [];
        try { filteredEvents = events.filter(filterCondition); }
        catch (filterError) { console.error("!! Error DURING filterCondition execution:", filterError); return { labels: [], data: [] }; } // Return empty on filter error
         console.log(`  aggregateData: Filtered events count: ${filteredEvents.length}`);

        if (filteredEvents.length === 0) { return { labels: [], data: [] }; } // Early exit if no filtered events

        let extractedKeys = [];
        filteredEvents.forEach((event, index) => {
            try { extractedKeys.push(keyExtractor(event)); }
            catch (extractError) {
                // Log error during extraction but continue if possible
                console.warn(`!! Error DURING keyExtractor execution (event index ${index}):`, extractError, "for event:", JSON.stringify(event).substring(0, 200));
                extractedKeys.push(null); // Add null placeholder to maintain array length if needed, filter later
            }
        });
         console.log(`  aggregateData: Extracted keys count (raw): ${extractedKeys.length}`);

        // Filter out null/undefined/empty keys *after* extraction
        const validKeys = extractedKeys.filter(value => value !== null && value !== undefined && String(value).trim() !== '');
         console.log(`  aggregateData: Valid keys count (non-empty): ${validKeys.length}`);
        if (validKeys.length === 0) { return { labels: [], data: [] }; } // Early exit if no valid keys

        // Aggregate counts
        const aggregation = validKeys.reduce((acc, value) => {
            const key = String(value).substring(0, 100); // Limit key length for safety
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {});
         console.log(`  aggregateData: Aggregation counts object:`, aggregation);

        // Sort by count descending and take top N
        const sortedEntries = Object.entries(aggregation)
            .sort(([, countA], [, countB]) => countB - countA)
            .slice(0, limit);
         console.log(`  aggregateData: Sorted/Limited entries:`, sortedEntries);

        // Extract final labels and data, applying labelExtractor
        labels = sortedEntries.map(([key]) => {
            try { return labelExtractor ? labelExtractor(key) : key; } // Use labelExtractor safely
            catch (labelError) { console.warn("!! Error DURING labelExtractor execution:", labelError, "for key:", key); return key; } // Fallback to raw key on error
        });
        data = sortedEntries.map(([, count]) => count);
         console.log(`  aggregateData: Final labels/data counts: ${labels.length}/${data.length}`);

    } catch (error) {
        // Catch any other unexpected errors during aggregation
        console.error(`!!! UNEXPECTED Error inside aggregateData !!!`, error);
        console.error(`  aggregateData error context: filterCondition=${filterCondition.toString()}, keyExtractor=${keyExtractor.toString()}`);
        return { labels: [], data: [] }; // Return empty on unexpected error
    }
    return { labels, data };
}


// --- renderCharts (Includes UPDATED logic for Link/Click charts) ---
function renderCharts(events) {
    console.log("--- Starting renderCharts ---");
    const colors = CHART_COLORS_FALLBACK; // Use fallback colors directly for now
    try {
        // 1. Page Views Over Time
        console.log("Processing Chart 1: Page Views Over Time");
        const viewsByDate = events
            .filter(e => e.type === 'pageview' && (e.receivedAt || e.timestamp)) // Ensure timestamp exists
            .reduce((acc, event) => {
                try {
                    const date = new Date(event.receivedAt || event.timestamp).toISOString().split('T')[0];
                    acc[date] = (acc[date] || 0) + 1;
                } catch(e) { console.warn("Error parsing date for pageview:", event.receivedAt || event.timestamp, e); } // Log date parsing errors
                return acc;
             }, {});
        const sortedDates = Object.keys(viewsByDate).sort();
        const pageViewData = sortedDates.map(date => viewsByDate[date]);
        console.log("Page View Data:", { labels: sortedDates.length, data: pageViewData.length });
        if (sortedDates.length > 0) {
            renderChart('pageViewsChart', 'line', {
                labels: sortedDates,
                datasets: [{
                    label: 'Page Views', data: pageViewData,
                    borderColor: colors[0], backgroundColor: colors[0].replace('0.7', '0.2'),
                    tension: 0.1, fill: true
                }]
            }, {
                scales: {
                    x: { type: 'time', time: { unit: 'day', tooltipFormat: 'PP' } }, // Use time scale
                    y: { beginAtZero: true, suggestedMax: Math.max(5, ...pageViewData) + 3, ticks: { precision: 0 } } // Ensure integer ticks
                }
            });
        } else {
            handleEmptyChart('pageViewsChart', 'No page view data available.');
        }
        console.log("Finished Chart 1");


        // 2. Project Interactions
        console.log("Processing Chart 2: Project Interactions"); console.log(" -> Calling aggregateData for Project Interactions...");
        // Improved Filter: Include project_click OR events with a projectId/context
        const projectAggData = aggregateData(
            events,
            e => e.type === 'project_click' || !!(e.projectId || e.details?.projectId || e.details?.context), // Simpler filter: does it have a project identifier?
            e => e.projectId || e.details?.projectId || e.details?.context || 'Unknown Project', // Key extractor
            formatLabel, // Use default label formatter
            10 // Limit
        );
        console.log(" <- Returned from aggregateData for Project Interactions:", projectAggData);
        if (projectAggData && Array.isArray(projectAggData.labels) && Array.isArray(projectAggData.data)) {
            const { labels: projectLabels, data: projectData } = projectAggData;
            console.log("Aggregated data for Project Interactions:", { labels: projectLabels.length, data: projectData.length });
            if (projectLabels.length > 0) {
                renderChart('projectInteractionsChart', 'bar', {
                    labels: projectLabels,
                    datasets: [{ label: 'Interactions', data: projectData, backgroundColor: colors[1] }]
                }, {
                    indexAxis: 'y', // Horizontal bar chart
                    scales: { x: { ticks: { precision: 0 } } }, // Ensure integer ticks on X axis
                    plugins: { legend: { display: false } } // Hide legend for bar charts usually
                });
                console.log("Finished Chart 2");
            } else {
                handleEmptyChart('projectInteractionsChart', 'No project interaction data found.');
            }
        } else {
            console.error("aggregateData for Project Interactions returned invalid data:", projectAggData);
            handleEmptyChart('projectInteractionsChart', 'Error aggregating project data.');
        }


        // 3. Link Click Destinations (*** CORRECTED LOGIC ***)
        console.log("Processing Chart 3: Link Click Destinations"); console.log(" -> Calling aggregateData for Link Destinations...");
        const linkDestAggData = aggregateData(
            events,
            e => e.type === 'link_click' || e.type === 'anchor_click', // Filter for link/anchor types
            e => e.details?.linkType || 'Unknown/Missing', // Extract linkType safely, provide default
            formatLabel, // Use default formatter
            10 // Limit
        );
        console.log(" <- Returned from aggregateData for Link Destinations:", linkDestAggData);
        if (linkDestAggData && Array.isArray(linkDestAggData.labels) && Array.isArray(linkDestAggData.data)) {
            const { labels: linkDestLabels, data: linkDestData } = linkDestAggData;
            console.log("Aggregated data for Link Destinations:", { labels: linkDestLabels.length, data: linkDestData.length });
            if (linkDestLabels.length > 0) {
                renderChart('linkTypesChart', 'doughnut', { // Use correct canvas ID: linkTypesChart
                    labels: linkDestLabels,
                    datasets: [{ label: 'Link Destination Types', data: linkDestData, backgroundColor: colors.slice(2), hoverOffset: 4 }]
                }, { plugins: { legend: { position: 'bottom' } } });
                console.log("Finished Chart 3");
            } else {
                handleEmptyChart('linkTypesChart', 'No link/anchor click data with linkType found.');
            }
        } else {
            console.error("aggregateData for Link Destinations returned invalid data:", linkDestAggData);
            handleEmptyChart('linkTypesChart', 'Error aggregating link destination data.');
        }


        // 4. Interaction Click Types (*** ADDED/CORRECTED LOGIC ***)
        console.log("Processing Chart 4: Interaction Click Types"); console.log(" -> Calling aggregateData for Click Types...");
        // *** THIS ARRAY MATCHES YOUR SAMPLE DATA - VERIFY IF OTHERS EXIST ***
        const clickEventTypes = [
            'anchor_click',
            'button_click',
            'project_click',
            'generic_click'
            // Add 'link_click' ONLY if you actually send that type for non-anchor links
        ];
        const clickTypesAggData = aggregateData(
            events,
            e => clickEventTypes.includes(e.type), // Filter using the accurate list
            e => e.type, // Extract the type itself
            formatLabel, // Use default formatter
            10 // Limit
        );
        console.log(" <- Returned from aggregateData for Click Types:", clickTypesAggData);
        if (clickTypesAggData && Array.isArray(clickTypesAggData.labels) && Array.isArray(clickTypesAggData.data)) {
            const { labels: clickLabels, data: clickData } = clickTypesAggData;
            console.log("Aggregated data for Click Types:", { labels: clickLabels.length, data: clickData.length });
            if (clickLabels.length > 0) {
                renderChart('clickTypesChart', 'pie', { // Use correct canvas ID: clickTypesChart
                    labels: clickLabels,
                    datasets: [{ label: 'Click Interaction Types', data: clickData, backgroundColor: colors.slice(3), hoverOffset: 4 }] // Use different color slice
                }, { plugins: { legend: { position: 'bottom' } } });
                console.log("Finished Chart 4");
            } else {
                handleEmptyChart('clickTypesChart', 'No known click type data found.');
            }
        } else {
            console.error("aggregateData for Click Types returned invalid data:", clickTypesAggData);
            handleEmptyChart('clickTypesChart', 'Error aggregating click type data.');
        }


        // 5. Modal Opens (Adjusted numbering)
        console.log("Processing Chart 5: Modal Opens"); console.log(" -> Calling aggregateData for Modal Opens...");
        const modalAggData = aggregateData(
            events,
            e => e.type === 'modal_open', // Filter only by type
            event => event.details?.modalId || 'Unknown/Missing', // Extract modalId safely from details
            formatLabel, // Use default formatter
            10
        );
        console.log(" <- Returned from aggregateData for Modal Opens:", modalAggData);
        if (modalAggData && Array.isArray(modalAggData.labels) && Array.isArray(modalAggData.data)) {
            const { labels: modalLabels, data: modalData } = modalAggData;
            console.log("Aggregated data for Modal Opens:", { labels: modalLabels.length, data: modalData.length });
            if (modalLabels.length > 0) {
                renderChart('modalOpensChart', 'pie', {
                    labels: modalLabels,
                    datasets: [{ label: 'Modal Opens', data: modalData, backgroundColor: colors.slice(1).reverse(), hoverOffset: 4 }]
                }, { plugins: { legend: { position: 'bottom' } } });
                console.log("Finished Chart 5");
            } else {
                handleEmptyChart('modalOpensChart', 'No modal open data available.');
            }
        } else {
            console.error("aggregateData for Modal Opens returned invalid data:", modalAggData);
            handleEmptyChart('modalOpensChart', 'Error aggregating modal data.');
        }


        // 6. Event Types Distribution (Adjusted numbering)
        console.log("Processing Chart 6: Event Types Distribution"); console.log(" -> Calling aggregateData for Event Types...");
        const eventTypeAggData = aggregateData(
            events,
            e => true, // Include all events
            event => event.type || 'Unknown Type', // Key is the type
            formatLabel, // Use default formatter
            15 // Show more types maybe
        );
        console.log(" <- Returned from aggregateData for Event Types:", eventTypeAggData);
        if (eventTypeAggData && Array.isArray(eventTypeAggData.labels) && Array.isArray(eventTypeAggData.data)) {
            const { labels: eventTypeLabels, data: eventTypeData } = eventTypeAggData;
            console.log("Aggregated data for Event Types:", { labels: eventTypeLabels.length, data: eventTypeData.length });
            if (eventTypeLabels.length > 0) {
                renderChart('eventTypesChart', 'bar', {
                    labels: eventTypeLabels,
                    datasets: [{ label: 'Event Count', data: eventTypeData, backgroundColor: colors[4] }]
                }, {
                    indexAxis: 'y',
                    scales: { x: { ticks: { precision: 0 } } },
                    plugins: { legend: { display: false } }
                });
                console.log("Finished Chart 6");
            } else {
                handleEmptyChart('eventTypesChart', 'No event data available.');
            }
        } else {
            console.error("aggregateData for Event Types returned invalid data:", eventTypeAggData);
            handleEmptyChart('eventTypesChart', 'Error aggregating event type data.');
        }


        // 7. Screen Width Distribution (Adjusted numbering)
        console.log("Processing Chart 7: Screen Width Distribution");
        const screenWidthCanvas = document.getElementById('screenWidthChart');
        if (screenWidthCanvas) {
            console.log(" -> Calling aggregateData for Screen Width...");
            const screenWidthAggData = aggregateData(
                events,
                // Ensure screenWidth is a positive number
                event => event.screenWidth != null && !isNaN(parseInt(event.screenWidth, 10)) && parseInt(event.screenWidth, 10) > 0,
                // Categorize width
                event => {
                    const width = parseInt(event.screenWidth, 10);
                    if (width <= 480) return '<= 480px (Mobile)';
                    if (width <= 768) return '481-768px (Tablet)';
                    if (width <= 1024) return '769-1024px (Sm Laptop)';
                    if (width <= 1440) return '1025-1440px (Desktop)';
                    return '> 1440px (Lrg Desktop)';
                },
                null, // Use raw category names as labels
                8 // Limit categories
            );
            console.log(" <- Returned from aggregateData for Screen Width:", screenWidthAggData);
            if (screenWidthAggData && Array.isArray(screenWidthAggData.labels) && Array.isArray(screenWidthAggData.data)) {
                 const { labels: screenWidthLabels, data: screenWidthData } = screenWidthAggData;
                 console.log("Aggregated data for Screen Width:", { labels: screenWidthLabels.length, data: screenWidthData.length });
                 if (screenWidthLabels.length > 0) {
                     renderChart('screenWidthChart', 'doughnut', {
                         labels: screenWidthLabels,
                         datasets: [{ label: 'Screen Widths', data: screenWidthData, backgroundColor: colors.slice(5), hoverOffset: 4 }] // Use different color slice
                     }, { plugins: { legend: { position: 'bottom' } } });
                     console.log("Finished Chart 7");
                 } else {
                     handleEmptyChart('screenWidthChart', 'No valid screen width data found.');
                 }
             } else {
                 console.error("aggregateData for Screen Width returned invalid data:", screenWidthAggData);
                 handleEmptyChart('screenWidthChart', 'Error aggregating screen width data.');
             }
        } else {
            console.error("Canvas element #screenWidthChart not found.");
        }

    } catch (renderChartsError) {
        console.error("Error during renderCharts function execution:", renderChartsError);
        statusEl.textContent = `Error rendering charts: ${renderChartsError.message}`;
        // Optionally display errors on all charts here as well
        handleEmptyChart('pageViewsChart', 'Chart Render Error');
        handleEmptyChart('projectInteractionsChart', 'Chart Render Error');
        handleEmptyChart('linkTypesChart', 'Chart Render Error');
        handleEmptyChart('clickTypesChart', 'Chart Render Error');
        handleEmptyChart('modalOpensChart', 'Chart Render Error');
        handleEmptyChart('eventTypesChart', 'Chart Render Error');
        handleEmptyChart('screenWidthChart', 'Chart Render Error');
    } finally {
         console.log("--- Finished renderCharts ---");
    }
}

// Helper function to handle empty chart state
function handleEmptyChart(canvasId, message) {
    console.log(`Handling empty chart: ${canvasId} - "${message}"`);
    const canvas = document.getElementById(canvasId);
    if (canvas) {
        // Destroy previous instance if it exists
        if (chartInstances[canvasId]) {
             try { chartInstances[canvasId].destroy(); } catch(e) { console.warn(`Minor error destroying chart ${canvasId}: ${e.message}`); }
             delete chartInstances[canvasId];
         }
        // Draw the message
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear previous drawing
            ctx.save(); // Save context state
            ctx.font = '16px "Segoe UI", system-ui, sans-serif'; // Use theme font if possible
            ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--secondary-text').trim() || '#888';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle'; // Center text vertically
            ctx.fillText(message, canvas.width / 2, canvas.height / 2);
            ctx.restore(); // Restore context state
        } else { console.warn(`Could not get 2D context for empty chart message: ${canvasId}`); }
    } else { console.warn(`Canvas not found for empty message: ${canvasId}`); }
}

// --- renderChart ---
function renderChart(canvasId, type, data, options = {}) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) { console.error(`Canvas element with ID "${canvasId}" not found.`); return; }
    const ctx = canvas.getContext('2d');
    if (!ctx) { console.error(`Failed to get 2D context for canvas "${canvasId}".`); return; }

    // Destroy existing chart instance for this canvas ID before creating a new one
    if (chartInstances[canvasId]) {
        try { chartInstances[canvasId].destroy(); } catch(e) { console.warn(`Minor error destroying chart ${canvasId} before re-render: ${e.message}`); }
        delete chartInstances[canvasId]; // Remove reference
    }

    // Define base options including theme-aware tooltips
    const isDark = document.body.classList.contains('dark-theme');
    const baseOptions = {
        scales: { // Default scales structure (can be overridden)
             x: { grid: { color: Chart.defaults.borderColor }, ticks: { color: Chart.defaults.color } },
             y: { grid: { color: Chart.defaults.borderColor }, ticks: { color: Chart.defaults.color } }
        },
        plugins: {
            legend: { labels: { color: Chart.defaults.color } },
            tooltip: { // Configure tooltips
                 bodyColor: Chart.defaults.color,
                 titleColor: Chart.defaults.color,
                 backgroundColor: isDark ? 'rgba(44, 44, 44, 0.9)' : 'rgba(255, 255, 255, 0.9)', // Theme-aware background
                 borderColor: Chart.defaults.borderColor,
                 borderWidth: 1
             }
        }
    };

    // Basic deep merge (handle nested objects like scales, plugins)
    function mergeDeep(target, source) {
        for (const key in source) {
             if (source.hasOwnProperty(key)) {
                 const targetValue = target[key];
                 const sourceValue = source[key];
                 if (sourceValue instanceof Object && !(sourceValue instanceof Array) && targetValue instanceof Object && !(targetValue instanceof Array)) {
                     // Recurse for nested objects
                     mergeDeep(targetValue, sourceValue);
                 } else {
                     // Assign non-object values or overwrite arrays/objects if types differ
                     target[key] = sourceValue;
                 }
             }
         }
         return target;
    }

    // Define default options for all charts
    const defaultOptions = {
        responsive: true,
        maintainAspectRatio: false, // Allow charts to fill container height
        animation: { duration: 400 } // Subtle animation
    };

    // Merge defaults -> base -> specific options provided
    const mergedOptions = mergeDeep(mergeDeep({ ...defaultOptions }, baseOptions), options);

    // Log details before rendering
    console.log(`Rendering chart: ${canvasId}`);
    console.log(`  - Type: ${type}`);
    const labelsInfo = data?.labels ?? 'N/A'; const datasetDataInfo = data?.datasets?.[0]?.data ?? 'N/A';
    console.log(`  - Data Labels Count:`, Array.isArray(labelsInfo) ? labelsInfo.length : labelsInfo);
    console.log(`  - First Dataset Points Count:`, Array.isArray(datasetDataInfo) ? datasetDataInfo.length : datasetDataInfo);
    // Avoid logging potentially huge options object fully, maybe just keys?
    // console.log(`  - Merged Options Keys:`, Object.keys(mergedOptions));

    try {
        chartInstances[canvasId] = new Chart(ctx, { type, data, options: mergedOptions });
        console.log(`  - Chart instance CREATED for ${canvasId}`);
    }
    catch (chartError) {
        console.error(`Error creating Chart.js instance for ${canvasId}:`, chartError);
        statusEl.textContent = `Error rendering chart ${canvasId}`;
        // Display error directly on the canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.font = '14px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = 'red';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`Chart Error: ${chartError.message.substring(0, 100)}...`, canvas.width / 2, canvas.height / 2); // Truncate long error messages
        ctx.restore();
    }
}
// --- END OF FILE dashboard.js ---
