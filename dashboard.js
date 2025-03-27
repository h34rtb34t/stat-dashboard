// --- Configuration ---
// PASTE THE URL FOR YOUR *RETRIEVAL* WORKER (patient-mode-9cfb...) HERE:
const RETRIEVAL_WORKER_URL = 'https://patient-mode-9cfb.azelbane87.workers.dev'; // <-- IMPORTANT: Set your URL here

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
const scrollToTopBtn = document.getElementById("scrollToTopBtn"); // Scroll button

// --- Chart Instances ---
let chartInstances = {}; // Store chart instances by canvas ID

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

// Apply saved theme and set up listeners on load
document.addEventListener('DOMContentLoaded', () => {
    // Apply initial theme
    const savedTheme = localStorage.getItem('dashboardTheme') || 'light'; // Default to light
    applyTheme(savedTheme); // Apply theme *before* rendering charts if possible

    // Event Listeners
    fetchDataBtn.addEventListener('click', fetchData);
    secretTokenInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            fetchData();
        }
    });
    themeToggleBtn.addEventListener('click', toggleTheme); // Listener for theme toggle
    // Scroll listener for the "Scroll to Top" button
    window.addEventListener('scroll', handleScroll);
    // Click listener for the "Scroll to Top" button
    scrollToTopBtn.addEventListener('click', goToTop);

    // Initial check for scroll position in case the page loads scrolled down
    handleScroll();
});


// --- Core Function (Unchanged Core Logic) ---
async function fetchData() {
    const secretToken = secretTokenInput.value.trim();
    if (!secretToken) {
        statusEl.textContent = 'Please enter the Auth Token.';
        return;
    }
    if (!RETRIEVAL_WORKER_URL || RETRIEVAL_WORKER_URL === 'YOUR_COPIED_RETRIEVAL_WORKER_URL') { // Safety check
         statusEl.textContent = 'ERROR: Retrieval Worker URL not configured in dashboard.js';
         console.error('ERROR: Retrieval Worker URL not configured in dashboard.js');
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
        // NB: Display raw events *after* rendering charts if chart functions need original data fields
        renderCharts(rawEvents); // Render all charts (now includes new ones)
        displayRawEvents(rawEvents); // Raw data display function (modified slightly for screenWidth usage)
        calculateAndDisplaySummary(rawEvents); // Unchanged


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
     const sortedEvents = [...events].sort((a, b) => new Date(b.receivedAt || 0) - new Date(a.receivedAt || 0));

     // Clear existing rows first
     rawEventsTbody.innerHTML = '';

     sortedEvents.forEach(event => {
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
     const uniqueDays = new Set(pageViews.map(e => {
         try {
             return new Date(e.receivedAt || e.timestamp).toLocaleDateString();
         } catch (err) { return null; } // Handle potential invalid dates
     }).filter(d => d !== null)); // Filter out invalid dates
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

    // Define chart colors - use the fallback array for direct assignment
    const colors = CHART_COLORS_FALLBACK;

    // 1. Page Views Over Time (Grouped by Day)
    const viewsByDate = events
        .filter(e => e.type === 'pageview')
        .reduce((acc, event) => {
            try {
                const date = new Date(event.receivedAt || event.timestamp).toISOString().split('T')[0]; // Get YYYY-MM-DD
                acc[date] = (acc[date] || 0) + 1;
            } catch(e) { /* Ignore invalid date events */ }
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
         e => e.projectId || e.context || 'Unknown Project', // Provide fallback
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
    }, { scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: {} }, indexAxis: 'y', plugins: { legend: { display: false }, tooltip: { displayColors: false } } });


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
    }, { plugins: { legend: { position: 'bottom', labels: { color: Chart.defaults.color } } } }); // Added label color


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
    }, { plugins: { legend: { position: 'bottom', labels: { color: Chart.defaults.color } } } }); // Added label color


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
    const screenWidthCanvas = document.getElementById('screenWidthChart');
    const screenWidthCtx = screenWidthCanvas?.getContext('2d');

    if (screenWidthCtx) { // Only proceed if canvas exists
        // Clear previous drawing/message
        screenWidthCtx.clearRect(0, 0, screenWidthCanvas.width, screenWidthCanvas.height);

        const { labels: screenWidthLabels, data: screenWidthData } = aggregateData(
             events,
             event => event.screenWidth !== null && event.screenWidth !== undefined && !isNaN(parseInt(event.screenWidth, 10)) && parseInt(event.screenWidth, 10) > 0, // More robust check
             event => {
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
            }, { plugins: { legend: { position: 'bottom', labels: { color: Chart.defaults.color } } } }); // Added label color
         } else {
             // Display a message if no screen width data
             screenWidthCtx.font = '16px Arial';
             screenWidthCtx.fillStyle = getComputedStyle(document.body).getPropertyValue('--secondary-text').trim(); // Use theme color
             screenWidthCtx.textAlign = 'center';
             screenWidthCtx.fillText('No screen width data available.', screenWidthCanvas.width / 2, screenWidthCanvas.height / 2);
         }
     } else {
        console.error('Canvas element with ID "screenWidthChart" not found.');
     }
}

// Generic Chart Rendering Function (Modified for theme defaults)
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

    // Merge options: defaults < base theme options < specific options passed in
    const mergedOptions = mergeDeep(mergeDeep({ ...defaultOptions }, baseOptions), options);

    // Destroy existing chart on this canvas before creating new one
    if (chartInstances[canvasId]) {
        chartInstances[canvasId].destroy();
    }

    chartInstances[canvasId] = new Chart(ctx, {
        type,
        data,
        options: mergedOptions
    });
}
