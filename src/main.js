// main.js
// Import shared Firebase instances from firebase.js
import { db, storage, auth, appId } from './firebase.js';
import { collection, addDoc, getDocs, deleteDoc, doc, query, serverTimestamp, updateDoc, setDoc as firestoreSetDoc, getDoc } from 'firebase/firestore'; 
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
// Corrected import: only import showNotification and showConfirmationModal
import { showNotification, showConfirmationModal } from './ui-utils.js'; 

console.log('main.js: db imported at top level:', db); // DEBUG: Check if db is imported

// Global variables
let allProjectsData = [];
// Store default texts from HTML to use if Firebase is unavailable or content isn't set
const defaultTexts = {};

// DOM Content Loaded
document.addEventListener('DOMContentLoaded', function() {
  console.log('main.js: DOMContentLoaded fired.'); // DEBUG

  // Check if we're on index.html by looking for a unique element (e.g., portfolio-grid)
  const isIndexPage = document.getElementById('portfolio-grid') !== null;

  if (isIndexPage) {
    // Removed: initializeNotificationModal(); initializeConfirmationModal();
    // These are now handled by ui-utils.js itself on DOMContentLoaded.

    // Collect default texts from HTML before loading from Firebase
    document.querySelectorAll('[data-text-id]').forEach(element => {
      const id = element.dataset.textId;
      if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
        defaultTexts[id] = element.value;
      } else {
        defaultTexts[id] = element.textContent;
      }
    });

    // Ensure Firebase auth state is determined before attempting to load data
    auth.onAuthStateChanged(user => {
        // user object will be null if no one is signed in, or contain user info
        // This callback ensures Firebase is ready
        console.log('main.js: Firebase Auth state changed in main.js. User:', user ? user.uid : 'none');
        setupMobileMenu();
        loadPortfolioProjects(); // Projects are separate from general editable texts
        loadEditableContent(); // Load content for the main website
        setupScrollIndicator();
        setupContactForm();
    });

  } else {
    console.log('main.js: Skipping portfolio setup on non-index page (e.g., admin.html).');
  }
});

/**
 * Sets up the mobile menu toggle functionality.
 */
function setupMobileMenu() {
  const menuToggle = document.getElementById('menu-toggle');
  const mobileMenu = document.getElementById('mobile-menu');
  const closeMenu = document.getElementById('close-menu');

  if (menuToggle && mobileMenu && closeMenu) {
    menuToggle.addEventListener('click', () => {
      mobileMenu.classList.add('open');
      menuToggle.setAttribute('aria-expanded', 'true');
    });

    closeMenu.addEventListener('click', () => {
      mobileMenu.classList.remove('open');
      menuToggle.setAttribute('aria-expanded', 'false');
    });

    // Close menu when a navigation link is clicked
    mobileMenu.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        mobileMenu.classList.remove('open');
        menuToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }
}

/**
 * Sets up the scroll progress indicator.
 */
function setupScrollIndicator() {
  const scrollIndicator = document.getElementById('scroll-indicator');

  if (scrollIndicator) {
    window.addEventListener('scroll', () => {
      const totalHeight = document.documentElement.scrollHeight - window.innerHeight;
      // Ensure totalHeight is not 0 to prevent division by zero
      const scrollProgress = totalHeight > 0 ? (window.scrollY / totalHeight) * 100 : 0;
      scrollIndicator.style.width = `${scrollProgress}%`;
    });
  }
}

/**
 * Sets up the contact form submission.
 */
function setupContactForm() {
  const contactForm = document.getElementById('contact-form');
  if (contactForm) {
    contactForm.addEventListener('submit', async function(e) {
      e.preventDefault();

      const name = contactForm.name.value;
      const email = contactForm.email.value;
      const message = contactForm.message.value;

      try {
        // Use the correct Firestore path for public messages
        const messagesCollectionRef = collection(db, `artifacts/${appId}/public/data/messages`);
        await addDoc(messagesCollectionRef, {
          name,
          email,
          message,
          timestamp: serverTimestamp()
        });
        showNotification('Success!', 'Your message has been sent successfully.', 'success');
        contactForm.reset();
      } catch (error) {
        console.error('Error sending message:', error);
        showNotification('Error!', 'Failed to send message. Please try again.', 'error');
      }
    });
  }
}

/**
 * Loads portfolio projects from Firestore and displays them.
 */
