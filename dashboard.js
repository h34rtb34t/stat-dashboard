// --- START OF FILE dashboard.js (FOR DASHBOARD) ---

// --- Configuration ---
const RETRIEVAL_WORKER_URL = 'https://patient-mode-9cfb.azelbane87.workers.dev/'; // <-- YOUR DASHBOARD RETRIEVAL URL IS HERE

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
const filterLinkTypeSelect = document.getElementById('filterLinkType'); // << Keep or remove based on HTML
const filterModalTypeSelect = document.getElementById('filterModalType');
const filterProjectIdInput = document.getElementById('filterProjectId');
const filterDetailLinkTypeSelect = document.getElementById('filterDetailLinkType'); // New Filter from dashboard HTML

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
                // Update radial scale (for radar/polar if used later)
                if(chart.options.scales?.r) {
                     chart.options.scales.r.grid.color = Chart.defaults.borderColor;
                     chart.options.scales.r.angleLines.color = Chart.defaults.borderColor;
                     chart.options.scales.r.pointLabels.color = Chart.defaults.color;
                     chart.options.scales.r.ticks.color = Chart.defaults.color;
                     chart.options.scales.r.ticks.backdropColor = isDark ? '#2c2c2c' : '#ffffff'; // Adjust backdrop
                }

                if (chart.options.plugins.legend) {
                     chart.options.plugins.legend.labels.color = Chart.defaults.color;
                }
                 if (chart.options.plugins.title) {
                     chart.options.plugins.title.color = Chart.defaults.color;
                 }
                chart.update('none'); // Use 'none' to prevent animations during theme change
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
        const initialThemeIsDark = document.body.classList.contains('dark-theme');
        if (initialThemeIsDark) { darkTileLayer.addTo(mapInstance); } else { lightTileLayer.addTo(mapInstance); }
        markerLayerGroup = L.layerGroup().addTo(mapInstance);
        console.log("Map initialized successfully.");
    } catch (error) { console.error("Error initializing map:", error); statusEl.textContent = "Error initializing map."; mapInstance = null; lightTileLayer = null; darkTileLayer = null; markerLayerGroup = null; }
}

// --- Map Rendering ---
function renderLocationMap(events) {
    if (!mapInstance || !markerLayerGroup) { console.warn("Map not initialized/ready for rendering."); initializeMap(); return; } // Try initializing if needed
    markerLayerGroup.clearLayers();
    let locationsAdded = 0;
    // Process in reverse to show latest markers on top if overlapping
    [...events].reverse().forEach(event => {
        if (event.location && event.location.latitude != null && event.location.longitude != null && !isNaN(parseFloat(event.location.latitude)) && !isNaN(parseFloat(event.location.longitude))) {
            const lat = parseFloat(event.location.latitude);
            const lon = parseFloat(event.location.longitude);
            if (lat === 0 && lon === 0 && event.location.ip !== '127.0.0.1') { console.log("Skipping potential invalid 0,0 coords for event:", event.type, event.location.ip); return; } // Skip likely default 0,0 unless explicitly localhost

             // Extract more details for popup
             const page = event.page || 'N/A';
             const type = event.type || 'N/A';
             const projectId = event.projectId || event.details?.projectId || event.details?.context || 'N/A';
             const timestamp = event.receivedAt ? new Date(event.receivedAt).toLocaleString() : 'N/A';
             const city = event.location.city || '?';
             const region = event.location.regionCode || event.location.region || '?';
             const country = event.location.country || '?';
             const ipInfo = `${event.location.ip || '?'} (${event.location.asOrganization || '?'})`;

             // Build popup content - more readable format
             const popupContent = `
                <b>Time:</b> ${timestamp}<br>
                <b>Type:</b> ${type}<br>
                <b>Page:</b> ${page.length > 50 ? page.substring(0, 47) + '...' : page}<br> <!-- Shorten long URLs -->
                ${projectId !== 'N/A' ? `<b>Project:</b> ${projectId}<br>` : ''} <!-- Show Project ID if available -->
                <b>Location:</b> ${city}, ${region}, ${country}<br>
                <b>IP Info:</b> ${ipInfo}
             `;

            try { L.marker([lat, lon]).bindPopup(popupContent).addTo(markerLayerGroup); locationsAdded++; }
            catch (markerError) { console.error(`Error adding marker for event: Lat=${lat}, Lon=${lon}`, markerError, event); }
        }
    });
    console.log(`Added ${locationsAdded} markers to the map.`);
     // Optional: Adjust map view to fit markers if desired (can be slow with many markers)
     // if (locationsAdded > 0) {
     //     try {
     //         mapInstance.fitBounds(markerLayerGroup.getBounds().pad(0.1)); // Add some padding
     //     } catch (boundsError) { console.warn("Could not fit map bounds:", boundsError); }
     // } else if (mapInstance) {
     //      mapInstance.setView([20, 0], 2); // Reset view if no markers
     // }
}

