// admin-index-editor.js
// This script will be loaded only by admin.html (formerly admin-index.html),
// specifically for the content editor tab, and will now rely on admin-dashboard.js for login.
import { db, auth, appId, signOut } from './firebase.js';
import { getDoc, setDoc, doc, serverTimestamp } from 'firebase/firestore';
// Removed: signInWithEmailAndPassword, generateCaptchaText, createLoginAttemptManager
import { showNotification, showConfirmationModal, trapFocus, releaseFocus } from './ui-utils.js';

// --- No more Admin Login State Variables here ---
// The login state and CAPTCHA are now managed exclusively by admin-dashboard.js

// --- DOM Elements ---
// Only editor-specific DOM elements are needed here. Login elements are in admin-dashboard.js.
const editorDashboard = document.getElementById('admin-dashboard'); // Main dashboard container
const editorLogoutBtn = document.getElementById('editor-logout-btn'); // Main dashboard logout button (handled by admin-dashboard.js)
const saveAllChangesBtn = document.getElementById('save-all-changes-btn');
const saveAllChangesText = document.getElementById('save-all-changes-text');
const saveAllChangesSpinner = document.getElementById('save-all-changes-spinner');


// --- Global State for Content Editor ---
const changes = {}; // Stores changes before saving { textId: newContent }
let currentEditableElement = null; // Tracks the currently active editable element
let elementThatOpenedModal = null; // To return focus to after modal closes

// --- DOM Elements for Content Editor Modals (initialized later) ---
let editTextModalOverlay;
let editModalCloseBtn;
let editModalCancelBtn;
let editModalSaveBtn;
let editTextArea;
let editModalSpinner;
let editModalSaveText;
let saveChangesPanel;
let saveChangesBtn;
let cancelChangesBtn;
let saveChangesSpinnerPanel;

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    console.log('admin-index-editor.js: DOMContentLoaded fired.');
    // No login/captcha initialization here.
    initializeEditorUI(); // Initialize editor UI elements
    setupLoginPersistence(); // This will now just check auth state and show/hide editor.
});


// --- Auth State and Login Persistence for Editor (simplified) ---
function setupLoginPersistence() {
    auth.onAuthStateChanged(user => {
        if (user) {
            console.log('admin-index-editor.js: User is authenticated. Showing editor dashboard sections.');
            // Only show the editor dashboard if it's currently the active tab
            const contentEditorTab = document.getElementById('content-editor-tab');
            if (contentEditorTab && !contentEditorTab.classList.contains('hidden')) {
                loadEditableContentForEditor();
            }
        } else {
            console.log('admin-index-editor.js: User is not authenticated. Hiding editor dashboard sections.');
            // When not logged in, ensure editor sections are hidden
            editorDashboard.classList.add('hidden'); // The main dashboard itself
            // Also hide the save changes panel
            hideSaveChangesPanel();
        }
    });
}

