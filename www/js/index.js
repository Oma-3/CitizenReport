let currentLatitude = null;
let currentLongitude = null;
let currentLocationName = "";
let selectedImage = "";
let authMode = "login";
let incidents = [];
let currentUserProfile = null;
let firstIncidentLoad = true;

// ----------------------------------------------------
// PAGE NAVIGATION
// ----------------------------------------------------

function showPage(pageId) {
  document.querySelectorAll(".page").forEach((page) => {
    page.classList.remove("active");
  });

  const selectedPage = document.getElementById(pageId);

  if (selectedPage) {
    selectedPage.classList.add("active");
  }

  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.remove("active-nav");
  });

  if (pageId === "homePage") {
    document.querySelectorAll(".nav-item")[0]?.classList.add("active-nav");
  }

  if (pageId === "incidentsPage") {
    document.querySelectorAll(".nav-item")[1]?.classList.add("active-nav");
    renderAllIncidents();
  }

  if (pageId === "loginPage") {
    document.querySelectorAll(".nav-item")[2]?.classList.add("active-nav");
    updateAccountPage();
  }

  window.scrollTo(0, 0);
}

function openReportPage() {
  const user = auth.currentUser;

  if (!user) {
    showPage("loginPage");

    const message = document.getElementById("authMessage");

    if (message) {
      message.textContent =
        "Please log in or create an account to submit an incident.";

      message.className = "auth-error";
    }

    showToast("Please log in before submitting a report.");
    return;
  }

  showPage("reportPage");
}

// ----------------------------------------------------
// INCIDENT CARDS
// ----------------------------------------------------

function createIncidentCard(incident) {
  const imageHTML = incident.image
    ? `<img src="${incident.image}" alt="Incident picture">`
    : "";

  let locationHTML = "Location unavailable";

  // New reports can display the readable location.
  if (incident.locationName) {
    locationHTML = `📍 ${escapeHTML(incident.locationName)}`;
  } else if (
    incident.latitude !== null &&
    incident.latitude !== undefined &&
    incident.longitude !== null &&
    incident.longitude !== undefined
  ) {
    // Older reports still work because they already contain coordinates.
    locationHTML =
      `📍 ${Number(incident.latitude).toFixed(5)}, ` +
      `${Number(incident.longitude).toFixed(5)}`;
  }

  return `
    <article class="incident-card">
      <span class="category-badge">
        ${escapeHTML(incident.category || "Other")}
      </span>

      <h3>${escapeHTML(incident.title || "Untitled Incident")}</h3>

      <p>${escapeHTML(incident.description || "")}</p>

      ${imageHTML}

      <p class="incident-meta">
        ${locationHTML}<br>
        Reported: ${escapeHTML(formatIncidentDate(incident))}
      </p>
    </article>
  `;
}

// This version is used only on the owner's account page.
function createMyIncidentCard(incident) {
  const imageHTML = incident.image
    ? `<img src="${incident.image}" alt="Incident picture">`
    : "";

  let locationHTML = "Location unavailable";

  if (incident.locationName) {
    locationHTML = `📍 ${escapeHTML(incident.locationName)}`;
  } else if (
    incident.latitude !== null &&
    incident.latitude !== undefined &&
    incident.longitude !== null &&
    incident.longitude !== undefined
  ) {
    locationHTML =
      `📍 ${Number(incident.latitude).toFixed(5)}, ` +
      `${Number(incident.longitude).toFixed(5)}`;
  }

  return `
    <article class="incident-card">
      <span class="category-badge">
        ${escapeHTML(incident.category || "Other")}
      </span>

      <h3>${escapeHTML(incident.title || "Untitled Incident")}</h3>

      <p>${escapeHTML(incident.description || "")}</p>

      ${imageHTML}

      <p class="incident-meta">
        ${locationHTML}<br>
        Reported: ${escapeHTML(formatIncidentDate(incident))}
      </p>

      <button
        type="button"
        class="delete-report-btn"
        onclick="deleteReport('${incident.id}')"
      >
        Delete Report
      </button>
    </article>
  `;
}

function formatIncidentDate(incident) {
  if (incident.createdAt && incident.createdAt.toDate) {
    return incident.createdAt.toDate().toLocaleString();
  }

  if (incident.date) {
    return incident.date;
  }

  return "Recently";
}

function renderRecentIncidents() {
  const container = document.getElementById("recentIncidents");

  if (!container) return;

  const recent = incidents.slice(0, 3);

  if (recent.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        No incidents have been reported yet.
      </div>
    `;
    return;
  }

  container.innerHTML = recent.map(createIncidentCard).join("");
}

function renderAllIncidents(category = "All") {
  const container = document.getElementById("allIncidents");

  if (!container) return;

  let filteredIncidents = [...incidents];

  if (category !== "All") {
    filteredIncidents = filteredIncidents.filter(
      (incident) => incident.category === category,
    );
  }

  if (filteredIncidents.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        No incidents found in this category.
      </div>
    `;
    return;
  }

  container.innerHTML = filteredIncidents.map(createIncidentCard).join("");
}