// Apply saved theme and set up listeners on load
document.addEventListener('DOMContentLoaded', () => {
    initializeMap(); // Initialize map FIRST
    const savedTheme = localStorage.getItem('dashboardTheme') || 'light';
    applyTheme(savedTheme); // Apply initial theme AFTER map structure is ready

    // Event Listeners
    fetchDataBtn.addEventListener('click', fetchData); // Ensure listener is attached
    secretTokenInput.addEventListener('keypress', function (e) { if (e.key === 'Enter') fetchData(); });
    themeToggleBtn.addEventListener('click', toggleTheme);
    window.addEventListener('scroll', handleScroll);
    scrollToTopBtn.addEventListener('click', goToTop);

    // Filters
    filterEventTypeSelect.addEventListener('change', applyFiltersAndDisplayEvents);
    filterKeywordInput.addEventListener('input', applyFiltersAndDisplayEvents);
    if(filterLinkTypeSelect) filterLinkTypeSelect.addEventListener('change', applyFiltersAndDisplayEvents); // Optional chaining if element might not exist
    filterModalTypeSelect.addEventListener('change', applyFiltersAndDisplayEvents);
    filterProjectIdInput.addEventListener('input', applyFiltersAndDisplayEvents);
    if(filterDetailLinkTypeSelect) filterDetailLinkTypeSelect.addEventListener('change', applyFiltersAndDisplayEvents); // Optional chaining

    handleScroll();
    console.log("DOM Content Loaded, event listeners attached."); // Log listener setup
});

// --- Core Fetch Function (ADDED DETAILED ENTRY/EXIT LOGGING) ---
async function fetchData() {
    console.log("fetchData function CALLED!");

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
         console.log("fetchData: Exiting - Invalid RETRIEVAL_WORKER_URL.");
         return;
     }
     console.log("fetchData: RETRIEVAL_WORKER_URL seems valid:", RETRIEVAL_WORKER_URL);


    statusEl.textContent = 'Fetching data...';
    console.log("fetchData: Disabling button.");
    fetchDataBtn.disabled = true;

    console.log("fetchData: Clearing UI elements (table, summary, charts, map).");
    rawEventsTbody.innerHTML = '<tr><td colspan="4">Loading...</td></tr>';
    resetSummary();
    destroyCharts(); // Destroys Chart.js instances

    if (markerLayerGroup) { markerLayerGroup.clearLayers(); console.log("fetchData: Cleared map markers."); }
    else { console.log("fetchData: Map layer group not ready for clearing (fetch)."); initializeMap(); }

    currentRawEvents = [];
    resetFilters(); // Reset filter dropdowns to default state before populating
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
        currentRawEvents = rawEvents; // Store fetched events

        console.log("fetchData: Populating filters...");
        populateEventTypeFilter(currentRawEvents);
        populateModalTypeFilter(currentRawEvents); // Uses modalId from details
        populateDetailLinkTypeFilter(currentRawEvents); // Uses linkType from details

        console.log("fetchData: Rendering charts...");
        renderCharts(currentRawEvents);

        console.log("fetchData: Applying filters and displaying table...");
        applyFiltersAndDisplayEvents(); // Display initial (unfiltered) table

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
        // Also clear charts and map on error
        destroyCharts();
        if(markerLayerGroup) markerLayerGroup.clearLayers();
        handleEmptyChart('pageViewsChart', 'Error fetching data');
        handleEmptyChart('projectInteractionsChart', 'Error fetching data');
        handleEmptyChart('linkTypesChart', 'Error fetching data');
        handleEmptyChart('clickTypesChart', 'Error fetching data');
        handleEmptyChart('modalOpensChart', 'Error fetching data');
        handleEmptyChart('eventTypesChart', 'Error fetching data');
        handleEmptyChart('screenWidthChart', 'Error fetching data');


    } finally {
         console.log("fetchData: Re-enabling button in finally block.");
         fetchDataBtn.disabled = false; // Re-enable button
         console.log("fetchData: Function finished.");
    }
}


