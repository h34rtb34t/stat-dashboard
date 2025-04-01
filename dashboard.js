// --- START OF FILE dashboard.js (FOR DASHBOARD - Updated for Improvements) ---

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

// --- Theme Handling --- (Keep existing - unchanged)
function applyTheme(theme) { /* ... keep existing logic ... */ }
function toggleTheme() { /* ... keep existing logic ... */ }

// --- Scroll to Top Logic --- (Keep existing - unchanged)
function handleScroll() { /* ... keep existing logic ... */ }
function goToTop() { /* ... keep existing logic ... */ }

// --- Map Initialization (Updated for MarkerCluster) ---
function initializeMap() {
    if (mapInstance) return;
    try {
        // Check for Leaflet AND MarkerCluster
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

        // *** Use MarkerClusterGroup ***
        markerLayerGroup = L.markerClusterGroup({
             // Optional MarkerCluster options:
             maxClusterRadius: 60, // Default 80
             // spiderfyOnMaxZoom: true, // Default true
             // showCoverageOnHover: true, // Default true
             // zoomToBoundsOnClick: true // Default true
        });
        markerLayerGroup.addTo(mapInstance); // Add the cluster group to the map
        console.log("Map initialized successfully with MarkerCluster.");

    } catch (error) {
        console.error("Error initializing map:", error);
        statusEl.textContent = "Error initializing map.";
        mapInstance = null; lightTileLayer = null; darkTileLayer = null; markerLayerGroup = null;
    }
}

// --- Map Rendering (Updated for MarkerCluster) ---
function renderLocationMap(events) {
    if (!mapInstance || !markerLayerGroup) { console.warn("Map or marker group not initialized/ready for rendering."); initializeMap(); return; } // Try initializing if needed
    markerLayerGroup.clearLayers(); // Clear layers from the cluster group
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
                // *** Add marker to the ClusterGroup instead of directly to map ***
                markerLayerGroup.addLayer(marker);
                locationsAdded++;
            }
            catch (markerError) { console.error(`Error adding marker for event: Lat=${lat}, Lon=${lon}`, markerError, event); }
        }
    });
    console.log(`Added ${locationsAdded} markers to the cluster group.`);
}

// Apply saved theme and set up listeners on load
document.addEventListener('DOMContentLoaded', () => {
    initializeMap(); // Initialize map FIRST
    const savedTheme = localStorage.getItem('dashboardTheme') || 'light';
    applyTheme(savedTheme); // Apply initial theme AFTER map structure is ready

    // Pre-fill auth token if saved
    secretTokenInput.value = localStorage.getItem('dashboardAuthToken') || '';
    // Set initial table message
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
    filterKeywordInput.addEventListener('input', debouncedFilter); // Debounced
    if(filterLinkTypeSelect) filterLinkTypeSelect.addEventListener('change', applyFiltersAndDisplayEvents);
    filterModalTypeSelect.addEventListener('change', applyFiltersAndDisplayEvents);
    filterProjectIdInput.addEventListener('input', debouncedFilter); // Debounced
    // if(filterDetailLinkTypeSelect) filterDetailLinkTypeSelect.addEventListener('change', applyFiltersAndDisplayEvents);

    // Auto-Refresh Listener
    autoRefreshCheckbox.addEventListener('change', handleAutoRefreshToggle);

    handleScroll(); // Initial check for scroll button
    console.log("DOM Content Loaded, event listeners attached.");
});

