// admin-dashboard.js
// This script is now the sole handler for the admin panel's login and overall dashboard navigation/management.
import { db, storage, auth, appId, signOut } from './firebase.js';
import { collection, addDoc, getDocs, deleteDoc, doc, query, serverTimestamp } from 'firebase/firestore';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { generateCaptchaText, createLoginAttemptManager } from './auth-utils.js';
import { showNotification, showConfirmationModal } from './ui-utils.js';

console.log('admin-dashboard.js: db imported at top level:', db);

// Import functions from main.js (for add/delete project/message logic)
import { 
    addProjectToFirebase, 
    deleteProjectFromFirebase, 
    loadProjectsForAdmin, 
    loadMessagesForAdmin, 
    deleteMessageFromFirebase 
} from './main.js';

console.log('admin-dashboard.js: Imported functions from main.js:', { 
    addProjectToFirebase, 
    deleteProjectFromFirebase, 
    loadProjectsForAdmin, 
    loadMessagesForAdmin, 
    deleteMessageFromFirebase 
}); 

// --- Global State Variables for Login ---
let currentCaptchaText = '';
const MAX_ATTEMPTS = 5;
const COOLDOWN_SECONDS = 30;
const loginAttemptManager = createLoginAttemptManager(MAX_ATTEMPTS, COOLDOWN_SECONDS);

// --- Admin Panel Specific Constants ---
const MAX_ADMIN_PROJECT_DESCRIPTION_LENGTH = 150; // New: Maximum length for project descriptions in admin list

// --- Global State for Project Images ---
let selectedImageFiles = []; // To store files selected for upload

// --- DOM Elements (Declared here, assigned in DOMContentLoaded) ---
let adminLoginSection;
let loginForm;
let loginEmailInput;
let loginPasswordInput;
let loginCaptchaInput;
let captchaImage;
let refreshCaptchaBtn;
let loginBtn;
let loginSpinner;
let loginText;
let loginErrorMessage;

let adminDashboard;
let logoutBtn;
let userDisplay;

let addProjectForm;
let projectTitleInput;
let projectDescriptionInput;
let projectImageInput;
let imagePreviewContainer; // New: for image previews
let addProjectBtn;
let addProjectSpinner;
let addProjectText;
let projectsListDiv;

let messagesListDiv;


// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    console.log('admin-dashboard.js: DOMContentLoaded fired.');

    // Assign DOM elements here to ensure they are loaded
    adminLoginSection = document.getElementById('admin-login-section');
    loginForm = document.getElementById('admin-login-form');
    loginEmailInput = document.getElementById('login-email');
    loginPasswordInput = document.getElementById('login-password');
    loginCaptchaInput = document.getElementById('captcha-input'); // Corrected ID
    captchaImage = document.getElementById('captcha-display'); // Corrected ID
    refreshCaptchaBtn = document.getElementById('refresh-captcha');
    loginBtn = document.getElementById('login-button'); // Corrected ID
    loginSpinner = document.getElementById('login-spinner');
    loginText = document.getElementById('login-button-text'); // Corrected ID
    loginErrorMessage = document.getElementById('login-error-message');

    adminDashboard = document.getElementById('admin-dashboard');
    logoutBtn = document.getElementById('main-logout-btn'); // Corrected ID
    userDisplay = document.getElementById('user-display'); // Added missing element for user display

    addProjectForm = document.getElementById('add-project-form');
    projectTitleInput = document.getElementById('project-title');
    projectDescriptionInput = document.getElementById('project-description');
    projectImageInput = document.getElementById('project-image');
    imagePreviewContainer = document.getElementById('image-preview-container'); // New: Get image preview container
    addProjectBtn = document.getElementById('add-project-btn');
    addProjectSpinner = document.getElementById('add-project-spinner');
    addProjectText = document.getElementById('add-project-btn-text'); // Corrected ID
    projectsListDiv = document.getElementById('projects-list');

    messagesListDiv = document.getElementById('messages-list');


    // --- Login Form Event Listeners ---
    if (loginForm && loginEmailInput && loginPasswordInput && loginCaptchaInput && captchaImage && refreshCaptchaBtn && loginBtn) {
        loginForm.addEventListener('submit', handleLogin);
        refreshCaptchaBtn.addEventListener('click', generateNewCaptcha);
        generateNewCaptcha(); // Generate initial CAPTCHA
        updateLoginButtonState(); // Update button state based on cooldown/attempts
    } else {
        console.warn("admin-dashboard.js: Some login form elements were not found. Login functionality may be impaired.");
    }

    // --- Tab Navigation ---
    const tabButtons = document.querySelectorAll('.tab-btn'); // Corrected class
    const tabContents = document.querySelectorAll('.tab-content');

    if (tabButtons.length > 0 && tabContents.length > 0) {
        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                handleTabClick(button);
            });
        });
        // Initial tab is set by auth state listener
    } else {
        console.warn("admin-dashboard.js: Tab navigation elements not found.");
    }

    // --- Logout Button Listener ---
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    } else {
        console.warn("admin-dashboard.js: Logout button element not found.");
    }

    // --- Firebase Auth State Listener (handles showing/hiding login/dashboard) ---
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            console.log('admin-dashboard.js: User is signed in:', user.uid);
            if (adminLoginSection) adminLoginSection.classList.add('hidden');
            if (adminDashboard) adminDashboard.classList.remove('hidden');
            // Check if userDisplay exists before setting textContent
            if (userDisplay) {
                userDisplay.textContent = `Logged in as: ${user.email || 'Admin'}`;
            }
            loginAttemptManager.resetAttempts(); // Reset attempts on successful login
            
            // Ensure data for the currently active tab is loaded after login
            const activeTabButton = document.querySelector('.tab-btn.active');
            if (activeTabButton) {
                // Call handleTabClick to re-trigger data loading for the active tab
                // This is important in case user was on Projects/Messages tab before logout
                handleTabClick(activeTabButton);
            } else {
                // If no active tab, default to 'live-editor' or first tab
                const defaultTabButton = document.querySelector('.tab-btn[data-tab="live-editor"]') || document.querySelector('.tab-btn');
                if (defaultTabButton) {
                    handleTabClick(defaultTabButton);
                }
            }


        } else {
            console.log('admin-dashboard.js: No user signed in.');
            if (adminLoginSection) adminLoginSection.classList.remove('hidden');
            if (adminDashboard) adminDashboard.classList.add('hidden');
            if (userDisplay) userDisplay.textContent = '';
            // Ensure login form is reset and captcha regenerated on logout
            if (loginForm) loginForm.reset();
            generateNewCaptcha();
        }
    });

    // --- Add Project Form Listener ---
    if (addProjectForm) {
        addProjectForm.addEventListener('submit', handleAddProject);
        // New: Add event listener for project image input to handle previews
        if (projectImageInput) {
            projectImageInput.addEventListener('change', handleImageSelection);
        }
    } else {
        console.warn("admin-dashboard.js: Add project form or its elements not found.");
    }
});


// --- Login Handlers ---

/**
 * Handles the login form submission.
 * @param {Event} e - The submit event.
 */
async function handleLogin(e) {
    e.preventDefault();

    if (loginAttemptManager.isCooldownActive()) {
        const remaining = loginAttemptManager.getCooldownRemainingSeconds();
        showNotification('Login Blocked', `Too many failed attempts. Please try again in ${remaining} seconds.`, 'error');
        return;
    }

    const email = loginEmailInput.value;
    const password = loginPasswordInput.value;
    const captcha = loginCaptchaInput.value;

    if (captcha.toLowerCase() !== currentCaptchaText.toLowerCase()) {
        showNotification('CAPTCHA Error', 'Incorrect CAPTCHA. Please try again.', 'error');
        loginAttemptManager.recordFailedAttempt();
        generateNewCaptcha();
        updateLoginButtonState();
        return;
    }

    // Show loading spinner
    if (loginBtn && loginSpinner && loginText) {
        loginBtn.disabled = true;
        loginText.classList.add('hidden');
        loginSpinner.classList.remove('hidden');
        loginSpinner.setAttribute('aria-label', 'Logging in');
    }
    if (loginErrorMessage) loginErrorMessage.textContent = '';

    try {
        await signInWithEmailAndPassword(auth, email, password);
        showNotification('Login Successful', 'Welcome to the admin dashboard!', 'success');
        // Auth state listener handles UI update
    } catch (error) {
        console.error('Login error:', error);
        loginAttemptManager.recordFailedAttempt();
        generateNewCaptcha(); // Always generate new CAPTCHA on login failure
        updateLoginButtonState(); // Update state after attempt
        let errorMessage = 'Login failed. Please check your credentials and CAPTCHA.';
        if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
            errorMessage = 'Invalid email or password.';
        } else if (error.code === 'auth/too-many-requests') {
            const remaining = loginAttemptManager.getCooldownRemainingSeconds();
            errorMessage = `Access to this account has been temporarily disabled due to many failed login attempts. Please try again later.`;
            if (remaining > 0) errorMessage += ` Cooldown: ${remaining} seconds.`;
        }
        if (loginErrorMessage) loginErrorMessage.textContent = errorMessage;
        showNotification('Login Failed', errorMessage, 'error');
    } finally {
        // Hide loading spinner
        if (loginBtn && loginSpinner && loginText) {
            loginBtn.disabled = false;
            loginText.classList.remove('hidden');
            loginSpinner.classList.add('hidden');
            loginSpinner.removeAttribute('aria-label');
        }
    }
}

