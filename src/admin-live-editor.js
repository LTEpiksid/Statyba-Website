// admin-live-editor.js
import { db, storage, auth, firebaseConfig } from './firebase.js'; // Ensure firebaseConfig is imported
import { getDoc, setDoc, doc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { showNotification, trapFocus, releaseFocus } from './ui-utils.js';

// --- DOM Elements ---
const liveEditorIframe = document.getElementById('live-editor-iframe');
const liveEditorLoading = document.getElementById('live-editor-loading');

// Universal Edit Modal Elements
const editModalOverlay = document.getElementById('live-editor-edit-modal-overlay');
const editModalCloseBtn = document.getElementById('live-editor-edit-modal-close-btn');
const editModalCancelBtn = document.getElementById('live-editor-edit-modal-cancel-btn');
const editModalSaveBtn = document.getElementById('live-editor-edit-modal-save-btn');
const editModalSaveText = document.getElementById('live-editor-edit-modal-save-text');
const editModalSpinner = document.getElementById('live-editor-edit-modal-spinner');
const editModalTitle = document.getElementById('live-editor-edit-modal-title');

// Sections within the modal
const editTextSection = document.getElementById('edit-text-section');
const editTextArea = document.getElementById('edit-live-text-area');

const editTextColorSection = document.getElementById('edit-text-color-section');
const editTextColorPicker = document.getElementById('edit-live-text-color-picker');
const editTextColorHex = document.getElementById('edit-live-text-color-hex');

const editBgColorSection = document.getElementById('edit-color-section');
const editBgColorPicker = document.getElementById('edit-live-color-picker');
const editBgColorHex = document.getElementById('edit-live-color-hex');

const editBackgroundSection = document.getElementById('edit-background-section');
const backgroundTypeGradientRadio = document.getElementById('background-type-gradient');
const backgroundTypeImageRadio = document.getElementById('background-type-image');
const editGradientSection = document.getElementById('edit-gradient-section');
const editGradientColor1 = document.getElementById('edit-live-gradient-color1');
const editGradientHex1 = document.getElementById('edit-live-gradient-hex1');
const editGradientColor2 = document.getElementById('edit-live-gradient-color2');
const editGradientHex2 = document.getElementById('edit-live-gradient-hex2');
const editGradientDirection = document.getElementById('edit-live-gradient-direction');

const editImageSection = document.getElementById('edit-image-section');
const editImageURL = document.getElementById('edit-live-image-url');
const editImageUpload = document.getElementById('edit-live-image-upload');
const editImagePreview = document.getElementById('edit-live-image-preview');


// --- Global State ---
let currentEditableElement = null; // Reference to the element in the iframe being edited
let elementThatOpenedModal = null; // To return focus to after modal closes in parent admin.html
// Stores mapping: { 'text': 'text-id', 'color': 'color-id', 'backgroundColor': 'bg-color-id', 'background': 'bg-id' }
let currentEditableProperties = {}; 


// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    console.log('admin-live-editor.js: DOMContentLoaded fired.');
    // Set up iframe load listener
    liveEditorIframe.addEventListener('load', handleIframeLoad);

    // Set up modal event listeners
    editModalCloseBtn.addEventListener('click', closeEditModal);
    editModalCancelBtn.addEventListener('click', closeEditModal);
    editModalSaveBtn.addEventListener('click', saveChangesToFirebase);

    // Color picker and hex input synchronization for BACKGROUND color
    editBgColorPicker.addEventListener('input', () => {
        editBgColorHex.value = editBgColorPicker.value;
        applyLivePreview();
    });
    editBgColorHex.addEventListener('input', () => {
        if (/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(editBgColorHex.value)) {
            editBgColorPicker.value = editBgColorHex.value;
            applyLivePreview();
        }
    });

    // Color picker and hex input synchronization for TEXT color
    editTextColorPicker.addEventListener('input', () => {
        editTextColorHex.value = editTextColorPicker.value;
        applyLivePreview();
    });
    editTextColorHex.addEventListener('input', () => {
        if (/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(editTextColorHex.value)) {
            editTextColorPicker.value = editTextColorHex.value;
            applyLivePreview();
        }
    });

    // Gradient color pickers and hex inputs synchronization
    editGradientColor1.addEventListener('input', () => {
        editGradientHex1.value = editGradientColor1.value;
        applyLivePreview();
    });
    editGradientHex1.addEventListener('input', () => {
        if (/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(editGradientHex1.value)) {
            editGradientColor1.value = editGradientHex1.value;
            applyLivePreview();
        }
    });
    editGradientColor2.addEventListener('input', () => {
        editGradientHex2.value = editGradientColor2.value;
        applyLivePreview();
    });
    editGradientHex2.addEventListener('input', () => {
        if (/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(editGradientHex2.value)) {
            editGradientColor2.value = editGradientHex2.value;
            applyLivePreview();
        }
    });
    editGradientDirection.addEventListener('change', applyLivePreview);

    // Image URL input and file upload
    editImageURL.addEventListener('input', applyLivePreview);
    editImageUpload.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                editImagePreview.src = event.target.result;
                editImagePreview.classList.remove('hidden');
                // Auto-select image radio if a file is chosen
                backgroundTypeImageRadio.checked = true;
                showBackgroundEditSection('image');
                applyLivePreview();
            };
            reader.readAsDataURL(file);
        } else {
            editImagePreview.classList.add('hidden');
            editImagePreview.src = '';
            applyLivePreview();
        }
    });

    editTextArea.addEventListener('input', applyLivePreview);

    // Background type radio buttons listeners
    backgroundTypeGradientRadio.addEventListener('change', () => {
        showBackgroundEditSection('gradient');
        applyLivePreview(); // Apply preview immediately on type change
    });
    backgroundTypeImageRadio.addEventListener('change', () => {
        showBackgroundEditSection('image');
        applyLivePreview(); // Apply preview immediately on type change
    });

    // Listener for tab change (from admin-dashboard.js)
    document.querySelectorAll('.tab-btn').forEach(button => {
        button.addEventListener('click', () => {
            if (button.dataset.tab === 'live-editor') {
                if (auth.currentUser) {
                    // Force a reload of the iframe when the Live Editor tab is clicked
                    // This ensures the iframe content gets the latest Firebase data
                    liveEditorLoading.classList.remove('hidden'); // Show loading spinner
                    liveEditorIframe.src = liveEditorIframe.src; // Reload iframe
                } else {
                    showNotification('Access Denied', 'Please log in to access the Live Editor.', 'info');
                }
            }
        });
    });
});

