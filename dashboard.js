// --- START OF FILE dashboard.js ---

// --- Configuration ---
// PASTE THE URL FOR YOUR *RETRIEVAL* WORKER HERE:
const RETRIEVAL_WORKER_URL = 'https://patient-mode-9cfb.azelbane87.workers.dev'; // <-- REPLACE WITH YOUR ACTUAL URL

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

// --- Map Instance and Layer --- <--- NEW
let mapInstance = null;
let markerLayerGroup = null;

// --- State ---
let currentRawEvents = []; // Store the last fetched events

// --- Theme Handling ---
function applyTheme(theme) {
    const isDark = theme === 'dark';
    document.body.classList.toggle('dark-theme', isDark);
    themeToggleBtn.textContent = isDark ? '☀️' : '🌙';
    themeToggleBtn.title = isDark ? 'Switch to Light Theme' : 'Switch to Dark Theme';

    // Set Chart.js global defaults based on theme
    Chart.defaults.color = isDark ? '#e0e0e0' : '#555'; // Default text color
    Chart.defaults.borderColor = isDark ? '#444' : '#e1e4e8'; // Default border/grid line color

    // Update existing charts to reflect theme changes
    Object.values(chartInstances).forEach(chart => {
        if (chart) {
            // Update chart options that depend on theme defaults
            chart.options.scales.x.grid.color = Chart.defaults.borderColor;
            chart.options.scales.x.ticks.color = Chart.defaults.color;
            chart.options.scales.y.grid.color = Chart.defaults.borderColor;
            chart.options.scales.y.ticks.color = Chart.defaults.color;
            if (chart.options.plugins.legend) { // Check if legend exists
                 chart.options.plugins.legend.labels.color = Chart.defaults.color;
            }
            chart.update();
        }
    });
    // Note: Leaflet map theme adaptation would require more work (custom tiles or CSS filters)
    // Map tile layers generally don't change with CSS themes.
    // Popup styles are partially adapted in the CSS.
}

function toggleTheme() {
    const currentTheme = document.body.classList.contains('dark-theme') ? 'dark' : 'light';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('dashboardTheme', newTheme);
    applyTheme(newTheme);
}

// --- Scroll to Top Logic ---
function handleScroll() {
    // Show button when scrolled down 100px (adjust as needed)
    const scrollThreshold = 100;
    if (document.body.scrollTop > scrollThreshold || document.documentElement.scrollTop > scrollThreshold) {
        scrollToTopBtn.classList.add('show');
    } else {
        scrollToTopBtn.classList.remove('show');
    }
}

function goToTop() {
    // Use the smooth scroll behavior defined in CSS
    window.scrollTo({ top: 0 /* behavior: 'smooth' - handled by CSS now */ });
}

// --- Map Initialization --- <--- NEW
function initializeMap() {
    if (mapInstance) return; // Initialize only once

    try {
        if (typeof L === 'undefined') {
            console.error("Leaflet library (L) not found. Map cannot be initialized.");
            statusEl.textContent = "Error: Map library not loaded."; // Inform user
            return;
        }
        const mapContainer = document.getElementById('locationMap');
        if (!mapContainer) {
            console.error("Map container element '#locationMap' not found.");
            return;
        }

        // Check if container is actually visible in the DOM (might avoid some edge cases)
        if (mapContainer.offsetParent === null) {
             console.log("Map container not visible yet, delaying initialization attempt if needed.");
             // In most cases, DOMContentLoaded is sufficient and this check isn't needed.
        }

        // Center map (e.g., Europe/Africa) with low zoom
        mapInstance = L.map('locationMap').setView([20, 0], 2);

        // Add OpenStreetMap tile layer (requires attribution)
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 18, // You can adjust this
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(mapInstance);

        // Layer group for markers, allows easy clearing
        markerLayerGroup = L.layerGroup().addTo(mapInstance);

        console.log("Map initialized successfully.");

    } catch (error) {
        console.error("Error initializing map:", error);
        statusEl.textContent = "Error initializing map.";
        mapInstance = null; // Reset state on failure
        markerLayerGroup = null;
    }
}