/**
 * Generates a new CAPTCHA and updates the image.
 */
function generateNewCaptcha() {
    if (captchaImage && loginCaptchaInput) {
        currentCaptchaText = generateCaptchaText();
        captchaImage.textContent = currentCaptchaText;
        loginCaptchaInput.value = ''; // Clear CAPTCHA input on new generation
    } else {
        console.warn("CAPTCHA elements not found.");
    }
}

/**
 * Updates the login button state based on cooldown.
 */
function updateLoginButtonState() {
    if (loginBtn && loginErrorMessage) {
        if (loginAttemptManager.isCooldownActive()) {
            const remaining = loginAttemptManager.getCooldownRemainingSeconds();
            loginBtn.disabled = true;
            loginErrorMessage.textContent = `Too many failed attempts. Try again in ${remaining} seconds.`;
            // Set up a timer to update remaining time
            const countdownInterval = setInterval(() => {
                const updatedRemaining = loginAttemptManager.getCooldownRemainingSeconds();
                if (updatedRemaining > 0) {
                    loginErrorMessage.textContent = `Too many failed attempts. Try again in ${updatedRemaining} seconds.`;
                } else {
                    clearInterval(countdownInterval);
                    loginErrorMessage.textContent = '';
                    loginBtn.disabled = false;
                    generateNewCaptcha(); // Refresh CAPTCHA after cooldown
                }
            }, 1000);
        } else {
            loginBtn.disabled = false;
            loginErrorMessage.textContent = '';
        }
    } else {
        console.warn("Login button or error message element not found for state update.");
    }
}

// --- Tab Navigation Handlers ---

/**
 * Handles clicks on tab buttons to switch content.
 * @param {HTMLElement} clickedButton - The button that was clicked.
 */
async function handleTabClick(clickedButton) {
    const targetTab = clickedButton.dataset.tab;
    const tabButtons = document.querySelectorAll('.tab-btn'); // Use .tab-btn
    const tabContents = document.querySelectorAll('.tab-content');

    // Update active class for buttons
    tabButtons.forEach(btn => {
        btn.classList.remove('active', 'border-blue-500', 'text-blue-600');
        btn.classList.add('border-transparent', 'text-gray-500', 'hover:text-gray-700');
        btn.setAttribute('aria-selected', 'false'); // ARIA
        btn.setAttribute('tabindex', '-1'); // ARIA
    });
    clickedButton.classList.add('active', 'border-blue-500', 'text-blue-600');
    clickedButton.classList.remove('border-transparent', 'text-gray-500', 'hover:text-gray-700');
    clickedButton.setAttribute('aria-selected', 'true'); // ARIA
    clickedButton.setAttribute('tabindex', '0'); // ARIA

    // Hide all tab contents and show the target one
    tabContents.forEach(content => {
        content.classList.add('hidden');
        content.setAttribute('aria-hidden', 'true'); // ARIA
    });
    const activeTabContent = document.getElementById(`${targetTab}-tab`);
    if (activeTabContent) {
        activeTabContent.classList.remove('hidden');
        activeTabContent.setAttribute('aria-hidden', 'false'); // ARIA
    } else {
        console.error(`Tab content for ${targetTab}-tab not found.`);
    }

    // Load data for the active tab
    if (auth.currentUser) { // Only load data if authenticated
        switch (targetTab) {
            case 'project-management': // Changed from 'projects' to 'project-management' to match the actual tab ID
                await loadAndRenderProjects();
                break;
            case 'messages':
                await loadAndRenderMessages();
                break;
            case 'live-editor':
                // The live editor iframe reload logic is already handled in admin-live-editor.js
                // when the tab-btn with data-tab="live-editor" is clicked.
                // We just need to make sure the tab's content is visible.
                break;
            // 'content-editor' is currently not a distinct tab in admin.html, it's 'live-editor'
        }
    } else {
        // If not logged in, show notification but still allow tab switch for visual feedback.
        // Data loading itself will be blocked by the auth.currentUser check within each case.
        showNotification('Access Denied', 'Please log in to manage content.', 'info');
    }
}