function filterIncidents(category, button) {
  document.querySelectorAll(".filter").forEach((filter) => {
    filter.classList.remove("active-filter");
  });

  button.classList.add("active-filter");

  renderAllIncidents(category);
}

// ----------------------------------------------------
// REAL-TIME FIRESTORE INCIDENTS
// ----------------------------------------------------

db.collection("incidents")
  .orderBy("createdAt", "desc")
  .onSnapshot(
    (snapshot) => {
      const previousCount = incidents.length;

      incidents = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      renderRecentIncidents();
      renderAllIncidents();

      if (auth.currentUser) {
        renderMyReports(auth.currentUser.uid);
      }

      if (!firstIncidentLoad && incidents.length > previousCount) {
        showToast("A new incident has been reported.");
      }

      firstIncidentLoad = false;
    },

    (error) => {
      console.error("Firestore error:", error);

      const recentContainer = document.getElementById("recentIncidents");

      if (recentContainer) {
        recentContainer.innerHTML = `
          <div class="empty-state">
            Unable to load incidents. Check your internet connection.
          </div>
        `;
      }
    },
  );

// ----------------------------------------------------
// GEOLOCATION
// ----------------------------------------------------

function getLocation() {
  const result = document.getElementById("locationResult");

  if (!result) return;

  if (!navigator.geolocation) {
    result.textContent = "Geolocation is not supported on this device.";
    return;
  }

  result.textContent = "Getting your location...";

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      currentLatitude = position.coords.latitude;
      currentLongitude = position.coords.longitude;

      result.innerHTML = `
        <strong>Location captured</strong><br>
        Finding location name...
      `;

      try {
        await getReadableLocation(currentLatitude, currentLongitude);

        if (currentLocationName) {
          result.innerHTML = `
            <strong>📍 ${escapeHTML(currentLocationName)}</strong><br>
            <span class="coordinate-text">
              Latitude: ${currentLatitude.toFixed(6)}<br>
              Longitude: ${currentLongitude.toFixed(6)}
            </span>
          `;
        } else {
          showCoordinateLocation(result);
        }
      } catch (error) {
        console.error("Readable location error:", error);

        showCoordinateLocation(result);
      }
    },

    (error) => {
      console.error("Location error:", error);

      currentLatitude = null;
      currentLongitude = null;
      currentLocationName = "";

      result.textContent =
        "Unable to get location. Please allow location permission and try again.";
    },

    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    },
  );
}

async function getReadableLocation(latitude, longitude) {
  currentLocationName = "";

  const url =
    "https://api.bigdatacloud.net/data/reverse-geocode-client" +
    `?latitude=${encodeURIComponent(latitude)}` +
    `&longitude=${encodeURIComponent(longitude)}` +
    "&localityLanguage=en";

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Unable to retrieve readable location.");
  }

  const data = await response.json();

  const locality =
    data.locality ||
    data.city ||
    data.localityInfo?.administrative?.[0]?.name ||
    "";

  const principalSubdivision = data.principalSubdivision || "";
  const countryName = data.countryName || "";

  const locationParts = [];

  if (locality) {
    locationParts.push(locality);
  }

  if (
    principalSubdivision &&
    !locationParts.some(
      (part) => part.toLowerCase() === principalSubdivision.toLowerCase(),
    )
  ) {
    locationParts.push(principalSubdivision);
  }

  if (
    countryName &&
    !locationParts.some(
      (part) => part.toLowerCase() === countryName.toLowerCase(),
    )
  ) {
    locationParts.push(countryName);
  }

  currentLocationName = locationParts.join(", ");
}

function showCoordinateLocation(result) {
  currentLocationName = "";

  result.innerHTML = `
    <strong>Location captured</strong><br>
    Latitude: ${currentLatitude.toFixed(6)}<br>
    Longitude: ${currentLongitude.toFixed(6)}
  `;
}

// ----------------------------------------------------
// IMAGE COMPRESSION AND PREVIEW
// ----------------------------------------------------

const imageInput = document.getElementById("incidentImage");