export async function loadPortfolioProjects() {
  const portfolioGrid = document.getElementById('portfolio-grid');
  const portfolioLoading = document.getElementById('portfolio-loading');
  const portfolioError = document.getElementById('portfolio-error');
  const showAllProjectsBtn = document.getElementById('show-all-projects');

  if (!portfolioGrid || !portfolioLoading || !portfolioError || !showAllProjectsBtn) {
    console.error("Missing portfolio DOM elements.");
    return;
  }

  // Show loading spinner
  portfolioLoading.classList.remove('hidden');
  portfolioGrid.classList.add('hidden');
  portfolioError.classList.add('hidden');
  showAllProjectsBtn.classList.add('hidden');

  try {
    if (!db) {
      console.error("loadPortfolioProjects: Firestore DB is null or undefined.");
      throw new Error("Database not initialized.");
    }

    // Use the correct Firestore path for public projects
    const projectsCol = collection(db, `artifacts/${appId}/public/data/projects`);
    const q = query(projectsCol); 

    const snapshot = await getDocs(q);
    allProjectsData = []; // Clear previous data
    snapshot.forEach(doc => {
      allProjectsData.push({ id: doc.id, ...doc.data() });
    });

    if (allProjectsData.length > 0) {
      renderProjects(allProjectsData.slice(0, 3), portfolioGrid); // Show first 3 projects
      portfolioGrid.classList.remove('hidden');
      if (allProjectsData.length > 3) {
        showAllProjectsBtn.classList.remove('hidden');
      }
    } else {
      portfolioGrid.innerHTML = '<p class="text-center text-gray-500 col-span-full">No projects found.</p>';
      portfolioGrid.classList.remove('hidden');
    }

    // Hide loading spinner
    portfolioLoading.classList.add('hidden');

  } catch (error) {
    console.error('Error loading portfolio projects:', error);
    portfolioLoading.classList.add('hidden');
    portfolioError.classList.remove('hidden');
  }
}

/**
 * Renders projects into a specified grid.
 * Adds lazy loading attribute to images.
 * @param {Array} projects - Array of project data.
 * @param {HTMLElement} targetGrid - The DOM element to render projects into.
 */
function renderProjects(projects, targetGrid) {
  targetGrid.innerHTML = ''; // Clear existing content
  projects.forEach(project => {
    const projectCard = `
      <div class="bg-white rounded-2xl shadow-lg overflow-hidden card-hover">
        <img src="${project.imageUrl}" alt="${project.title}" class="w-full h-48 object-cover" loading="lazy">
        <div class="p-6">
          <h3 class="text-xl font-semibold text-gray-900 mb-2">${project.title}</h3>
          <p class="text-gray-600 text-sm">${project.description}</p>
        </div>
      </div>
    `;
    targetGrid.insertAdjacentHTML('beforeend', projectCard);
  });
}

// Handle "View All Projects" modal
const allProjectsModal = document.getElementById('all-projects-modal');
const showAllProjectsBtnIndex = document.getElementById('show-all-projects'); // Renamed to avoid conflict
const closeProjectsModalBtn = document.getElementById('close-projects-modal');
const allProjectsGrid = document.getElementById('all-projects-grid');

if (showAllProjectsBtnIndex && allProjectsModal && closeProjectsModalBtn && allProjectsGrid) {
  showAllProjectsBtnIndex.addEventListener('click', () => { // Used renamed variable
    if (allProjectsData.length > 0) {
      renderProjects(allProjectsData, allProjectsGrid);
    } else {
      allProjectsGrid.innerHTML = '<p class="text-center text-gray-500 col-span-full">No projects found.</p>';
    }
    allProjectsModal.classList.remove('hidden');
    // Set focus to the close button when modal opens
    closeProjectsModalBtn.focus();
  });

  closeProjectsModalBtn.addEventListener('click', () => {
    allProjectsModal.classList.add('hidden');
    // Return focus to the button that opened the modal
    showAllProjectsBtnIndex.focus();
  });
}


/**
 * Adds a new project to Firestore and uploads its image to Storage.
 * @param {object} projectData - The project data (title, description).
 * @param {File} imageFile - The image file to upload.
 * @returns {Promise<boolean>} True if successful, false otherwise.
 */
export async function addProjectToFirebase(projectData, imageFile) {
  try {
    if (!db || !storage) {
      console.error("addProjectToFirebase: Firestore DB or Storage is null or undefined.");
      throw new Error("Firebase services not initialized.");
    }
    
    // 1. Upload image to Firebase Storage
    const imageRef = ref(storage, `artifacts/${appId}/public/images/projects/${imageFile.name}`);
    const uploadResult = await uploadBytes(imageRef, imageFile);
    const imageUrl = await getDownloadURL(uploadResult.ref);

    // 2. Add project data to Firestore
    // Use the correct Firestore path for public projects
    const projectsCollectionRef = collection(db, `artifacts/${appId}/public/data/projects`);
    await addDoc(projectsCollectionRef, {
      title: projectData.title,
      description: projectData.description,
      imageUrl: imageUrl,
      timestamp: serverTimestamp()
    });

    console.log('Project added successfully!');
    return true;
  } catch (error) {
    console.error('Error adding project:', error);
    throw error; // Re-throw to be caught by the calling function
  }
}

