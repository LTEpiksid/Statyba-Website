// ui-utils.js

// Global variables for notification modal
let notificationModal = null;
let notificationTitle = null;
let notificationMessage = null;
let notificationCloseBtn = null;

// Global variables for custom confirmation modal
let confirmModal = null;
let confirmTitle = null;
let confirmMessage = null;
let confirmOkBtn = null;
let confirmCancelBtn = null;

/**
 * Injects the notification modal HTML into the DOM and initializes its elements.
 * This is called automatically when the module loads.
 */
function setupNotificationModal() {
    if (!document.getElementById('global-notification-modal')) {
        const modalHtml = `
            <!-- Global Notification Modal -->
            <div id="global-notification-modal" class="fixed inset-0 bg-black bg-opacity-50 z-[9999] flex items-center justify-center p-4 hidden" role="dialog" aria-modal="true" aria-labelledby="global-notification-title">
                <div class="bg-white rounded-2xl max-w-sm w-full p-6 text-center shadow-xl">
                    <h3 id="global-notification-title" class="text-2xl font-bold mb-4"></h3>
                    <p id="global-notification-message" class="text-gray-600 mb-6"></p>
                    <button id="global-notification-close-btn" class="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded-lg transition-colors">
                        Close
                    </button>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    notificationModal = document.getElementById('global-notification-modal');
    notificationTitle = document.getElementById('global-notification-title');
    notificationMessage = document.getElementById('global-notification-message');
    notificationCloseBtn = document.getElementById('global-notification-close-btn');

    if (notificationCloseBtn && !notificationCloseBtn.dataset.listenerAttached) {
        notificationCloseBtn.addEventListener('click', hideNotification);
        notificationCloseBtn.dataset.listenerAttached = 'true'; // Prevent multiple listeners
    }
}

/**
 * Injects the confirmation modal HTML into the DOM and initializes its elements.
 * This is called automatically when the module loads.
 */
function setupConfirmationModal() {
    if (!document.getElementById('global-confirm-modal')) {
        const modalHtml = `
            <!-- Global Confirmation Modal -->
            <div id="global-confirm-modal" class="fixed inset-0 bg-black bg-opacity-50 z-[9999] flex items-center justify-center p-4 hidden" role="dialog" aria-modal="true" aria-labelledby="global-confirm-title">
                <div class="bg-white rounded-2xl max-w-sm w-full p-6 text-center shadow-xl">
                    <h3 id="global-confirm-title" class="text-2xl font-bold mb-4"></h3>
                    <p id="global-confirm-message" class="text-gray-600 mb-6"></p>
                    <div class="flex justify-center space-x-4">
                        <button id="global-confirm-cancel-btn" class="bg-gray-200 hover:bg-gray-300 text-gray-800 px-6 py-2 rounded-lg transition-colors">
                            Cancel
                        </button>
                        <button id="global-confirm-ok-btn" class="bg-red-500 hover:bg-red-600 text-white px-6 py-2 rounded-lg transition-colors">
                            Confirm
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    confirmModal = document.getElementById('global-confirm-modal');
    confirmTitle = document.getElementById('global-confirm-title');
    confirmMessage = document.getElementById('global-confirm-message');
    confirmOkBtn = document.getElementById('global-confirm-ok-btn');
    confirmCancelBtn = document.getElementById('global-confirm-cancel-btn');
    // Listeners for these buttons are added dynamically in showConfirmationModal
}


// --- Exported UI Functions ---

/**
 * Displays a notification modal.
 * @param {string} title - The title of the notification.
 * @param {string} message - The message content.
 * @param {'success'|'error'|'info'} type - The type of notification to determine color.
 */
export function showNotification(title, message, type) {
    if (!notificationModal) {
        // Fallback: If not already set up, try to set up now (should ideally be done on module load)
        setupNotificationModal();
        if (!notificationModal) {
            console.error('Failed to initialize notification modal. Cannot show notification.');
            return;
        }
    }

    notificationTitle.textContent = title;
    notificationMessage.textContent = message;

    notificationTitle.classList.remove('text-green-600', 'text-red-600', 'text-blue-600');
    if (type === 'success') {
        notificationTitle.classList.add('text-green-600');
    } else if (type === 'error') {
        notificationTitle.classList.add('text-red-600');
    } else if (type === 'info') {
        notificationTitle.classList.add('text-blue-600');
    }

    notificationModal.classList.remove('hidden');
    if (notificationCloseBtn) {
        notificationCloseBtn.focus();
    }
}

/**
 * Hides the notification modal.
 */
export function hideNotification() {
    if (notificationModal) {
        notificationModal.classList.add('hidden');
    }
}

/**
 * Displays a custom confirmation modal.
 * @param {string} title - The title of the confirmation.
 * @param {string} message - The message content.
 * @param {function} onConfirm - Callback function to execute if confirmed.
 * @param {function} [onCancel] - Optional callback function to execute if cancelled.
 */
export function showConfirmationModal(title, message, onConfirm, onCancel = () => {}) {
    if (!confirmModal) {
        // Fallback: If not already set up, try to set up now
        setupConfirmationModal();
        if (!confirmModal) {
            console.error('Failed to initialize confirmation modal. Cannot show confirmation.');
            return;
        }
    }

    confirmTitle.textContent = title;
    confirmMessage.textContent = message;

    // Clone and replace buttons to remove old event listeners
    const newOkBtn = confirmOkBtn.cloneNode(true);
    confirmOkBtn.parentNode.replaceChild(newOkBtn, confirmOkBtn);
    confirmOkBtn = newOkBtn; 

    const newCancelBtn = confirmCancelBtn.cloneNode(true);
    confirmCancelBtn.parentNode.replaceChild(newCancelBtn, confirmCancelBtn);
    confirmCancelBtn = newCancelBtn; 

    // Attach new listeners
    confirmOkBtn.addEventListener('click', () => {
        onConfirm();
        confirmModal.classList.add('hidden');
    });

    confirmCancelBtn.addEventListener('click', () => {
        onCancel();
        confirmModal.classList.add('hidden');
    });

    confirmModal.classList.remove('hidden');
    confirmOkBtn.focus();
}

// Named function for tab key handling, so we can reference it for removal
let currentTabKeyListener = null; // Store a reference to the active listener

/**
 * Manages focus trapping within a given modal element.
 * @param {HTMLElement} modalElement - The modal element to trap focus within.
 * @param {HTMLElement} initialFocusElement - The element to focus when the modal opens.
 */
export function trapFocus(modalElement, initialFocusElement) {
    const focusableElementsString = 'a[href], area[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), iframe, object, embed, [tabindex="0"], [contenteditable]';
    let focusableElements = Array.from(modalElement.querySelectorAll(focusableElementsString));
    let firstFocusableElement = focusableElements[0];
    let lastFocusableElement = focusableElements[focusableElements.length - 1];

    if (initialFocusElement) {
        initialFocusElement.focus();
    } else if (firstFocusableElement) {
        firstFocusableElement.focus();
    }

    // Define the handler function as a named function within the scope of this module
    const handleTabKey = function(e) {
        const isTabPressed = (e.key === 'Tab' || e.keyCode === 9);

        if (!isTabPressed) {
            return;
        }

        if (e.shiftKey) { // if shift key pressed for shift + tab
            if (document.activeElement === firstFocusableElement) {
                lastFocusableElement.focus(); 
                e.preventDefault();
            }
        } else { // if tab key is pressed
            if (document.activeElement === lastFocusableElement) {
                firstFocusableElement.focus(); 
                e.preventDefault();
            }
        }
    };

    // Store the reference and add the listener
    currentTabKeyListener = handleTabKey;
    modalElement.addEventListener('keydown', currentTabKeyListener);
}

/**
 * Removes focus trapping from a given modal element.
 * Call this when the modal closes.
 * @param {HTMLElement} modalElement - The modal element from which focus trapping was applied.
 * @param {HTMLElement} elementToReturnFocusTo - The element to return focus to after closing.
 */
export function releaseFocus(modalElement, elementToReturnFocusTo) {
    if (currentTabKeyListener) {
        modalElement.removeEventListener('keydown', currentTabKeyListener);
        currentTabKeyListener = null; // Clear the reference
    }
    if (elementToReturnFocusTo) {
        elementToReturnFocusTo.focus();
    }
}

// Call setup functions immediately when the module loads
// This ensures the modal HTML is injected into the DOM as early as possible.
document.addEventListener('DOMContentLoaded', () => {
    setupNotificationModal();
    setupConfirmationModal();
});