/**
 * Handles logging out the user.
 */
async function handleLogout() {
    try {
        await signOut(auth);
        showNotification('Logged Out', 'You have been successfully logged out.', 'info');
        // Auth state listener will handle UI update
    } catch (error) {
        console.error('Logout error:', error);
        showNotification('Logout Failed', 'Failed to log out. Please try again.', 'error');
    }
}

// --- Project Management Handlers ---

/**
 * Handles selection of images for project upload, showing previews.
 * @param {Event} e - The change event from the file input.
 */
function handleImageSelection(e) {
    // Append new files to the existing selectedImageFiles array
    selectedImageFiles.push(...Array.from(e.target.files)); 
    // Clear the input's value to allow selecting the same file again (if needed) and to clear the displayed file name in input
    e.target.value = ''; 
    console.log('Selected image files updated:', selectedImageFiles);
    renderImagePreviews();
}

/**
 * Renders the selected image file previews in the UI.
 */
function renderImagePreviews() {
    if (!imagePreviewContainer) {
        console.warn("Image preview container not found.");
        return;
    }

    // Clear previous previews and revoke old object URLs to prevent memory leaks
    Array.from(imagePreviewContainer.children).forEach(child => {
        const img = child.querySelector('img');
        if (img && img.src.startsWith('blob:')) {
            URL.revokeObjectURL(img.src);
        }
    });
    imagePreviewContainer.innerHTML = '';

    selectedImageFiles.forEach((file, index) => {
        const previewWrapper = document.createElement('div');
        previewWrapper.className = 'relative w-24 h-24 rounded-lg overflow-hidden border border-gray-300 shadow-sm flex-shrink-0';
        
        const img = document.createElement('img');
        img.src = URL.createObjectURL(file);
        img.alt = `Preview of ${file.name}`;
        img.className = 'w-full h-full object-cover';
        img.onload = () => {
            // Revoke URL after image has loaded into the DOM to free up memory
            URL.revokeObjectURL(img.src); 
        };
        img.onerror = () => {
            console.error(`Failed to load preview for ${file.name}`);
            img.src = 'https://placehold.co/100x100?text=Error'; // Fallback for preview
        };


        const deleteButton = document.createElement('button');
        deleteButton.className = 'absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold opacity-80 hover:opacity-100 transition-opacity';
        deleteButton.innerHTML = '&times;'; // 'x' symbol
        deleteButton.title = `Remove ${file.name}`;
        deleteButton.addEventListener('click', () => {
            removeImageFromFileList(index);
        });

        previewWrapper.appendChild(img);
        previewWrapper.appendChild(deleteButton);
        imagePreviewContainer.appendChild(previewWrapper);
    });
}

/**
 * Removes an image from the selectedImageFiles array and updates previews.
 * @param {number} indexToRemove - The index of the file to remove.
 */
function removeImageFromFileList(indexToRemove) {
    if (indexToRemove > -1 && indexToRemove < selectedImageFiles.length) {
        selectedImageFiles.splice(indexToRemove, 1);
        renderImagePreviews(); // Re-render previews to reflect the change
    }
}


/**
 * Handles adding a new project.
 * @param {Event} e - The submit event.
 */