// --- Helper Functions ---
function resetSummary() { totalViewsEl.textContent = '--'; uniqueDaysEl.textContent = '--'; }
function destroyCharts() { Object.values(chartInstances).forEach(chart => { if (chart) chart.destroy(); }); chartInstances = {}; }
function formatLabel(key) {
       if (!key) return 'Unknown';
       // Improved formatting: handle camelCase, snake_case, kebab-case
       return String(key)
            .replace(/([A-Z])/g, ' $1') // Add space before uppercase letters
            .replace(/[_-]/g, ' ') // Replace underscore/hyphen with space
            .replace(/\b\w/g, char => char.toUpperCase()) // Capitalize first letter of each word
            .replace(/ +/g, ' ') // Replace multiple spaces with single
            .trim();
}


// --- Filter Functions ---
function resetFilters() {
    if(filterEventTypeSelect) filterEventTypeSelect.innerHTML = '<option value="">All Types</option>';
    if(filterKeywordInput) filterKeywordInput.value = '';
    if(filterLinkTypeSelect) filterLinkTypeSelect.innerHTML = '<option value="">All Link Types</option>'; // Keep or remove based on HTML
    if(filterModalTypeSelect) filterModalTypeSelect.innerHTML = '<option value="">All Modal IDs</option>';
    if(filterProjectIdInput) filterProjectIdInput.value = '';
    if(filterDetailLinkTypeSelect) filterDetailLinkTypeSelect.innerHTML = '<option value="">All Link Detail Types</option>';
 }

 function populateEventTypeFilter(events) {
    if(!filterEventTypeSelect) return;
    const types = new Set(events.map(e => e.type || 'Unknown').filter(t => t));
    filterEventTypeSelect.innerHTML = '<option value="">All Types</option>';
    [...types].sort().forEach(type => { // Sort alphabetically
        const option = document.createElement('option');
        option.value = type;
        option.textContent = formatLabel(type); // Use formatter
        filterEventTypeSelect.appendChild(option);
    });
}

 function populateModalTypeFilter(events) {
    if(!filterModalTypeSelect) return;
    // Prioritize details.modalId for filtering
    const modalIds = new Set(
        events.filter(e => e.type === 'modal_open' && e.details?.modalId)
              .map(e => e.details.modalId)
              .filter(Boolean) // Remove null/undefined
    );
    // Fallback: include top-level modalId/modalType if details are missing (older data?)
    events.filter(e => e.type === 'modal_open' && !e.details?.modalId && (e.modalId || e.modalType))
          .forEach(e => modalIds.add(e.modalId || e.modalType));

    filterModalTypeSelect.innerHTML = '<option value="">All Modal IDs/Types</option>';
    [...modalIds].sort().forEach(id => {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = formatLabel(id);
        filterModalTypeSelect.appendChild(option);
    });
}

 function populateDetailLinkTypeFilter(events) {
    if(!filterDetailLinkTypeSelect) return;
    const linkDetailTypes = new Set(
        events.filter(e => e.details && (e.details.linkType || e.details.linkTypeDetail)) // Check both potential fields
              .map(e => e.details.linkType || e.details.linkTypeDetail) // Use whichever is present
              .filter(Boolean)
    );
    filterDetailLinkTypeSelect.innerHTML = '<option value="">All Link Detail Types</option>';
    [...linkDetailTypes].sort().forEach(type => {
         const option = document.createElement('option');
         option.value = type;
         option.textContent = formatLabel(type);
         filterDetailLinkTypeSelect.appendChild(option);
    });
}

