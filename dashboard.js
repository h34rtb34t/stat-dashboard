// --- START OF FILE script.js (Integrated Tracker) ---

// ----------------------------------------------------------------------- //
// --- NEW Portfolio Analytics Tracker (Based on tracker.js example) ---   //
// ----------------------------------------------------------------------- //
(function() {
    // --- Configuration ---
    // IMPORTANT: Replace with the URL of your DEPLOYED logging-worker
    const LOGGING_WORKER_URL = 'https://YOUR_LOGGING_WORKER_SUBDOMAIN.YOUR_WORKERS_DOMAIN.workers.dev/log'; // <<<<<------ SET THIS ******
    // Optional: Add a simple secret if you want basic verification on the logging worker
    // const TRACKING_SECRET = 'your_optional_simple_secret';

    // Debounce function (optional - keep if you think you might need it later)
    function debounce(func, wait) { /* ... (keep debounce function code) ... */ }

    // --- Core Event Sending Function ---
    function sendEvent(eventType, eventDetails = {}) {
        if (!LOGGING_WORKER_URL || LOGGING_WORKER_URL.includes('YOUR_LOGGING_WORKER_SUBDOMAIN')) { // Added check for placeholder
            console.warn("Logging worker URL not configured correctly in script.js. Tracking disabled.", LOGGING_WORKER_URL);
            return;
        }

        // Add projectId/context from details if missing at top level (for consistency in KV)
        const detailsProjectId = eventDetails.projectId || eventDetails.context || eventDetails.trackId || null;

        const payload = {
            type: eventType,
            timestamp: new Date().toISOString(), // Client-side timestamp
            page: window.location.href, // Use full URL
            screenWidth: window.innerWidth, // Use innerWidth (more common for layout)
            screenHeight: window.innerHeight,
            referrer: document.referrer, // Where the user came from
            projectId: detailsProjectId, // Hoist projectId/context if available in details
            details: eventDetails // Keep the full details object
        };

        const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });

        try {
            // Optional: Add secret header if using one
            // if (TRACKING_SECRET) {
            //    navigator.sendBeacon(LOGGING_WORKER_URL, blob, { 'X-Tracking-Secret': TRACKING_SECRET });
            // } else {
               navigator.sendBeacon(LOGGING_WORKER_URL, blob); // Use sendBeacon for reliability
            // }
            // console.log('Beacon sent:', payload.type, payload.projectId || '', payload.details.targetElement || '', payload.details.href || ''); // Debugging
        } catch (error) {
            console.error('Error sending tracking beacon:', error);
            // Fallback or alternative logging method if needed
            fetch(LOGGING_WORKER_URL, { method: 'POST', body: JSON.stringify(payload), headers: {'Content-Type': 'application/json'}, keepalive: true })
             .catch(fetchErr => console.error('Tracking fetch fallback error:', fetchErr));
        }
    }

    // --- Event Listeners ---

    // 1. Page View Tracking
    // Send immediately on script load (approximates page view)
    // No need for DOMContentLoaded here, as it runs when the script file loads
    sendEvent('pageview');

    // 2. Click Tracking (using event delegation)
    // This will capture ALL clicks on the body and analyze the target
    document.body.addEventListener('click', function(event) {
        const element = event.target;

        // --- Element Identification ---
        // Find the nearest relevant interactive ancestor
        const link = element.closest('a');
        const button = element.closest('button');
        // Add specific identifiable elements if needed (e.g., project cards)
        const projectCard = element.closest('.project-card');
        const trackedElement = element.closest('[data-track-id]'); // Explicit tracking points
        const publicationItemLink = element.closest('.publication-item a'); // Specific handling for these links
        const projectImage = element.closest('.project-image[data-project-id]'); // Specific image clicks
        const projectTitle = element.closest('.project-info h3[data-project-id]'); // Specific title clicks
        const themeToggle = element.closest('#theme-toggle-btn, #theme-toggle-btn-mobile'); // Theme toggles
        const scrollToTop = element.closest('#scrollToTopBtn'); // Scroll to top
        const hamburger = element.closest('#hamburger-menu'); // Hamburger toggle
        const mobileNavLink = element.closest('.mobile-nav-panel a.mobile-nav-link'); // Links inside mobile nav
        const modalCloseBtn = element.closest('[data-close-modal]'); // Modal close buttons

        // --- Determine Context (e.g., Project ID) ---
        let contextProjectId = null;
        if (projectCard) {
            const cardTitle = projectCard.querySelector('h3[data-project-id]');
            if (cardTitle) contextProjectId = cardTitle.getAttribute('data-project-id');
        } else if (trackedElement) {
            contextProjectId = trackedElement.getAttribute('data-project-id') || trackedElement.getAttribute('data-context') || contextProjectId;
        } else if (projectImage) {
            contextProjectId = projectImage.getAttribute('data-project-id');
        } else if (projectTitle) {
             contextProjectId = projectTitle.getAttribute('data-project-id');
        }
        // Note: contextProjectId might still be null here if the click wasn't within a project context

        // --- Event Type and Details Logic ---
        let eventType = 'generic_click'; // Default if nothing specific matches
        let details = {
            targetElement: element.tagName,
            targetId: element.id || null,
            targetClasses: element.className || null,
            // Add contextProjectId if found
            ...(contextProjectId && { projectId: contextProjectId })
        };
        let shouldTrack = true; // Flag to decide if this generic click tracker should log the event

        // --- Handle Specific Click Cases FIRST (to avoid double-tracking) ---
        // These cases are likely handled by MORE SPECIFIC listeners elsewhere in the code
        // OR we want to assign a VERY specific event type here.

        if (projectImage) {
            // Handled by the specific project image click listener below if it's opening slideshow
            // We could track a basic image click here if needed, but let's rely on the modal/slideshow tracking
            shouldTrack = false; // Don't track generically, rely on dedicated handler
        } else if (projectTitle) {
            // Handled by the specific project title click listener below
            shouldTrack = false; // Don't track generically, rely on dedicated handler
        } else if (publicationItemLink) {
            // Handled by the specific publication link listener below
             shouldTrack = false; // Don't track generically, rely on dedicated handler
        } else if (themeToggle || scrollToTop || hamburger || mobileNavLink || modalCloseBtn) {
             // These have dedicated tracking calls within their specific handlers below
             shouldTrack = false;
        } else if (link) {
            // This is a link click NOT handled by the specific cases above
            details.href = link.getAttribute('href'); // Use getAttribute to get the raw value
            details.linkText = link.textContent?.trim().substring(0, 100); // Limit text length

            if (details.href) {
                if (details.href.startsWith('#')) {
                    eventType = 'anchor_click';
                    details.linkType = 'anchor';
                    // Note: If it's the publications link, it will be handled by specific listeners below
                    if (link.id === 'publications-link' || link.id === 'publications-link-mobile') {
                        shouldTrack = false; // Prevent double tracking
                    }
                } else {
                    eventType = 'link_click'; // External or internal page link
                    if (link.hostname === window.location.hostname || details.href.startsWith('/')) {
                         details.linkType = 'internal';
                    } else {
                         details.linkType = 'external';
                    }
                    // Add more specific link types based on your old logic if needed
                    if (link.closest('.project-links')) details.linkTypeDetail = 'project_link';
                    if (link.closest('.social-links') || link.closest('.contact-links a[href*="linkedin"]') || link.closest('.contact-links a[href*="github"]')) details.linkTypeDetail = 'social_contact_link';
                    // etc...
                }
            } else {
                 eventType = 'link_click'; // Link without href
                 details.linkType = 'nohref';
            }
            // If contextProjectId was found earlier, it's already in details
             if (!details.projectId && trackedElement) { // Add trackId if link is inside a tracked element
                 details.trackId = trackedElement.getAttribute('data-track-id');
             }

        } else if (button) {
            // A button was clicked that isn't handled by specific cases
            eventType = 'button_click';
            details.buttonText = button.textContent?.trim().substring(0, 100);
            details.buttonId = button.id || null;
            details.buttonClasses = button.className || null;
             // If contextProjectId was found earlier, it's already in details
             if (!details.projectId && trackedElement) { // Add trackId if button is inside a tracked element
                 details.trackId = trackedElement.getAttribute('data-track-id');
             }

        } else if (trackedElement) {
            // Clicked directly on or inside an element with data-track-id, but wasn't a link/button/handled case
            eventType = trackedElement.getAttribute('data-track-event-type') || 'tracked_element_click'; // Allow custom event type
            details.trackId = trackedElement.getAttribute('data-track-id');
            // projectId/context should already be in details if found via context logic above
        }
        // --- Add more specific 'else if' cases here if needed ---


        // --- Send the Event (if not handled specifically elsewhere) ---
        if (shouldTrack) {
            sendEvent(eventType, details);
        }

    }, true); // Use CAPTURE phase (true) to catch clicks early if needed, but false (bubbling) is usually fine.

    // --- Public API ---
    // Expose functions to be called from the rest of your script
    window.portfolioTracker = {
        trackEvent: sendEvent, // General purpose tracking
        // Specific helpers matching the old tracker.js example
        trackModalOpen: (modalId, context = {}) => {
            // Ensure context is an object, extract relevant fields
            let detail = context.detail || context.pdfPath || (context.projectId ? `Project: ${context.projectId}` : '');
            let projectId = context.projectId || null;
            if (!projectId && typeof context.context === 'string' && context.context.length > 0) {
                 projectId = context.context; // Use context.context if projectId missing
            }

            sendEvent('modal_open', { modalId: modalId, detail: String(detail).substring(0,150), projectId: projectId });
        },
        trackImageView: (imageSrc, context = {}) => {
             // Ensure context is an object
             let projectId = context.projectId || null;
              if (!projectId && typeof context.context === 'string' && context.context.length > 0) {
                  projectId = context.context; // Use context.context if projectId missing
              }

             sendEvent('image_view', {
                 imageSrc: String(imageSrc).substring(0, 200), // Limit src length
                 slide: context.slide || null,
                 totalSlides: context.totalSlides || null,
                 projectId: projectId
                });
        }
        // Add other specific tracking functions if needed (e.g., trackFormSubmit)
    };

    console.log("Portfolio tracker initialized.");

})(); // End of Tracker IIFE