// --- Iframe Communication ---

/**
 * Checks if an element has any of the defined editable data attributes.
 * @param {HTMLElement} element The element to check.
 * @returns {boolean} True if the element has any editable attribute, false otherwise.
 */
function hasAnyEditableAttribute(element) {
    return (
        element.dataset.editableTextId ||
        element.dataset.editablePlaceholderId ||
        element.dataset.editableColorId ||
        element.dataset.editableBackgroundColorId ||
        element.dataset.editableGradientId ||
        element.dataset.editableBackgroundImageId ||
        element.dataset.editableBackgroundId // New generic background ID
    );
}

function handleIframeLoad() {
    liveEditorLoading.classList.add('hidden'); // Hide loading spinner once iframe is loaded
    console.log('Iframe loaded. Attaching click listeners to iframe content.');
    try {
        const iframeDoc = liveEditorIframe.contentDocument || liveEditorIframe.contentWindow.document;
        // Add a class to the iframe body for specific styling in admin mode if needed
        iframeDoc.body.classList.add('admin-live-edit-mode');

        // Attach event listeners to the iframe's document body
        iframeDoc.body.addEventListener('click', handleIframeClick);
        // Add a mouseover/mouseout for visual indication
        iframeDoc.body.addEventListener('mouseover', handleIframeMouseOver);
        iframeDoc.body.addEventListener('mouseout', handleIframeMouseOut);

        // Notify iframe to load editable content from Firebase
        // This is important because the iframe runs in its own context
        liveEditorIframe.contentWindow.postMessage({ type: 'LOAD_EDITABLE_CONTENT' }, '*');

    } catch (error) {
        console.error('Error accessing iframe content:', error);
        showNotification('Error', 'Could not load live editor. Browser security restrictions may apply.', 'error');
    }
}