function applyFiltersAndDisplayEvents() {
    const selectedEventType = filterEventTypeSelect?.value || '';
    const keyword = filterKeywordInput?.value.trim().toLowerCase() || '';
    const selectedModalId = filterModalTypeSelect?.value || '';
    const projectIdKeyword = filterProjectIdInput?.value.trim().toLowerCase() || '';
    const selectedDetailLinkType = filterDetailLinkTypeSelect?.value || '';

    // Start with sorted events (most recent first)
    const sortedEvents = [...currentRawEvents].sort((a, b) => new Date(b.receivedAt || 0) - new Date(a.receivedAt || 0));

    const filteredEvents = sortedEvents.filter(event => {
        // Event Type Filter
        if (selectedEventType && (event.type || 'Unknown') !== selectedEventType) {
            return false;
        }
        // Modal ID/Type Filter (checks details.modalId first, then top-level)
        if (selectedModalId && !(
            (event.type === 'modal_open' && event.details?.modalId === selectedModalId) ||
            (event.type === 'modal_open' && !event.details?.modalId && (event.modalId === selectedModalId || event.modalType === selectedModalId))
           )) {
             return false;
        }
        // Detail Link Type Filter (checks details.linkType or details.linkTypeDetail)
        if (selectedDetailLinkType && !(event.details && (event.details.linkType === selectedDetailLinkType || event.details.linkTypeDetail === selectedDetailLinkType))) {
            return false;
        }
        // Project ID Keyword Filter (checks top-level projectId first, then details)
        const projId = event.projectId || event.details?.projectId || event.details?.context || event.details?.trackId || '';
        if (projectIdKeyword && !String(projId).toLowerCase().includes(projectIdKeyword)) {
            return false;
        }
         // General Keyword Filter (searches timestamp, type, page, location, stringified details)
        if (keyword) {
             const timestampStr = event.receivedAt ? new Date(event.receivedAt).toLocaleString().toLowerCase() : '';
             const typeStr = (event.type || '').toLowerCase();
             const pageStr = (event.page || '').toLowerCase();
             let searchString = `${timestampStr} ${typeStr} ${pageStr}`;
             try {
                 if(event.details && Object.keys(event.details).length > 0) {
                    searchString += ` ${JSON.stringify(event.details).toLowerCase()}`;
                 }
                 if(event.location) {
                    searchString += ` ${event.location.city || ''} ${event.location.regionCode || ''} ${event.location.country || ''} ${event.location.ip || ''} ${event.location.asOrganization || ''}`.toLowerCase();
                 }
             } catch (e) { /* ignore errors */ }

            if (!searchString.includes(keyword)) {
                 return false;
            }
        }

        return true; // Event passes all active filters
    });

    renderTableBody(filteredEvents); // Render table with filtered results
}

 function renderTableBody(events) {
    rawEventsTbody.innerHTML = '';
    if (events.length === 0) {
        rawEventsTbody.innerHTML = '<tr><td colspan="4">No events match the current filters.</td></tr>';
        return;
    }
    events.forEach(event => {
        const row = rawEventsTbody.insertRow();
        row.insertCell().textContent = event.receivedAt ? new Date(event.receivedAt).toLocaleString() : 'N/A';
        row.insertCell().textContent = event.type || 'N/A';
         // Shorten Page URL display visually
         const pageCell = row.insertCell();
         const pageUrl = event.page || 'N/A';
         pageCell.textContent = pageUrl.length > 60 ? pageUrl.substring(0, 57) + '...' : pageUrl;
         pageCell.title = pageUrl; // Show full URL on hover

         const detailsCell = row.insertCell();
         // Create a clean object for display, excluding redundant/large fields already shown
         const detailsToShow = { ...event };
         delete detailsToShow.receivedAt;
         delete detailsToShow.type;
         delete detailsToShow.page;
         // Optionally exclude raw location object if summarized below
         // delete detailsToShow.location;
         // Optionally exclude large screen dims if not needed in details view
         // delete detailsToShow.screenWidth;
         // delete detailsToShow.screenHeight;

         let content = '';

         // Add Location Summary first if available
         if (event.location) {
             content += `Loc: ${event.location.city || '?'} / ${event.location.country || '?'} (IP: ${event.location.ip || '?'})\n`;
             content += `Org: ${event.location.asOrganization || '?'}\n`;
         }
          // Add Screen Size if available
          if(event.screenWidth) {
              content += `Screen: ${event.screenWidth}x${event.screenHeight}\n`;
          }
          // Add Referrer if available
          if(event.referrer) {
              content += `Referrer: ${event.referrer}\n`;
          }
           // Add Project ID if available and not obvious from context
           if(event.projectId) {
               content += `Project: ${event.projectId}\n`;
           }
           content += '----\n'; // Separator

         // Add formatted details (remaining keys)
          const remainingDetails = detailsToShow.details || {};
          // Add any other top-level keys left in detailsToShow
          Object.keys(detailsToShow).forEach(key => {
              if (key !== 'details' && key !== 'location') { // Avoid double-listing details/location
                   remainingDetails[key] = detailsToShow[key];
              }
          });

          if (Object.keys(remainingDetails).length > 0) {
             try {
                  content += JSON.stringify(remainingDetails, null, 2);
             } catch (e) { content += "Error stringifying details"; }
          } else if (content.endsWith('----\n')) { // If only separators added
              content = content.replace('----\n', '-- No Details --');
          } else if (!content.includes('\n')) { // If no location/screen etc.
               content += '-- No Details --';
          }


          // Use <pre> for formatting
          detailsCell.innerHTML = `<pre>${content}</pre>`;
    });
}


