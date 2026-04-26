const STORAGE_KEY = "visa-photo-tracker-v2";

const CATEGORY_PRESETS = [
  { id: "all", label: "Alles" },
  { id: "parking", label: "🅿 Parkeren" },
  { id: "fuel", label: "⛽ Brandstof" },
  { id: "toll", label: "🛣 Tol" },
  { id: "transport", label: "🚌 Openbaar vervoer" },
  { id: "taxi", label: "🚕 Taxi" },
  { id: "rental", label: "🚗 Huurwagen" },
  { id: "food", label: "🍽 Eten" },
  { id: "hotel", label: "🏨 Hotel" },
  { id: "other", label: "📦 Overige" }
];

const SEED_ITEMS = [];

const cropRatios = {
  auto: "4 / 5",
  square: "1 / 1",
  portrait: "4 / 5",
  banner: "16 / 10"
};

const state = loadState();

const elements = {
  screens: [...document.querySelectorAll(".screen")],
  photoInput: document.getElementById("photoInput"),
  heroUploadButton: document.getElementById("heroUploadButton"),
  photoUploadButton: document.getElementById("photoUploadButton"),
  openSheetButton: document.getElementById("openSheetButton"),
  exportButton: document.getElementById("exportButton"),
  categoryStrip: document.getElementById("categoryStrip"),
  expenseList: document.getElementById("expenseList"),
  totalDisplay: document.getElementById("totalDisplay"),
  formSheet: document.getElementById("formSheet"),
  formPreview: document.getElementById("formPreview"),
  aiStatus: document.getElementById("aiStatus"),
  aiStatusText: document.getElementById("aiStatusText"),
  photoDate: document.getElementById("photoDate"),
  photoTitle: document.getElementById("photoTitle"),
  photoCredit: document.getElementById("photoCredit"),
  photoUrl: document.getElementById("photoUrl"),
  photoCategory: document.getElementById("photoCategory"),
  customCategory: document.getElementById("customCategory"),
  photoTags: document.getElementById("photoTags"),
  photoNotes: document.getElementById("photoNotes"),
  previewUrlButton: document.getElementById("previewUrlButton"),
  savePhotoButton: document.getElementById("savePhotoButton"),
  reviewScreen: document.getElementById("reviewScreen"),
  reviewBackButton: document.getElementById("reviewBackButton"),
  acceptReviewButton: document.getElementById("acceptReviewButton"),
  reviewImage: document.getElementById("reviewImage"),
  reviewFrame: document.getElementById("reviewFrame"),
  toolButtons: [...document.querySelectorAll(".tool-btn[data-crop-mode]")],
  editModal: document.getElementById("editModal"),
  editDate: document.getElementById("editDate"),
  editTitle: document.getElementById("editTitle"),
  editCredit: document.getElementById("editCredit"),
  editCategory: document.getElementById("editCategory"),
  editTags: document.getElementById("editTags"),
  editNotes: document.getElementById("editNotes"),
  cancelEditButton: document.getElementById("cancelEditButton"),
  saveEditButton: document.getElementById("saveEditButton"),
  closeFormSheetBtn: document.getElementById("closeFormSheetBtn"),
  toast: document.getElementById("toast")
};

init();

function init() {
  bindEvents();
  renderCategoryOptions();
  renderCategoryStrip();
  renderList();
  elements.photoDate.valueAsDate = new Date();
}

function bindEvents() {
  elements.heroUploadButton.addEventListener("click", () => elements.photoInput.click());
  elements.photoUploadButton.addEventListener("click", () => elements.photoInput.click());
  elements.photoInput.addEventListener("change", handleFileUpload);
  elements.openSheetButton.addEventListener("click", () => openFormSheet({ focusUrl: true }));
  elements.previewUrlButton.addEventListener("click", handleUrlPreview);
  elements.savePhotoButton.addEventListener("click", savePhoto);
  elements.reviewBackButton.addEventListener("click", closeReview);
  elements.acceptReviewButton.addEventListener("click", acceptReview);
  elements.exportButton.addEventListener("click", exportPhotos);
  elements.cancelEditButton.addEventListener("click", closeEdit);
  elements.saveEditButton.addEventListener("click", saveEdit);
  elements.closeFormSheetBtn.addEventListener("click", closeFormSheet);

  elements.formSheet.addEventListener("click", (event) => {
    if (event.target === elements.formSheet) closeFormSheet();
  });

  elements.editModal.addEventListener("click", (event) => {
    if (event.target === elements.editModal) closeEdit();
  });

  elements.toolButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.pending.cropMode = button.dataset.cropMode;
      renderReviewCropMode();
    });
  });

  elements.categoryStrip.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-category-id]");
    if (!button) return;
    state.activeCategory = button.dataset.categoryId;
    renderCategoryStrip();
    renderList();
  });

  elements.expenseList.addEventListener("click", (event) => {
    const action = event.target.closest("button[data-action]");
    if (!action) return;

    const item = state.photos.find((entry) => entry.id === action.dataset.id);
    if (!item) return;

    if (action.dataset.action === "edit") {
      openEdit(item.id);
    }

    if (action.dataset.action === "delete") {
      state.photos = state.photos.filter((entry) => entry.id !== item.id);
      persistState();
      renderCategoryStrip();
      renderList();
      showToast("✓ Foto verwijderd");
    }

    if (action.dataset.action === "focus") {
      item.focusY = cycleFocus(item.focusY);
      persistState();
      renderList();
      showToast("✓ Uitsnede aangepast");
    }
  });
}

