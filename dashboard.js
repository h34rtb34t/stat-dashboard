// --- Configuration ---
// PASTE THE URL FOR YOUR *RETRIEVAL* WORKER (patient-mode-9cfb...) HERE:
const RETRIEVAL_WORKER_URL = 'https://patient-mode-9cfb.azelbane87.workers.dev';
const CHART_COLORS = [ // Add more colors if needed
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
const uniqueDaysEl = document.querySelector('#uniqueDaysBox .value'); // Corrected ID

// --- Chart Instances ---
let chartInstances = {}; // Store chart instances by canvas ID

// --- Event Listener ---
fetchDataBtn.addEventListener('click', fetchData);
// Optional: Allow Enter key in password field to trigger fetch
secretTokenInput.addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
        fetchData();
    }
});

// --- Core Function ---
async function fetchData() {
    const secretToken = secretTokenInput.value.trim();
    if (!secretToken) {
        statusEl.textContent = 'Please enter the Auth Token.';
        return;
    }
    if (!RETRIEVAL_WORKER_URL || RETRIEVAL_WORKER_URL === 'YOUR_COPIED_RETRIEVAL_WORKER_URL') { // Safety check
         statusEl.textContent = 'ERROR: Retrieval Worker URL not configured in dashboard.js';
         return;
    }

    statusEl.textContent = 'Fetching data...';
    fetchDataBtn.disabled = true; // Prevent multiple clicks
    rawEventsTbody.innerHTML = ''; // Clear table
    resetSummary(); // Clear summary boxes
    destroyCharts(); // Clear previous charts

    try {
        const response = await fetch(RETRIEVAL_WORKER_URL, {
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

        // Process & Display
        displayRawEvents(rawEvents);
        calculateAndDisplaySummary(rawEvents);
        renderCharts(rawEvents); // Render all charts

        statusEl.textContent = `Displayed ${rawEvents.length} recent events.`;

    } catch (error) {
        console.error('Error fetching or processing data:', error);
        statusEl.textContent = `Error: ${error.message}`;
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
}

function displayRawEvents(events) {
     // Sort events by receivedAt descending before displaying
     events.sort((a, b) => new Date(b.receivedAt || 0) - new Date(a.receivedAt || 0));
     events.forEach(event => {
        const row = rawEventsTbody.insertRow();
        row.insertCell().textContent = event.receivedAt ? new Date(event.receivedAt).toLocaleString() : 'N/A';
        row.insertCell().textContent = event.type || 'N/A';
        row.insertCell().textContent = event.page || 'N/A';
        const detailsCell = row.insertCell();
        const details = { ...event };
        // Remove common/redundant fields from details view
        ['receivedAt', 'timestamp', 'type', 'page', 'screenWidth'].forEach(k => delete details[k]);
        detailsCell.innerHTML = `<pre>${Object.keys(details).length > 0 ? JSON.stringify(details, null, 2) : '--'}</pre>`;
     });
}

function calculateAndDisplaySummary(events) {
    const pageViews = events.filter(e => e.type === 'pageview');
    totalViewsEl.textContent = pageViews.length;

    // Approximate unique days by counting unique dates in pageviews
     const uniqueDays = new Set(pageViews.map(e => new Date(e.receivedAt || e.timestamp).toLocaleDateString()));
     uniqueDaysEl.textContent = uniqueDays.size;
}

 // Generic function to aggregate data by a specific key
 function aggregateData(events, filterCondition, keyExtractor, labelExtractor = null, limit = 10) {
    const aggregation = events
        .filter(filterCondition) // Use flexible filter condition
        .map(keyExtractor) // Extract the value we want to count
        .filter(value => value !== null && value !== undefined && value !== '') // Ignore null/undefined/empty keys
        .reduce((acc, value) => {
            const key = String(value).substring(0, 50); // Limit key length for sanity
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {});

    // Sort by count descending and take top N
    const sortedEntries = Object.entries(aggregation)
                            .sort(([, countA], [, countB]) => countB - countA)
                            .slice(0, limit);

    const labels = sortedEntries.map(([key]) => labelExtractor ? labelExtractor(key) : key);
    const data = sortedEntries.map(([, count]) => count);

    return { labels, data };
}


function renderCharts(events) {
    // 1. Page Views Over Time (Grouped by Day)
    const viewsByDate = events
        .filter(e => e.type === 'pageview')
        .reduce((acc, event) => {
            const date = new Date(event.receivedAt || event.timestamp).toISOString().split('T')[0]; // Get YYYY-MM-DD
            acc[date] = (acc[date] || 0) + 1;
            return acc;
        }, {});
    const sortedDates = Object.keys(viewsByDate).sort();
    renderChart('pageViewsChart', 'line', {
        labels: sortedDates,
        datasets: [{
            label: 'Page Views',
            data: sortedDates.map(date => viewsByDate[date]),
            borderColor: CHART_COLORS[0],
            tension: 0.1,
             fill: false
        }]
    }, { scales: { x: { type: 'time', time: { unit: 'day', tooltipFormat: 'PP' } }, y: { beginAtZero: true, suggestedMax: Math.max(...Object.values(viewsByDate), 0) + 3 } } }); // Add 0 for case of no views


    // 2. Project Interactions (Clicks + Modal Opens + Image Views, grouped by ProjectID/Context)
     const { labels: projectLabels, data: projectData } = aggregateData(
         events,
         e => e.type === 'project_click' || ((e.type === 'modal_open' || e.type === 'image_view') && (e.context)), // Filter condition
         e => e.projectId || e.context, // Key extractor (project ID)
         null, // No special label extractor needed
         10 // Limit to top 10
     );
    renderChart('projectInteractionsChart', 'bar', {
        labels: projectLabels,
        datasets: [{
            label: 'Project Interactions (Clicks, Modals, Image Views)',
            data: projectData,
            backgroundColor: CHART_COLORS[1],
        }]
    }, { scales: { y: { beginAtZero: true }, x: { ticks: { precision: 0 } } }, indexAxis: 'y', plugins: { legend: { display: false }, tooltip: { displayColors: false } } });


    // 3. Link Click Types
    const { labels: linkLabels, data: linkData } = aggregateData(
        events,
        e => e.type === 'link_click', // Filter condition
        event => event.type, // Key: Use the pre-categorized type
        key => key.replace(/_/g, ' ').replace('link', '').trim().toUpperCase(), // Nicer labels
        10 // Limit
    );
    renderChart('linkTypesChart', 'doughnut', {
        labels: linkLabels,
        datasets: [{
            label: 'Link Types',
            data: linkData,
            backgroundColor: CHART_COLORS.slice(2), // Use remaining colors
            hoverOffset: 4
        }]
    }, { plugins: { legend: { position: 'right' } } });

    // 4. Modal Opens
     const { labels: modalLabels, data: modalData } = aggregateData(
         events,
         e => e.type === 'modal_open', // Filter condition
         event => event.modalType || event.modalId, // Key: Use modalType if available
         key => key.replace(/_/g, ' ').replace('modal', '').trim().toUpperCase(), // Make label nicer
         10 // Limit
     );
    renderChart('modalOpensChart', 'pie', {
        labels: modalLabels,
        datasets: [{
            label: 'Modal Opens',
            data: modalData,
            backgroundColor: CHART_COLORS.slice(1).reverse(), // Re-use some colors
            hoverOffset: 4
        }]
    }, { plugins: { legend: { position: 'right' } } });

}

// Generic Chart Rendering Function
function renderChart(canvasId, type, data, options = {}) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) { console.error(`Canvas element with ID "${canvasId}" not found.`); return; }
    const ctx = canvas.getContext('2d');
    if (!ctx) { console.error(`Failed to get 2D context for canvas "${canvasId}".`); return; }
    // Merge default options for responsiveness and maintain aspect ratio
    const defaultOptions = { responsive: true, maintainAspectRatio: false };
    chartInstances[canvasId] = new Chart(ctx, { type, data, options: { ...defaultOptions, ...options } });
}