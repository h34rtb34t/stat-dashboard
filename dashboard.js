// --- Configuration ---
// ... (existing config) ...

// --- DOM Elements ---
// ... (existing elements) ...
const scrollToTopBtn = document.getElementById("scrollToTopBtn"); // Scroll button

// --- Chart Instances ---
// ... (existing) ...

// --- Theme Handling ---
// ... (existing theme functions) ...

// --- Event Listeners ---
// ... (existing listeners) ...
// Scroll listener for the "Scroll to Top" button
window.addEventListener('scroll', handleScroll);
// Click listener for the "Scroll to Top" button
scrollToTopBtn.addEventListener('click', goToTop);

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
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// --- Core Function (Unchanged Core Logic) ---
// ... (existing fetchData function) ...

// --- Helper Functions ---
// ... (existing helper functions) ...

// Apply saved theme on load (This listener might need to be moved *outside* the DOMContentLoaded if handleScroll relies on elements loaded later, but usually it's fine here)
document.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('dashboardTheme') || 'light'; // Default to light
    applyTheme(savedTheme);
    // Initial check in case the page loads already scrolled down
    handleScroll();
});
