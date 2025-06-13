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

// --- DOM Elements for Login ---
const loginSection = document.getElementById('login-section');
const adminDashboard = document.getElementById('admin-dashboard');
const loginForm = document.getElementById('login-form');
const captchaDisplay = document.getElementById('captcha-display');
const captchaInput = document.getElementById('captcha-input');
const refreshCaptchaBtn = document.getElementById('refresh-captcha');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('login-btn');
const loginBtnText = document.getElementById('login-btn-text');
const cooldownMessage = document.getElementById('cooldown-message');
const cooldownTimerSpan = document.getElementById('cooldown-timer');
const attemptsCounter = document.getElementById('attempts-counter');
const attemptsCountSpan = document.getElementById('attempts-count');

// Dashboard Logout button (common to the whole admin dashboard)
const logoutBtn = document.getElementById('editor-logout-btn'); 

// Project Management Elements
const addProjectModalBtn = document.getElementById('add-project-modal-btn');
const addProjectFormModal = document.getElementById('add-project-form-modal'); // Updated ID for modal overlay
const cancelAddProjectBtn = document.getElementById('cancel-add-project');
const projectForm = document.getElementById('project-form');
const saveProjectBtn = document.getElementById('save-project-btn');
const saveProjectBtnText = document.getElementById('save-project-btn-text');
const saveProjectSpinner = document.getElementById('save-project-spinner');
const projectsList = document.getElementById('projects-list');
const projectsLoadingSpinner = document.getElementById('projects-loading-spinner');
const totalProjectsSpan = document.getElementById('total-projects');

// Message Management Elements
const messagesList = document.getElementById('messages-list');
const messagesLoadingSpinner = document.getElementById('messages-loading-spinner');
const noMessagesFoundDiv = document.getElementById('no-messages-found');
const totalMessagesSpan = document.getElementById('total-messages');

// Tabs
const tabButtons = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');


// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    console.log('admin-dashboard.js: DOMContentLoaded fired.');
    // UI utilities are initialized by ui-utils.js on DOMContentLoaded.
    setupLoginPersistence(); // This will check auth state and show login or dashboard.
    generateAndDisplayCaptcha(); // Generate CAPTCHA for the login form.
    updateLoginButtonState();
    updateAttemptsCounter();
});

// --- Auth State and Login Persistence ---
function setupLoginPersistence() {
    auth.onAuthStateChanged(user => {
        if (user) {
            console.log('admin-dashboard.js: User is authenticated.');
            showAdminDashboard();
        } else {
            console.log('admin-dashboard.js: User is not authenticated. Showing login.');
            showLoginForm();
        }
    });
}

function showLoginForm() {
    loginSection.classList.remove('hidden');
    adminDashboard.classList.add('hidden');
    generateAndDisplayCaptcha(); // Re-generate CAPTCHA on showing login form
    emailInput.value = '';
    passwordInput.value = '';
    captchaInput.value = '';
    updateLoginButtonState();
}

async function showAdminDashboard() {
    loginSection.classList.add('hidden');
    adminDashboard.classList.remove('hidden');
    // Set default tab to 'portfolio' or 'content-editor'
    // Simulate click on Portfolio tab to load its content
    document.getElementById('portfolio-tab-btn').click();
    await loadAdminDashboardData();
}

// --- CAPTCHA Functions (Centralized here) ---
function generateAndDisplayCaptcha() {
    currentCaptchaText = generateCaptchaText();
    if (captchaDisplay) {
        captchaDisplay.textContent = currentCaptchaText;
        console.log('admin-dashboard.js: CAPTCHA generated:', currentCaptchaText);
    }
}

