// --- START OF FILE dashboard.js ---

// --- Configuration ---
const RETRIEVAL_WORKER_URL = 'https://patient-mode-9cfb.azelbane87.workers.dev/'; // <-- YOUR URL IS HERE

const CHART_COLORS_CSS = [ /* ... unchanged ... */ ];
const CHART_COLORS_FALLBACK = [ /* ... unchanged ... */ ];


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

// --- aggregateData (Unchanged) ---
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


// --- renderCharts (MODIFIED FOR CHART 3 ONLY) ---
function renderCharts(events) {
    console.log("--- Starting renderCharts ---");
    const colors = CHART_COLORS_FALLBACK;

    try {
        // 1. Page Views Over Time (Unchanged)
        console.log("Processing Chart 1: Page Views Over Time");
        const viewsByDate = events.filter(e => e.type === 'pageview' && e.receivedAt).reduce((acc, event) => { try { const date = new Date(event.receivedAt).toISOString().split('T')[0]; acc[date] = (acc[date] || 0) + 1; } catch(e) {} return acc; }, {});
        const sortedDates = Object.keys(viewsByDate).sort(); const pageViewData = sortedDates.map(date => viewsByDate[date]);
        console.log("Page View Data:", { labels: sortedDates.length, data: pageViewData.length });
        renderChart('pageViewsChart', 'line', { labels: sortedDates, datasets: [{ label: 'Page Views', data: pageViewData, borderColor: colors[0], backgroundColor: colors[0].replace('0.7', '0.2'), tension: 0.1, fill: true }] }, { scales: { x: { type: 'time', time: { unit: 'day', tooltipFormat: 'PP' } }, y: { beginAtZero: true, suggestedMax: Math.max(0, ...pageViewData) + 3 } } });
        console.log("Finished Chart 1");

        // 2. Project Interactions (Unchanged)
        console.log("Processing Chart 2: Project Interactions"); console.log(" -> Calling aggregateData for Project Interactions...");
        const projectAggData = aggregateData( events, e => e.type === 'project_click' || ((e.type === 'modal_open' || e.type === 'image_view') && (e.context || e.projectId)), e => e.projectId || e.context || 'Unknown Project', null, 10 );
        console.log(" <- Returned from aggregateData for Project Interactions:", projectAggData);
        if (projectAggData && Array.isArray(projectAggData.labels) && Array.isArray(projectAggData.data)) { const { labels: projectLabels, data: projectData } = projectAggData; console.log("Aggregated data for Project Interactions:", { labels: projectLabels, data: projectData }); if (projectLabels.length > 0) { renderChart('projectInteractionsChart', 'bar', { labels: projectLabels, datasets: [{ label: 'Interactions', data: projectData, backgroundColor: colors[1] }] }, { indexAxis: 'y', scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: {} }, plugins: { legend: { display: false } } }); console.log("Finished Chart 2"); } else { handleEmptyChart('projectInteractionsChart', 'No interaction data available.'); } } else { console.error("aggregateData for Project Interactions returned invalid data:", projectAggData); handleEmptyChart('projectInteractionsChart', 'Error aggregating data.');}

        // --- START: MODIFIED CHART 3 ---
        // 3. Link Clicks per Project (Changed from Link Click Types)
        console.log("Processing Chart 3: Link Clicks per Project"); // Updated log message
        console.log(" -> Calling aggregateData for Project Link Clicks...");
        const projectLinkAggData = aggregateData(
            events,
            e => e.type === 'link_click' && e.context && e.context !== 'undefined' && e.context !== '', // Filter: link_click events WITH a non-empty context
            event => event.context, // Key Extractor: Use the project context (ID)
            key => String(key).replace(/-/g, ' ').toUpperCase(), // Label Formatter: Make project IDs more readable
            10 // Limit: Show top 10 projects
        );
        console.log(" <- Returned from aggregateData for Project Link Clicks:", projectLinkAggData);

        if (projectLinkAggData && Array.isArray(projectLinkAggData.labels) && Array.isArray(projectLinkAggData.data)) {
            const { labels: projectLinkLabels, data: projectLinkData } = projectLinkAggData;
            console.log("Aggregated data for Project Link Clicks:", { labels: projectLinkLabels, data: projectLinkData });

            if (projectLinkLabels.length > 0) {
                // Change chart type to 'bar' and use indexAxis: 'y'
                renderChart('linkTypesChart', 'bar', { // **** CHANGED chart type to 'bar' ****
                    labels: projectLinkLabels, // Use project labels
                    datasets: [{
                        label: 'Link Clicks', // Updated dataset label
                        data: projectLinkData, // Use project link counts
                        backgroundColor: CHART_COLORS_FALLBACK[2], // Use a color (e.g., the 3rd color)
                    }]
                }, { // Chart options for horizontal bar
                    indexAxis: 'y', // **** ADDED for horizontal bars ****
                    scales: {
                        // X axis (counts) starts at zero
                        x: { beginAtZero: true, ticks: { precision: 0 } },
                        // Y axis (project names) - default scale is fine
                        y: {}
                    },
                    plugins: {
                        legend: { display: false }, // Hide legend for single dataset bar chart
                        tooltip: { displayColors: false } // Optional: Hide color box in tooltip
                    }
                });
                console.log("Finished Chart 3 (Link Clicks per Project)");
            } else {
                // Use the existing helper function for empty state
                handleEmptyChart('linkTypesChart', 'No project-specific link clicks found.');
            }
        } else {
            console.error("aggregateData for Project Link Clicks returned invalid data:", projectLinkAggData);
            handleEmptyChart('linkTypesChart', 'Error aggregating project link data.');
        }
        // --- END: MODIFIED CHART 3 ---


        // 4. Modal Opens (Unchanged)
        console.log("Processing Chart 4: Modal Opens"); console.log(" -> Calling aggregateData for Modal Opens...");
        const modalAggData = aggregateData( events, e => e.type === 'modal_open', event => event.modalType || event.modalId || 'Unknown', key => key.replace(/_/g, ' ').replace('modal', '').trim().toUpperCase(), 10 );
        console.log(" <- Returned from aggregateData for Modal Opens:", modalAggData);
        if (modalAggData && Array.isArray(modalAggData.labels) && Array.isArray(modalAggData.data)) { const { labels: modalLabels, data: modalData } = modalAggData; console.log("Aggregated data for Modal Opens:", { labels: modalLabels, data: modalData }); if (modalLabels.length > 0) { renderChart('modalOpensChart', 'pie', { labels: modalLabels, datasets: [{ label: 'Modal Opens', data: modalData, backgroundColor: colors.slice(1).reverse(), hoverOffset: 4 }] }, { plugins: { legend: { position: 'bottom' } } }); console.log("Finished Chart 4"); } else { handleEmptyChart('modalOpensChart', 'No modal open data available.'); } } else { console.error("aggregateData for Modal Opens returned invalid data:", modalAggData); handleEmptyChart('modalOpensChart', 'Error aggregating data.');}

        // 5. Event Types Distribution (Unchanged)
        console.log("Processing Chart 5: Event Types Distribution"); console.log(" -> Calling aggregateData for Event Types...");
        const eventTypeAggData = aggregateData( events, e => true, event => event.type || 'Unknown Type', key => key.replace(/_/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '), 12 );
        console.log(" <- Returned from aggregateData for Event Types:", eventTypeAggData);
        if (eventTypeAggData && Array.isArray(eventTypeAggData.labels) && Array.isArray(eventTypeAggData.data)) { const { labels: eventTypeLabels, data: eventTypeData } = eventTypeAggData; console.log("Aggregated data for Event Types:", { labels: eventTypeLabels, data: eventTypeData }); if (eventTypeLabels.length > 0) { renderChart('eventTypesChart', 'bar', { labels: eventTypeLabels, datasets: [{ label: 'Event Count', data: eventTypeData, backgroundColor: colors[4] }] }, { indexAxis: 'y', scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: {} }, plugins: { legend: { display: false } } }); console.log("Finished Chart 5"); } else { handleEmptyChart('eventTypesChart', 'No event data available.'); } } else { console.error("aggregateData for Event Types returned invalid data:", eventTypeAggData); handleEmptyChart('eventTypesChart', 'Error aggregating data.');}

        // 6. Screen Width Distribution (Unchanged)
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

// Helper function to handle empty chart state (Unchanged)
function handleEmptyChart(canvasId, message) { /* ... */ }

// --- renderChart --- (Unchanged) ---
function renderChart(canvasId, type, data, options = {}) { /* ... */ }

// --- END OF FILE dashboard.js ---
