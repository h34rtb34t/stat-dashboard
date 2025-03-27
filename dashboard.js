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
const uniqueDaysEl = document.querySelector('#uniqueDaysBox .value');

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

// Existing helper functions remain the same as in the original dashboard.js

// Theme Toggle Functionality
function initThemeToggle() {
    const themeToggle = document.createElement('button');
    themeToggle.id = 'themeToggle';
    themeToggle.textContent = '🌓 Toggle Theme';
    document.body.appendChild(themeToggle);

    // Check for saved theme preference or default to light
    const savedTheme = localStorage.getItem('portfolio-dashboard-theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-theme');
    }

    themeToggle.addEventListener('click', () => {
        document.body.classList.toggle('dark-theme');
        
        // Save preference
        const isDarkMode = document.body.classList.contains('dark-theme');
        localStorage.setItem('portfolio-dashboard-theme', isDarkMode ? 'dark' : 'light');

        // Recreate charts with updated theme colors
        if (typeof renderCharts !== 'undefined' && window.lastFetchedEvents) {
            destroyCharts();
            renderCharts(window.lastFetchedEvents);
        }
    });
}

// Call theme toggle initialization when script loads
document.addEventListener('DOMContentLoaded', initThemeToggle);

// Modify renderCharts to store last fetched events
function renderCharts(events) {
    // Store events globally for potential theme-based re-rendering
    window.lastFetchedEvents = events;

    // Original renderCharts logic remains exactly the same
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
    }, { scales: { x: { type: 'time', time: { unit: 'day', tooltipFormat: 'PP' } }, y: { beginAtZero: true, suggestedMax: Math.max(...Object.values(viewsByDate), 0) + 3 } } });

    // Rest of the renderCharts function remains exactly the same as in the original dashboard.js
    // ... (keep the rest of the existing renderCharts code)
}