if (imageInput) {
  imageInput.addEventListener("change", function (event) {
    const file = event.target.files[0];

    const preview = document.getElementById("imagePreview");

    if (!file) {
      selectedImage = "";

      if (preview) {
        preview.src = "";
        preview.style.display = "none";
      }

      return;
    }

    if (!file.type.startsWith("image/")) {
      showToast("Please select an image file.");

      this.value = "";

      return;
    }

    showToast("Preparing image...");

    const reader = new FileReader();

    reader.onload = function (e) {
      const image = new Image();

      image.onload = function () {
        const canvas = document.createElement("canvas");

        const maxWidth = 600;
        const maxHeight = 600;

        let width = image.width;
        let height = image.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const context = canvas.getContext("2d");

        context.drawImage(image, 0, 0, width, height);

        // Keep the existing compressed image approach.
        selectedImage = canvas.toDataURL("image/jpeg", 0.45);

        if (preview) {
          preview.src = selectedImage;
          preview.style.display = "block";
        }

        showToast("Image added.");
      };

      image.onerror = function () {
        selectedImage = "";

        if (preview) {
          preview.style.display = "none";
        }

        showToast("Unable to process this image.");
      };

      image.src = e.target.result;
    };

    reader.onerror = function () {
      selectedImage = "";

      showToast("Unable to read this image.");
    };

    reader.readAsDataURL(file);
  });
}

// ----------------------------------------------------
// SUBMIT INCIDENT TO FIRESTORE
// ----------------------------------------------------

document
  .getElementById("incidentForm")
  .addEventListener("submit", async function (event) {
    event.preventDefault();

    const user = auth.currentUser;

    if (!user) {
      showToast("You must be logged in to submit an incident.");

      showPage("loginPage");

      return;
    }

    const title = document.getElementById("title").value.trim();

    const category = document.getElementById("category").value;

    const description = document.getElementById("description").value.trim();

    if (!title || !category || !description) {
      showToast("Please complete all required fields.");

      return;
    }

    try {
      showToast("Submitting incident...");

      await db.collection("incidents").add({
        title: title,
        category: category,
        description: description,

        latitude: currentLatitude,
        longitude: currentLongitude,

        locationName: currentLocationName || "",

        image: selectedImage || "",

        userId: user.uid,
        userEmail: user.email,
        userName: currentUserProfile?.name || user.displayName || user.email,

        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });

      this.reset();

      currentLatitude = null;
      currentLongitude = null;
      currentLocationName = "";
      selectedImage = "";

      document.getElementById("locationResult").textContent =
        "Location not added yet.";

      const preview = document.getElementById("imagePreview");

      if (preview) {
        preview.src = "";
        preview.style.display = "none";
      }

      showToast("Incident submitted successfully.");

      setTimeout(() => {
        showPage("homePage");
      }, 600);
    } catch (error) {
      console.error("Incident submission error:", error);

      if (error.code === "invalid-argument") {
        showToast("The selected image is too large. Please choose another.");
      } else {
        showToast("Unable to submit incident. Please try again.");
      }
    }
  });

// ----------------------------------------------------
// LOGIN / SIGN-UP DISPLAY
// ----------------------------------------------------

function toggleAuthMode() {
  const loginForm = document.getElementById("loginForm");

  const signupForm = document.getElementById("signupForm");

  const heading = document.getElementById("accountHeading");

  const description = document.getElementById("accountDescription");

  const switchText = document.getElementById("switchText");

  const switchButton = document.getElementById("switchAuthButton");

  const message = document.getElementById("authMessage");

  message.textContent = "";
  message.className = "";

  if (authMode === "login") {
    authMode = "signup";

    loginForm.classList.add("hidden");
    signupForm.classList.remove("hidden");

    heading.textContent = "Create Account";

    description.textContent =
      "Create an account to submit incidents and keep track of your reports.";

    switchText.textContent = "Already have an account?";

    switchButton.textContent = "Login";
  } else {
    authMode = "login";

    signupForm.classList.add("hidden");
    loginForm.classList.remove("hidden");

    heading.textContent = "Welcome Back";

    description.textContent =
      "Sign in to submit incidents and view your reports.";

    switchText.textContent = "Don't have an account?";

    switchButton.textContent = "Sign Up";
  }
}

// ----------------------------------------------------
// FIREBASE SIGN UP
// ----------------------------------------------------

document
  .getElementById("signupForm")
  .addEventListener("submit", async function (event) {
    event.preventDefault();

    const name = document.getElementById("signupName").value.trim();

    const email = document
      .getElementById("signupEmail")
      .value.trim()
      .toLowerCase();

    const password = document.getElementById("signupPassword").value;

    const confirmPassword = document.getElementById("confirmPassword").value;

    const message = document.getElementById("authMessage");

    if (!name || !email || !password || !confirmPassword) {
      message.textContent = "Please complete all fields.";
      message.className = "auth-error";

      return;
    }

    if (password.length < 6) {
      message.textContent = "Password must contain at least 6 characters.";
      message.className = "auth-error";

      return;
    }

    if (password !== confirmPassword) {
      message.textContent = "Passwords do not match.";
      message.className = "auth-error";

      return;
    }

    try {
      const result = await auth.createUserWithEmailAndPassword(email, password);

      await result.user.updateProfile({
        displayName: name,
      });

      currentUserProfile = {
        name: name,
        email: email,
        uid: result.user.uid,
      };

      this.reset();

      showToast("Account created successfully.");

      updateAccountPage();
    } catch (error) {
      console.error("Signup error:", error);

      if (error.code === "auth/email-already-in-use") {
        message.textContent = "An account with this email already exists.";
      } else if (error.code === "auth/invalid-email") {
        message.textContent = "Please enter a valid email address.";
      } else if (error.code === "auth/weak-password") {
        message.textContent = "Please choose a stronger password.";
      } else {
        message.textContent = "Unable to create account. Please try again.";
      }

      message.className = "auth-error";
    }
  });