async function handleAddProject(e) {
    e.preventDefault();

    if (!projectTitleInput || !projectDescriptionInput || !addProjectBtn || !addProjectSpinner || !addProjectText) {
        showNotification('Error', 'Project form elements not found.', 'error');
        return;
    }

    const title = projectTitleInput.value.trim();
    const description = projectDescriptionInput.value.trim();
    // Use the global selectedImageFiles array
    const imageFiles = selectedImageFiles; 

    console.log('Attempting to add project. Selected files count:', imageFiles.length); // Debug log

    if (!title || !description || imageFiles.length === 0) {
        showNotification('Warning', 'Please fill in all project fields and select at least one image.', 'warning');
        return;
    }

    // Show loading spinner
    addProjectBtn.disabled = true;
    addProjectText.classList.add('hidden');
    addProjectSpinner.classList.remove('hidden');
    addProjectSpinner.setAttribute('aria-label', 'Adding project');

    try {
        // Pass the array of image files
        const success = await addProjectToFirebase({ title, description }, imageFiles); 
        if (success) {
            showNotification('Success', 'Project added successfully!', 'success');
            addProjectForm.reset();
            selectedImageFiles = []; // Clear selected files after successful upload
            renderImagePreviews(); // Clear previews
            await loadAndRenderProjects(); // Reload projects list
        } else {
            showNotification('Error', 'Failed to add project.', 'error');
        }
    } catch (error) {
        console.error('Error adding project:', error);
        showNotification('Error', `Failed to add project: ${error.message}`, 'error');
    } finally {
        addProjectBtn.disabled = false;
        addProjectText.classList.remove('hidden');
        addProjectSpinner.classList.add('hidden');
        addProjectSpinner.removeAttribute('aria-label');
    }
}

/**
 * Loads and renders projects in the admin panel.
 */
async function loadAndRenderProjects() {
    if (!projectsListDiv) {
        console.warn("Projects list div not found.");
        return;
    }
    projectsListDiv.innerHTML = '<p class="text-gray-500">Loading projects...</p>'; // Show loading

    try {
        const projects = await loadProjectsForAdmin();
        if (projects.length > 0) {
            projectsListDiv.innerHTML = ''; // Clear loading message
            projects.sort((a, b) => b.timestamp.toDate() - a.timestamp.toDate()); // Sort by latest
            projects.forEach(project => {
                // Truncate description for display in admin panel
                let displayedDescription = project.description;
                if (project.description && project.description.length > MAX_ADMIN_PROJECT_DESCRIPTION_LENGTH) {
                    displayedDescription = project.description.substring(0, MAX_ADMIN_PROJECT_DESCRIPTION_LENGTH) + '...';
                }
                // Determine the image URL to display. Use the first image if available, else a placeholder.
                const imageUrlToDisplay = project.imageUrls && project.imageUrls.length > 0 
                                            ? project.imageUrls[0] 
                                            : 'https://placehold.co/100x100?text=No+Image';

                const projectElement = document.createElement('div');
                projectElement.className = 'flex items-center justify-between bg-white p-4 rounded-lg shadow-sm border border-gray-200';
                projectElement.innerHTML = `
                    <div class="flex items-center space-x-4">
                        <img src="${imageUrlToDisplay}" alt="${project.title}" class="w-16 h-16 object-cover rounded-md">
                        <div>
                            <h4 class="font-semibold text-gray-800">${project.title}</h4>
                            <p class="text-sm text-gray-600">${displayedDescription}</p>
                        </div>
                    </div>
                    <button class="delete-project-btn bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded-md text-sm transition-colors"
                            data-project-id="${project.id}" data-image-urls='${JSON.stringify(project.imageUrls || [])}' aria-label="Delete project ${project.title}">
                        Delete
                    </button>
                `;
                projectsListDiv.appendChild(projectElement);
            });

            // Attach delete listeners
            projectsListDiv.querySelectorAll('.delete-project-btn').forEach(button => {
                button.addEventListener('click', handleDeleteProject);
            });
        } else {
            projectsListDiv.innerHTML = '<p class="text-gray-500">No projects added yet.</p>';
        }
    }
    catch (error) {
        console.error('Error loading and rendering projects:', error);
        projectsListDiv.innerHTML = '<p class="text-red-500">Failed to load projects. Please try again.</p>';
    }
}

/**
 * Handles deleting a project.
 * @param {Event} e - The click event.
 */