async function handleFileUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  setStatus("scanning", "Foto laden en auto crop bepalen...");
  try {
    const image = await readFileAsDataUrl(file);
    const cropMode = await detectCropMode(image);
    state.pending = {
      image,
      cropMode,
      focusY: defaultFocus(cropMode)
    };
    openReview();
    setStatus("success", "✓ Preview klaar");
  } catch (err) {
    console.error(err);
    setStatus("error", "Kon deze foto niet laden");
  } finally {
    elements.photoInput.value = "";
  }
}

async function handleUrlPreview() {
  const url = elements.photoUrl.value.trim();
  if (!url) {
    showToast("Voeg eerst een afbeeldingslink toe");
    return;
  }

  setStatus("scanning", "Link laden en automatische crop instellen...");
  try {
    const cropMode = await detectCropMode(url);
    state.pending = {
      image: url,
      cropMode,
      focusY: defaultFocus(cropMode)
    };
    openReview();
    setStatus("success", "✓ Preview klaar");
  } catch (err) {
    console.error(err);
    setStatus("error", "Deze link kon niet als afbeelding geladen worden");
  }
}

function openReview() {
  elements.formSheet.classList.remove("open");
  elements.reviewImage.src = state.pending.image;
  renderReviewCropMode();
  showScreen("reviewScreen");
}

function closeReview() {
  showScreen("homeScreen");
}

function acceptReview() {
  closeReview();
  openFormSheet();
}

function renderReviewCropMode() {
  const cropMode = state.pending.cropMode || "auto";
  elements.toolButtons.forEach((button) => {
    button.classList.toggle("active-filter", button.dataset.cropMode === cropMode);
  });

  const effectiveMode = cropMode === "auto" ? "portrait" : cropMode;
  elements.reviewFrame.style.setProperty("--review-ratio", cropRatios[effectiveMode] || cropRatios.portrait);
  elements.reviewFrame.style.setProperty("--review-position", `${state.pending.focusY ?? 50}%`);
}

function openFormSheet(options = {}) {
  resetFormFields();

  if (state.pending.image) {
    elements.formPreview.hidden = false;
    elements.formPreview.src = state.pending.image;
    elements.formPreview.style.setProperty("--form-position", `${state.pending.focusY ?? 50}%`);
  } else {
    elements.formPreview.hidden = true;
    elements.formPreview.removeAttribute("src");
  }

  elements.formSheet.classList.add("open");
  if (options.focusUrl) {
    elements.photoUrl.focus();
  }
}

function closeFormSheet() {
  elements.formSheet.classList.remove("open");
  setStatus("hidden");
}

function resetFormFields() {
  elements.photoDate.value = formatToday();
  elements.photoTitle.value = "";
  elements.photoCredit.value = "";
  elements.photoTags.value = "";
  elements.photoNotes.value = "";
  elements.customCategory.value = "";
  if (!elements.photoUrl.value) {
    elements.photoUrl.value = "";
  }
}