function updateLoginButtonState() {
    if (loginAttemptManager.isCooldownActive()) {
        loginBtn.disabled = true;
        loginBtnText.textContent = 'Please Wait...';
        cooldownMessage.classList.remove('hidden');
        startCooldownTimer();
    } else if (loginAttemptManager.getFailedAttempts() >= MAX_ATTEMPTS) {
        loginBtn.disabled = true;
        loginBtnText.textContent = 'Too Many Attempts';
        cooldownMessage.classList.remove('hidden');
    } else {
        loginBtn.disabled = false;
        loginBtnText.textContent = 'Access Dashboard';
        cooldownMessage.classList.add('hidden');
        stopCooldownTimer();
    }
}

let cooldownInterval;
function startCooldownTimer() {
    stopCooldownTimer();
    let timeLeft = loginAttemptManager.getCooldownRemainingSeconds();

    if (timeLeft > 0) {
        cooldownTimerSpan.textContent = timeLeft;
        cooldownInterval = setInterval(() => {
            timeLeft--;
            if (timeLeft <= 0) {
                clearInterval(cooldownInterval);
                loginAttemptManager.resetAttempts();
                updateLoginButtonState();
                updateAttemptsCounter();
                generateAndDisplayCaptcha();
            }
            cooldownTimerSpan.textContent = timeLeft;
        }, 1000);
    }
}

function stopCooldownTimer() {
    if (cooldownInterval) {
        clearInterval(cooldownInterval);
    }
}

function updateAttemptsCounter() {
    if (attemptsCounter) {
        if (loginAttemptManager.getFailedAttempts() > 0) {
            attemptsCounter.classList.remove('hidden');
            attemptsCountSpan.textContent = loginAttemptManager.getFailedAttempts();
        } else {
            attemptsCounter.classList.add('hidden');
        }
    }
}

// --- Login Handlers (Centralized here) ---
async function handleLogin(e) {
    e.preventDefault();

    const enteredEmail = emailInput.value;
    const enteredPassword = passwordInput.value;
    const enteredCaptcha = captchaInput.value;

    if (loginAttemptManager.isCooldownActive()) {
        showNotification('Hold On!', `Please wait ${loginAttemptManager.getCooldownRemainingSeconds()} seconds before trying again.`, 'info');
        return;
    }

    // IMPORTANT: Check against the currentCaptchaText managed by this script
    if (enteredCaptcha !== currentCaptchaText) {
        const isCooldown = loginAttemptManager.recordFailedAttempt();
        updateAttemptsCounter();
        if (isCooldown) {
            updateLoginButtonState();
            showNotification('Access Denied', `Too many failed CAPTCHA attempts. Please wait ${COOLDOWN_SECONDS} seconds.`, 'error');
        } else {
            showNotification('Invalid CAPTCHA', 'The security code you entered is incorrect. Please try again.', 'error');
        }
        generateAndDisplayCaptcha(); // Generate new CAPTCHA on failure
        captchaInput.value = '';
        return;
    }

    try {
        await signInWithEmailAndPassword(auth, enteredEmail, enteredPassword);
        console.log('Login successful with Firebase Auth!');
        loginAttemptManager.resetAttempts();
        updateAttemptsCounter();
        updateLoginButtonState();
        showAdminDashboard();
        showNotification('Welcome!', 'You have successfully logged in.', 'success');
    } catch (error) {
        const isCooldown = loginAttemptManager.recordFailedAttempt();
        updateAttemptsCounter();
        let errorMessage = 'Login failed. Please check your email and password.';
        if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
            errorMessage = 'Invalid email or password.';
        } else if (error.code === 'auth/too-many-requests') {
            errorMessage = `Too many login attempts. Please wait ${COOLDOWN_SECONDS} seconds.`;
        }
        
        if (isCooldown) {
            updateLoginButtonState();
            showNotification('Access Denied', `Too many failed attempts. ${errorMessage}`, 'error');
        } else {
            showNotification('Login Failed', errorMessage, 'error');
        }
        console.error('Firebase Auth Login Error:', error);
        generateAndDisplayCaptcha(); // Generate new CAPTCHA on login failure
    } finally {
        passwordInput.value = '';
        captchaInput.value = '';
    }
}

