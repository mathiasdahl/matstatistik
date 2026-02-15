const mealRows = document.getElementById("meal-rows");
const statusNode = document.getElementById("status");
const addMealForm = document.getElementById("add-meal-form");
const sortButtons = document.querySelectorAll(".sort-button");
const API_BASE = "./api";
const CATEGORY_META = {
  meat: { label: "Meat", badgeClass: "category-meat" },
  vegetarian: { label: "Vegetarian", badgeClass: "category-vegetarian" },
  fish: { label: "Fish", badgeClass: "category-fish" },
  chicken: { label: "Chicken", badgeClass: "category-chicken" },
  soup: { label: "Soup", badgeClass: "category-soup" },
};

let sortBy = "lastCooked";
let sortOrder = "asc";
let loadingMealId = null;
let editingMealId = null;
let editNameDraft = "";

function setStatus(message, isError = false) {
  statusNode.textContent = message;
  statusNode.style.color = isError ? "#b42318" : "#3a4758";
}

function formatDate(dateValue) {
  return new Date(`${dateValue}T00:00:00`).toLocaleDateString("sv-SE");
}

function getSortArrow(column) {
  if (column !== sortBy) {
    return "";
  }
  return sortOrder === "asc" ? " \u2191" : " \u2193";
}

function updateSortButtonState() {
  sortButtons.forEach((button) => {
    const column = button.dataset.sort;
    button.classList.toggle("active", column === sortBy);

    const readableText = button.textContent.replace(/\s[\u2191\u2193]$/, "");
    button.textContent = `${readableText}${getSortArrow(column)}`;
  });
}

function categoryLabel(category) {
  if (CATEGORY_META[category]) {
    return CATEGORY_META[category].label;
  }
  return category.charAt(0).toUpperCase() + category.slice(1);
}

function categoryBadgeClass(category) {
  if (CATEGORY_META[category]) {
    return CATEGORY_META[category].badgeClass;
  }
  return "category-other";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderMeals(meals) {
  if (!meals.length) {
    mealRows.innerHTML = `
      <tr>
        <td colspan="5">No meals yet. Add one above.</td>
      </tr>
    `;
    return;
  }

  mealRows.innerHTML = meals
    .map((meal) => {
      const disabled = loadingMealId === meal.id ? "disabled" : "";
      const loadingText = loadingMealId === meal.id ? "Saving..." : "Cooked today";
      const isEditing = editingMealId === meal.id;
      const disabledEdit = loadingMealId !== null ? "disabled" : "";
      const nameCell = isEditing
        ? `<input class="name-edit-input" data-action="edit-name-input" data-id="${meal.id}" value="${escapeHtml(editNameDraft)}" maxlength="80" />`
        : escapeHtml(meal.name);
      const actionCell = isEditing
        ? `
          <div class="action-buttons">
            <button data-action="save-name" data-id="${meal.id}" ${disabledEdit}>Save</button>
            <button class="secondary" data-action="cancel-name" data-id="${meal.id}" ${disabledEdit}>Cancel</button>
          </div>
        `
        : `
          <div class="action-buttons">
            <button class="secondary" data-action="edit-name" data-id="${meal.id}" ${disabledEdit}>Edit name</button>
            <button data-action="cooked-today" data-id="${meal.id}" ${disabled}>
              ${loadingText}
            </button>
          </div>
        `;
      return `
        <tr>
          <td>${nameCell}</td>
          <td>
            <span class="category-badge ${categoryBadgeClass(meal.category)}">
              ${categoryLabel(meal.category)}
            </span>
          </td>
          <td>${formatDate(meal.lastCooked)}</td>
          <td>${meal.timesCooked}</td>
          <td>${actionCell}</td>
        </tr>
      `;
    })
    .join("");
}

async function fetchMeals() {
  setStatus("Loading meals...");
  try {
    const response = await fetch(`${API_BASE}/meals?sortBy=${sortBy}&order=${sortOrder}`);
    if (!response.ok) {
      throw new Error("Could not load meals.");
    }
    const meals = await response.json();
    renderMeals(meals);
    setStatus(`${meals.length} meals shown. Sorted by ${sortBy} (${sortOrder}).`);
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function markCookedToday(mealId) {
  loadingMealId = mealId;
  await fetchMeals();

  try {
    const response = await fetch(`${API_BASE}/meals/${mealId}/cooked-today`, { method: "POST" });
    if (!response.ok) {
      throw new Error("Could not update meal.");
    }
    setStatus("Meal updated.");
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    loadingMealId = null;
    await fetchMeals();
  }
}

async function saveMealName(mealId, name) {
  loadingMealId = mealId;
  await fetchMeals();

  try {
    const response = await fetch(`${API_BASE}/meals/${mealId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Could not update meal name.");
    }

    editingMealId = null;
    editNameDraft = "";
    setStatus("Meal name updated.");
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    loadingMealId = null;
    await fetchMeals();
  }
}

addMealForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(addMealForm);
  const payload = {
    name: String(formData.get("name")),
    category: String(formData.get("category")),
    lastCooked: String(formData.get("lastCooked")),
    timesCooked: Number(formData.get("timesCooked")),
  };

  setStatus("Adding meal...");
  try {
    const response = await fetch(`${API_BASE}/meals`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Could not add meal.");
    }

    addMealForm.reset();
    document.getElementById("timesCooked").value = "0";
    setStatus("Meal added.");
    await fetchMeals();
  } catch (error) {
    setStatus(error.message, true);
  }
});

sortButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    const nextSortBy = button.dataset.sort;
    if (nextSortBy === sortBy) {
      sortOrder = sortOrder === "asc" ? "desc" : "asc";
    } else {
      sortBy = nextSortBy;
      sortOrder = "asc";
    }

    updateSortButtonState();
    await fetchMeals();
  });
});

mealRows.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) {
    return;
  }

  const mealId = Number(target.dataset.id);
  if (!Number.isInteger(mealId)) {
    return;
  }

  if (target.dataset.action === "cooked-today") {
    await markCookedToday(mealId);
    return;
  }

  if (target.dataset.action === "edit-name") {
    const row = target.closest("tr");
    const nameCell = row?.children?.[0];
    const existingName = nameCell?.textContent?.trim() || "";
    editingMealId = mealId;
    editNameDraft = existingName;
    await fetchMeals();
    const input = mealRows.querySelector(`input[data-action="edit-name-input"][data-id="${mealId}"]`);
    if (input instanceof HTMLInputElement) {
      input.focus();
      input.select();
    }
    return;
  }

  if (target.dataset.action === "cancel-name") {
    editingMealId = null;
    editNameDraft = "";
    setStatus("Edit cancelled.");
    await fetchMeals();
    return;
  }

  if (target.dataset.action === "save-name") {
    const input = mealRows.querySelector(`input[data-action="edit-name-input"][data-id="${mealId}"]`);
    if (!(input instanceof HTMLInputElement)) {
      return;
    }
    const nextName = input.value.trim();
    await saveMealName(mealId, nextName);
  }
});

mealRows.addEventListener("input", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }

  if (target.dataset.action !== "edit-name-input") {
    return;
  }

  editNameDraft = target.value;
});

updateSortButtonState();
fetchMeals();