async function savePhoto() {
  const title = elements.photoTitle.value.trim();
  if (!title) {
    showToast("Geef je foto eerst een titel");
    return;
  }

  let image = state.pending.image;
  if (!image && elements.photoUrl.value.trim()) {
    try {
      const cropMode = await detectCropMode(elements.photoUrl.value.trim());
      state.pending = {
        image: elements.photoUrl.value.trim(),
        cropMode,
        focusY: defaultFocus(cropMode)
      };
      image = state.pending.image;
    } catch (err) {
      console.error(err);
      showToast("De link kon niet geladen worden");
      return;
    }
  }

  if (!image) {
    showToast("Upload een foto of laad eerst een linkpreview");
    return;
  }

  const categoryId = ensureCategory(elements.photoCategory.value, elements.customCategory.value.trim());
  const tags = elements.photoTags.value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

  state.photos.unshift({
    id: crypto.randomUUID(),
    date: elements.photoDate.value || formatToday(),
    title,
    credit: elements.photoCredit.value.trim(),
    category: categoryId,
    tags,
    notes: elements.photoNotes.value.trim(),
    image,
    cropMode: state.pending.cropMode || "auto",
    focusY: state.pending.focusY ?? 50
  });

  persistState();
  closeFormSheet();
  clearPending();
  renderCategoryOptions();
  renderCategoryStrip();
  renderList();
  elements.photoUrl.value = "";
  showToast("✓ Foto toegevoegd");
}

function ensureCategory(selectedId, customLabel) {
  if (!customLabel) return selectedId;

  const id = slugify(customLabel);
  const existing = state.categories.find((entry) => entry.id === id);
  if (existing) return existing.id;

  const category = {
    id,
    label: `📁 ${customLabel}`
  };
  state.categories.push(category);
  return category.id;
}

function renderCategoryOptions() {
  const options = state.categories
    .filter((entry) => entry.id !== "all")
    .map((entry) => `<option value="${escapeHtml(entry.id)}">${escapeHtml(entry.label)}</option>`)
    .join("");

  elements.photoCategory.innerHTML = options;
  elements.editCategory.innerHTML = options;
}

function renderCategoryStrip() {
  const counts = countCategories();
  elements.categoryStrip.innerHTML = state.categories
    .map((entry) => {
      const count = entry.id === "all" ? state.photos.length : (counts.get(entry.id) ?? 0);
      return `
        <button class="category-pill${state.activeCategory === entry.id ? " active" : ""}" type="button" data-category-id="${escapeHtml(entry.id)}">
          ${escapeHtml(entry.label)} · ${count}
        </button>
      `;
    })
    .join("");
}

function renderList() {
  const filtered = getVisiblePhotos();
  elements.totalDisplay.textContent = String(filtered.length);

  if (!filtered.length) {
    elements.expenseList.innerHTML = `
      <div class="empty-state">
        <div class="ei">🖼</div>
        <h3>Nog geen foto's</h3>
        <p>Voeg hierboven je eerste beeld toe</p>
      </div>
    `;
    return;
  }

  elements.expenseList.innerHTML = filtered
    .map((photo) => {
      const category = state.categories.find((entry) => entry.id === photo.category);
      const cropLabel = (photo.cropMode || "auto").toUpperCase();
      return `
        <div class="expense-card">
          <div class="ec-top">
            <div class="ec-thumb" style="--thumb-position:${photo.focusY ?? 50}%;">
              <img src="${escapeAttribute(photo.image)}" alt="${escapeAttribute(photo.title)}">
            </div>
            <div class="ec-body">
              <div class="ec-row">
                <div class="ec-desc">${escapeHtml(photo.title)}</div>
                <div class="ec-amount">${escapeHtml(cropLabel)}</div>
              </div>
              <div class="ec-date">📅 ${escapeHtml(formatDate(photo.date))}${photo.credit ? ` · ${escapeHtml(photo.credit)}` : ""}</div>
              <span class="ec-cat">${escapeHtml((category?.label || "Overige").replace(/[^\x00-\x7F]/g, "").trim())}</span>
              ${photo.notes ? `<div class="ec-note">${escapeHtml(photo.notes)}</div>` : ""}
              <div class="ec-tags">${photo.tags.length ? escapeHtml(photo.tags.slice(0, 3).join(" · ")) : "auto crop actief"}</div>
            </div>
          </div>
          <div class="ec-actions">
            <button class="ec-btn" type="button" data-action="edit" data-id="${escapeHtml(photo.id)}">✏ Bewerken</button>
            <button class="ec-btn" type="button" data-action="focus" data-id="${escapeHtml(photo.id)}">↕ Herkader</button>
            <button class="ec-btn del" type="button" data-action="delete" data-id="${escapeHtml(photo.id)}">✕ Verwijder</button>
          </div>
        </div>
      `;
    })
    .join("");
}