async function handleDeleteProject(e) {
    const projectId = e.target.dataset.projectId;
    // Parse imageUrls from data attribute
    const imageUrls = JSON.parse(e.target.dataset.imageUrls || '[]'); 
    const projectTitle = e.target.parentNode.querySelector('h4').textContent;

    const confirmed = await showConfirmationModal(
        'Confirm Deletion',
        `Are you sure you want to delete the project "${projectTitle}"? This action cannot be undone.`,
        'Delete', // Text for OK button
        'Cancel'  // Text for Cancel button
    );

    if (confirmed) {
        e.target.disabled = true; // Disable button during deletion
        e.target.textContent = 'Deleting...';
        try {
            // Pass the array of image URLs to delete
            const success = await deleteProjectFromFirebase(projectId, imageUrls); 
            if (success) {
                showNotification('Deleted!', `Project "${projectTitle}" deleted successfully.`, 'success');
                await loadAndRenderProjects(); // Reload the list
            } else {
                showNotification('Error!', `Failed to delete project "${projectTitle}".`, 'error');
            }
        } catch (error) {
            console.error('Error deleting project:', error);
            showNotification('Error!', `Failed to delete project "${projectTitle}": ${error.message}`, 'error');
        } finally {
            e.target.disabled = false;
            e.target.textContent = 'Delete';
        }
    }
}

// --- Messages Handlers ---

/**
 * Loads and renders messages in the admin panel.
 */
async function loadAndRenderMessages() {
    if (!messagesListDiv) {
        console.warn("Messages list div not found.");
        return;
    }
    messagesListDiv.innerHTML = '<p class="text-gray-500">Loading messages...</p>'; // Show loading

    try {
        const messages = await loadMessagesForAdmin();
        if (messages.length > 0) {
            messagesListDiv.innerHTML = ''; // Clear loading message
            messages.sort((a, b) => b.timestamp.toDate() - a.timestamp.toDate()); // Sort by latest
            messages.forEach(message => {
                const messageElement = document.createElement('div');
                messageElement.className = 'bg-white p-4 rounded-lg shadow-sm border border-gray-200';
                messageElement.innerHTML = `
                    <div class="flex justify-between items-start mb-2">
                        <div>
                            <h4 class="font-semibold text-gray-800">${message.name} (${message.email})</h4>
                            <p class="text-xs text-gray-500">${message.timestamp ? new Date(message.timestamp.seconds * 1000).toLocaleString() : 'N/A'}</p>
                        </div>
                        <button class="delete-message-btn bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded-md text-sm transition-colors"
                                data-message-id="${message.id}" aria-label="Delete message from ${message.name}">
                            Delete
                        </button>
                    </div>
                    <p class="text-gray-700">${message.message}</p>
                `;
                messagesListDiv.appendChild(messageElement);
            });

            // Attach delete listeners
            messagesListDiv.querySelectorAll('.delete-message-btn').forEach(button => {
                button.addEventListener('click', handleDeleteMessage);
            });
        } else {
            messagesListDiv.innerHTML = '<p class="text-gray-500">No messages received yet.</p>';
        }
    } catch (error) {
        console.error('Error loading and rendering messages:', error);
        messagesListDiv.innerHTML = '<p class="text-red-500">Failed to load messages. Please try again.</p>';
    }
}

/**
 * Handles deleting a message.
 * @param {Event} e - The click event.
 */
async function handleDeleteMessage(e) {
    const messageId = e.target.dataset.messageId;
    const messageSender = e.target.parentNode.querySelector('h4').textContent;

    const confirmed = await showConfirmationModal(
        'Confirm Deletion',
        `Are you sure you want to delete the message from "${messageSender}"? This action cannot be undone.`,
        'Delete', // Text for OK button
        'Cancel'  // Text for Cancel button
    );

    if (confirmed) {
        e.target.disabled = true; // Disable button during deletion
        e.target.textContent = 'Deleting...';
        try {
            const success = await deleteMessageFromFirebase(messageId);
            if (success) {
                showNotification('Deleted!', `Message from "${messageSender}" deleted successfully.`, 'success');
                await loadAndRenderMessages(); // Reload the list
            } else {
                showNotification('Error!', `Failed to delete message from "${messageSender}".`, 'error');
            }
        } catch (error) {
            console.error('Error deleting message:', error);
            showNotification('Error!', `Failed to delete message from "${messageSender}": ${error.message}`, 'error');
        } finally {
            e.target.disabled = false;
            e.target.textContent = 'Delete';
        }
    }
}