// --- calculateAndDisplaySummary ---
function calculateAndDisplaySummary(events) {
     const pageViews = events.filter(e => e.type === 'pageview');
     totalViewsEl.textContent = pageViews.length;

     const uniqueDays = new Set(pageViews.map(e => {
         try {
             // Use receivedAt for server-side accuracy if available, fallback to client timestamp
             const dateStr = e.receivedAt || e.timestamp;
             if (!dateStr) return null;
             return new Date(dateStr).toLocaleDateString();
         } catch (err) {
             console.warn("Error parsing date for unique day calculation:", e, err);
             return null;
         }
     }).filter(d => d !== null));
     uniqueDaysEl.textContent = uniqueDays.size;
}

// --- aggregateData (Includes previous safety return) ---
function aggregateData(events, filterCondition, keyExtractor, labelExtractor = formatLabel, limit = 10) {
    console.log(`--- aggregateData called for filter: ${filterCondition.toString().substring(0,50)} | key: ${keyExtractor.toString().substring(0,50)}`);
    let labels = [];
    let data = [];
    try {
        const filteredEvents = events.filter(filterCondition);
        // console.log(`  aggregateData: Filtered events count: ${filteredEvents.length}`);

        // Extract keys, ensuring the extractor doesn't throw errors
        let extractedKeys = [];
        filteredEvents.forEach(event => {
            try {
                extractedKeys.push(keyExtractor(event));
            } catch (extractError) {
                console.warn("Error in keyExtractor:", extractError, "for event:", event);
                extractedKeys.push(null); // Add null if extractor fails
            }
        });
        // console.log(`  aggregateData: Extracted keys count (raw): ${extractedKeys.length}`);

        // Filter out null/undefined/empty strings AFTER extraction
        const validKeys = extractedKeys.filter(value => value !== null && value !== undefined && String(value).trim() !== '');
        // console.log(`  aggregateData: Valid keys count (non-empty): ${validKeys.length}`);

        // Aggregate counts
        const aggregation = validKeys.reduce((acc, value) => {
             // Limit key length for safety, convert to string
             const key = String(value).substring(0, 100); // Increased limit slightly
             acc[key] = (acc[key] || 0) + 1;
             return acc;
        }, {});
        // console.log(`  aggregateData: Aggregation counts object:`, aggregation);

        // Sort by count (descending) and limit
        const sortedEntries = Object.entries(aggregation).sort(([, countA], [, countB]) => countB - countA).slice(0, limit);
        // console.log(`  aggregateData: Sorted/Limited entries:`, sortedEntries);

        // Generate final labels and data, applying labelExtractor safely
        labels = sortedEntries.map(([key]) => {
            try {
                 return labelExtractor ? labelExtractor(key) : key;
            } catch (labelError) {
                 console.warn("Error in labelExtractor:", labelError, "for key:", key);
                 return key; // Fallback to raw key
            }
        });
        data = sortedEntries.map(([, count]) => count);
        // console.log(`  aggregateData: Final labels/data counts: ${labels.length}/${data.length}`);

    } catch (error) {
        console.error(`  !!! Error inside aggregateData !!!`, error);
        console.error(`  aggregateData error context: filterCondition=${filterCondition.toString()}, keyExtractor=${keyExtractor.toString()}`);
        return { labels: [], data: [] }; // Return empty on error
    }
    return { labels, data };
}


