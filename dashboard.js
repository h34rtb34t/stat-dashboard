// --- Configuration ---
// PASTE THE URL FOR YOUR *RETRIEVAL* WORKER (patient-mode-9cfb...) HERE:
const RETRIEVAL_WORKER_URL = 'https://patient-mode-9cfb.azelbane87.workers.dev';

// Use CSS variables for chart colors where possible, fallback to array
// Define them here to easily reference them
const CHART_COLORS_CSS = [
    'var(--chart-color-1)', 'var(--chart-color-2)', 'var(--chart-color-3)',
    'var(--chart-color-4)', 'var(--chart-color-5)', 'var(--chart-color-6)',
    'var(--chart-color-7)', 'var(--chart-color-8)', 'var(--chart-color-9)'
];
// Fallback if CSS vars aren't supported or needed directly
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
const uniqueDaysEl = document.querySelector('#uniqueDaysBox .value'); // Corrected ID
const themeToggleBtn = document.getElementById('themeToggleBtn'); // Theme toggle button

// --- Chart Instances ---
let chartInstances = {}; // Store chart instances by canvas ID

// --- Theme Handling ---
function applyTheme(theme) {
    if (theme === 'dark') {
        document.body.classList.add('dark-theme');
        themeToggleBtn.textContent = '☀️'; // Sun icon for light mode
        themeToggleBtn.title = 'Switch to Light Theme';
        // Set Chart.js defaults for dark theme
        Chart.defaults.color = '#e0e0e0'; // Default text color for charts
        Chart.defaults.borderColor = '#444'; // Default border/grid line color
    } else {
        document.body.classList.remove('dark-theme');
        themeToggleBtn.textContent = '🌙'; // Moon icon for dark mode
        themeToggleBtn.title = 'Switch to Dark Theme';
        // Reset Chart.js defaults for light theme
        Chart.defaults.color = '#555'; // Or your preferred light theme text color
        Chart.defaults.borderColor = '#e1e4e8'; // Default light border color
    }
    // Update existing charts to reflect theme changes (if needed)
     Object.values(chartInstances).forEach(chart => {
        if (chart) chart.update();
    });
}

function toggleTheme() {
    const currentTheme = document.body.classList.contains('dark-theme') ? 'dark' : 'light';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('dashboardTheme', newTheme);
    applyTheme(newTheme);
}

// Apply saved theme on load
document.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('dashboardTheme') || 'light'; // Default to light
    applyTheme(savedTheme);
});

// --- Event Listeners ---
fetchDataBtn.addEventListener('click', fetchData);
secretTokenInput.addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
        fetchData();
    }
});
themeToggleBtn.addEventListener('click', toggleTheme); // Listener for theme toggle

// --- Core Function (Unchanged Core Logic) ---
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
        displayRawEvents(rawEvents); // Raw data display function (modified slightly for screenWidth usage)
        calculateAndDisplaySummary(rawEvents); // Unchanged
        renderCharts(rawEvents); // Render all charts (now includes new ones)

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

// Modified slightly: Keep screenWidth temporarily for aggregation if present
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
        // Remove common/redundant fields from details view AFTER potential use in charts
        ['receivedAt', 'timestamp', 'type', 'page', 'screenWidth', 'screenHeight'].forEach(k => delete details[k]); // Added screenHeight too
        detailsCell.innerHTML = `<pre>${Object.keys(details).length > 0 ? JSON.stringify(details, null, 2) : '--'}</pre>`;
     });
}

// Unchanged
function calculateAndDisplaySummary(events) {
    const pageViews = events.filter(e => e.type === 'pageview');
    totalViewsEl.textContent = pageViews.length;

    // Approximate unique days by counting unique dates in pageviews
     const uniqueDays = new Set(pageViews.map(e => new Date(e.receivedAt || e.timestamp).toLocaleDateString()));
     uniqueDaysEl.textContent = uniqueDays.size;
}

// Generic function to aggregate data (Unchanged)
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