// ----------------------------------------------------------------------- //
// --- MAIN SCRIPT CONTENT STARTS HERE ---                                 //
// ----------------------------------------------------------------------- //

document.addEventListener('DOMContentLoaded', function() {

    // --- START: Theme Toggle Logic ---
    // ... (Keep your existing theme toggle code) ...
    // --- MODIFY handleToggleClick to use new tracker ---
    const handleToggleClick = () => {
        const currentThemeIsLight = body.classList.contains('light-theme');
        const newTheme = currentThemeIsLight ? 'dark' : 'light';
        applyTheme(newTheme);
        // --- Use new tracker ---
        if (window.portfolioTracker) {
             window.portfolioTracker.trackEvent('theme_change', { theme: newTheme });
        }
        // --- End Use new tracker ---
    };
    // ... (Rest of theme toggle code: applyTheme, updateButtonState, listeners etc.) ...
    // --- END: Theme Toggle Logic ---


    // --- Elements ---
    // ... (Keep your existing element selections) ...

    // --- Slideshow Data ---
    // ... (Keep your existing slideshowData) ...

    // --- Publications Data ---
    // ... (Keep your existing publicationsData) ...

    // --- Utility ---
    // ... (Keep your existing isElementInViewport) ...

    // --- Intersection Observer ---
    // ... (Keep your existing observer setup) ...

    // --- Modal Functions ---
    // --- MODIFY openModal to use new tracker ---
    function openModal(modalElement, contextData = {}) {
         if (!modalElement) return;

         // --- Track Modal Open (using new tracker helper) ---
         if (window.portfolioTracker) {
            // Prepare context for the tracker function
            let trackerContext = {};
            let modalId = modalElement.id || 'unknown_modal';

             // Extract project ID or other relevant context
             if (contextData.projectId) trackerContext.projectId = contextData.projectId;
             else if (contextData.pdfPath) trackerContext.detail = contextData.pdfPath; // Use pdfPath as detail if no projectId

            // Refine detail based on modal type AFTER basic context is set
             if (modalId === 'imageModal' && currentProjectData) {
                 trackerContext.detail = currentProjectData.prefix;
                 trackerContext.projectId = trackerContext.projectId || currentProjectData.prefix.replace(/[.\/]/g, ''); // Add projectId if missing
             } else if (modalId === 'pdfModal') {
                 trackerContext.detail = currentPdfOriginalPath || pdfViewer.src; // Prefer original path
                  trackerContext.projectId = trackerContext.projectId || (currentPdfOriginalPath ? currentPdfOriginalPath.split('/').pop() : ''); // Add filename as context if missing
             } else if (modalId === 'descriptionModal') {
                  trackerContext.detail = modalDescTitle ? modalDescTitle.textContent : '';
                 // projectId should already be in trackerContext if passed via contextData
             } else if (modalId === 'publicationsModal'){
                 trackerContext.detail = 'Publication List';
             }

             window.portfolioTracker.trackModalOpen(modalId, trackerContext);
         }
         // --- End Tracking ---

         // ... (Rest of your existing openModal logic: add class, focus, etc.) ...
    }
    // --- Keep closeModal as is (no tracking needed on close typically) ---
    function closeModal(modalElement) { /* ... keep existing ... */ }

    // --- Slideshow Functions ---
    // --- MODIFY showSlide to use new tracker ---
    function showSlide(slideNumber) {
         if (!currentProjectData || !slideImage || !slideCounter || !prevBtn || !nextBtn) return;
         // ... (Keep existing slide update logic: currentSlide, imageUrl, alt, counter, buttons, rotation) ...
         const imageUrl = `${currentProjectData.prefix}${currentSlide}.${currentProjectData.extension}`;
         slideImage.src = imageUrl;
         slideImage.alt = `Project image ${currentSlide} of ${currentProjectData.totalSlides}`;
          if (currentProjectData.totalSlides === 1) { /* hide controls */ } else { /* show controls */ }
          const rotation = currentProjectData.rotations?.[currentSlide] ?? 0;
          slideImage.style.transform = `rotate(${rotation}deg)`;


         // --- Track Image View (using new tracker helper) ---
         if (imageModal.classList.contains('show') && window.portfolioTracker) {
             window.portfolioTracker.trackImageView(imageUrl, {
                 // Pass context clearly
                 projectId: currentProjectData.prefix.replace(/[.\/]/g, ''),
                 slide: currentSlide,
                 totalSlides: currentProjectData.totalSlides
             });
         }
         // --- End Tracking ---
    }
    function nextSlide() { /* ... keep existing ... */ }
    function prevSlide() { /* ... keep existing ... */ }


    // --- Event Listeners ---
    // ... (Keep close button and overlay listeners) ...

    // *** Project Image Click Handler (for Slideshow ONLY) ***
    // --- MODIFY to use new tracker ---
    document.querySelectorAll('.project-image[data-project-id]').forEach(element => {
         element.addEventListener('click', function(event) {
            const projectId = this.getAttribute('data-project-id');
            if (!projectId || !slideshowData[projectId]) return;

             // --- Track Project Click Intent (Image for Slideshow) ---
             if (window.portfolioTracker) {
                 window.portfolioTracker.trackEvent('project_click', { // Use a consistent 'project_click' type maybe?
                    element: 'image',
                    projectId: projectId,
                    action: 'open_slideshow'
                 });
             }
             // --- End Tracking ---

            // Open Slideshow Modal (calls openModal, which tracks modal open)
             if (imageModal) {
                 currentProjectData = slideshowData[projectId];
                 showSlide(1); // Shows first slide (tracks image view if modal is shown)
                 openModal(imageModal, { projectId: projectId }); // Tracks modal open
            } else { /* console error */ }
         });
    });
    // *** END Project Image Click Handler ***


    // *** Project Title Click Handler (for Description Modal / Specific PDFs) ***
    // --- MODIFY to use new tracker ---
    document.querySelectorAll('.project-info h3[data-project-id]').forEach(title => {
        const projectId = title.getAttribute('data-project-id');
        // ... (Keep element finding logic: projectCard, descriptionDiv, imageElement) ...

        title.addEventListener('click', function(event) {
            // --- Track Project Click Intent (Title) ---
             if (window.portfolioTracker) {
                 window.portfolioTracker.trackEvent('project_click', { // Consistent event type
                     element: 'title',
                     projectId: projectId
                 });
             }
            // --- End Tracking ---

            let pdfPath = null;
            let pdfContext = { projectId: projectId };

            // --- Special Case PDFs (Uncomment and adjust if needed) ---
            // if (projectId === 'physiball') { pdfPath = ...; }
            // else if (projectId === 'drake-music-project') { pdfPath = ...; }

            // --- Action: Open PDF Modal ---
            if (pdfPath) {
                event.preventDefault();
                if (!pdfModal || !pdfViewer) { /* console error */ return; }
                currentPdfOriginalPath = pdfPath;

                // PDF Fetch and Blob logic (keep existing)
                fetch(pdfPath)
                    .then(response => { /* check ok */ return response.blob(); })
                    .then(blob => {
                        currentPdfBlobUrl = URL.createObjectURL(blob);
                        pdfViewer.src = currentPdfBlobUrl + "#toolbar=0&navpanes=0";
                        // openModal tracks the pdf modal open here
                        openModal(pdfModal, pdfContext); // Pass context
                    }).catch(err => {
                        console.error("PDF Blob Error:", err);
                        pdfViewer.src = pdfPath; // Fallback
                        openModal(pdfModal, pdfContext);
                    });
                return;
            }

            // --- Default Case: Open Description Modal ---
            const descriptionDiv = this.closest('.project-card')?.querySelector('.description');
            const imageElement = this.closest('.project-card')?.querySelector('.project-image img');
            if (descriptionDiv && imageElement && descriptionModal && modalDescImage && modalDescTitle && modalDescText) {
                 event.preventDefault();
                // ... (Keep description modal population logic) ...
                 modalDescTitle.textContent = this.textContent;
                 modalDescImage.src = imageElement.src;
                 modalDescImage.alt = imageElement.alt || this.textContent;
                 modalDescText.innerHTML = descriptionDiv.innerHTML;

                // Open the description modal (openModal tracks the modal open)
                openModal(descriptionModal, { projectId: projectId }); // Pass context
            } else {
                 console.warn(`Clicked title for '${projectId}', but required elements missing.`);
            }
        });
    });
    // *** END Project Title Click Handler ***


    // ... (Keep Slideshow Navigation Buttons listener) ...
    // ... (Keep Keyboard Navigation listener) ...


    // --- Hamburger Menu Logic ---
    // --- MODIFY to use new tracker ---
     if (hamburgerMenu && mobileNavPanel) {
         hamburgerMenu.addEventListener('click', () => {
             const isActive = hamburgerMenu.classList.toggle('active');
             mobileNavPanel.classList.toggle('active');
             document.body.style.overflow = isActive ? 'hidden' : '';
             // Track menu toggle
              if (window.portfolioTracker) {
                 window.portfolioTracker.trackEvent('mobile_menu_toggle', { state: isActive ? 'open' : 'close' });
              }
         });
     }
     // --- MODIFY Mobile Nav Link Click ---
     document.querySelectorAll('.mobile-nav-panel a.mobile-nav-link').forEach(link => {
         link.addEventListener('click', (e) => {
            const href = link.getAttribute('href');
             // Close menu logic (keep existing)
             if(hamburgerMenu && hamburgerMenu.classList.contains('active')) {
                 hamburgerMenu.classList.remove('active');
                 if(mobileNavPanel) mobileNavPanel.classList.remove('active');
                 document.body.style.overflow = '';
                  // Track menu close via link click
                 if (window.portfolioTracker) {
                      window.portfolioTracker.trackEvent('mobile_menu_toggle', { state: 'close', trigger: 'link_click', targetHref: href });
                 }
             }

             // Handle specific actions
             if (link.id === 'publications-link-mobile') {
                  e.preventDefault();
                  openPublicationsModal(); // This calls openModal, which handles tracking
             } else if (href && href.startsWith('#')) {
                 // Anchor link - generic click tracker should have caught this if 'shouldTrack' remained true
                 // No specific tracking needed here unless you want to override generic 'anchor_click'
             } else {
                 // Other mobile links (e.g., external) - generic link tracker should handle these
             }
         });
     });
    // --- END Hamburger Menu Logic ---


    // --- Publications Modal ---
    // --- MODIFY Publication Link Click ---
    function populatePublications() {
         if (!publicationsGrid) return;
         publicationsGrid.innerHTML = '';
         if (publicationsData.length === 0) { /* empty message */ return; }
         publicationsData.forEach(pub => {
             // ... (Keep item and link creation) ...
             const item = document.createElement('div'); item.classList.add('publication-item');
             const link = document.createElement('a'); link.href = pub.filePath; link.textContent = pub.title; link.rel = 'noopener noreferrer';

             link.addEventListener('click', (e) => {
                 e.preventDefault();
                 if (!pdfModal || !pdfViewer) { /* console error */ return; }
                 const pdfPath = link.getAttribute('href');
                 currentPdfOriginalPath = pdfPath;

                 // Track click intent for this specific publication link
                 if (window.portfolioTracker) {
                     window.portfolioTracker.trackEvent('publication_click', { title: pub.title, path: pdfPath });
                 }

                 // ... (Keep PDF Fetch and Blob logic) ...
                 fetch(pdfPath)
                     .then(response => { /* check ok */ return response.blob(); })
                     .then(blob => {
                         currentPdfBlobUrl = URL.createObjectURL(blob);
                         pdfViewer.src = currentPdfBlobUrl + "#toolbar=0&navpanes=0";
                         closeModal(publicationsModal); // Close pub list first
                         // openModal tracks the pdf modal open
                         setTimeout(() => openModal(pdfModal, { pdfPath: pdfPath }), 50);
                     }).catch(err => { /* handle error, fallback, openModal */ });
             });
             item.appendChild(link);
             publicationsGrid.appendChild(item);
         });
    }
    // openPublicationsModal calls openModal, which tracks the modal open
    function openPublicationsModal() { /* ... keep existing, calls openModal ... */ }
    // Desktop Publications Link Listener (keep existing, calls openPublicationsModal)
    if (publicationsLink) { /* ... keep existing ... */ }
    // --- END Publications Modal ---


    // --- Scroll to Top Button ---
    // --- MODIFY click listener to use new tracker ---
    if (scrollToTopBtn) {
        window.addEventListener('scroll', () => { /* toggle visibility */ }, { passive: true });
        scrollToTopBtn.addEventListener('click', () => {
             // Track the click event
             if (window.portfolioTracker) {
                 window.portfolioTracker.trackEvent('scroll_to_top');
             }
             window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }
    // --- END Scroll to Top Button ---


    // ... (Keep Footer Year) ...
    // ... (Keep Image Protection) ...
    // ... (Keep Feedback Slider Logic - no tracking added here, but could track hover/interaction if desired) ...

    console.log('Portfolio script fully initialized.');

}); // End DOMContentLoaded

// --- END OF FILE script.js (Integrated Tracker) ---
