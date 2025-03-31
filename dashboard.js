// --- START OF FILE dashboard.js ---

// --- Configuration ---
const RETRIEVAL_WORKER_URL = 'https://patient-mode-9cfb.azelbane87.workers.dev/'; // <-- YOUR URL IS HERE

const CHART_COLORS_CSS = [ /* ... */ ];
const CHART_COLORS_FALLBACK = [ /* ... */ ];

// --- DOM Elements --- (Unchanged)
const fetchDataBtn = document.getElementById('fetchDataBtn'); /* ... */
const filterProjectIdInput = document.getElementById('filterProjectId');

// --- Chart Instances --- (Unchanged)
let chartInstances = {};

// --- Map Instance and Layer --- (Unchanged)
let mapInstance = null; /* ... */
let darkTileLayer = null;

// --- State --- (Unchanged)
let currentRawEvents = [];

// --- Theme Handling --- (Unchanged)
function applyTheme(theme) { /* ... */ }
function toggleTheme() { /* ... */ }

// --- Scroll to Top Logic --- (Unchanged)
function handleScroll() { /* ... */ }
function goToTop() { /* ... */ }

// --- Map Initialization --- (Unchanged)
function initializeMap() { /* ... */ }

// --- Map Rendering --- (Unchanged)
function renderLocationMap(events) { /* ... */ }

// Apply saved theme and set up listeners on load (Unchanged)
document.addEventListener('DOMContentLoaded', () => { /* ... */ });

// --- Core Fetch Function (Unchanged) ---
async function fetchData() { /* ... */ }

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


// --- aggregateData (MODIFIED WITH LOGGING AND SAFETY RETURN) ---
function aggregateData(events, filterCondition, keyExtractor, labelExtractor = null, limit = 10) {
    console.log(`--- aggregateData called for: ${keyExtractor.toString().substring(0, 80)}...`); // Log which aggregation is running
    let labels = []; // Default empty results
    let data = [];

    try {
        const filteredEvents = events.filter(filterCondition);
        console.log(`  aggregateData: Filtered events count: ${filteredEvents.length}`);

        const extractedKeys = filteredEvents.map(keyExtractor);
        console.log(`  aggregateData: Extracted keys count (raw): ${extractedKeys.length}`);

        const validKeys = extractedKeys.filter(value => value !== null && value !== undefined && value !== '');
        console.log(`  aggregateData: Valid keys count (non-empty): ${validKeys.length}`);

        const aggregation = validKeys.reduce((acc, value) => {
                const key = String(value).substring(0, 50); // Limit key length
                acc[key] = (acc[key] || 0) + 1;
                return acc;
            }, {});
        console.log(`  aggregateData: Aggregation counts object:`, aggregation);


        // Sort by count descending and take top N
        const sortedEntries = Object.entries(aggregation)
                                .sort(([, countA], [, countB]) => countB - countA)
                                .slice(0, limit);
        console.log(`  aggregateData: Sorted/Limited entries:`, sortedEntries);

        // Re-assign labels and data ONLY if successful
        labels = sortedEntries.map(([key]) => labelExtractor ? labelExtractor(key) : key);
        data = sortedEntries.map(([, count]) => count);

        console.log(`  aggregateData: Final labels/data counts: ${labels.length}/${data.length}`);

    } catch (error) {
        console.error(`  !!! Error inside aggregateData !!!`, error);
        // Log the arguments that might have caused the error
        console.error(`  aggregateData error context: filterCondition=${filterCondition.toString()}, keyExtractor=${keyExtractor.toString()}`);
        // Return default empty object in case of error to prevent destructuring failure
        return { labels: [], data: [] };
    }

    // Ensure an object is always returned
    return { labels, data };
}