// --- Content Editor UI Initialization ---
function initializeEditorUI() {
    // Inject the save changes panel if not already present
    saveChangesPanel = document.getElementById('save-changes-panel');
    if (!saveChangesPanel) {
        const uiHtml = `
            <!-- Save Changes Panel -->
            <div id="save-changes-panel" class="fixed bottom-0 left-0 w-full bg-blue-700 text-white p-4 flex items-center justify-center space-x-4 z-[9998] shadow-lg hidden" role="status" aria-live="polite">
                <p class="text-lg font-semibold">You have unsaved changes.</p>
                <button id="save-changes-btn" class="bg-white text-blue-700 px-6 py-2 rounded-full font-bold hover:bg-blue-100 transition-colors duration-200 flex items-center disabled:opacity-50 disabled:cursor-not-allowed">
                    <span id="save-changes-btn-text">Save All</span>
                    <span id="save-changes-spinner" class="spinner ml-2 hidden" aria-label="Saving changes"></span>
                </button>
                <button id="cancel-changes-btn" class="bg-transparent border border-white text-white px-6 py-2 rounded-full font-bold hover:bg-white hover:text-blue-700 transition-colors duration-200">
                    Discard
                </button>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', uiHtml);
        saveChangesPanel = document.getElementById('save-changes-panel');
        saveChangesBtn = document.getElementById('save-changes-btn');
        cancelChangesBtn = document.getElementById('cancel-changes-btn');
        saveChangesSpinnerPanel = document.getElementById('save-changes-spinner'); // Correctly assign to panel spinner

        // Add event listeners for the save changes panel
        saveChangesBtn.addEventListener('click', saveAllPendingChanges);
        cancelChangesBtn.addEventListener('click', discardAllChanges);
    }
    
    // Query edit modal elements here, ensuring they exist before attaching listeners
    editTextModalOverlay = document.getElementById('edit-text-modal-overlay');
    editModalCloseBtn = document.getElementById('edit-modal-close-btn');
    editModalCancelBtn = document.getElementById('edit-modal-cancel-btn');
    editModalSaveBtn = document.getElementById('edit-modal-save-btn');
    editTextArea = document.getElementById('edit-text-area');
    editModalSpinner = document.getElementById('edit-modal-spinner');
    editModalSaveText = document.getElementById('edit-modal-save-text');

    if (editTextModalOverlay && editModalCloseBtn && editModalCancelBtn && editModalSaveBtn && editTextArea) {
        editModalCloseBtn.addEventListener('click', finishEditing);
        editModalCancelBtn.addEventListener('click', finishEditing);
        editModalSaveBtn.addEventListener('click', applyEdit);
        console.log('admin-index-editor.js: Edit modal listeners attached.');
    } else {
        console.error('admin-index-editor.js: One or more edit modal elements not found during UI initialization. Check admin.html for IDs. Elements found:', {
            editTextModalOverlay: !!editTextModalOverlay,
            editModalCloseBtn: !!editModalCloseBtn,
            editModalCancelBtn: !!editModalCancelBtn,
            editModalSaveBtn: !!editModalSaveBtn,
            editTextArea: !!editTextArea
        });
    }
}

// --- Content Editor Core Functions ---
function setupEditableElements() {
    document.body.classList.add('edit-mode'); // Add class to body to activate editor-specific styles

    console.log('setupEditableElements: Attaching listeners to edit buttons.'); // Add this log
    document.querySelectorAll('.edit-text-btn').forEach(button => {
        const targetId = button.dataset.targetId;
        const contentElement = document.getElementById(targetId);

        if (contentElement) {
            // Store original content on the element for discard functionality
            if (contentElement.tagName === 'INPUT' || contentElement.tagName === 'TEXTAREA') {
                contentElement.dataset.originalContent = contentElement.value;
            } else {
                contentElement.dataset.originalContent = contentElement.textContent;
            }
            button.addEventListener('click', () => {
                console.log(`Edit button clicked for ID: ${targetId}`); // Add this log
                startEditing(contentElement, button);
            });
        } else {
            console.warn(`Content element with ID '${targetId}' not found for edit button.`, button);
        }
    });
}

function startEditing(element, triggerButton) {
    console.log('startEditing called for element:', element.id); // Add this log
    // If an element is already being edited, finish it first
    if (currentEditableElement && currentEditableElement !== element) {
        finishEditing(); // Call finishEditing without argument to just close current modal
    }

    currentEditableElement = element;
    elementThatOpenedModal = triggerButton; // Store the button that opened the modal

    if (editTextModalOverlay && editTextArea) {
        console.log('Edit modal elements are found, proceeding to open modal.'); // Add this log
        const isPlaceholder = element.dataset.isPlaceholder === 'true';

        if (isPlaceholder) {
            editTextArea.value = element.textContent;
        } else if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
            editTextArea.value = element.value;
        } else {
            editTextArea.value = element.textContent;
        }
        
        editTextModalOverlay.classList.add('open');
        editTextModalOverlay.classList.remove('hidden'); // Ensure hidden is explicitly removed

        // Trap focus within the modal
        trapFocus(editTextModalOverlay, editTextArea);

        console.log('Edit modal should now be open.');
    } else {
        console.error('Failed to open edit modal: Modal overlay or text area not found. Ensure initializeEditorUI ran correctly. Debug: ', {
            editTextModalOverlay: !!editTextModalOverlay,
            editModalCloseBtn: !!editModalCloseBtn, // Added for debugging
            editModalCancelBtn: !!editModalCancelBtn, // Added for debugging
            editModalSaveBtn: !!editModalSaveBtn, // Added for debugging
            editTextArea: !!editTextArea
        });
    }
}


function finishEditing() {
    if (editTextModalOverlay) {
        editTextModalOverlay.classList.remove('open');
        setTimeout(() => {
            editTextModalOverlay.classList.add('hidden');
        }, 300); // Match this with your CSS transition duration
        
        // Release focus and return to the element that opened the modal
        releaseFocus(editTextModalOverlay, elementThatOpenedModal);
    }
    currentEditableElement = null;
    elementThatOpenedModal = null;
}

async function applyEdit() {
    if (!currentEditableElement || !editTextArea) return;

    const textId = currentEditableElement.dataset.textId;
    const newContent = editTextArea.value;
    const isPlaceholder = currentEditableElement.dataset.isPlaceholder === 'true';

    editModalSaveBtn.disabled = true;
    editModalSaveText.classList.add('hidden');
    editModalSpinner.classList.remove('hidden');
    editModalSpinner.setAttribute('aria-label', 'Applying edit'); // ARIA

    try {
        if (isPlaceholder) {
            currentEditableElement.textContent = newContent; 
        } else if (currentEditableElement.tagName === 'INPUT' || currentEditableElement.tagName === 'TEXTAREA') {
            currentEditableElement.value = newContent;
        } else {
            currentEditableElement.textContent = newContent;
        }
        
        changes[textId] = newContent;
        showSaveChangesPanel();
        showNotification('Change Staged', `Changes for '${textId}' ready to be saved.`, 'info');
        finishEditing();
    } catch (error) {
        console.error('Error applying edit:', error);
        showNotification('Error', 'Failed to apply edit. Please try again.', 'error');
    } finally {
        editModalSaveBtn.disabled = false;
        editModalSaveText.classList.remove('hidden');
        editModalSpinner.classList.add('hidden');
        editModalSpinner.removeAttribute('aria-label'); // ARIA
    }
}

async function saveAllPendingChanges() {
    if (Object.keys(changes).length === 0) {
        showNotification('No Changes', 'There are no unsaved changes.', 'info');
        return;
    }

    saveAllChangesBtn.disabled = true;
    saveAllChangesText.classList.add('hidden');
    saveAllChangesSpinner.classList.remove('hidden');
    saveAllChangesSpinner.setAttribute('aria-label', 'Saving all changes'); // ARIA

    const savePromises = [];
    for (const textId in changes) {
        savePromises.push(saveEditableText(textId, changes[textId]));
    }

    try {
        const results = await Promise.all(savePromises);
        const allSucceeded = results.every(result => result === true);

        if (allSucceeded) {
            Object.keys(changes).forEach(textId => {
                const element = document.querySelector(`[data-text-id="${textId}"]`);
                if (element) {
                    // Update original content dataset after successful save
                    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                        element.dataset.originalContent = element.value;
                    } else {
                        element.dataset.originalContent = element.textContent;
                    }
                }
            });
            Object.keys(changes).forEach(key => delete changes[key]); // Clear all pending changes
            hideSaveChangesPanel();
            showNotification('Saved!', 'All changes have been saved successfully.', 'success');
        } else {
            showNotification('Partial Save', 'Some changes failed to save. Check console for details.', 'error');
        }
    } catch (error) {
        console.error('Error saving all changes:', error);
        showNotification('Error', `An error occurred while saving: ${error.message}`, 'error');
    } finally {
        saveAllChangesBtn.disabled = false;
        saveAllChangesText.classList.remove('hidden');
        saveAllChangesSpinner.classList.add('hidden');
        saveAllChangesSpinner.removeAttribute('aria-label'); // ARIA
    }
}

function showSaveChangesPanel() {
    if (saveChangesPanel) {
        saveChangesPanel.classList.remove('hidden');
    }
}

function hideSaveChangesPanel() {
    if (saveChangesPanel) {
        saveChangesPanel.classList.add('hidden');
    }
}

function discardAllChanges() {
    showConfirmationModal('Discard Changes', 'Are you sure you want to discard all unsaved changes? This action cannot be undone.', () => {
        for (const textId in changes) {
            const element = document.querySelector(`[data-text-id="${textId}"]`);
            if (element) {
                if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                   element.value = element.dataset.originalContent || '';
                } else {
                    element.textContent = element.dataset.originalContent || '';
                }
            }
        }
        Object.keys(changes).forEach(key => delete changes[key]); // Clear all pending changes
        hideSaveChangesPanel();
        showNotification('Discarded', 'All unsaved changes have been discarded.', 'info');
        if (currentEditableElement) {
            finishEditing();
        }
    });
}

/**
 * Loads editable content from Firestore for the editor page.
 */
async function loadEditableContentForEditor() {
    console.log('admin-index-editor.js: Attempting to load editable texts for editor.');
    try {
        if (!db) {
            console.error("loadEditableContentForEditor: Firestore DB is null or undefined.");
            return;
        }

        const editableElements = document.querySelectorAll('[data-text-id]');
        const fetchPromises = [];

        editableElements.forEach(element => {
            const textId = element.dataset.textId;
            const docRef = doc(db, `artifacts/${appId}/public/data/editableTexts`, textId);
            fetchPromises.push(getDoc(docRef).then(snapshot => ({ element, snapshot, textId })));
        });

        const results = await Promise.all(fetchPromises);

        results.forEach(({ element, snapshot, textId }) => {
            if (snapshot.exists()) {
                const content = snapshot.data().content;
                if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                    element.value = content; 
                } else {
                    element.textContent = content;
                }
                element.dataset.originalContent = content;
                console.log(`Editor: Updated text for '${textId}' from Firebase.`);
            } else {
                console.log(`Editor: No content found in Firebase for '${textId}'. Using default HTML content.`);
            }
        });
        // CRITICAL: Call setupEditableElements() AFTER content is loaded and elements are fully rendered/populated.
        setupEditableElements(); 
    } catch (error) {
        console.error('Editor: Error loading editable content:', error);
        showNotification('Error', `Failed to load website content for editing: ${error.message}`, 'error');
    }
}

/**
 * Saves a single editable text document to Firestore.
 * @param {string} textId The ID of the text document.
 * @param {string} newContent The new text content.
 * @returns {Promise<boolean>} True if successful, false otherwise.
 */
async function saveEditableText(textId, newContent) {
  try {
    if (!db) {
      console.error("saveEditableText: Firestore DB is null or undefined.");
      return false;
    }
    const textDocRef = doc(db, `artifacts/${appId}/public/data/editableTexts`, textId);
    await setDoc(textDocRef, { content: newContent, lastModified: serverTimestamp() }, { merge: true });
    console.log(`Text ID '${textId}' saved successfully.`);
    return true;
  } catch (error) {
    console.error(`Error saving editable text '${textId}':`, error);
    return false;
  }
}

// --- Event Listeners ---
// Removed handleEditorLogout listener, as admin-dashboard.js handles overall logout.
// editorLogoutBtn.addEventListener('click', handleEditorLogout); // REMOVED THIS LINE
saveAllChangesBtn.addEventListener('click', saveAllPendingChanges);

// This listener should stay as it specifically triggers loading editor content when the tab is clicked.
document.querySelectorAll('.tab-btn').forEach(button => {
    button.addEventListener('click', () => {
        if (button.dataset.tab === 'content-editor') {
            if (auth.currentUser) { // Only load if authenticated
                console.log('Content editor tab clicked, user authenticated. Loading editable content.'); // Added log
                loadEditableContentForEditor(); // This calls setupEditableElements()
            } else {
                console.log('Not authenticated, content editor is not active.');
                // Optionally show a message that they need to log in first
                showNotification('Access Denied', 'Please log in to access the content editor.', 'info');
            }
        }
    });
});