// --- Map Rendering --- <--- NEW
function renderLocationMap(events) {
    if (!mapInstance || !markerLayerGroup) {
        console.warn("Map not initialized or marker group missing. Cannot render locations.");
        // Optionally attempt re-initialization here, but be cautious of loops
        // initializeMap();
        // if (!mapInstance || !markerLayerGroup) return;
        return;
    }

    markerLayerGroup.clearLayers(); // Clear previous markers from the layer

    let locationsAdded = 0;
    events.forEach(event => {
        // Check carefully for valid location data and coordinates
        if (event.location &&
            event.location.latitude != null && event.location.longitude != null && // Prefer != null over !== null/undefined check
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
    // if (locationsAdded > 0 && markerLayerGroup.getLayers().length > 0) {
    //    try {
    //        // Get bounds of all markers in the group and fit the map view
    //        mapInstance.fitBounds(markerLayerGroup.getBounds().pad(0.1)); // pad adds some margin
    //    } catch (boundsError) {
    //        console.error("Error fitting map bounds:", boundsError);
    //        // Fallback view if bounds calculation fails
    //        // mapInstance.setView([20, 0], 2);
    //    }
    // } else if (mapInstance) {
    //    // Optionally reset view if no markers were added/found
    //    mapInstance.setView([20, 0], 2);
    // }
}


// Apply saved theme and set up listeners on load
document.addEventListener('DOMContentLoaded', () => {
    // Apply initial theme
    const savedTheme = localStorage.getItem('dashboardTheme') || 'light'; // Default to light
    applyTheme(savedTheme); // Apply theme *before* rendering charts/map if possible

    // Event Listeners
    fetchDataBtn.addEventListener('click', fetchData);
    secretTokenInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            fetchData();
        }
    });
    themeToggleBtn.addEventListener('click', toggleTheme);
    // Scroll listener for the "Scroll to Top" button
    window.addEventListener('scroll', handleScroll);
    // Click listener for the "Scroll to Top" button
    scrollToTopBtn.addEventListener('click', goToTop);

    // --- Listeners for table filters (Unchanged) ---
    filterEventTypeSelect.addEventListener('change', applyFiltersAndDisplayEvents);
    filterKeywordInput.addEventListener('input', applyFiltersAndDisplayEvents); // 'input' for real-time filtering
    filterLinkTypeSelect.addEventListener('change', applyFiltersAndDisplayEvents);
    filterModalTypeSelect.addEventListener('change', applyFiltersAndDisplayEvents);
    filterProjectIdInput.addEventListener('input', applyFiltersAndDisplayEvents);

    // --- Initialize the map --- <--- NEW
    // Called after DOM is ready ensures the #locationMap div exists
    initializeMap();

    // Initial check for scroll position in case the page loads scrolled down
    handleScroll();
});