// --- ** HEAVILY REVISED renderCharts Function ** ---
function renderCharts(events) {
    console.log("--- Starting renderCharts (Revised Dashboard) ---");
    const colors = CHART_COLORS_FALLBACK; // Use your color definitions
    // No need to destroy here, handled in fetchData before calling this

    try {
        // 1. Page Views Over Time (Line Chart)
        console.log("Processing Chart 1: Page Views Over Time");
        const viewsByDate = events
            .filter(e => e.type === 'pageview' && (e.receivedAt || e.timestamp)) // Ensure timestamp exists
            .reduce((acc, event) => {
                try {
                    const date = new Date(event.receivedAt || event.timestamp).toISOString().split('T')[0];
                    acc[date] = (acc[date] || 0) + 1;
                } catch(e) { console.warn("Invalid date for pageview event", event); }
                return acc;
             }, {});
        const sortedDates = Object.keys(viewsByDate).sort();
        const pageViewData = sortedDates.map(date => viewsByDate[date]);
        if (sortedDates.length > 0) {
            renderChart('pageViewsChart', 'line', {
                labels: sortedDates,
                datasets: [{ label: 'Page Views', data: pageViewData, borderColor: colors[0], backgroundColor: colors[0].replace('0.7', '0.2'), tension: 0.1, fill: true }]
            }, { scales: { x: { type: 'time', time: { unit: 'day', tooltipFormat: 'PP' } }, y: { beginAtZero: true, suggestedMax: Math.max(5, ...pageViewData) + 3, ticks: { precision: 0 } } } }); // Ensure integer ticks on Y axis
        } else { handleEmptyChart('pageViewsChart', 'No page view data.'); }
        console.log("Finished Chart 1");

        // 2. Project Interactions (Bar Chart)
        console.log("Processing Chart 2: Project Interactions");
        // Aggregate based on top-level projectId or details.projectId/context/trackId
        const projectAggData = aggregateData(
            events,
            e => e.projectId || e.details?.projectId || e.details?.context || e.details?.trackId, // Filter condition
            e => e.projectId || e.details?.projectId || e.details?.trackId || e.details?.context || 'Unknown Project', // Key extractor
            formatLabel, // Use the formatting function
            10 // Limit
        );
        if (projectAggData.labels.length > 0) {
             renderChart('projectInteractionsChart', 'bar', {
                 labels: projectAggData.labels,
                 datasets: [{ label: 'Interactions', data: projectAggData.data, backgroundColor: colors[1] }]
             }, { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { ticks: { precision: 0 }}}});
        } else { handleEmptyChart('projectInteractionsChart', 'No project interaction data.'); }
        console.log("Finished Chart 2");

        // 3. Link Click Destinations (Doughnut)
        console.log("Processing Chart 3: Link Click Destinations");
        // Uses details.linkType (e.g., internal, external, anchor)
        const linkDestAggData = aggregateData(
            events,
            e => (e.type === 'link_click' || e.type === 'anchor_click') && e.details?.linkType,
            e => e.details.linkType, // Key is internal, external, anchor
            formatLabel,
            10
        );
         if (linkDestAggData.labels.length > 0) {
             // Use the linkTypesChart canvas ID from the HTML
             renderChart('linkTypesChart', 'doughnut', {
                 labels: linkDestAggData.labels,
                 datasets: [{ label: 'Link Types', data: linkDestAggData.data, backgroundColor: colors.slice(2), hoverOffset: 4 }]
             }, { plugins: { legend: { position: 'bottom' } } });
        } else { handleEmptyChart('linkTypesChart', 'No link click data.'); }
        console.log("Finished Chart 3");


         // 4. Interaction Click Types (Pie Chart) - NEW CHART
         console.log("Processing Chart 4: Interaction Click Types");
         const clickTypesAggData = aggregateData(
             events,
             // Filter for specific click-related events
             e => ['link_click', 'anchor_click', 'button_click', 'project_click', 'generic_click', 'publication_click', 'project_card_area_click', 'tracked_element_click'].includes(e.type),
             e => e.type, // Key is the event type itself
             formatLabel,
             10
         );
          if (clickTypesAggData.labels.length > 0) {
              // Ensure 'clickTypesChart' ID exists in your dashboard HTML
              renderChart('clickTypesChart', 'pie', {
                  labels: clickTypesAggData.labels,
                  datasets: [{ label: 'Click Types', data: clickTypesAggData.data, backgroundColor: colors.slice(3), hoverOffset: 4 }] // Use different colors
              }, { plugins: { legend: { position: 'bottom' } } });
         } else { handleEmptyChart('clickTypesChart', 'No click type data.'); }
         console.log("Finished Chart 4");


        // 5. Modal Opens (Pie Chart)
        console.log("Processing Chart 5: Modal Opens");
        // Uses details.modalId first, falls back to top-level modalId/modalType
        const modalAggData = aggregateData(
            events,
            e => e.type === 'modal_open' && (e.details?.modalId || e.modalId || e.modalType),
            e => e.details?.modalId || e.modalId || e.modalType, // Extract key
            formatLabel,
            10
        );
        if (modalAggData.labels.length > 0) {
            renderChart('modalOpensChart', 'pie', {
                labels: modalAggData.labels,
                datasets: [{ label: 'Modal Opens', data: modalAggData.data, backgroundColor: colors.slice(1).reverse(), hoverOffset: 4 }] // Adjust colors if needed
            }, { plugins: { legend: { position: 'bottom' } } });
        } else { handleEmptyChart('modalOpensChart', 'No modal open data.'); }
        console.log("Finished Chart 5");


        // 6. Event Types Distribution (Bar Chart)
        console.log("Processing Chart 6: Event Types Distribution");
        const eventTypeAggData = aggregateData(
            events,
            e => true, // All events
            event => event.type || 'Unknown Type',
            formatLabel,
            15 // Show more types
        );
         if (eventTypeAggData.labels.length > 0) {
            renderChart('eventTypesChart', 'bar', {
                labels: eventTypeAggData.labels,
                datasets: [{ label: 'Event Count', data: eventTypeAggData.data, backgroundColor: colors[4] }]
            }, { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { ticks: { precision: 0 }}}});
        } else { handleEmptyChart('eventTypesChart', 'No event data available.'); }
        console.log("Finished Chart 6");

        // 7. Screen Width Distribution (Doughnut)
        console.log("Processing Chart 7: Screen Width Distribution");
         const screenWidthAggData = aggregateData(
             events,
             event => event.screenWidth != null && !isNaN(parseInt(event.screenWidth, 10)) && parseInt(event.screenWidth, 10) > 0,
             event => { // Bucket logic
                    const width = parseInt(event.screenWidth, 10);
                    if (width <= 480) return '<= 480px (Mobile)';
                    if (width <= 768) return '481-768px (Tablet)';
                    if (width <= 1024) return '769-1024px (Sm Laptop)';
                    if (width <= 1440) return '1025-1440px (Desktop)';
                    return '> 1440px (Lrg Desktop)';
             },
             null, // Use bucket names directly as labels
             8
         );
         if (screenWidthAggData.labels.length > 0) {
              renderChart('screenWidthChart', 'doughnut', {
                  labels: screenWidthAggData.labels,
                  datasets: [{ label: 'Screen Widths', data: screenWidthAggData.data, backgroundColor: colors.slice(5), hoverOffset: 4 }] // Adjust colors
              }, { plugins: { legend: { position: 'bottom' } } });
         } else { handleEmptyChart('screenWidthChart', 'No screen width data.'); }
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
         console.log("--- Finished renderCharts (Revised Dashboard) ---");
    }
}