function handleIframeMouseOver(e) {
    let target = e.target;
    // Traverse up the DOM to find the closest editable element
    while (target && target !== this && !hasAnyEditableAttribute(target)) {
        target = target.parentNode;
    }
    if (target && hasAnyEditableAttribute(target)) {
        target.classList.add('editable-element'); // Add class for highlighting
    }
}

function handleIframeMouseOut(e) {
    let target = e.target;
    // Traverse up the DOM to find the closest editable element
    while (target && target !== this && !hasAnyEditableAttribute(target)) {
        target = target.parentNode;
    }
    if (target && hasAnyEditableAttribute(target)) {
        target.classList.remove('editable-element'); // Remove class
    }
}

function handleIframeClick(e) {
    e.preventDefault(); // Prevent default link clicks or button actions inside iframe

    let target = e.target;
    // Traverse up the DOM to find the closest editable element based on any data-editable-* attribute
    while (target && target !== this && !hasAnyEditableAttribute(target)) {
        target = target.parentNode;
    }

    if (target && hasAnyEditableAttribute(target)) {
        currentEditableElement = target;
        currentEditableProperties = {}; // Reset properties for new element

        // Populate currentEditableProperties based on specific data-editable-*-id attributes
        if (target.dataset.editableTextId) {
            currentEditableProperties.text = target.dataset.editableTextId;
        }
        if (target.dataset.editablePlaceholderId) {
            currentEditableProperties.placeholder = target.dataset.editablePlaceholderId;
        }
        if (target.dataset.editableColorId) { // For text color
            currentEditableProperties.color = target.dataset.editableColorId;
        }
        if (target.dataset.editableBackgroundColorId) { // For background color
            currentEditableProperties.backgroundColor = target.dataset.editableBackgroundColorId;
        }
        // Use a single 'background' property for generic background handling
        if (target.dataset.editableGradientId) { // Fallback for old gradient ID
            currentEditableProperties.background = target.dataset.editableGradientId;
        }
        if (target.dataset.editableBackgroundImageId) { // Fallback for old image ID
            currentEditableProperties.background = target.dataset.editableBackgroundImageId;
        }
        if (target.dataset.editableBackgroundId) { // New generic background ID
            currentEditableProperties.background = target.dataset.editableBackgroundId;
        }
        
        console.log('Clicked editable element:', target.id || 'No ID', 'Properties:', currentEditableProperties);

        // Highlight the selected element in the iframe
        liveEditorIframe.contentDocument.querySelectorAll('.editable-element.selected').forEach(el => el.classList.remove('selected'));
        currentEditableElement.classList.add('selected');

        openEditModal(currentEditableElement, currentEditableProperties);
    } else {
        console.log('Clicked non-editable element or outside editable area.');
    }
}

// Listen for messages from the iframe (e.g., when it confirms content loaded or changes)
window.addEventListener('message', (event) => {
    // Ensure the message is from our iframe and from a trusted origin in production
    // For local development, '*' is fine, but specify origin in production
    if (event.source === liveEditorIframe.contentWindow) {
        const data = event.data;
        if (data.type === 'IFRAME_CONTENT_LOADED') {
            console.log('Received IFRAME_CONTENT_LOADED from iframe.');
        } else if (data.type === 'UPDATE_ELEMENT_STYLE') {
            // This can be used to reflect changes from the iframe if it initiates them
        }
    }
});