// --- Auto-Refresh Handler ---
function handleAutoRefreshToggle() {
    if (autoRefreshCheckbox.checked) {
        if (refreshIntervalId === null) { // Prevent multiple intervals
             // Fetch immediately when checked, then start interval
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

    // Prevent fetch if already fetching (relevant for auto-refresh)
    if (fetchDataBtn.disabled && !autoRefreshCheckbox.checked) { // Allow auto-refresh even if button disabled briefly
        console.log("fetchData: Fetch already in progress, skipping.");
        return;
    }

    const secretToken = secretTokenInput.value.trim();
    if (!secretToken) {
        statusEl.textContent = 'Please enter the Auth Token.';
        console.log("fetchData: Exiting - No secret token.");
        return;
    }
    console.log("fetchData: Secret token found.");

     if (!RETRIEVAL_WORKER_URL || RETRIEVAL_WORKER_URL.includes('REPLACE') || RETRIEVAL_WORKER_URL.length < 20) {
         statusEl.textContent = 'ERROR: RETRIEVAL_WORKER_URL seems invalid or not configured in dashboard.js.';
         console.error('ERROR: Invalid RETRIEVAL_WORKER_URL detected:', RETRIEVAL_WORKER_URL);
         return; // Exit early
     }
     console.log("fetchData: RETRIEVAL_WORKER_URL seems valid:", RETRIEVAL_WORKER_URL);

    // --- Start Loading State ---
    statusEl.textContent = 'Fetching data...';
    loadingSpinner.style.display = 'inline-block'; // Show spinner
    fetchDataBtn.disabled = true;
    console.log("fetchData: Disabling button, showing spinner.");

    console.log("fetchData: Clearing UI elements (table, summary, charts, map).");
    rawEventsTbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Loading...</td></tr>'; // Update table message
    resetSummary();
    destroyCharts();

    // Clear map markers (using cluster group method)
    if (markerLayerGroup) { markerLayerGroup.clearLayers(); console.log("fetchData: Cleared map markers."); }
    else { console.log("fetchData: Map layer group not ready for clearing (fetch)."); initializeMap(); }

    currentRawEvents = [];
    // Don't reset filters here, allow user selection to persist between fetches
    // resetFilters();
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

        statusEl.textContent = 'Processing data...'; // Update status
        console.log("fetchData: Response OK, attempting to parse JSON...");
        const rawEvents = await response.json();
        console.log("fetchData: JSON parsed successfully.");

        if (!Array.isArray(rawEvents)) { throw new Error('Received invalid data format from worker.'); }

        statusEl.textContent = `Fetched ${rawEvents.length} recent events. Processing...`;
        console.log(`fetchData: Fetched ${rawEvents.length} events.`);
        currentRawEvents = rawEvents; // Store fetched events

        // *** Save token on successful fetch ***
        localStorage.setItem('dashboardAuthToken', secretToken);
        console.log("fetchData: Auth token saved to localStorage.");

        statusEl.textContent = 'Populating filters...';
        console.log("fetchData: Populating filters...");
        // Re-populate filters only if needed (e.g., if options could change)
        // If options are stable, maybe only populate on first load? For now, populate each time.
        resetFilters(); // Reset dropdowns before populating
        populateEventTypeFilter(currentRawEvents);
        populateModalTypeFilter(currentRawEvents);
        // populateDetailLinkTypeFilter(currentRawEvents); // Uncomment if using this filter

        statusEl.textContent = 'Rendering charts...';
        console.log("fetchData: Rendering charts...");
        renderCharts(currentRawEvents);

        statusEl.textContent = 'Rendering table...';
        console.log("fetchData: Applying filters and displaying table...");
        applyFiltersAndDisplayEvents(); // Display table with filters applied

        statusEl.textContent = 'Calculating summary...';
        console.log("fetchData: Calculating summary...");
        calculateAndDisplaySummary(currentRawEvents); // Includes new summary boxes

        statusEl.textContent = 'Rendering map...';
        console.log("fetchData: Rendering map...");
        renderLocationMap(currentRawEvents);

        statusEl.textContent = `Displayed ${currentRawEvents.length} fetched events.`; // Final success message
        console.log("fetchData: Processing complete.");

    } catch (error) {
        console.error('fetchData: Error during fetch or processing:', error);
        statusEl.textContent = `Error: ${error.message}`; // Display specific error
        rawEventsTbody.innerHTML = `<tr><td colspan="4" style="color: red; text-align:center;">Error: ${error.message}</td></tr>`;
        // Clear charts and map on error
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
         // Clear new summary boxes on error too
         if(topCountryEl) topCountryEl.textContent = 'Error';
         if(topReferrerEl) topReferrerEl.textContent = 'Error';

    } finally {
         // --- End Loading State ---
         loadingSpinner.style.display = 'none'; // Hide spinner
         fetchDataBtn.disabled = false; // Re-enable button
         // Don't clear status immediately, leave success/error message visible briefly
         // setTimeout(() => { if (statusEl.textContent.startsWith('Displayed') || statusEl.textContent.startsWith('Error')) statusEl.textContent = ''; }, 5000);
         console.log("fetchData: Re-enabling button, hiding spinner in finally block.");
         console.log("fetchData: Function finished.");
    }
}


// --- Helper Functions ---
function resetSummary() {
    totalViewsEl.textContent = '--';
    uniqueDaysEl.textContent = '--';
    if(topCountryEl) topCountryEl.textContent = '--'; // Reset new boxes
    if(topReferrerEl) topReferrerEl.textContent = '--';
}
function destroyCharts() { /* ... keep existing ... */ }
function formatLabel(key) { /* ... keep existing ... */ }


// --- Filter Functions ---
function resetFilters() { /* ... keep existing ... */ }
function populateEventTypeFilter(events) { /* ... keep existing ... */ }
function populateModalTypeFilter(events) { /* ... keep existing ... */ }
// function populateDetailLinkTypeFilter(events) { /* ... keep existing, uncomment if needed ... */ }

// --- Apply Filters (No changes needed for debounce, handled in listener) ---
function applyFiltersAndDisplayEvents() { /* ... keep existing logic ... */ }

// --- Render Table Body (No changes needed) ---
function renderTableBody(events) { /* ... keep existing logic ... */ }


// --- calculateAndDisplaySummary (Updated for New Boxes) ---
function calculateAndDisplaySummary(events) {
    // Total Views & Unique Days (Existing)
     const pageViews = events.filter(e => e.type === 'pageview');
     totalViewsEl.textContent = pageViews.length;
     const uniqueDays = new Set(pageViews.map(e => { /* ... date parsing ... */ }).filter(d => d !== null));
     uniqueDaysEl.textContent = uniqueDays.size;

     // *** START: Calculate Top Country ***
     if (topCountryEl) {
         const countries = events
            .filter(e => e.location?.country) // Filter events with country data
            .reduce((acc, e) => {
                const country = e.location.country;
                acc[country] = (acc[country] || 0) + 1;
                return acc;
            }, {});
         const sortedCountries = Object.entries(countries).sort(([, countA], [, countB]) => countB - countA);
         topCountryEl.textContent = sortedCountries.length > 0 ? `${sortedCountries[0][0]} (${sortedCountries[0][1]})` : '--'; // Show top country and count
     }
     // *** END: Calculate Top Country ***

     // *** START: Calculate Top Referrer ***
      if (topReferrerEl) {
          const referrers = events
             .filter(e => e.referrer && !e.referrer.includes(window.location.hostname) && !e.referrer.startsWith('android-app://') && !e.referrer.startsWith('ios-app://') && e.referrer !== '(direct)') // Filter valid, external referrers
             .reduce((acc, e) => {
                 try {
                     const url = new URL(e.referrer);
                     // Use hostname, remove 'www.' if present for cleaner grouping
                     const domain = url.hostname.replace(/^www\./, '');
                     acc[domain] = (acc[domain] || 0) + 1;
                 } catch (err) {
                      // console.warn("Could not parse referrer URL:", e.referrer);
                      acc['(Invalid/Other)'] = (acc['(Invalid/Other)'] || 0) + 1;
                 }
                 return acc;
             }, {});
          const sortedReferrers = Object.entries(referrers).sort(([, countA], [, countB]) => countB - countA);
          topReferrerEl.textContent = sortedReferrers.length > 0 ? `${sortedReferrers[0][0]} (${sortedReferrers[0][1]})` : '--';
          // Add title attribute for full domain if truncated
          if (sortedReferrers.length > 0 && sortedReferrers[0][0].length > 20) {
             topReferrerEl.title = sortedReferrers[0][0];
             topReferrerEl.textContent = `${sortedReferrers[0][0].substring(0, 17)}... (${sortedReferrers[0][1]})`;
          } else if (sortedReferrers.length > 0) {
               topReferrerEl.title = sortedReferrers[0][0];
          }
      }
     // *** END: Calculate Top Referrer ***
}

// --- aggregateData --- (Keep existing - unchanged)
function aggregateData(events, filterCondition, keyExtractor, labelExtractor = formatLabel, limit = 10) { /* ... keep existing ... */ }

// --- renderCharts --- (Keep existing - unchanged)
function renderCharts(events) { /* ... keep existing logic ... */ }

// --- handleEmptyChart --- (Keep existing - unchanged)
function handleEmptyChart(canvasId, message) { /* ... keep existing ... */ }

// --- renderChart --- (Keep existing - unchanged)
function renderChart(canvasId, type, data, options = {}) { /* ... keep existing ... */ }

// --- END OF FILE dashboard.js (FOR DASHBOARD - Updated for Improvements) ---