async function handleLogout() {
    try {
        await signOut(auth);
        console.log('Logged out from Firebase!');
        showLoginForm();
        showNotification('Goodbye!', 'You have been logged out.', 'info');
    } catch (error) {
        console.error('Error logging out:', error);
        showNotification('Error', 'Failed to log out. Please try again.', 'error');
    }
}

async function handleAddProject(e) {
    e.preventDefault();

    const title = document.getElementById('project-title').value;
    const description = document.getElementById('project-description').value;
    const imageFile = document.getElementById('project-image').files[0];

    if (!title || !description || !imageFile) {
        showNotification('Missing Info', 'Please fill in all project fields and select an image.', 'error');
        return;
    }

    saveProjectBtn.disabled = true;
    saveProjectBtnText.classList.add('hidden');
    saveProjectSpinner.classList.remove('hidden');
    saveProjectSpinner.setAttribute('aria-label', 'Saving project'); // ARIA

    try {
        const projectData = { title, description };
        const success = await addProjectToFirebase(projectData, imageFile); // Call the imported function
        if (success) {
            showNotification('Success', 'Project added successfully!', 'success');
            projectForm.reset();
            hideAddProjectForm();
            loadProjectsInAdminPanel(); // Refresh projects list
        } else {
            showNotification('Error', 'Failed to add project. Please try again.', 'error');
        }
    } catch (error) {
        console.error('Error adding project:', error);
        showNotification('Error', `Failed to add project: ${error.message}`, 'error');
    } finally {
        saveProjectBtn.disabled = false;
        saveProjectBtnText.classList.remove('hidden');
        saveProjectSpinner.classList.add('hidden');
        saveProjectSpinner.removeAttribute('aria-label'); // ARIA
    }
}

// --- Project Management Functions ---
function showAddProjectForm() {
    addProjectFormModal.classList.remove('hidden');
    // Focus the first input in the modal for accessibility
    document.getElementById('project-title').focus();
}

function hideAddProjectForm() {
    addProjectFormModal.classList.add('hidden');
    projectForm.reset(); // Clear the form
    // Return focus to the button that opened the modal
    addProjectModalBtn.focus();
}

async function loadProjectsInAdminPanel() {
    if (!projectsList || !projectsLoadingSpinner || !totalProjectsSpan) {
        console.error("Missing project list DOM elements.");
        return;
    }

    projectsLoadingSpinner.classList.remove('hidden');
    projectsList.innerHTML = ''; // Clear previous projects
    projectsLoadingSpinner.setAttribute('aria-live', 'polite'); // ARIA
    projectsLoadingSpinner.setAttribute('aria-label', 'Loading projects'); // ARIA

    try {
        const projects = await loadProjectsForAdmin(); // Call the imported function
        totalProjectsSpan.textContent = projects.length;

        if (projects.length > 0) {
            projects.forEach(project => {
                const projectCard = `
                    <div class="bg-white rounded-xl shadow-sm p-4 flex items-center justify-between">
                        <div class="flex items-center space-x-4">
                            <img src="${project.imageUrl || 'https://placehold.co/60x60/cccccc/000000?text=No+Image'}" alt="${project.title}" class="w-16 h-16 object-cover rounded-lg" loading="lazy">
                            <div>
                                <h4 class="font-semibold text-gray-900">${project.title}</h4>
                                <p class="text-sm text-gray-600 truncate max-w-[200px]">${project.description}</p>
                            </div>
                        </div>
                        <button data-project-id="${project.id}" data-image-url="${project.imageUrl}" class="delete-project-btn bg-red-100 text-red-600 p-2 rounded-full hover:bg-red-200 transition-colors" aria-label="Delete project ${project.title}">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                            </svg>
                        </button>
                    </div>
                `;
                projectsList.insertAdjacentHTML('beforeend', projectCard);
            });

            // Add event listeners to delete buttons
            document.querySelectorAll('.delete-project-btn').forEach(button => {
                button.addEventListener('click', async (e) => {
                    const projectId = e.currentTarget.dataset.projectId;
                    const imageUrl = e.currentTarget.dataset.imageUrl;
                    const projectName = e.currentTarget.previousElementSibling.querySelector('h4').textContent;

                    showConfirmationModal('Delete Project', `Are you sure you want to delete "${projectName}"? This action cannot be undone.`, async () => {
                        try {
                            const success = await deleteProjectFromFirebase(projectId, imageUrl); // Call imported function
                            if (success) {
                                showNotification('Deleted', 'Project deleted successfully.', 'success');
                                loadProjectsInAdminPanel(); // Refresh list
                            } else {
                                showNotification('Error', 'Failed to delete project.', 'error');
                            }
                        } catch (error) {
                            console.error('Error deleting project:', error);
                            showNotification('Error', `Failed to delete project: ${error.message}`, 'error');
                        }
                    });
                });
            });

        } else {
            projectsList.innerHTML = '<p class="text-center text-gray-500 col-span-full">No projects added yet.</p>';
        }
    } catch (error) {
        console.error('Error loading projects for admin panel:', error);
        projectsList.innerHTML = `<p class="text-center text-red-500 col-span-full">Error loading projects: ${error.message}</p>`;
    } finally {
        projectsLoadingSpinner.classList.add('hidden');
        projectsLoadingSpinner.removeAttribute('aria-live');
        projectsLoadingSpinner.removeAttribute('aria-label');
    }
}