// --- handleEmptyChart ---
function handleEmptyChart(canvasId, message) {
    console.log(`Handling empty chart: ${canvasId} - ${message}`);
    const canvas = document.getElementById(canvasId);
    if (!canvas) { console.warn(`Canvas not found for empty message: ${canvasId}`); return;}
    // Ensure existing chart is destroyed before drawing text
    if (chartInstances[canvasId]) {
         chartInstances[canvasId].destroy();
         delete chartInstances[canvasId];
    }
    const ctx = canvas.getContext('2d');
    if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save(); // Save context state
        ctx.font = '16px Arial';
        ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--secondary-text').trim() || '#888';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle'; // Center text vertically too
        ctx.fillText(message, canvas.width / 2, canvas.height / 2);
        ctx.restore(); // Restore context state
    }
}

// --- renderChart ---
function renderChart(canvasId, type, data, options = {}) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) { console.error(`Canvas element with ID "${canvasId}" not found.`); return; }
    const ctx = canvas.getContext('2d');
    if (!ctx) { console.error(`Failed to get 2D context for canvas "${canvasId}".`); return; }

    // Base options incorporating theme defaults - applied dynamically via Chart.defaults
    const baseOptions = {
         // Scales are dynamically themed using Chart.defaults
         plugins: {
             legend: {
                 labels: {
                    // color: Chart.defaults.color // Handled by Chart.defaults
                 }
             },
              tooltip: { // Add tooltip styling if needed
                 bodyColor: Chart.defaults.color,
                 titleColor: Chart.defaults.color,
                 backgroundColor: document.body.classList.contains('dark-theme') ? 'rgba(44, 44, 44, 0.9)' : 'rgba(255, 255, 255, 0.9)',
                 borderColor: Chart.defaults.borderColor,
                 borderWidth: 1
             }
         }
    };

    // Merge deep function (simple version)
    function mergeDeep(target, source) {
         for (const key in source) {
             if (source[key] instanceof Object && key in target && target[key] instanceof Object) {
                 // Only merge if both are objects, otherwise source overwrites target
                 if (!(source[key] instanceof Array) && !(target[key] instanceof Array)) { // Don't deep merge arrays
                     mergeDeep(target[key], source[key]);
                 } else {
                      target[key] = source[key]; // Overwrite arrays or if types differ
                 }
             } else {
                 target[key] = source[key];
             }
         }
         return target;
    }

    // Default Chart.js options for responsiveness etc.
    const defaultOptions = {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
             duration: 400 // Subtle animation
        }
    };

    // Merge all options: default < base < specific 'options' passed in
    const mergedOptions = mergeDeep(mergeDeep({ ...defaultOptions }, baseOptions), options);

    // Destroy existing chart on this canvas if it exists
    if (chartInstances[canvasId]) {
        chartInstances[canvasId].destroy();
    }

    // Create the new chart
    try {
        console.log(`Rendering chart: ${canvasId}`);
        chartInstances[canvasId] = new Chart(ctx, {
            type,
            data,
            options: mergedOptions
        });
    }
    catch (chartError) {
        console.error(`Error creating Chart.js instance for ${canvasId}:`, chartError);
        statusEl.textContent = `Error rendering chart ${canvasId}`;
        // Display error message on canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.font = '14px Arial';
        ctx.fillStyle = 'red';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`Chart Error: ${chartError.message.substring(0, 100)}`, canvas.width / 2, canvas.height / 2); // Limit message length
        ctx.restore();
    }
}
// --- END OF FILE dashboard.js (FOR DASHBOARD) ---