/**
 * Deletes a project from Firestore and its image from Storage.
 * @param {string} projectId - The ID of the project document to delete.
 * @param {string} imageUrl - The URL of the image to delete from storage.
 * @returns {Promise<boolean>} True if successful, false otherwise.
 */
export async function deleteProjectFromFirebase(projectId, imageUrl) {
  try {
    if (!db || !storage) {
      console.error("deleteProjectFromFirebase: Firestore DB or Storage is null or undefined.");
      throw new Error("Firebase services not initialized.");
    }

    // 1. Delete document from Firestore
    // Use the correct Firestore path for public projects
    await deleteDoc(doc(db, `artifacts/${appId}/public/data/projects`, projectId));

    // 2. Delete image from Firebase Storage
    const imageRef = ref(storage, imageUrl);
    await deleteObject(imageRef);

    console.log(`Project ${projectId} and its image deleted successfully.`);
    return true;
  } catch (error) {
    console.error(`Error deleting project ${projectId}:`, error);
    throw error;
  }
}

/**
 * Loads projects for the admin panel.
 * @returns {Promise<Array>} An array of project documents.
 */
export async function loadProjectsForAdmin() {
  try {
    if (!db) {
      console.error("loadProjectsForAdmin: Firestore DB is null or undefined.");
      throw new Error("Database not initialized.");
    }
    // Use the correct Firestore path for public projects
    const projectsCol = collection(db, `artifacts/${appId}/public/data/projects`);
    const q = query(projectsCol); 
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('Error loading projects for admin:', error);
    throw error;
  }
}

/**
 * Loads messages for the admin panel.
 * @returns {Promise<Array>} An array of message documents.
 */
export async function loadMessagesForAdmin() {
  try {
    if (!db) {
      console.error("loadMessagesForAdmin: Firestore DB is null or undefined.");
      throw new Error("Database not initialized.");
    }
    // Use the correct Firestore path for public messages
    const messagesCol = collection(db, `artifacts/${appId}/public/data/messages`);
    const q = query(messagesCol); 
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('Error loading messages for admin:', error);
    throw error;
  }
}

/**
 * Deletes a message from Firestore.
 * @param {string} messageId - The ID of the message document to delete.
 * @returns {Promise<boolean>} True if successful, false otherwise.
 */
export async function deleteMessageFromFirebase(messageId) {
  try {
    if (!db) {
      console.error("deleteMessageFromFirebase: Firestore DB is null or undefined.");
      return false;
    }
    // Use the correct Firestore path for public messages
    await deleteDoc(doc(db, `artifacts/${appId}/public/data/messages`, messageId));
    console.log(`Message ${messageId} deleted successfully.`);
    return true;
  } catch (error) {
    console.error(`Error deleting message ${messageId}:`, error);
    return false;
  }
}

/**
 * Loads editable content from Firestore for elements with data-text-id.
 */
export async function loadEditableContent() {
  console.log('main.js: Attempting to load editable texts:', Object.keys(defaultTexts));
  try {
    if (!db) {
      console.error("loadEditableContent: Firestore DB is null or undefined.");
      return;
    }

    // Iterate over each data-text-id element and try to load its content
    document.querySelectorAll('[data-text-id]').forEach(async (element) => {
      const textId = element.dataset.textId;
      // Use the correct Firestore path for public editable texts
      const docRef = doc(db, `artifacts/${appId}/public/data/editableTexts`, textId);
      const snapshot = await getDoc(docRef);

      if (snapshot.exists()) {
        const content = snapshot.data().content;
        if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
          element.value = content;
        } else {
          element.textContent = content;
        }
        console.log(`Updated text for '${textId}' from Firebase.`);
      } else {
        console.log(`No content found in Firebase for '${textId}'. Using default HTML content.`);
        // If no content in Firebase, the default HTML content will remain
      }
    });

  } catch (error) {
    console.error('Error loading editable content:', error);
    // Optionally, show a user-friendly error message
  }
}

/**
 * Saves a single editable text document to Firestore.
 * This is exported for use by content-editor.js (or other admin-side scripts).
 * @param {string} textId The ID of the text document.
 * @param {string} newContent The new text content.
 * @returns {Promise<boolean>} True if successful, false otherwise.
 */
export async function saveEditableText(textId, newContent) {
  try {
    if (!db) {
      console.error("saveEditableText: Firestore DB is null or undefined.");
      return false;
    }
    // Use the correct Firestore path for public editable texts
    const textDocRef = doc(db, `artifacts/${appId}/public/data/editableTexts`, textId);
    await firestoreSetDoc(textDocRef, { content: newContent, lastModified: serverTimestamp() }, { merge: true });
    console.log(`Text ID '${textId}' saved successfully.`);
    return true;
  } catch (error) {
    console.error(`Error saving editable text '${textId}':`, error);
    return false;
  }
}