// --- Edit Modal Functions ---
async function openEditModal(element, properties) {
    // Hide all sections first
    editTextSection.classList.add('hidden');
    editTextColorSection.classList.add('hidden'); 
    editBgColorSection.classList.add('hidden');
    editBackgroundSection.classList.add('hidden'); // Parent for gradient/image
    editGradientSection.classList.add('hidden');
    editImageSection.classList.add('hidden');
    editImagePreview.classList.add('hidden'); // Always hide preview initially
    editImageUpload.value = ''; // Clear file input
    editImageURL.value = ''; // Clear URL input


    editModalTitle.textContent = `Edit: ${element.id || 'Element'}`;

    let firstInput = null; // To set initial focus

    // Show and populate sections based on identified properties
    if (properties.text || properties.placeholder) {
        editTextSection.classList.remove('hidden');
        editTextArea.value = properties.placeholder ? element.getAttribute('placeholder') : element.textContent;
        firstInput = firstInput || editTextArea;
    }
    
    if (properties.color) { // Text color
        editTextColorSection.classList.remove('hidden');
        const currentColor = window.getComputedStyle(element).color;
        const hexColor = rgbToHex(currentColor);
        editTextColorPicker.value = hexColor;
        editTextColorHex.value = hexColor;
        firstInput = firstInput || editTextColorPicker;
    }

    if (properties.backgroundColor) { // Background color (simple, non-gradient/image)
        editBgColorSection.classList.remove('hidden');
        const currentBgColor = window.getComputedStyle(element).backgroundColor;
        const hexBgColor = rgbToHex(currentBgColor);
        editBgColorPicker.value = hexBgColor;
        editBgColorHex.value = hexBgColor;
        firstInput = firstInput || editBgColorPicker;
    }

    if (properties.background) { // Generic background (gradient/image)
        editBackgroundSection.classList.remove('hidden');
        
        const backgroundStyleId = properties.background;
        const docRef = doc(db, `artifacts/${firebaseConfig.projectId}/public/data/editableStyles`, backgroundStyleId);
        const snapshot = await getDoc(docRef);

        let savedType = 'gradient'; // Default if not found or no type
        let savedValue = '';

        if (snapshot.exists()) {
            const data = snapshot.data();
            savedType = data.type || savedType;
            savedValue = data.value || '';
        } else {
            // If no data in Firebase, try to infer from live element's computed style
            const computedBackground = window.getComputedStyle(element).backgroundImage;
            const computedBackgroundColor = window.getComputedStyle(element).backgroundColor;

            if (computedBackground && computedBackground !== 'none' && computedBackground.startsWith('linear-gradient')) {
                savedType = 'gradient';
                savedValue = computedBackground;
            } else if (computedBackground && computedBackground !== 'none' && computedBackground.startsWith('url')) {
                savedType = 'background-image';
                savedValue = computedBackground;
            } else if (computedBackgroundColor && computedBackgroundColor !== 'rgba(0, 0, 0, 0)' && computedBackgroundColor !== 'transparent') {
                 // If it's a solid background color, treat it as a background color, not gradient/image
                savedType = 'background-color';
                savedValue = computedBackgroundColor;
                // For a background-color saved as generic 'background', show color picker in background section
                editBgColorSection.classList.remove('hidden');
                const hexColor = rgbToHex(savedValue);
                editBgColorPicker.value = hexColor;
                editBgColorHex.value = hexColor;
                firstInput = firstInput || editBgColorPicker; // Set focus if it's the first active input
            } else {
                // Default to gradient if nothing found
                savedType = 'gradient';
                savedValue = 'linear-gradient(135deg, #ea580c, #dc2626)'; // Default gradient
            }
        }
        
        // Ensure radio buttons reflect the actual type
        if (savedType === 'gradient') {
            backgroundTypeGradientRadio.checked = true;
            showBackgroundEditSection('gradient');
            const parsed = parseGradient(savedValue);
            if (parsed) {
                editGradientDirection.value = parsed.direction;
                editGradientColor1.value = parsed.color1; editGradientHex1.value = parsed.color1;
                editGradientColor2.value = parsed.color2; editGradientHex2.value = parsed.color2;
            } else {
                // Fallback if parsing fails
                editGradientDirection.value = '135deg';
                editGradientColor1.value = '#ea580c'; editGradientHex1.value = '#ea580c';
                editGradientColor2.value = '#dc2626'; editGradientHex2.value = '#dc2626';
            }
        } else if (savedType === 'background-image') {
            backgroundTypeImageRadio.checked = true;
            showBackgroundEditSection('image');
            const imageUrlMatch = savedValue.match(/url\(['"]?(.*?)['"]?\)/);
            if (imageUrlMatch && imageUrlMatch[1]) {
                editImageURL.value = imageUrlMatch[1].replace(/"/g, '');
                editImagePreview.src = editImageURL.value;
                editImagePreview.classList.remove('hidden');
            } else {
                editImageURL.value = savedValue === 'none' ? '' : savedValue; // Show 'none' as empty
                editImagePreview.classList.add('hidden');
            }
        } else if (savedType === 'background-color') {
            // If the saved type is 'background-color' for a 'data-editable-background-id',
            // we will effectively handle it as a single color background, not a gradient/image type.
            // This case should be handled by `editBgColorSection` above.
            // If it somehow reached here, it means the background system is mixing.
            // For now, we will default it to gradient as a fallback in this section, 
            // though ideally, this ID should manage complex backgrounds only.
            backgroundTypeGradientRadio.checked = true;
            showBackgroundEditSection('gradient');
            editGradientDirection.value = '135deg';
            editGradientColor1.value = rgbToHex(savedValue); editGradientHex1.value = rgbToHex(savedValue);
            editGradientColor2.value = rgbToHex(savedValue); editGradientHex2.value = rgbToHex(savedValue);
            showNotification('Warning', 'A plain background color was found for a complex background element. Defaulting to gradient.', 'warning');
        }

        firstInput = firstInput || (backgroundTypeGradientRadio.checked ? editGradientColor1 : editImageURL);
    }


    editModalOverlay.classList.add('open');
    editModalOverlay.classList.remove('hidden');
    trapFocus(editModalOverlay, firstInput || editModalCloseBtn);
}

function showBackgroundEditSection(type) {
    if (type === 'gradient') {
        editGradientSection.classList.remove('hidden');
        editImageSection.classList.add('hidden');
    } else if (type === 'image') {
        editImageSection.classList.remove('hidden');
        editGradientSection.classList.add('hidden');
    }
}

function closeEditModal() {
    editModalOverlay.classList.remove('open');
    setTimeout(() => {
        editModalOverlay.classList.add('hidden');
        // Remove highlighting from the selected element
        if (currentEditableElement) {
            currentEditableElement.classList.remove('selected');
        }
        currentEditableElement = null;
        currentEditableProperties = {}; // Clear properties
        releaseFocus(editModalOverlay, elementThatOpenedModal || liveEditorIframe); // Return focus to iframe or original element
    }, 300); // Match CSS transition duration
}

function applyLivePreview() {
    if (!currentEditableElement || Object.keys(currentEditableProperties).length === 0 || !liveEditorIframe.contentDocument) return;

    const iframeElement = currentEditableElement; // Reference to the element inside the iframe

    if (currentEditableProperties.text || currentEditableProperties.placeholder) {
        const newContent = editTextArea.value;
        if (currentEditableProperties.placeholder) { 
            iframeElement.setAttribute('placeholder', newContent);
        } else {
            iframeElement.textContent = newContent;
        }
    }
    
    if (currentEditableProperties.color) { // For text color
        const newColor = editTextColorHex.value;
        iframeElement.style.color = newColor;
    }
    
    if (currentEditableProperties.backgroundColor) { // For simple background color
        const newColor = editBgColorHex.value;
        iframeElement.style.backgroundColor = newColor;
        // Ensure no background image/gradient is applied if it's a simple background color
        iframeElement.style.backgroundImage = 'none';
    }

    if (currentEditableProperties.background) { // Generic background (gradient/image)
        // Clear previous background styles to avoid conflicts
        iframeElement.style.backgroundImage = 'none';
        iframeElement.style.backgroundColor = 'transparent'; // Ensure transparent if no color explicitly set

        if (backgroundTypeGradientRadio.checked) {
            const color1 = editGradientHex1.value;
            const color2 = editGradientHex2.value;
            const direction = editGradientDirection.value;
            iframeElement.style.backgroundImage = `linear-gradient(${direction}, ${color1}, ${color2})`;
            iframeElement.style.backgroundSize = ''; // Clear image-specific styles
            iframeElement.style.backgroundPosition = '';
            iframeElement.style.backgroundRepeat = '';
        } else if (backgroundTypeImageRadio.checked) {
            const imageUrl = editImageURL.value;
            const imageFile = editImageUpload.files[0];

            if (imageFile) {
                // If a new file is selected, show its preview immediately
                const reader = new FileReader();
                reader.onload = (e) => {
                    iframeElement.style.backgroundImage = `url('${e.target.result}')`;
                    iframeElement.style.backgroundSize = 'cover';
                    iframeElement.style.backgroundPosition = 'center';
                    iframeElement.style.backgroundRepeat = 'no-repeat';
                };
                reader.readAsDataURL(imageFile);
            } else {
                // Otherwise, use the URL from the input
                iframeElement.style.backgroundImage = imageUrl ? `url('${imageUrl}')` : 'none';
                iframeElement.style.backgroundSize = 'cover';
                iframeElement.style.backgroundPosition = 'center';
                iframeElement.style.backgroundRepeat = 'no-repeat';
            }
        }
    }
}


async function saveChangesToFirebase() {
    if (!currentEditableElement || Object.keys(currentEditableProperties).length === 0 || !auth.currentUser) {
        showNotification('Error', 'No element selected, no editable properties, or not authenticated.', 'error');
        return;
    }

    editModalSaveBtn.disabled = true;
    editModalSaveText.classList.add('hidden');
    editModalSpinner.classList.remove('hidden');
    editModalSpinner.setAttribute('aria-label', 'Saving changes');

    const savePromises = [];

    // Save Text property
    if (currentEditableProperties.text) {
        const textId = currentEditableProperties.text;
        const newContent = editTextArea.value;
        savePromises.push(saveEditableTextToFirestore(textId, newContent));
    }
    // Save Placeholder property (also treated as text)
    if (currentEditableProperties.placeholder) {
        const placeholderId = currentEditableProperties.placeholder;
        const newContent = editTextArea.value; // Placeholder uses the same textarea
        savePromises.push(saveEditableTextToFirestore(placeholderId, newContent));
    }

    // Save Text Color property
    if (currentEditableProperties.color) {
        const colorId = currentEditableProperties.color;
        const newColor = editTextColorHex.value;
        savePromises.push(saveEditableStyleToFirestore(colorId, { type: 'color', value: newColor }));
    }

    // Save Background Color property (simple, non-gradient/image)
    if (currentEditableProperties.backgroundColor) {
        const bgColorId = currentEditableProperties.backgroundColor;
        const newBgColor = editBgColorHex.value;
        savePromises.push(saveEditableStyleToFirestore(bgColorId, { type: 'background-color', value: newBgColor }));
    }

    // Save Generic Background property (gradient/image)
    if (currentEditableProperties.background) {
        const styleId = currentEditableProperties.background;
        let styleTypeToSave;
        let styleValueToSave;

        if (backgroundTypeGradientRadio.checked) {
            styleTypeToSave = 'gradient';
            const color1 = editGradientHex1.value;
            const color2 = editGradientHex2.value;
            const direction = editGradientDirection.value;
            styleValueToSave = `linear-gradient(${direction}, ${color1}, ${color2})`;
        } else if (backgroundTypeImageRadio.checked) {
            styleTypeToSave = 'background-image';
            let imageUrlToSave = editImageURL.value;
            const imageFile = editImageUpload.files[0];

            if (imageFile) {
                // Upload new image to Storage
                const imageRef = ref(storage, `artifacts/${firebaseConfig.projectId}/public/images/editor/${imageFile.name}`);
                const uploadResult = await uploadBytes(imageRef, imageFile);
                imageUrlToSave = await getDownloadURL(uploadResult.ref);

                // Delete old image if it existed and was from Firebase Storage
                const currentBgImageStyle = window.getComputedStyle(currentEditableElement).backgroundImage;
                const oldImageUrlMatch = currentBgImageStyle.match(/url\(['"]?(.*?)['"]?\)/);
                if (oldImageUrlMatch && oldImageUrlMatch[1] && oldImageUrlMatch[1].includes('firebasestorage.googleapis.com')) {
                    try {
                        const oldPathStartIndex = oldImageUrlMatch[1].indexOf(`/o/artifacts%2F${firebaseConfig.projectId}%2Fpublic%2Fimages%2Feditor%2F`) + `/o/artifacts%2F${firebaseConfig.projectId}%2Fpublic%2Fimages%2Feditor%2F`.length;
                        let oldStoragePath = oldImageUrlMatch[1].substring(oldPathStartIndex);
                        oldStoragePath = decodeURIComponent(oldStoragePath.split('?')[0]); 
                        const oldImageRef = ref(storage, `artifacts/${firebaseConfig.projectId}/public/images/editor/${oldStoragePath}`);
                        await deleteObject(oldImageRef);
                        console.log('Old image deleted:', oldImageUrlMatch[1]);
                    } catch (deleteError) {
                        console.warn('Could not delete old image:', deleteError);
                    }
                }
            } else if (!imageUrlToSave) {
                // User cleared the URL input or no file uploaded, set to 'none' to clear background image
                const currentBgImageStyle = window.getComputedStyle(currentEditableElement).backgroundImage;
                if (currentBgImageStyle !== 'none' && currentBgImageStyle.startsWith('url')) {
                     // Only attempt to delete if there was an image previously
                    const oldImageUrlMatch = currentBgImageStyle.match(/url\(['"]?(.*?)['"]?\)/);
                    if (oldImageUrlMatch && oldImageUrlMatch[1] && oldImageUrlMatch[1].includes('firebasestorage.googleapis.com')) {
                        try {
                            const oldPathStartIndex = oldImageUrlMatch[1].indexOf(`/o/artifacts%2F${firebaseConfig.projectId}%2Fpublic%2Fimages%2Feditor%2F`) + `/o/artifacts%2F${firebaseConfig.projectId}%2Fpublic%2Fimages%2Feditor%2F`.length;
                            let oldStoragePath = oldImageUrlMatch[1].substring(oldPathStartIndex);
                            oldStoragePath = decodeURIComponent(oldStoragePath.split('?')[0]); 
                            const oldImageRef = ref(storage, `artifacts/${firebaseConfig.projectId}/public/images/editor/${oldStoragePath}`);
                            await deleteObject(oldImageRef);
                            console.log('Old image deleted due to clear input:', oldImageUrlMatch[1]);
                        } catch (deleteError) {
                            console.warn('Could not delete old image on clear input:', deleteError);
                        }
                    }
                }
                imageUrlToSave = 'none'; 
            }
            styleValueToSave = imageUrlToSave;
        }
        
        savePromises.push(saveEditableStyleToFirestore(styleId, { type: styleTypeToSave, value: styleValueToSave }));
    }


    try {
        const results = await Promise.all(savePromises);
        const allSuccessful = results.every(result => result === true);

        if (allSuccessful) {
            showNotification('Success', 'Changes saved successfully!', 'success');
            // Post message back to iframe to update its content based on saved data (or current preview)
            // This ensures consistency without a full iframe reload
            for (const propType in currentEditableProperties) {
                const propId = currentEditableProperties[propType];
                let valueToSend;
                let elementTypeToUpdate = propType; // Corresponds to the field in Firebase, or CSS property

                if (propType === 'text' || propType === 'placeholder') {
                    valueToSend = editTextArea.value;
                    elementTypeToUpdate = propType; // 'text' or 'placeholder'
                } else if (propType === 'color') {
                    valueToSend = editTextColorHex.value;
                } else if (propType === 'backgroundColor') {
                    valueToSend = editBgColorHex.value;
                    elementTypeToUpdate = 'background-color';
                } else if (propType === 'background') { // Generic background
                    if (backgroundTypeGradientRadio.checked) {
                        const color1 = editGradientHex1.value;
                        const color2 = editGradientHex2.value;
                        const direction = editGradientDirection.value;
                        valueToSend = `linear-gradient(${direction}, ${color1}, ${color2})`;
                        elementTypeToUpdate = 'gradient'; // This will be the 'type' saved in Firebase
                    } else if (backgroundTypeImageRadio.checked) {
                        const imageFile = editImageUpload.files[0];
                        if (imageFile) {
                            // If a file was just uploaded, use the new URL.
                            // This would require waiting for the upload result, or sending a placeholder
                            // and then updating again. For now, we'll rely on the main.js reload or
                            // a second postMessage if the URL is only known after upload.
                            // Simplest: `main.js` re-fetches from Firebase for this ID.
                            // So, we don't send the direct image data here, but the URL or 'none' if cleared.
                            valueToSend = editImageURL.value || 'none'; // Send the URL from input
                            elementTypeToUpdate = 'background-image'; // This will be the 'type' saved in Firebase
                        } else {
                            valueToSend = editImageURL.value || 'none'; // Send the URL from input
                            elementTypeToUpdate = 'background-image'; // This will be the 'type' saved in Firebase
                        }
                    }
                }
                
                liveEditorIframe.contentWindow.postMessage({ 
                    type: 'UPDATE_ELEMENT_AFTER_SAVE', 
                    id: propId, // Use the specific ID for this property
                    value: valueToSend, 
                    elementType: elementTypeToUpdate 
                }, '*');
            }
            closeEditModal();
        } else {
            showNotification('Error', 'Some changes failed to save. Please check console for details.', 'error');
        }

    } catch (error) {
        console.error('Error during save operation:', error);
        showNotification('Error', `Failed to save changes: ${error.message}`, 'error');
    } finally {
        editModalSaveBtn.disabled = false;
        editModalSaveText.classList.remove('hidden');
        editModalSpinner.classList.add('hidden');
        editModalSpinner.removeAttribute('aria-label');
    }
}

// Helper to convert RGB to Hex
function rgbToHex(rgb) {
    if (!rgb || rgb === 'transparent' || rgb.startsWith('rgba(0, 0, 0, 0)')) return '#000000'; 
    const parts = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
    if (!parts) return rgb; 
    const toHex = (c) => ('0' + parseInt(c).toString(16)).slice(-2);
    return `#${toHex(parts[1])}${toHex(parts[2])}${toHex(parts[3])}`;
}

// Helper to parse gradient string
function parseGradient(gradientString) {
    const match = gradientString.match(/linear-gradient\(([^,]+),\s*(.+?)\s*(?:[\d.]+%?|),\s*(.+?)\s*(?:[\d.]+%?|)\)/);
    if (match && match.length >= 4) {
        let direction = match[1].trim();
        let color1 = match[2].trim();
        let color2 = match[3].trim();
        
        if (color1.startsWith('rgb')) color1 = rgbToHex(color1);
        if (color2.startsWith('rgb')) color2 = rgbToHex(color2);

        return { direction, color1, color2 };
    }
    return null;
}

// --- Firebase Operations ---
async function saveEditableTextToFirestore(textId, newContent) {
    try {
        const textDocRef = doc(db, `artifacts/${firebaseConfig.projectId}/public/data/editableTexts`, textId);
        console.log(`Saving text to Firestore: ${textDocRef.path} with content: "${newContent}"`); // Diagnostic log
        await setDoc(textDocRef, { content: newContent, lastModified: serverTimestamp() }, { merge: true });
        console.log(`Text ID '${textId}' saved successfully.`);
        return true;
    } catch (error) {
        console.error(`Error saving editable text '${textId}':`, error);
        return false;
    }
}

async function saveEditableStyleToFirestore(styleId, data) {
    try {
        const styleDocRef = doc(db, `artifacts/${firebaseConfig.projectId}/public/data/editableStyles`, styleId);
        console.log(`Saving style to Firestore: ${styleDocRef.path} with data:`, data); // Diagnostic log
        await setDoc(styleDocRef, { ...data, lastModified: serverTimestamp() }, { merge: true });
        console.log(`Style ID '${styleId}' saved successfully.`);
        return true;
    } catch (error) {
        console.error(`Error saving editable style '${styleId}':`, error);
        return false;
    }
}