// ----------------------------------------------------
// FIREBASE LOGIN
// ----------------------------------------------------

document
  .getElementById("loginForm")
  .addEventListener("submit", async function (event) {
    event.preventDefault();

    const email = document
      .getElementById("loginEmail")
      .value.trim()
      .toLowerCase();

    const password = document.getElementById("loginPassword").value;

    const message = document.getElementById("authMessage");

    try {
      await auth.signInWithEmailAndPassword(email, password);

      this.reset();

      message.textContent = "";
      message.className = "";

      showToast("Login successful.");
    } catch (error) {
      console.error("Login error:", error);

      message.textContent = "Incorrect email or password.";

      message.className = "auth-error";
    }
  });

// ----------------------------------------------------
// AUTHENTICATION STATE
// ----------------------------------------------------

auth.onAuthStateChanged((user) => {
  if (user) {
    currentUserProfile = {
      uid: user.uid,
      email: user.email,
      name: user.displayName || user.email.split("@")[0],
    };
  } else {
    currentUserProfile = null;
  }

  updateAccountPage();
});

// ----------------------------------------------------
// ACCOUNT PAGE
// ----------------------------------------------------

function updateAccountPage() {
  const loggedOut = document.getElementById("loggedOutAccount");

  const loggedIn = document.getElementById("loggedInAccount");

  const user = auth.currentUser;

  if (!user) {
    loggedOut.classList.remove("hidden");
    loggedIn.classList.add("hidden");

    return;
  }

  loggedOut.classList.add("hidden");
  loggedIn.classList.remove("hidden");

  const displayName =
    user.displayName || currentUserProfile?.name || user.email.split("@")[0];

  document.getElementById("accountUserName").textContent = displayName;

  document.getElementById("accountUserEmail").textContent = user.email;

  document.getElementById("userAvatar").textContent = displayName
    .charAt(0)
    .toUpperCase();

  renderMyReports(user.uid);
}

// ----------------------------------------------------
// MY REPORTS
// ----------------------------------------------------

function renderMyReports(userId) {
  const container = document.getElementById("myReports");

  if (!container) return;

  const userIncidents = incidents.filter(
    (incident) => incident.userId === userId,
  );

  if (userIncidents.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        You haven't submitted any incidents yet.
      </div>
    `;

    return;
  }

  container.innerHTML = userIncidents.map(createMyIncidentCard).join("");
}

async function deleteReport(incidentId) {
  const user = auth.currentUser;

  if (!user) {
    showToast("Please log in to manage your reports.");

    return;
  }

  const incident = incidents.find((item) => item.id === incidentId);

  if (!incident) {
    showToast("This report could not be found.");

    return;
  }

  // Client-side ownership check.
  if (incident.userId !== user.uid) {
    showToast("You can only delete your own reports.");

    return;
  }

  const confirmed = window.confirm(
    "Are you sure you want to delete this report? This cannot be undone.",
  );

  if (!confirmed) {
    return;
  }

  try {
    showToast("Deleting report...");

    await db.collection("incidents").doc(incidentId).delete();

    showToast("Report deleted successfully.");
  } catch (error) {
    console.error("Delete report error:", error);

    if (error.code === "permission-denied") {
      showToast("You do not have permission to delete this report.");
    } else {
      showToast("Unable to delete report. Please try again.");
    }
  }
}

// ----------------------------------------------------
// LOGOUT
// ----------------------------------------------------

async function logout() {
  try {
    await auth.signOut();

    showToast("You have been logged out.");

    showPage("loginPage");
  } catch (error) {
    console.error("Logout error:", error);

    showToast("Unable to log out. Please try again.");
  }
}

// ----------------------------------------------------
// UTILITIES
// ----------------------------------------------------

function showToast(message) {
  const toast = document.getElementById("toast");

  if (!toast) return;

  toast.textContent = message;

  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
  }, 2500);
}

function escapeHTML(value) {
  const div = document.createElement("div");

  div.textContent = String(value);

  return div.innerHTML;
}