// --- Core Fetch Function (MODIFIED to call map render) ---
async function fetchData() {
    const secretToken = secretTokenInput.value.trim();
    if (!secretToken) {
        statusEl.textContent = 'Please enter the Auth Token.';
        return;
    }
    if (!RETRIEVAL_WORKER_URL || RETRIEVAL_WORKER_URL === 'https://patient-mode-9cfb.azelbane87.workers.dev/' || RETRIEVAL_WORKER_URL.includes('patient-mode')) { // Safety check
         // Make sure the placeholder URL is replaced!
         if (RETRIEVAL_WORKER_URL.includes('patient-mode')) {
             statusEl.textContent = 'ERROR: Please replace the placeholder RETRIEVAL_WORKER_URL in dashboard.js with your actual worker URL.';
             console.error('ERROR: Placeholder RETRIEVAL_WORKER_URL detected. Please update dashboard.js.');
             return;
         }
         statusEl.textContent = 'ERROR: Retrieval Worker URL not configured in dashboard.js';
         console.error('ERROR: Retrieval Worker URL not configured in dashboard.js');
         return;
    }

    statusEl.textContent = 'Fetching data...';
    fetchDataBtn.disabled = true; // Prevent multiple clicks
    rawEventsTbody.innerHTML = '<tr><td colspan="4">Loading...</td></tr>'; // Clear table with loading message
    resetSummary(); // Clear summary boxes
    destroyCharts(); // Clear previous Chart.js charts

    // --- Clear map markers before new fetch --- <--- NEW
    if (markerLayerGroup) {
        markerLayerGroup.clearLayers();
        console.log("Cleared map markers.");
    } else {
        console.log("Map layer group not ready for clearing (might be first fetch or init error).");
        // Attempt initialization again, in case it failed before user clicked fetch
        initializeMap();
    }

    currentRawEvents = []; // Clear previous data state
    resetFilters(); // Reset filter inputs for table

    try {
        const response = await fetch(https://patient-mode-9cfb.azelbane87.workers.dev/, {
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

        // Store fetched data
        currentRawEvents = rawEvents;

        // Process & Display (Order generally doesn't strictly matter unless one depends on another)
        populateEventTypeFilter(currentRawEvents); // Populate main type filter
        populateLinkTypeFilter(currentRawEvents); // Populate link type filter
        populateModalTypeFilter(currentRawEvents); // Populate modal type filter
        renderCharts(currentRawEvents); // Render all Chart.js charts
        applyFiltersAndDisplayEvents(); // Initial display of (potentially filtered) events in table
        calculateAndDisplaySummary(currentRawEvents); // Calculate summary based on *all* fetched events

        // --- Render the location map using the fetched data --- <--- NEW
        renderLocationMap(currentRawEvents);

        statusEl.textContent = `Displayed ${currentRawEvents.length} fetched events.`;

    } catch (error) {
        console.error('Error fetching or processing data:', error);
        statusEl.textContent = `Error: ${error.message}`;
        rawEventsTbody.innerHTML = `<tr><td colspan="4" style="color: red;">Error: ${error.message}</td></tr>`; // Show error in table
        // Optionally clear the map on error as well
        // if (markerLayerGroup) {
        //     markerLayerGroup.clearLayers();
        // }
    } finally {
         fetchDataBtn.disabled = false; // Re-enable button
    }
}

// --- Helper Functions ---
function resetSummary() {
    totalViewsEl.textContent = '--';
    uniqueDaysEl.textContent = '--';
}

function destroyCharts() {
    Object.values(chartInstances).forEach(chart => {
        if (chart) chart.destroy();
    });
    chartInstances = {};
    // No need to destroy the map instance itself, just clear its layers.
}

// --- Filter Functions (Unaffected by Map) ---
function resetFilters() {
    filterEventTypeSelect.innerHTML = '<option value="">All Types</option>'; // Reset dropdown
    filterKeywordInput.value = ''; // Clear search box
    filterLinkTypeSelect.innerHTML = '<option value="">All Link Types</option>';
    filterModalTypeSelect.innerHTML = '<option value="">All Modal Types/IDs</option>';
    filterProjectIdInput.value = '';
}

function populateEventTypeFilter(events) {
    const types = new Set(events.map(e => e.type || 'Unknown').filter(t => t));
    filterEventTypeSelect.innerHTML = '<option value="">All Types</option>';
    types.forEach(type => {
         const option = document.createElement('option');
         option.value = type;
         option.textContent = type.replace(/_/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
         filterEventTypeSelect.appendChild(option);
    });
}

function populateLinkTypeFilter(events) {
    const linkTypes = new Set(
        events.filter(e => e.linkType).map(e => e.linkType)
    );
    filterLinkTypeSelect.innerHTML = '<option value="">All Link Types</option>';
    linkTypes.forEach(type => {
        if (type) {
             const option = document.createElement('option');
             option.value = type;
             option.textContent = type.replace(/_/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
             filterLinkTypeSelect.appendChild(option);
        }
    });
}

function populateModalTypeFilter(events) {
     const modalTypes = new Set(
         events.filter(e => e.type === 'modal_open' && (e.modalType || e.modalId))
               .flatMap(e => [e.modalType, e.modalId])
               .filter(Boolean)
     );
     filterModalTypeSelect.innerHTML = '<option value="">All Modal Types/IDs</option>';
     modalTypes.forEach(type => {
         const option = document.createElement('option');
         option.value = type;
         option.textContent = type.replace(/_/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
         filterModalTypeSelect.appendChild(option);
     });
}

// --- applyFiltersAndDisplayEvents (Unaffected by Map - Only Filters Table) ---
function applyFiltersAndDisplayEvents() {
    const selectedEventType = filterEventTypeSelect.value;
    const keyword = filterKeywordInput.value.trim().toLowerCase();
    const selectedLinkType = filterLinkTypeSelect.value;
    const selectedModalType = filterModalTypeSelect.value;
    const projectIdKeyword = filterProjectIdInput.value.trim().toLowerCase();

    // Sort the original data first (important for "latest")
    const sortedEvents = [...currentRawEvents].sort((a, b) => new Date(b.receivedAt || 0) - new Date(a.receivedAt || 0));

    // Apply filters sequentially
    let filteredEvents = sortedEvents;

    // Filter by main Event Type
    if (selectedEventType) {
        filteredEvents = filteredEvents.filter(event => (event.type || 'Unknown') === selectedEventType);
    }
    // Filter by Specific Link Type
    if (selectedLinkType) {
        filteredEvents = filteredEvents.filter(event => event.linkType === selectedLinkType);
    }
    // Filter by Specific Modal Type/ID
    if (selectedModalType) {
        filteredEvents = filteredEvents.filter(event => event.modalType === selectedModalType || event.modalId === selectedModalType);
    }
    // Filter by Project ID / Context Keyword
     if (projectIdKeyword) {
        filteredEvents = filteredEvents.filter(event =>
            (event.projectId && String(event.projectId).toLowerCase().includes(projectIdKeyword)) ||
            (event.context && String(event.context).toLowerCase().includes(projectIdKeyword))
        );
     }
    // Filter by General Keyword (applies last)
    if (keyword) {
        filteredEvents = filteredEvents.filter(event => {
            const timestampStr = event.receivedAt ? new Date(event.receivedAt).toLocaleString().toLowerCase() : '';
            const typeStr = (event.type || '').toLowerCase();
            const pageStr = (event.page || '').toLowerCase();
            let detailsStr = '';
            try {
                const details = { ...event };
                 // Remove fields handled by specific filters or common fields before general search
                 ['receivedAt', 'timestamp', 'type', 'page', 'screenWidth', 'screenHeight', 'location',
                  'linkType', 'modalType', 'modalId', 'projectId', 'context'].forEach(k => delete details[k]);
                 if (Object.keys(details).length > 0) {
                    detailsStr = JSON.stringify(details).toLowerCase();
                 }
            } catch (e) { /* ignore stringify errors */ }

            return timestampStr.includes(keyword) ||
                   typeStr.includes(keyword) ||
                   pageStr.includes(keyword) ||
                   detailsStr.includes(keyword);
        });
    }

    // Render ONLY the table body with the filtered results
    renderTableBody(filteredEvents);
}


// --- renderTableBody (Unaffected by Map - Renders Table Rows) ---
// Modified slightly to show simplified location in details <pre>
function renderTableBody(events) {
     // Clear existing rows first
     rawEventsTbody.innerHTML = '';

     if (events.length === 0) {
         rawEventsTbody.innerHTML = '<tr><td colspan="4">No events match the current filters.</td></tr>';
         return;
     }

     events.forEach(event => {
        const row = rawEventsTbody.insertRow();
        row.insertCell().textContent = event.receivedAt ? new Date(event.receivedAt).toLocaleString() : 'N/A';
        row.insertCell().textContent = event.type || 'N/A';
        row.insertCell().textContent = event.page || 'N/A';
        const detailsCell = row.insertCell();
        const details = { ...event };
        // Remove common/redundant/sensitive fields from raw details view AFTER potential use in charts/filtering
        ['receivedAt', 'timestamp', 'type', 'page', 'screenWidth', 'screenHeight', 'location'].forEach(k => delete details[k]);

        // Add a simple location summary to the details PRE block
        let locationSummary = '';
        if (event.location) {
            locationSummary = `(Loc: ${event.location.city || '?'}, ${event.location.regionCode || '?'} ${event.location.country || '?'})\n`;
        }

        detailsCell.innerHTML = `<pre>${locationSummary}${Object.keys(details).length > 0 ? JSON.stringify(details, null, 2) : '--'}</pre>`;
     });
}

// --- calculateAndDisplaySummary (Unaffected by Map) ---
function calculateAndDisplaySummary(events) {
    const pageViews = events.filter(e => e.type === 'pageview');
    totalViewsEl.textContent = pageViews.length;
     const uniqueDays = new Set(pageViews.map(e => {
         try {
             return new Date(e.receivedAt || e.timestamp).toLocaleDateString();
         } catch (err) { return null; }
     }).filter(d => d !== null));
     uniqueDaysEl.textContent = uniqueDays.size;
}

// --- aggregateData (Unaffected by Map) ---
function aggregateData(events, filterCondition, keyExtractor, labelExtractor = null, limit = 10) {
    const aggregation = events
        .filter(filterCondition)
        .map(keyExtractor)
        .filter(value => value !== null && value !== undefined && value !== '')
        .reduce((acc, value) => {
            const key = String(value).substring(0, 50);
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {});

    const sortedEntries = Object.entries(aggregation)
                            .sort(([, countA], [, countB]) => countB - countA)
                            .slice(0, limit);

    const labels = sortedEntries.map(([key]) => labelExtractor ? labelExtractor(key) : key);
    const data = sortedEntries.map(([, count]) => count);

    return { labels, data };
}


// --- renderCharts (Unaffected by Map - Only Renders Chart.js Charts) ---
function renderCharts(events) {
    const colors = CHART_COLORS_FALLBACK; // Use fallback directly

    // 1. Page Views Over Time
    const viewsByDate = events
        .filter(e => e.type === 'pageview' && e.receivedAt) // Ensure timestamp exists
        .reduce((acc, event) => {
            try {
                const date = new Date(event.receivedAt).toISOString().split('T')[0];
                acc[date] = (acc[date] || 0) + 1;
            } catch(e) { /* Ignore invalid date events */ }
            return acc;
        }, {});
    const sortedDates = Object.keys(viewsByDate).sort();
    const pageViewData = sortedDates.map(date => viewsByDate[date]);
    renderChart('pageViewsChart', 'line', {
        labels: sortedDates,
        datasets: [{
            label: 'Page Views', data: pageViewData, borderColor: colors[0],
            backgroundColor: colors[0].replace('0.7', '0.2'), tension: 0.1, fill: true
        }]
    }, { scales: { x: { type: 'time', time: { unit: 'day', tooltipFormat: 'PP' } }, y: { beginAtZero: true, suggestedMax: Math.max(...pageViewData, 0) + 3 } } });

    // 2. Project Interactions
     const { labels: projectLabels, data: projectData } = aggregateData(
         events, e => e.type === 'project_click' || ((e.type === 'modal_open' || e.type === 'image_view') && (e.context || e.projectId)),
         e => e.projectId || e.context || 'Unknown Project', null, 10 );
    renderChart('projectInteractionsChart', 'bar', {
        labels: projectLabels, datasets: [{ label: 'Interactions', data: projectData, backgroundColor: colors[1] }]
    }, { indexAxis: 'y', scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: {} }, plugins: { legend: { display: false } } });

    // 3. Link Click Types
    const { labels: linkLabels, data: linkData } = aggregateData(
        events, e => e.type === 'link_click', event => event.linkType || 'Unknown',
        key => key.replace(/_/g, ' ').replace('link', '').trim().toUpperCase(), 10 );
    renderChart('linkTypesChart', 'doughnut', {
        labels: linkLabels, datasets: [{ label: 'Link Types', data: linkData, backgroundColor: colors.slice(2), hoverOffset: 4 }]
    }, { plugins: { legend: { position: 'bottom' } } });

    // 4. Modal Opens
     const { labels: modalLabels, data: modalData } = aggregateData(
         events, e => e.type === 'modal_open', event => event.modalType || event.modalId || 'Unknown',
         key => key.replace(/_/g, ' ').replace('modal', '').trim().toUpperCase(), 10 );
    renderChart('modalOpensChart', 'pie', {
        labels: modalLabels, datasets: [{ label: 'Modal Opens', data: modalData, backgroundColor: colors.slice(1).reverse(), hoverOffset: 4 }]
    }, { plugins: { legend: { position: 'bottom' } } });

    // 5. Event Types Distribution
    const { labels: eventTypeLabels, data: eventTypeData } = aggregateData(
         events, e => true, event => event.type || 'Unknown Type',
         key => key.replace(/_/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '), 12 );
    renderChart('eventTypesChart', 'bar', {
        labels: eventTypeLabels, datasets: [{ label: 'Event Count', data: eventTypeData, backgroundColor: colors[4] }]
    }, { indexAxis: 'y', scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: {} }, plugins: { legend: { display: false } } });

    // 6. Screen Width Distribution
    const screenWidthCanvas = document.getElementById('screenWidthChart');
    if (screenWidthCanvas) {
        const screenWidthCtx = screenWidthCanvas.getContext('2d');
        screenWidthCtx.clearRect(0, 0, screenWidthCanvas.width, screenWidthCanvas.height); // Clear previous state
        const { labels: screenWidthLabels, data: screenWidthData } = aggregateData(
             events, event => event.screenWidth != null && !isNaN(parseInt(event.screenWidth, 10)) && parseInt(event.screenWidth, 10) > 0,
             event => {
                const width = parseInt(event.screenWidth, 10);
                if (width <= 480) return '<= 480px (Mobile)'; if (width <= 768) return '481-768px (Tablet)';
                if (width <= 1024) return '769-1024px (Sm Laptop)'; if (width <= 1440) return '1025-1440px (Desktop)';
                return '> 1440px (Lrg Desktop)';
             }, null, 8 );
         if (screenWidthLabels.length > 0) {
            renderChart('screenWidthChart', 'doughnut', {
                labels: screenWidthLabels, datasets: [{ label: 'Screen Widths', data: screenWidthData, backgroundColor: colors.slice(3), hoverOffset: 4 }]
            }, { plugins: { legend: { position: 'bottom' } } });
         } else {
             screenWidthCtx.font = '16px Arial';
             screenWidthCtx.fillStyle = getComputedStyle(document.body).getPropertyValue('--secondary-text').trim() || '#888'; // Use theme color
             screenWidthCtx.textAlign = 'center';
             screenWidthCtx.fillText('No screen width data available.', screenWidthCanvas.width / 2, screenWidthCanvas.height / 2);
         }
     }
}

// --- renderChart (Unaffected by Map - Only Renders Chart.js Charts) ---
function renderChart(canvasId, type, data, options = {}) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) { console.error(`Canvas element with ID "${canvasId}" not found.`); return; }
    const ctx = canvas.getContext('2d');
    if (!ctx) { console.error(`Failed to get 2D context for canvas "${canvasId}".`); return; }

    // Define base options ensuring theme defaults are applied
    const baseOptions = {
        scales: {
            x: { grid: { color: Chart.defaults.borderColor }, ticks: { color: Chart.defaults.color } },
            y: { grid: { color: Chart.defaults.borderColor }, ticks: { color: Chart.defaults.color } }
        },
        plugins: {
             legend: { labels: { color: Chart.defaults.color } } // Default legend color
        }
    };

    // Deep merge function (simple version for this use case)
    function mergeDeep(target, source) {
        for (const key in source) {
            if (source[key] instanceof Object && key in target && target[key] instanceof Object) {
                mergeDeep(target[key], source[key]);
            } else {
                target[key] = source[key];
            }
        }
        return target;
    }
    const defaultOptions = { responsive: true, maintainAspectRatio: false };
    const mergedOptions = mergeDeep(mergeDeep({ ...defaultOptions }, baseOptions), options);

    // Destroy existing chart on this canvas before creating new one
    if (chartInstances[canvasId]) {
        chartInstances[canvasId].destroy();
    }

    try {
        chartInstances[canvasId] = new Chart(ctx, {
            type,
            data,
            options: mergedOptions
        });
    } catch (chartError) {
        console.error(`Error creating Chart.js instance for ${canvasId}:`, chartError);
        // Optionally display error message on canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.font = '16px Arial';
        ctx.fillStyle = 'red';
        ctx.textAlign = 'center';
        ctx.fillText(`Chart Error: ${chartError.message}`, canvas.width / 2, canvas.height / 2);

    }
}
// --- END OF FILE dashboard.js ---