async function loadMessagesInAdminPanel() {
    if (!messagesList || !messagesLoadingSpinner || !totalMessagesSpan || !noMessagesFoundDiv) {
        console.error("Missing message list DOM elements.");
        return;
    }
    messagesLoadingSpinner.classList.remove('hidden');
    messagesList.innerHTML = ''; // Clear previous messages
    noMessagesFoundDiv.classList.add('hidden');
    messagesLoadingSpinner.setAttribute('aria-live', 'polite'); // ARIA
    messagesLoadingSpinner.setAttribute('aria-label', 'Loading messages'); // ARIA

    try {
        const messages = await loadMessagesForAdmin(); // Call the imported function
        totalMessagesSpan.textContent = messages.length;

        if (messages.length > 0) {
            messages.forEach(message => {
                const messageCard = `
                    <div class="bg-white rounded-xl shadow-sm p-4 flex items-center justify-between">
                        <div>
                            <h4 class="font-semibold text-gray-900">${message.name} <span class="text-sm text-gray-500">- ${message.email}</span></h4>
                            <p class="text-sm text-gray-600">${message.message}</p>
                            <p class="text-xs text-gray-400 mt-1">${message.timestamp ? new Date(message.timestamp.toDate()).toLocaleString() : 'N/A'}</p>
                        </div>
                        <button data-message-id="${message.id}" class="delete-message-btn bg-red-100 text-red-600 p-2 rounded-full hover:bg-red-200 transition-colors" aria-label="Delete message from ${message.name}">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                            </svg>
                        </button>
                    </div>
                `;
                messagesList.insertAdjacentHTML('beforeend', messageCard);
            });

            // Add event listeners to delete buttons
            document.querySelectorAll('.delete-message-btn').forEach(button => {
                button.addEventListener('click', async (e) => {
                    const messageId = e.currentTarget.dataset.messageId;
                    const senderName = e.currentTarget.previousElementSibling.querySelector('h4').textContent.split(' ')[0]; // Extract name

                    showConfirmationModal('Delete Message', `Are you sure you want to delete this message from ${senderName}? This action cannot be undone.`, async () => {
                        try {
                            const success = await deleteMessageFromFirebase(messageId); // Call imported function
                            if (success) {
                                showNotification('Deleted', 'Message deleted successfully.', 'success');
                                loadMessagesInAdminPanel(); // Refresh list
                            } else {
                                showNotification('Error', 'Failed to delete message.', 'error');
                            }
                        } catch (error) {
                            console.error('Error deleting message:', error);
                            showNotification('Error', `Failed to delete message: ${error.message}`, 'error');
                        }
                    });
                });
            });

        } else {
            noMessagesFoundDiv.classList.remove('hidden');
        }
    } catch (error) {
        console.error('Error loading messages for admin panel:', error);
        messagesList.innerHTML = `<p class="text-center text-red-500 col-span-full">Error loading messages: ${error.message}</p>`;
    } finally {
        messagesLoadingSpinner.classList.add('hidden');
        messagesLoadingSpinner.removeAttribute('aria-live');
        messagesLoadingSpinner.removeAttribute('aria-label');
    }
}

