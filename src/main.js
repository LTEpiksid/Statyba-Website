// main.js
// Import shared Firebase instances and firebaseConfig from firebase.js
import { db, storage, auth, firebaseConfig } from './firebase.js';
import { collection, addDoc, getDocs, deleteDoc, doc, query, serverTimestamp, updateDoc, setDoc as firestoreSetDoc, getDoc } from 'firebase/firestore'; 
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
// Corrected import: only import showNotification and showConfirmationModal
import { showNotification, showConfirmationModal } from './ui-utils.js'; 

console.log('main.js: db imported at top level:', db); // DEBUG: Check if db is imported

// Global variables
let allProjectsData = [];
// Store default texts from HTML to use if Firebase is unavailable or content isn't set
const defaultTexts = {};
// Store default styles from HTML (inline or computed)
const defaultStyles = {};

// Define a maximum length for descriptions on the portfolio cards
const MAX_CARD_DESCRIPTION_LENGTH = 120; // You can adjust this value as needed

// DOM Content Loaded
document.addEventListener('DOMContentLoaded', function() {
  console.log('main.js: DOMContentLoaded fired.'); // DEBUG

  // Determine if we are on the index.html or project-detail.html page
  const isIndexPage = document.getElementById('portfolio-grid') !== null;
  const isProjectDetailPage = document.getElementById('project-detail-content') !== null;

  if (isIndexPage) {
    // Collect default texts from HTML before loading from Firebase
    document.querySelectorAll('[data-editable-text-id], [data-editable-placeholder-id]').forEach(element => {
      const id = element.dataset.editableTextId || element.dataset.editablePlaceholderId;
      if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
        defaultTexts[id] = element.value;
      } else {
        defaultTexts[id] = element.textContent;
      }
    });

    // Collect default styles from HTML (inline or computed styles)
    document.querySelectorAll('[data-editable-color-id], [data-editable-background-color-id], [data-editable-gradient-id], [data-editable-background-image-id], [data-editable-background-id]').forEach(element => {
        let id;
        let type;
        let defaultValue;

        if (element.dataset.editableColorId) {
            id = element.dataset.editableColorId;
            type = 'color';
            defaultValue = window.getComputedStyle(element).color;
        } else if (element.dataset.editableBackgroundColorId) {
            id = element.dataset.editableBackgroundColorId;
            type = 'background-color';
            defaultValue = window.getComputedStyle(element).backgroundColor;
        } else if (element.dataset.editableGradientId) {
            id = element.dataset.editableGradientId;
            type = 'gradient';
            defaultValue = window.getComputedStyle(element).backgroundImage;
        } else if (element.dataset.editableBackgroundImageId) {
            id = element.dataset.editableBackgroundImageId;
            type = 'background-image';
            defaultValue = window.getComputedStyle(element).backgroundImage;
        } else if (element.dataset.editableBackgroundId) { // New generic background ID
            id = element.dataset.editableBackgroundId;
            // For generic background, try to determine its initial type based on computed style
            const computedBackground = window.getComputedStyle(element).backgroundImage;
            const computedBgColor = window.getComputedStyle(element).backgroundColor;

            if (computedBackground && computedBackground !== 'none' && computedBackground.startsWith('linear-gradient')) {
                type = 'gradient';
                defaultValue = computedBackground;
            } else if (computedBackground && computedBackground !== 'none' && computedBackground.startsWith('url')) {
                type = 'background-image';
                defaultValue = computedBackground;
            } else if (computedBgColor && computedBgColor !== 'rgba(0, 0, 0, 0)' && computedBgColor !== 'transparent') {
                type = 'background-color';
                defaultValue = computedBgColor;
            } else {
                // Default to a solid color if no specific background is set
                type = 'background-color';
                defaultValue = 'rgb(255, 255, 255)'; // A default white, for instance
            }
        } else {
            return; // Skip if no relevant editable ID is found
        }
        
        if (defaultValue !== undefined && id) { // Ensure id is also present
            defaultStyles[id] = { type: type, value: defaultValue };
        }
    });

    // Ensure Firebase auth state is determined before attempting to load data
    auth.onAuthStateChanged(user => {
        // user object will be null if no one is signed in, or contain user info
        // This callback ensures Firebase is ready
        console.log('main.js: Firebase Auth state changed in main.js. User:', user ? user.uid : 'none');
        setupMobileMenu();
        loadPortfolioProjects(); // Projects are separate from general editable texts
        loadEditableContentAndStyles(); // Load content and styles for the main website
        setupScrollIndicator();
        setupContactForm();
    });

  } else if (isProjectDetailPage) {
      console.log('main.js: On project-detail.html. Loading specific project.');
      auth.onAuthStateChanged(user => {
          // Ensure Firebase is ready before loading project details
          console.log('main.js: Firebase Auth state changed in project-detail.html. User:', user ? user.uid : 'none');
          loadProjectDetails();
      });
  } else {
    console.log('main.js: Skipping specific page setup.');
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
        // Use the correct Firestore path for public messages using projectId
        const messagesCollectionRef = collection(db, `artifacts/${firebaseConfig.projectId}/public/data/messages`);
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

    // Use the correct Firestore path for public projects using projectId
    const projectsCol = collection(db, `artifacts/${firebaseConfig.projectId}/public/data/projects`);
    console.log(`Fetching projects from: ${projectsCol.path}`); // Diagnostic log
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
 * Makes project cards clickable to view details.
 * @param {Array} projects - Array of project data.
 * @param {HTMLElement} targetGrid - The DOM element to render projects into.
 */
function renderProjects(projects, targetGrid) {
  targetGrid.innerHTML = ''; // Clear existing content
  projects.forEach(project => {
    // Truncate description for display on cards
    let displayedDescription = project.description;
    if (project.description && project.description.length > MAX_CARD_DESCRIPTION_LENGTH) {
      displayedDescription = project.description.substring(0, MAX_CARD_DESCRIPTION_LENGTH) + '...';
    }

    // Use the first image for the thumbnail on the portfolio grid
    const thumbnailUrl = project.imageUrls && project.imageUrls.length > 0 
                         ? project.imageUrls[0] 
                         : 'https://placehold.co/800x600?text=No+Image';

    // Wrap the card content in an anchor tag to make it clickable
    // Pass the project ID as a URL parameter
    const projectCard = `
      <a href="project-detail.html?id=${project.id}" class="bg-white rounded-2xl shadow-lg overflow-hidden card-hover block cursor-pointer">
        <img src="${thumbnailUrl}" alt="${project.title}" class="w-full h-48 object-cover" loading="lazy">
        <div class="p-6">
          <h3 class="text-xl font-semibold text-gray-900 mb-2">${project.title}</h3>
          <p class="text-gray-600 text-sm">${displayedDescription}</p>
        </div>
      </a>
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
 * Adds a new project to Firestore and uploads its images to Storage.
 * @param {object} projectData - The project data (title, description).
 * @param {File[]} imageFiles - An array of image files to upload.
 * @returns {Promise<boolean>} True if successful, false otherwise.
 */
export async function addProjectToFirebase(projectData, imageFiles) {
  try {
    if (!db || !storage) {
      console.error("addProjectToFirebase: Firestore DB or Storage is null or undefined.");
      throw new Error("Firebase services not initialized.");
    }
    
    const imageUrls = [];
    // 1. Upload each image to Firebase Storage
    for (const imageFile of imageFiles) {
        // Generate a unique file name to prevent collisions, especially if multiple users upload same named files
        const uniqueFileName = `${Date.now()}-${imageFile.name}`;
        const imageRef = ref(storage, `artifacts/${firebaseConfig.projectId}/public/images/projects/${uniqueFileName}`); // Using projectId and unique name
        console.log(`Uploading ${imageFile.name} to storage path: ${imageRef.fullPath}`); // Debug log
        const uploadResult = await uploadBytes(imageRef, imageFile);
        const imageUrl = await getDownloadURL(uploadResult.ref);
        imageUrls.push(imageUrl);
        console.log(`Uploaded ${imageFile.name}, URL: ${imageUrl}`); // Debug log
    }

    // 2. Add project data to Firestore
    // Use the correct Firestore path for public projects using projectId
    const projectsCollectionRef = collection(db, `artifacts/${firebaseConfig.projectId}/public/data/projects`); // Using projectId
    await addDoc(projectsCollectionRef, {
      title: projectData.title,
      description: projectData.description,
      imageUrls: imageUrls, // Store array of URLs
      timestamp: serverTimestamp()
    });

    console.log('Project added successfully! Image URLs:', imageUrls); // Debug log
    return true;
  } catch (error) {
    console.error('Error adding project:', error);
    throw error; // Re-throw to be caught by the calling function
  }
}

/**
 * Deletes a project from Firestore and its images from Storage.
 * @param {string} projectId - The ID of the project document to delete.
 * @param {string[]} imageUrls - An array of URLs of the images to delete from storage.
 * @returns {Promise<boolean>} True if successful, false otherwise.
 */
export async function deleteProjectFromFirebase(projectId, imageUrls) {
  try {
    if (!db || !storage) {
      console.error("deleteProjectFromFirebase: Firestore DB or Storage is null or undefined.");
      throw new Error("Firebase services not initialized.");
    }

    // 1. Delete document from Firestore
    // Use the correct Firestore path for public projects using projectId
    await deleteDoc(doc(db, `artifacts/${firebaseConfig.projectId}/public/data/projects`, projectId)); // Using projectId

    // 2. Delete each image from Firebase Storage
    const deleteImagePromises = imageUrls.map(async (imageUrl) => {
        if (imageUrl && imageUrl.includes('firebasestorage.googleapis.com')) {
            try {
                // Extract the full path from the URL
                // This regex captures everything after the project ID part up to the first '?'
                const regex = new RegExp(`artifacts%2F${firebaseConfig.projectId}%2Fpublic%2Fimages%2Fprojects%2F([^?]+)`);
                const match = imageUrl.match(regex);
                
                if (match && match[1]) {
                    const encodedFilePath = match[1];
                    const decodedFilePath = decodeURIComponent(encodedFilePath); // Decode to get actual file path
                    const imageRef = ref(storage, `artifacts/${firebaseConfig.projectId}/public/images/projects/${decodedFilePath}`);
                    await deleteObject(imageRef);
                    console.log(`Deleted image: ${imageUrl}`);
                } else {
                    console.warn(`Could not parse storage path from URL for deletion: ${imageUrl}`);
                }
            } catch (storageError) {
                // Handle cases where image might not exist in storage or other storage errors
                console.warn(`Failed to delete image from Storage (${imageUrl}): ${storageError.message}`);
            }
        } else {
            console.warn(`Skipping image deletion for non-Firebase Storage URL: ${imageUrl}`);
        }
    });
    await Promise.all(deleteImagePromises);

    console.log(`Project ${projectId} and its images deleted successfully.`);
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
    // Use the correct Firestore path for public projects using projectId
    const projectsCol = collection(db, `artifacts/${firebaseConfig.projectId}/public/data/projects`); // Using projectId
    console.log(`Fetching admin projects from: ${projectsCol.path}`); // Diagnostic log
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
      return false;
    }
    // Use the correct Firestore path for public messages using projectId
    const messagesCol = collection(db, `artifacts/${firebaseConfig.projectId}/public/data/messages`); // Using projectId
    console.log(`Fetching admin messages from: ${messagesCol.path}`); // Diagnostic log
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
    // Use the correct Firestore path for public messages using projectId
    await deleteDoc(doc(db, `artifacts/${firebaseConfig.projectId}/public/data/messages`, messageId)); // Using projectId
    console.log(`Message ${messageId} deleted successfully.`);
    return true;
  } catch (error) {
    console.error(`Error deleting message ${messageId}:`, error);
    return false;
  }
}

/**
 * Loads editable content (text and styles) from Firestore for elements with data-text-id and data-editable-id.
 */
export async function loadEditableContentAndStyles() {
  console.log('main.js: Attempting to load editable texts and styles.');
  try {
    if (!db) {
      console.error("loadEditableContentAndStyles: Firestore DB is null or undefined.");
      return;
    }

    // Select elements based on any of the data attributes for editable content/styles
    const elementsToUpdate = document.querySelectorAll(
        '[data-editable-text-id], [data-editable-placeholder-id], ' +
        '[data-editable-color-id], [data-editable-background-color-id], ' +
        '[data-editable-gradient-id], [data-editable-background-image-id], ' +
        '[data-editable-background-id]' // Include the new generic background ID
    );
    
    const textFetchPromises = [];
    const styleFetchPromises = [];

    elementsToUpdate.forEach(element => {
      // Check for each specific editable data attribute and push corresponding fetch promise
      if (element.dataset.editableTextId) {
        const id = element.dataset.editableTextId;
        const docRef = doc(db, `artifacts/${firebaseConfig.projectId}/public/data/editableTexts`, id);
        textFetchPromises.push(getDoc(docRef).then(snapshot => ({ element, snapshot, id, type: 'text' })));
      }
      if (element.dataset.editablePlaceholderId) {
        const id = element.dataset.editablePlaceholderId;
        const docRef = doc(db, `artifacts/${firebaseConfig.projectId}/public/data/editableTexts`, id);
        textFetchPromises.push(getDoc(docRef).then(snapshot => ({ element, snapshot, id, type: 'placeholder' })));
      }
      if (element.dataset.editableColorId) {
        const id = element.dataset.editableColorId;
        const docRef = doc(db, `artifacts/${firebaseConfig.projectId}/public/data/editableStyles`, id);
        styleFetchPromises.push(getDoc(docRef).then(snapshot => ({ element, snapshot, id, type: 'color' })));
      }
      if (element.dataset.editableBackgroundColorId) {
        const id = element.dataset.editableBackgroundColorId;
        const docRef = doc(db, `artifacts/${firebaseConfig.projectId}/public/data/editableStyles`, id);
        styleFetchPromises.push(getDoc(docRef).then(snapshot => ({ element, snapshot, id, type: 'background-color' })));
      }
      // Combine gradient and background-image handling under data-editable-background-id
      else if (element.dataset.editableGradientId) { // Legacy gradient ID
          const id = element.dataset.editableGradientId;
          const docRef = doc(db, `artifacts/${firebaseConfig.projectId}/public/data/editableStyles`, id);
          styleFetchPromises.push(getDoc(docRef).then(snapshot => {
              const firebaseType = snapshot.exists() ? snapshot.data().type : 'gradient'; 
              return { element, snapshot, id, type: firebaseType }; 
          }));
      } else if (element.dataset.editableBackgroundImageId) { // Legacy background-image ID
          const id = element.dataset.editableBackgroundImageId;
          const docRef = doc(db, `artifacts/${firebaseConfig.projectId}/public/data/editableStyles`, id);
          styleFetchPromises.push(getDoc(docRef).then(snapshot => {
              const firebaseType = snapshot.exists() ? snapshot.data().type : 'background-image';
              return { element, snapshot, id, type: firebaseType }; 
          }));
      } else if (element.dataset.editableBackgroundId) { // New generic background ID
          const id = element.dataset.editableBackgroundId;
          const docRef = doc(db, `artifacts/${firebaseConfig.projectId}/public/data/editableStyles`, id);
          styleFetchPromises.push(getDoc(docRef).then(snapshot => {
              const firebaseType = snapshot.exists() ? snapshot.data().type : 'gradient'; // Default to gradient if not specified
              return { element, snapshot, id, type: firebaseType }; 
          }));
      }
    });

    const textResults = await Promise.all(textFetchPromises);
    const styleResults = await Promise.all(styleFetchPromises);

    textResults.forEach(({ element, snapshot, id, type }) => {
      if (snapshot.exists()) {
        const content = snapshot.data().content;
        if (type === 'placeholder') {
          element.setAttribute('placeholder', content);
        } else {
          element.textContent = content;
        }
        console.log(`Updated text for '${id}' (type: ${type}) from Firebase.`);
      } else {
        // If content is not in Firebase, keep the default from HTML
        if (defaultTexts[id] !== undefined) {
          if (type === 'placeholder') {
            element.setAttribute('placeholder', defaultTexts[id]);
          } else {
            element.textContent = defaultTexts[id];
          }
          console.log(`No text content found in Firebase for '${id}' (type: ${type}). Using default HTML content.`);
        }
      }
    });

    styleResults.forEach(({ element, snapshot, id, type }) => { 
      if (snapshot.exists()) {
        const value = snapshot.data().value;
        const savedType = snapshot.data().type; // Get the actual type saved in Firestore

        // Always clear previous background styles before applying new ones to avoid conflicts
        element.style.backgroundImage = '';
        element.style.backgroundColor = '';
        element.style.color = ''; // Also clear color to ensure it's not overriding later
        element.style.backgroundSize = '';
        element.style.backgroundPosition = '';
        element.style.backgroundRepeat = '';

        if (savedType === 'color') { // CORRECTED: Apply to text color
            element.style.color = value;
        } else if (savedType === 'background-color') { // CORRECTED: Apply to background color
            element.style.backgroundColor = value;
        } else if (savedType === 'gradient') {
            element.style.backgroundImage = value;
        } else if (savedType === 'background-image') {
            element.style.backgroundImage = value === 'none' ? 'none' : `url('${value}')`;
            element.style.backgroundSize = 'cover'; 
            element.style.backgroundPosition = 'center';
            element.style.backgroundRepeat = 'no-repeat';
        } else {
            console.warn(`Unknown or unhandled style type '${savedType}' for ID '${id}'.`);
        }
        console.log(`Updated style for '${id}' (Firebase type: ${savedType}) from Firebase with value: ${value}`);
      } else {
        // If style not in Firebase, apply the default from HTML if captured
        if (defaultStyles[id] !== undefined) {
          const defaultVal = defaultStyles[id].value;
          const defaultType = defaultStyles[id].type;

          if (defaultType === 'color') { // CORRECTED: Apply to text color
              element.style.color = defaultVal;
          } else if (defaultType === 'background-color') { // CORRECTED: Apply to background color
              element.style.backgroundColor = defaultVal;
          } else if (defaultType === 'gradient') {
              element.style.backgroundImage = defaultVal;
          } else if (defaultType === 'background-image') {
              element.style.backgroundImage = defaultVal === 'none' ? 'none' : `url('${defaultVal}')`;
              element.style.backgroundSize = 'cover';
              element.style.backgroundPosition = 'center';
              element.style.backgroundRepeat = 'no-repeat';
          }
          console.log(`No style content found in Firebase for '${id}' (type: ${type}). Using default HTML/CSS.`);
        }
      }
    });

    // If this script is running inside the iframe in admin panel, notify parent it's loaded
    if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'IFRAME_CONTENT_LOADED' }, '*');
    }

  } catch (error) {
    console.error('Error loading editable content and styles:', error);
    // Optionally, show a user-friendly error message
  }
}

// Listen for messages from the parent window (admin.html)
window.addEventListener('message', (event) => {
    // Only process messages from the expected origin (your admin panel's domain)
    // In development, you might use '*' but secure this in production.
    if (event.data.type === 'LOAD_EDITABLE_CONTENT') {
        console.log('IFRAME: Received LOAD_EDITABLE_CONTENT message from parent.');
        loadEditableContentAndStyles(); // Reload all content and styles
    } else if (event.data.type === 'UPDATE_ELEMENT_AFTER_SAVE') {
        const { id, value, elementType } = event.data;
        // Select element based on its specific data-editable-*-id
        const element = document.querySelector(
            `[data-editable-text-id="${id}"], [data-editable-placeholder-id="${id}"], ` +
            `[data-editable-color-id="${id}"], [data-editable-background-color-id="${id}"], ` +
            `[data-editable-gradient-id="${id}"], [data-editable-background-image-id="${id}"], ` +
            `[data-editable-background-id="${id}"]` // Include the new generic background ID
        );

        if (element) {
            // Clear previous background styles to prevent conflicts
            element.style.backgroundImage = '';
            element.style.backgroundColor = '';
            element.style.color = ''; // Also clear color here for consistency
            element.style.backgroundSize = '';
            element.style.backgroundPosition = '';
            element.style.backgroundRepeat = '';

            if (elementType === 'text' || elementType === 'placeholder') { 
                if (elementType === 'placeholder') {
                    element.setAttribute('placeholder', value);
                } else {
                    element.textContent = value;
                }
            } else if (elementType === 'color') { // CORRECTED: Apply to text color
                element.style.color = value;
            } else if (elementType === 'background-color') { // CORRECTED: Apply to background color
                element.style.backgroundColor = value;
            } else if (elementType === 'gradient') { 
                element.style.backgroundImage = value;
            } else if (elementType === 'background-image') { 
                element.style.backgroundImage = value === 'none' ? 'none' : `url('${value}')`;
                element.style.backgroundSize = 'cover';
                element.style.backgroundPosition = 'center';
                element.style.backgroundRepeat = 'no-repeat';
            }
            console.log(`IFRAME: Live updated element with ID matching '${id}' and type '${elementType}' with new value.`);
        } else {
            console.warn(`IFRAME: Element with ID matching '${id}' not found for live update.`);
        }
    }
});


/**
 * Loads and displays details for a single project based on ID from URL.
 */
async function loadProjectDetails() {
    const urlParams = new URLSearchParams(window.location.search);
    const projectId = urlParams.get('id');

    const projectTitleTag = document.getElementById('project-detail-title-tag');
    const projectLoadingDiv = document.getElementById('project-loading');
    const projectErrorDiv = document.getElementById('project-error');
    const projectDisplayDiv = document.getElementById('project-display');
    const projectTitleElement = document.getElementById('project-title');
    const projectImageGalleryElement = document.getElementById('project-image-gallery'); // New: for multiple images
    const projectDescriptionElement = document.getElementById('project-description');

    // Show loading, hide others
    if (projectLoadingDiv) projectLoadingDiv.classList.remove('hidden');
    if (projectErrorDiv) projectErrorDiv.classList.add('hidden');
    if (projectDisplayDiv) projectDisplayDiv.classList.add('hidden');

    if (!projectId) {
        console.error('No project ID found in URL.');
        if (projectLoadingDiv) projectLoadingDiv.classList.add('hidden');
        if (projectErrorDiv) projectErrorDiv.classList.remove('hidden');
        if (projectTitleTag) projectTitleTag.textContent = 'Project Not Found - Statyba';
        return;
    }

    try {
        if (!db) {
            console.error("loadProjectDetails: Firestore DB is null or undefined.");
            throw new Error("Database not initialized.");
        }

        const projectDocRef = doc(db, `artifacts/${firebaseConfig.projectId}/public/data/projects`, projectId);
        console.log(`Fetching project details for ID: ${projectId} from path: ${projectDocRef.path}`); // Debug log
        const projectSnapshot = await getDoc(projectDocRef);

        if (projectSnapshot.exists()) {
            const projectData = projectSnapshot.data();
            console.log('Successfully fetched project data:', projectData); // Debug log

            if (projectTitleElement) {
              projectTitleElement.textContent = projectData.title || 'Untitled Project';
            }
            if (projectDescriptionElement) {
              projectDescriptionElement.textContent = projectData.description || 'No description available.';
            }
            if (projectTitleTag) {
                projectTitleTag.textContent = `${projectData.title} - Statyba`;
            }

            // Populate image gallery
            if (projectImageGalleryElement) {
                projectImageGalleryElement.innerHTML = ''; // Clear existing images
                if (projectData.imageUrls && projectData.imageUrls.length > 0) {
                    console.log('Rendering images:', projectData.imageUrls); // Debug log image URLs
                    projectData.imageUrls.forEach(url => {
                        const img = document.createElement('img');
                        img.src = url;
                        img.alt = projectData.title || 'Project Image'; // Use project title as alt text
                        img.className = 'w-full h-auto object-cover rounded-lg shadow-md mb-4'; // Tailwind classes for styling
                        img.loading = 'lazy'; // Lazy load images
                        img.onerror = () => { // Add error handling for images
                            console.error(`Failed to load image: ${url}`);
                            img.src = 'https://placehold.co/800x600?text=Image+Load+Error'; // Fallback
                            img.alt = 'Image Load Error';
                        };
                        projectImageGalleryElement.appendChild(img);
                    });
                } else {
                    console.log('No images found for this project. Displaying placeholder.');
                    // Fallback if no images are available
                    const noImage = document.createElement('img');
                    noImage.src = 'https://placehold.co/800x600?text=No+Image';
                    noImage.alt = 'No Image Available';
                    noImage.className = 'w-full h-auto object-cover rounded-lg shadow-md mb-4';
                    projectImageGalleryElement.appendChild(noImage);
                }
            }

            // Hide loading and show content
            if (projectLoadingDiv) projectLoadingDiv.classList.add('hidden');
            if (projectDisplayDiv) projectDisplayDiv.classList.remove('hidden');

        } else {
            console.warn(`Project with ID ${projectId} not found.`);
            if (projectLoadingDiv) projectLoadingDiv.classList.add('hidden');
            if (projectErrorDiv) projectErrorDiv.classList.remove('hidden');
            if (projectTitleTag) projectTitleTag.textContent = 'Project Not Found - Statyba';
        }
    } catch (error) {
        console.error('Error loading project details:', error);
        if (projectLoadingDiv) projectLoadingDiv.classList.add('hidden');
        if (projectErrorDiv) projectErrorDiv.classList.remove('hidden');
        if (projectTitleTag) projectTitleTag.textContent = 'Error - Statyba';
    }
}