// --- renderCharts (ADDED LOGGING before aggregateData calls) ---
function renderCharts(events) {
    console.log("--- Starting renderCharts ---");
    const colors = CHART_COLORS_FALLBACK;

    try {
        // 1. Page Views Over Time
        console.log("Processing Chart 1: Page Views Over Time");
        const viewsByDate = events.filter(e => e.type === 'pageview' && e.receivedAt).reduce((acc, event) => { try { const date = new Date(event.receivedAt).toISOString().split('T')[0]; acc[date] = (acc[date] || 0) + 1; } catch(e) {} return acc; }, {});
        const sortedDates = Object.keys(viewsByDate).sort();
        const pageViewData = sortedDates.map(date => viewsByDate[date]);
        console.log("Page View Data:", { labels: sortedDates.length, data: pageViewData.length });
        renderChart('pageViewsChart', 'line', { labels: sortedDates, datasets: [{ label: 'Page Views', data: pageViewData, borderColor: colors[0], backgroundColor: colors[0].replace('0.7', '0.2'), tension: 0.1, fill: true }] }, { scales: { x: { type: 'time', time: { unit: 'day', tooltipFormat: 'PP' } }, y: { beginAtZero: true, suggestedMax: Math.max(0, ...pageViewData) + 3 } } });
        console.log("Finished Chart 1");

        // 2. Project Interactions
        console.log("Processing Chart 2: Project Interactions");
        console.log(" -> Calling aggregateData for Project Interactions..."); // Log before call
        const projectAggData = aggregateData(
             events, e => e.type === 'project_click' || ((e.type === 'modal_open' || e.type === 'image_view') && (e.context || e.projectId)),
             e => e.projectId || e.context || 'Unknown Project', null, 10 );
        console.log(" <- Returned from aggregateData for Project Interactions:", projectAggData); // Log after call
        // Defensive check: Ensure projectAggData is an object with labels/data before destructuring
        if (projectAggData && Array.isArray(projectAggData.labels) && Array.isArray(projectAggData.data)) {
            const { labels: projectLabels, data: projectData } = projectAggData; // Destructure now
            console.log("Aggregated data for Project Interactions:", { labels: projectLabels, data: projectData });
            if (projectLabels.length > 0) {
                 renderChart('projectInteractionsChart', 'bar', { labels: projectLabels, datasets: [{ label: 'Interactions', data: projectData, backgroundColor: colors[1] }] }, { indexAxis: 'y', scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: {} }, plugins: { legend: { display: false } } });
                 console.log("Finished Chart 2");
            } else { handleEmptyChart('projectInteractionsChart', 'No interaction data available.'); }
        } else { console.error("aggregateData for Project Interactions returned invalid data:", projectAggData); handleEmptyChart('projectInteractionsChart', 'Error aggregating data.');}


        // 3. Link Click Types
        console.log("Processing Chart 3: Link Click Types");
        console.log(" -> Calling aggregateData for Link Click Types...");
        const linkAggData = aggregateData(
            events, e => e.type === 'link_click', event => event.linkType || 'Unknown',
            key => key.replace(/_/g, ' ').replace('link', '').trim().toUpperCase(), 10 );
        console.log(" <- Returned from aggregateData for Link Click Types:", linkAggData);
        if (linkAggData && Array.isArray(linkAggData.labels) && Array.isArray(linkAggData.data)) {
            const { labels: linkLabels, data: linkData } = linkAggData;
            console.log("Aggregated data for Link Click Types:", { labels: linkLabels, data: linkData });
            if (linkLabels.length > 0) {
                 renderChart('linkTypesChart', 'doughnut', { labels: linkLabels, datasets: [{ label: 'Link Types', data: linkData, backgroundColor: colors.slice(2), hoverOffset: 4 }] }, { plugins: { legend: { position: 'bottom' } } });
                 console.log("Finished Chart 3");
            } else { handleEmptyChart('linkTypesChart', 'No link click data available.'); }
        } else { console.error("aggregateData for Link Click Types returned invalid data:", linkAggData); handleEmptyChart('linkTypesChart', 'Error aggregating data.');}


        // 4. Modal Opens
        console.log("Processing Chart 4: Modal Opens");
        console.log(" -> Calling aggregateData for Modal Opens...");
        const modalAggData = aggregateData(
             events, e => e.type === 'modal_open', event => event.modalType || event.modalId || 'Unknown',
             key => key.replace(/_/g, ' ').replace('modal', '').trim().toUpperCase(), 10 );
        console.log(" <- Returned from aggregateData for Modal Opens:", modalAggData);
        if (modalAggData && Array.isArray(modalAggData.labels) && Array.isArray(modalAggData.data)) {
             const { labels: modalLabels, data: modalData } = modalAggData;
             console.log("Aggregated data for Modal Opens:", { labels: modalLabels, data: modalData });
             if (modalLabels.length > 0) {
                  renderChart('modalOpensChart', 'pie', { labels: modalLabels, datasets: [{ label: 'Modal Opens', data: modalData, backgroundColor: colors.slice(1).reverse(), hoverOffset: 4 }] }, { plugins: { legend: { position: 'bottom' } } });
                  console.log("Finished Chart 4");
             } else { handleEmptyChart('modalOpensChart', 'No modal open data available.'); }
        } else { console.error("aggregateData for Modal Opens returned invalid data:", modalAggData); handleEmptyChart('modalOpensChart', 'Error aggregating data.');}


        // 5. Event Types Distribution
        console.log("Processing Chart 5: Event Types Distribution");
        console.log(" -> Calling aggregateData for Event Types...");
        const eventTypeAggData = aggregateData(
             events, e => true, event => event.type || 'Unknown Type',
             key => key.replace(/_/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '), 12 );
        console.log(" <- Returned from aggregateData for Event Types:", eventTypeAggData);
        if (eventTypeAggData && Array.isArray(eventTypeAggData.labels) && Array.isArray(eventTypeAggData.data)) {
             const { labels: eventTypeLabels, data: eventTypeData } = eventTypeAggData;
             console.log("Aggregated data for Event Types:", { labels: eventTypeLabels, data: eventTypeData });
             if (eventTypeLabels.length > 0) {
                  renderChart('eventTypesChart', 'bar', { labels: eventTypeLabels, datasets: [{ label: 'Event Count', data: eventTypeData, backgroundColor: colors[4] }] }, { indexAxis: 'y', scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: {} }, plugins: { legend: { display: false } } });
                  console.log("Finished Chart 5");
             } else { handleEmptyChart('eventTypesChart', 'No event data available.'); }
        } else { console.error("aggregateData for Event Types returned invalid data:", eventTypeAggData); handleEmptyChart('eventTypesChart', 'Error aggregating data.');}


        // 6. Screen Width Distribution
        console.log("Processing Chart 6: Screen Width Distribution");
        const screenWidthCanvas = document.getElementById('screenWidthChart');
        if (screenWidthCanvas) {
            console.log(" -> Calling aggregateData for Screen Width...");
            const screenWidthAggData = aggregateData(
                 events, event => event.screenWidth != null && !isNaN(parseInt(event.screenWidth, 10)) && parseInt(event.screenWidth, 10) > 0,
                 event => { const width = parseInt(event.screenWidth, 10); if (width <= 480) return '<= 480px (Mobile)'; if (width <= 768) return '481-768px (Tablet)'; if (width <= 1024) return '769-1024px (Sm Laptop)'; if (width <= 1440) return '1025-1440px (Desktop)'; return '> 1440px (Lrg Desktop)'; },
                 null, 8 );
            console.log(" <- Returned from aggregateData for Screen Width:", screenWidthAggData);
            if (screenWidthAggData && Array.isArray(screenWidthAggData.labels) && Array.isArray(screenWidthAggData.data)) {
                 const { labels: screenWidthLabels, data: screenWidthData } = screenWidthAggData;
                 console.log("Aggregated data for Screen Width:", { labels: screenWidthLabels, data: screenWidthData });
                 if (screenWidthLabels.length > 0) {
                    renderChart('screenWidthChart', 'doughnut', { labels: screenWidthLabels, datasets: [{ label: 'Screen Widths', data: screenWidthData, backgroundColor: colors.slice(3), hoverOffset: 4 }] }, { plugins: { legend: { position: 'bottom' } } });
                    console.log("Finished Chart 6");
                 } else { handleEmptyChart('screenWidthChart', 'No screen width data available.'); }
             } else { console.error("aggregateData for Screen Width returned invalid data:", screenWidthAggData); handleEmptyChart('screenWidthChart', 'Error aggregating data.');}
         } else { console.error("Canvas element #screenWidthChart not found."); }

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
    if (canvas) {
        // Destroy existing chart instance if present
        if (chartInstances[canvasId]) {
            chartInstances[canvasId].destroy();
            delete chartInstances[canvasId];
        }
        // Display message
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.font = '16px Arial';
        ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--secondary-text').trim() || '#888';
        ctx.textAlign = 'center';
        ctx.fillText(message, canvas.width / 2, canvas.height / 2);
    }
}

// --- renderChart --- (Unchanged) ---
function renderChart(canvasId, type, data, options = {}) { /* ... */ }

// --- END OF FILE dashboard.js ---