async function loadAdminDashboardData() {
    console.log('admin-dashboard.js: loadAdminDashboardData called. db:', db);
    if (!auth.currentUser) {
        console.warn('admin-dashboard.js: loadAdminDashboardData: User not authenticated, cannot load data.');
        return;
    }

    try {
        // Load data for the initially active tab (set by click above)
        const activeTab = document.querySelector('.tab-btn.active');
        if (activeTab) {
            const targetTab = activeTab.dataset.tab;
            if (targetTab === 'portfolio') {
                await loadProjectsInAdminPanel();
            } else if (targetTab === 'messages') {
                await loadMessagesInAdminPanel();
            }
            // For 'content-editor', load is handled by admin-index-editor.js (which now relies on auth state)
        }
        
        const lastUpdatedSpan = document.getElementById('last-updated');
        if (lastUpdatedSpan) {
            lastUpdatedSpan.textContent = new Date().toLocaleString();
        }
    } catch (error) {
        console.error('Error loading dashboard data:', error);
        showNotification('Error', `Failed to load dashboard data: ${error.message}. Please check permissions.`, 'error');
    }
}

// --- Event Listeners (Centralized here) ---
loginForm.addEventListener('submit', handleLogin);
refreshCaptchaBtn.addEventListener('click', generateAndDisplayCaptcha); // Re-generate CAPTCHA button

// Logout button is shared and needs to be handled by the main dashboard script
if (logoutBtn) {
    logoutBtn.addEventListener('click', handleLogout);
} else {
    console.warn("Logout button with ID 'editor-logout-btn' not found.");
}

addProjectModalBtn.addEventListener('click', showAddProjectForm);
cancelAddProjectBtn.addEventListener('click', hideAddProjectForm);
projectForm.addEventListener('submit', handleAddProject);


// Tab switching logic (Centralized here)
tabButtons.forEach(button => {
    button.addEventListener('click', () => {
        const targetTab = button.dataset.tab;

        // Update active class for buttons
        tabButtons.forEach(btn => {
            btn.classList.remove('active', 'border-blue-500', 'text-blue-600', 'hover:text-gray-700');
            btn.classList.add('border-transparent', 'text-gray-500', 'hover:text-gray-700');
            btn.setAttribute('aria-selected', 'false'); // ARIA
            btn.setAttribute('tabindex', '-1'); // ARIA
        });
        button.classList.add('active', 'border-blue-500', 'text-blue-600');
        button.classList.remove('border-transparent', 'text-gray-500', 'hover:text-gray-700');
        button.setAttribute('aria-selected', 'true'); // ARIA
        button.setAttribute('tabindex', '0'); // ARIA

        // Hide all tab contents and show the target one
        tabContents.forEach(content => {
            content.classList.add('hidden');
            content.setAttribute('aria-hidden', 'true'); // ARIA
        });
        const activeTabContent = document.getElementById(`${targetTab}-tab`);
        activeTabContent.classList.remove('hidden');
        activeTabContent.setAttribute('aria-hidden', 'false'); // ARIA

        // Load data for the active tab (content-editor is handled by admin-index-editor.js via its auth listener)
        if (targetTab === 'portfolio') {
            loadProjectsInAdminPanel();
        } else if (targetTab === 'messages') {
            loadMessagesInAdminPanel();
        }
    });
});