function openEdit(id) {
  const photo = state.photos.find((entry) => entry.id === id);
  if (!photo) return;

  state.editingId = id;
  elements.editDate.value = photo.date;
  elements.editTitle.value = photo.title;
  elements.editCredit.value = photo.credit || "";
  elements.editCategory.value = photo.category;
  elements.editTags.value = photo.tags.join(", ");
  elements.editNotes.value = photo.notes || "";
  elements.editModal.classList.add("open");
}

function closeEdit() {
  elements.editModal.classList.remove("open");
  state.editingId = null;
}

function saveEdit() {
  const photo = state.photos.find((entry) => entry.id === state.editingId);
  if (!photo) return;

  photo.date = elements.editDate.value || photo.date;
  photo.title = elements.editTitle.value.trim() || photo.title;
  photo.credit = elements.editCredit.value.trim();
  photo.category = elements.editCategory.value;
  photo.tags = elements.editTags.value.split(",").map((tag) => tag.trim()).filter(Boolean);
  photo.notes = elements.editNotes.value.trim();

  persistState();
  closeEdit();
  renderCategoryStrip();
  renderList();
  showToast("✓ Opgeslagen");
}

function exportPhotos() {
  if (!state.photos.length) {
    showToast("Geen foto's om te exporteren");
    return;
  }

  const payload = {
    exportedAt: new Date().toISOString(),
    total: state.photos.length,
    photos: state.photos
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `visa-photo-tracker-${formatToday()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  showToast("✓ Export gedownload");
}

function countCategories() {
  return state.photos.reduce((map, photo) => {
    map.set(photo.category, (map.get(photo.category) ?? 0) + 1);
    return map;
  }, new Map());
}

function getVisiblePhotos() {
  if (state.activeCategory === "all") return state.photos;
  return state.photos.filter((photo) => photo.category === state.activeCategory);
}

function showScreen(id) {
  elements.screens.forEach((screen) => screen.classList.remove("active"));
  const target = document.getElementById(id);
  if (target) target.classList.add("active");
}

function clearPending() {
  state.pending = {
    image: null,
    cropMode: "auto",
    focusY: 50
  };
}

function setStatus(mode, message = "") {
  elements.aiStatus.className = "ai-status";
  if (mode === "hidden") {
    elements.aiStatusText.textContent = "";
    return;
  }
  elements.aiStatus.classList.add(mode);
  elements.aiStatusText.textContent = message;
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  window.clearTimeout(state.toastTimer);
  state.toastTimer = window.setTimeout(() => {
    elements.toast.classList.remove("show");
  }, 2200);
}

async function detectCropMode(source) {
  const image = await loadImage(source);
  const ratio = image.naturalWidth / image.naturalHeight;

  // Ratio-based detection
  if (ratio >= 1.35) return "banner";
  if (ratio <= 0.88) return "portrait";
  return "square";
}

function defaultFocus(cropMode) {
  if (cropMode === "portrait") return 34;
  if (cropMode === "banner") return 48;
  return 46;
}

function cycleFocus(value = 50) {
  const steps = [28, 38, 50, 62];
  const index = steps.findIndex((step) => Math.abs(step - value) < 2);
  return steps[(index + 1) % steps.length];
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.crossOrigin = "anonymous";
    image.src = source;
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function formatToday() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value) {
  if (!value || !value.includes("-")) return value || "";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function loadState() {
  const fallback = {
    categories: CATEGORY_PRESETS.map((entry) => ({ ...entry })),
    photos: SEED_ITEMS.map((entry) => ({ ...entry })),
    activeCategory: "all",
    pending: {
      image: null,
      cropMode: "auto",
      focusY: 50
    },
    editingId: null,
    toastTimer: null
  };

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return {
      ...fallback,
      ...parsed,
      categories: mergeCategories(parsed.categories),
      photos: Array.isArray(parsed.photos) ? parsed.photos : fallback.photos,
      pending: fallback.pending
    };
  } catch (err) {
    console.error(err);
    return fallback;
  }
}

function mergeCategories(savedCategories = []) {
  const map = new Map();
  CATEGORY_PRESETS.forEach((entry) => map.set(entry.id, { ...entry }));
  savedCategories.forEach((entry) => {
    if (!map.has(entry.id)) map.set(entry.id, entry);
  });
  return [...map.values()];
}

function persistState() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      categories: state.categories,
      photos: state.photos,
      activeCategory: state.activeCategory
    })
  );
}

function slugify(value) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 28);
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value = "") {
  return escapeHtml(value).replaceAll("`", "&#96;");
}