// Modified to include new charts
function renderCharts(events) {

    // Define chart colors - try using CSS variables, fallback if needed
    // Note: Direct use of CSS variables in chart.js datasets might be tricky.
    // It's often easier to assign the fallback colors directly.
    const colors = CHART_COLORS_FALLBACK; // Stick with explicit colors for simplicity

    // 1. Page Views Over Time (Grouped by Day)
    const viewsByDate = events
        .filter(e => e.type === 'pageview')
        .reduce((acc, event) => {
            const date = new Date(event.receivedAt || event.timestamp).toISOString().split('T')[0]; // Get YYYY-MM-DD
            acc[date] = (acc[date] || 0) + 1;
            return acc;
        }, {});
    const sortedDates = Object.keys(viewsByDate).sort();
    const pageViewData = sortedDates.map(date => viewsByDate[date]); // Define here for suggestedMax
    renderChart('pageViewsChart', 'line', {
        labels: sortedDates,
        datasets: [{
            label: 'Page Views',
            data: pageViewData,
            borderColor: colors[0],
            backgroundColor: colors[0].replace('0.7', '0.2'), // Lighter fill
            tension: 0.1,
            fill: true // Changed to true for area chart feel
        }]
    }, { scales: { x: { type: 'time', time: { unit: 'day', tooltipFormat: 'PP' } }, y: { beginAtZero: true, suggestedMax: Math.max(...pageViewData, 0) + 3 } } });


    // 2. Project Interactions
     const { labels: projectLabels, data: projectData } = aggregateData(
         events,
         e => e.type === 'project_click' || ((e.type === 'modal_open' || e.type === 'image_view') && (e.context)),
         e => e.projectId || e.context,
         null,
         10
     );
    renderChart('projectInteractionsChart', 'bar', {
        labels: projectLabels,
        datasets: [{
            label: 'Project Interactions',
            data: projectData,
            backgroundColor: colors[1],
        }]
    }, { scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: {} }, indexAxis: 'y', plugins: { legend: { display: false }, tooltip: { displayColors: false } } }); // Removed x-axis tick precision


    // 3. Link Click Types
    const { labels: linkLabels, data: linkData } = aggregateData(
        events,
        e => e.type === 'link_click',
        event => event.linkType || 'Unknown', // Use linkType, provide fallback
        key => key.replace(/_/g, ' ').replace('link', '').trim().toUpperCase(),
        10
    );
    renderChart('linkTypesChart', 'doughnut', {
        labels: linkLabels,
        datasets: [{
            label: 'Link Types',
            data: linkData,
            backgroundColor: colors.slice(2),
            hoverOffset: 4
        }]
    }, { plugins: { legend: { position: 'bottom' } } }); // Moved legend

    // 4. Modal Opens
     const { labels: modalLabels, data: modalData } = aggregateData(
         events,
         e => e.type === 'modal_open',
         event => event.modalType || event.modalId || 'Unknown', // Better key extraction
         key => key.replace(/_/g, ' ').replace('modal', '').trim().toUpperCase(),
         10
     );
    renderChart('modalOpensChart', 'pie', {
        labels: modalLabels,
        datasets: [{
            label: 'Modal Opens',
            data: modalData,
            backgroundColor: colors.slice(1).reverse(),
            hoverOffset: 4
        }]
    }, { plugins: { legend: { position: 'bottom' } } }); // Moved legend

    // 5. NEW: Event Types Distribution
    const { labels: eventTypeLabels, data: eventTypeData } = aggregateData(
         events,
         e => true, // Include all events
         event => event.type || 'Unknown Type', // Key: event type
         key => key.replace(/_/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '), // Prettify labels
         12 // Show more types
     );
    renderChart('eventTypesChart', 'bar', {
        labels: eventTypeLabels,
        datasets: [{
            label: 'Event Count',
            data: eventTypeData,
            backgroundColor: colors[4],
        }]
    }, { scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: {} }, indexAxis: 'y', plugins: { legend: { display: false } } });


    // 6. NEW: Screen Width Distribution (if screenWidth is available)
    const { labels: screenWidthLabels, data: screenWidthData } = aggregateData(
         events,
         // Only include events that *have* screenWidth (likely pageviews or initial loads)
         event => event.screenWidth !== null && event.screenWidth !== undefined && event.screenWidth > 0,
         event => {
            // Group into common breakpoints
            const width = parseInt(event.screenWidth, 10);
            if (width <= 480) return '<= 480px (Mobile)';
            if (width <= 768) return '481-768px (Tablet)';
            if (width <= 1024) return '769-1024px (Small Laptop)';
            if (width <= 1440) return '1025-1440px (Laptop/Desktop)';
            return '> 1440px (Large Desktop)';
         },
         null, // Label is already descriptive
         8 // Limit categories
     );
     // Only render if we have data
     if (screenWidthLabels.length > 0) {
        renderChart('screenWidthChart', 'doughnut', {
            labels: screenWidthLabels,
            datasets: [{
                label: 'Screen Widths',
                data: screenWidthData,
                backgroundColor: colors.slice(3), // Use different colors
                hoverOffset: 4
            }]
        }, { plugins: { legend: { position: 'bottom' } } });
     } else {
         // Optionally display a message if no screen width data
         const canvas = document.getElementById('screenWidthChart');
         if(canvas) {
             const ctx = canvas.getContext('2d');
             ctx.font = '16px Arial';
             ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--secondary-text').trim(); // Use theme color
             ctx.textAlign = 'center';
             ctx.fillText('No screen width data available.', canvas.width / 2, canvas.height / 2);
         }
     }
}

// Generic Chart Rendering Function (Modified for theme defaults)
function renderChart(canvasId, type, data, options = {}) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) { console.error(`Canvas element with ID "${canvasId}" not found.`); return; }
    const ctx = canvas.getContext('2d');
    if (!ctx) { console.error(`Failed to get 2D context for canvas "${canvasId}".`); return; }

    // Apply current theme defaults to options before creating chart
    // Note: Chart.js v3+ might automatically pick up some defaults set globally
    const themeOptions = {
        // scales: { // Example if specific scale colors are needed per theme
        //     x: { grid: { color: Chart.defaults.borderColor }, ticks: { color: Chart.defaults.color } },
        //     y: { grid: { color: Chart.defaults.borderColor }, ticks: { color: Chart.defaults.color } }
        // },
        // plugins: { // Example for legend
        //     legend: { labels: { color: Chart.defaults.color } }
        // }
    };

    const defaultOptions = { responsive: true, maintainAspectRatio: false };

    // Merge options: defaults < theme adjustments < specific options passed in
    const mergedOptions = { ...defaultOptions, ...themeOptions, ...options };

    // Ensure nested options are merged correctly (e.g., scales, plugins)
    if (options.scales) mergedOptions.scales = { ...(themeOptions.scales || {}), ...options.scales };
    if (options.plugins) mergedOptions.plugins = { ...(themeOptions.plugins || {}), ...options.plugins };


    chartInstances[canvasId] = new Chart(ctx, {
        type,
        data,
        options: mergedOptions
    });
}
