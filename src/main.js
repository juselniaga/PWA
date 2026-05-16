import './index.css';

// Dynamically use the current hostname to allow LAN testing (e.g., 192.168.x.x)
const API_BASE_URL = `http://${window.location.hostname}:3001/v1`;

// Helpers
const showToast = (message) => {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove('opacity-0', 'translate-y-4', 'pointer-events-none');
  toast.classList.add('opacity-100', 'translate-y-0');
  
  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-4', 'pointer-events-none');
    toast.classList.remove('opacity-100', 'translate-y-0');
  }, 3000);
};

const apiFetch = async (endpoint, options = {}) => {
  const token = localStorage.getItem('svrms_token');
  const headers = {
    ...options.headers
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // If not FormData, set Content-Type to JSON
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, { ...options, headers });
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'API request failed');
    }
    return data;
  } catch (err) {
    // If network error, throw a specific flag
    if (err.name === 'TypeError' && err.message === 'Failed to fetch') {
      throw { offline: true, message: 'No internet connection' };
    }
    throw err;
  }
};

// Offline Queue Manager
const getOfflineQueue = () => JSON.parse(localStorage.getItem('svrms_offline_queue') || '[]');
const saveToOfflineQueue = (type, payload) => {
  const queue = getOfflineQueue();
  queue.push({
    type,
    payload,
    local_id: 'ls_' + Date.now(),
    created_offline_at: new Date().toISOString()
  });
  localStorage.setItem('svrms_offline_queue', JSON.stringify(queue));
  showToast('Saved offline. Will sync when online.');
};

const syncOfflineData = async () => {
  const queue = getOfflineQueue();
  if (queue.length === 0) return;
  
  try {
    showToast(`Syncing ${queue.length} offline records...`);
    const data = await apiFetch('/sync', {
      method: 'POST',
      body: JSON.stringify({ records: queue })
    });
    
    if (data.failed === 0) {
      localStorage.removeItem('svrms_offline_queue');
      showToast('All offline data synced successfully!');
      loadTodoTasks();
    } else {
      showToast(`Sync completed with ${data.failed} errors`);
      // In production, you'd filter out success records and keep failed ones
      localStorage.removeItem('svrms_offline_queue');
    }
  } catch (err) {
    console.log('Sync failed', err);
  }
};

// Monitor online status
window.addEventListener('online', syncOfflineData);

// Navigation Variables
const screens = {
  login: document.getElementById('login-screen'),
  todo: document.getElementById('todo-screen'),
  registerSite: document.getElementById('register-site-screen'),
  siteVisit: document.getElementById('site-visit-screen'),
  review: document.getElementById('review-screen')
};

const navigateTo = (screenName) => {
  Object.values(screens).forEach(screen => screen?.classList.add('hidden'));
  if (screens[screenName]) {
    screens[screenName].classList.remove('hidden');
  }
};

// Application State
let currentApplicationId = null;

// Initialization
document.addEventListener('DOMContentLoaded', () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(err => console.log('SW error:', err));
  }

  // Call sync on load if online
  if (navigator.onLine) {
    syncOfflineData();
  }

  // --- Auth Logic ---
  const loginForm = document.getElementById('login-form');
  const passwordInput = document.getElementById('password');
  const togglePasswordBtn = document.getElementById('toggle-password');

  if (togglePasswordBtn && passwordInput) {
    togglePasswordBtn.addEventListener('click', () => {
      const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
      passwordInput.setAttribute('type', type);
      togglePasswordBtn.querySelector('span').textContent = type === 'password' ? 'visibility' : 'visibility_off';
    });
  }

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('username').value;
      const password = passwordInput.value;
      
      try {
        const data = await apiFetch('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ username, password })
        });
        localStorage.setItem('svrms_token', data.token);
        localStorage.setItem('svrms_user', JSON.stringify(data.user));
        showToast('Login successful');
        await loadTodoTasks();
        navigateTo('todo');
      } catch (err) {
        showToast(err.message || 'Login Failed');
      }
    });
  }

  // Check if already logged in
  if (localStorage.getItem('svrms_token')) {
    loadTodoTasks().then(() => navigateTo('todo')).catch(() => navigateTo('login'));
  } else {
    navigateTo('login');
  }

  // --- Logout Logic ---
  document.getElementById('logout-btn')?.addEventListener('click', () => {
    localStorage.removeItem('svrms_token');
    localStorage.removeItem('svrms_user');
    showToast('Logged out successfully');
    navigateTo('login');
  });

  // --- Back buttons ---
  document.getElementById('back-to-todo')?.addEventListener('click', () => navigateTo('todo'));
  document.getElementById('back-from-visit')?.addEventListener('click', () => navigateTo('todo'));
  document.getElementById('back-from-review')?.addEventListener('click', () => {
    // Reset checklist when leaving review screen
    ['self-check-1','self-check-2','self-check-3'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.checked = false;
    });
    updateChecklistState();
    navigateTo('todo');
  });

  // --- Self-check checklist → gate submit button ---
  const SELF_CHECK_IDS = ['self-check-1', 'self-check-2', 'self-check-3'];
  const submitReviewBtn = document.getElementById('submit-review-btn');

  function updateChecklistState() {
    const checked = SELF_CHECK_IDS.filter(id => document.getElementById(id)?.checked).length;
    const total   = SELF_CHECK_IDS.length;
    const allDone = checked === total;

    // Progress bar
    const fill  = document.getElementById('checklist-progress-fill');
    const label = document.getElementById('checklist-progress-label');
    if (fill)  fill.style.width  = `${(checked / total) * 100}%`;
    if (label) {
      label.textContent = `${checked} / ${total}`;
      label.className = allDone
        ? 'text-[9px] font-bold text-emerald-600 shrink-0'
        : 'text-[9px] font-bold text-slate-400 shrink-0';
    }

    // Toggle button
    if (!submitReviewBtn) return;
    if (allDone) {
      submitReviewBtn.disabled = false;
      submitReviewBtn.className = 'w-full h-12 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg transition-all active:scale-[0.98] flex items-center justify-center gap-2 text-xs uppercase tracking-widest cursor-pointer';
      submitReviewBtn.querySelector('span').textContent = 'send';
    } else {
      submitReviewBtn.disabled = true;
      submitReviewBtn.className = 'w-full h-12 bg-slate-200 text-slate-400 font-bold rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-widest cursor-not-allowed';
      submitReviewBtn.querySelector('span').textContent = 'lock';
    }
  }

  SELF_CHECK_IDS.forEach(id => {
    document.getElementById(id)?.addEventListener('change', updateChecklistState);
  });

  // Initialise state on load
  updateChecklistState();


  // --- Geolocation ---
  const getGPSLocation = (targetId) => {
    if (!navigator.geolocation) {
      showToast('Geolocation is not supported by your browser');
      return;
    }

    showToast('Getting location...');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const coordsStr = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
        const coordInput = document.getElementById(targetId);
        if (coordInput) {
          coordInput.value = coordsStr;
          showToast('Location updated');
        }
      },
      (error) => {
        showToast(`Location Error: ${error.message}`);
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
  };

  document.getElementById('set-current-location-btn')?.addEventListener('click', () => getGPSLocation('visit-coordinates'));
  document.getElementById('reg-set-location-btn')?.addEventListener('click', () => getGPSLocation('reg-google-lat'));

  // --- Directional Camera Capture ---
  // Photo store keyed by DB field name (photos_north, photos_south, photo_east, photo_west)
  const directionPhotos = {};

  // Map: DB field name -> short alias used in HTML element IDs
  const dirAlias = {
    photos_north: 'utara',
    photos_south: 'selatan',
    photo_east:   'timur',
    photo_west:   'barat'
  };

  const setupPhotoCapture = (dir) => {
    const alias  = dirAlias[dir];
    const inputEl   = document.getElementById(`photo-${alias}`);
    const previewEl = document.getElementById(`preview-${alias}`);
    const imgEl     = document.getElementById(`preview-${alias}-img`);

    if (!inputEl || !previewEl || !imgEl) return;

    // Trigger file picker / camera on button click
    document.querySelectorAll(`.photo-capture-btn[data-target="photo-${alias}"]`).forEach(btn => {
      btn.addEventListener('click', () => inputEl.click());
    });

    // When a file is selected show preview
    inputEl.addEventListener('change', () => {
      const file = inputEl.files[0];
      if (!file) return;

      directionPhotos[dir] = file;

      const reader = new FileReader();
      reader.onload = (e) => {
        imgEl.src = e.target.result;
        previewEl.classList.remove('hidden');
        // Show "Captured" badge in card header
        const badge = document.getElementById(`badge-${alias}`);
        if (badge) badge.classList.replace('hidden', 'flex');
      };
      reader.readAsDataURL(file);
    });
  };

  ['photos_north', 'photos_south', 'photo_east', 'photo_west'].forEach(setupPhotoCapture);

  // Remove photo handler (delegated)
  document.addEventListener('click', (e) => {
    const removeBtn = e.target.closest('.photo-remove-btn');
    if (!removeBtn) return;
    const alias = removeBtn.getAttribute('data-dir'); // HTML still uses alias (utara etc.)
    // Find the DB field key from alias
    const dir = Object.keys(dirAlias).find(k => dirAlias[k] === alias);
    if (dir) delete directionPhotos[dir];
    const inputEl   = document.getElementById(`photo-${alias}`);
    const previewEl = document.getElementById(`preview-${alias}`);
    const imgEl     = document.getElementById(`preview-${alias}-img`);
    if (inputEl)   inputEl.value = '';
    if (imgEl)     imgEl.src = '';
    if (previewEl) previewEl.classList.add('hidden');
    // Hide badge
    const badge = document.getElementById(`badge-${alias}`);
    if (badge) badge.classList.replace('flex', 'hidden');
  });

  // --- Form Actions ---

  // Register Site
  document.getElementById('register-site-action-btn')?.addEventListener('click', async () => {
    const payload = {
      application_id: currentApplicationId,
      mukim: document.getElementById('reg-mukim').value || 'Jasin',
      bpk: document.getElementById('reg-bpk').value || 'BPK 1.1',
      lot: document.getElementById('reg-lot').value || 'NA',
      kategori_tanah: document.getElementById('reg-kategori').value || 'NA',
      status_tanah: document.getElementById('reg-status-tanah').value || 'NA',
      lembaran: document.getElementById('reg-lembaran').value || 'NA',
      luas: parseFloat(document.getElementById('reg-luas').value) || 0,
      google_lat: document.getElementById('reg-google-lat').value || 'NA'
    };

    try {
      await apiFetch('/sites', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      showToast('Site Registered Successfully');
      await loadTodoTasks();
      navigateTo('todo');
    } catch (err) {
      if (err.offline) saveToOfflineQueue('site', payload);
      else showToast(err.message || 'Failed to register site');
    }
  });

  // Site Visit
  const handleSiteVisitSubmit = async (action) => {
    const user = JSON.parse(localStorage.getItem('svrms_user'));
    const payload = {
      application_id: currentApplicationId,
      officer_id: user.user_id,
      visit_date: new Date().toISOString().split('T')[0],
      location_data: document.getElementById('visit-coordinates').value || '0.00, 0.00',
      finding_north: document.getElementById('visit-finding-north').value || 'Tiada',
      findings_south: document.getElementById('visit-findings-south').value || 'Tiada',
      findings_east: document.getElementById('visit-findings-east').value || 'Tiada',
      finding_west: document.getElementById('visit-finding-west').value || 'Tiada',
      activity: document.getElementById('visit-activity').value || 'Tiada',
      facility: document.getElementById('visit-facility').value || 'Tiada',
      entrance_way: document.getElementById('visit-entrance').value || 'Tiada',
      parit: document.getElementById('visit-parit').value || 'Tiada',
      tree: document.getElementById('visit-tree').value || 'Tiada',
      topography: document.getElementById('visit-topography').value || 'Tiada',
      land_use_zone: document.getElementById('visit-zone').value || 'Tiada',
      density: document.getElementById('visit-density').value || 'Tiada',
      recommend_road: document.getElementById('visit-recommend-road').checked ? 1 : 0,
      anjakan: document.getElementById('visit-anjakan').value || 'Tiada',
      social_facility: document.getElementById('visit-social').value || 'Tiada',
      action
    };

    try {
      // Create FormData to satisfy Multer backend
      const formData = new FormData();
      Object.keys(payload).forEach(key => formData.append(key, payload[key]));

      // Attach direction photos using DB column names
      if (directionPhotos.photos_north) formData.append('photos_north', directionPhotos.photos_north, directionPhotos.photos_north.name);
      if (directionPhotos.photos_south) formData.append('photos_south', directionPhotos.photos_south, directionPhotos.photos_south.name);
      if (directionPhotos.photo_east)   formData.append('photo_east',   directionPhotos.photo_east,   directionPhotos.photo_east.name);
      if (directionPhotos.photo_west)   formData.append('photo_west',   directionPhotos.photo_west,   directionPhotos.photo_west.name);

      await apiFetch('/site-visits', {
        method: 'POST',
        body: formData
      });
      showToast(action === 'submit' ? 'Record sent for review' : 'Draft saved');
      if (action === 'submit') {
        await loadTodoTasks();
        navigateTo('todo');
      }
    } catch (err) {
      if (err.offline) {
        saveToOfflineQueue('site_visit', payload);
        if (action === 'submit') navigateTo('todo');
      } else {
        showToast(err.message || 'Failed to save site visit');
      }
    }
  };

  document.getElementById('save-draft-btn')?.addEventListener('click', () => handleSiteVisitSubmit('draft'));
  document.getElementById('save-btn')?.addEventListener('click', () => handleSiteVisitSubmit('submit'));

  // Review
  document.getElementById('submit-review-btn')?.addEventListener('click', async () => {
    const user = JSON.parse(localStorage.getItem('svrms_user'));
    const payload = {
      application_id: currentApplicationId,
      officer_id: user.user_id,
      review_content: document.getElementById('review-content').value || 'Tiada Ulasan',
      recommendation: document.getElementById('review-recommendation').value || 'SUPPORTED',
      self_check_completed: true
    };

    try {
      await apiFetch('/reviews', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      showToast('Review sent to Assistant Director');
      await loadTodoTasks();
      navigateTo('todo');
    } catch (err) {
      if (err.offline) {
        saveToOfflineQueue('review', payload);
        navigateTo('todo');
      } else {
        showToast(err.message || 'Failed to submit review');
      }
    }
  });
});

// --- Dynamic Rendering ---
async function loadTodoTasks() {
  const todoMain = document.querySelector('#todo-screen main');
  if (!todoMain) return;

  try {
    const data = await apiFetch('/todo');
    
    todoMain.innerHTML = '<h3 class="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Today\'s Tasks</h3>';

    if (data.applications && data.applications.length > 0) {
      data.applications.forEach(app => {
        let badgeColor, badgeText, btnText, btnClass;
        
        if (app.process === 'register_site') {
          badgeColor = 'bg-indigo-50 text-indigo-700'; badgeText = 'Register Site';
          btnText = 'Register Site'; btnClass = 'bg-slate-900 text-white';
        } else if (app.process === 'register_site_visit') {
          badgeColor = 'bg-amber-50 text-amber-700'; badgeText = 'Site Visit';
          btnText = 'Register Site Visit'; btnClass = 'bg-slate-900 text-white';
        } else if (app.process === 'review') {
          badgeColor = 'bg-emerald-50 text-emerald-700'; badgeText = 'Review';
          btnText = 'Review Task'; btnClass = 'bg-slate-200 text-slate-600';
        } else {
          badgeColor = 'bg-slate-50 text-slate-700'; badgeText = 'Pending';
          btnText = 'View'; btnClass = 'bg-slate-200 text-slate-600';
        }

        const taskDiv = document.createElement('div');
        taskDiv.className = 'bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col gap-3';
        taskDiv.innerHTML = `
          <div class="flex-1 flex flex-col">
              <div>
                  <span class="px-2 py-0.5 rounded ${badgeColor} text-[9px] font-bold uppercase tracking-wider">${badgeText}</span>
                  <h4 class="text-sm font-bold text-slate-900 mt-1.5">${app.reference_no} - ${app.tajuk}</h4>
                  <p class="text-[11px] text-slate-500 mt-0.5">${app.lokasi}</p>
              </div>
              <button class="task-action-btn mt-4 ${btnClass} text-[11px] font-bold px-4 py-2 rounded-lg w-fit transition-transform active:scale-95" data-id="${app.application_id}" data-process="${app.process}">
                  ${btnText}
              </button>
          </div>
        `;
        todoMain.appendChild(taskDiv);
      });

      document.querySelectorAll('.task-action-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          currentApplicationId = e.target.getAttribute('data-id');
          const processName = e.target.getAttribute('data-process');
          if (processName === 'register_site') navigateTo('registerSite');
          else if (processName === 'register_site_visit') navigateTo('siteVisit');
          else if (processName === 'review') {
            navigateTo('review');
            loadReviewPhotos(currentApplicationId);
          }
        });
      });
    } else {
      todoMain.innerHTML += '<p class="text-xs text-slate-400">No pending tasks.</p>';
    }
  } catch (err) {
    if (err.offline) {
      todoMain.innerHTML += '<p class="text-xs text-rose-500">You are offline. Cannot load live tasks.</p>';
    } else {
      console.error('Error loading tasks:', err);
    }
  }
}

// --- Review Screen: Load directional photos from site visit ---
async function loadReviewPhotos(applicationId) {
  if (!applicationId) return;

  // Laravel serves photos from its public storage
  const LARAVEL_STORAGE = `http://${window.location.hostname}:8000/storage`;

  // Map: API field name -> photo slot element ID
  const dirMap = [
    { field: 'photos_north', slotId: 'photo-slot-north' },
    { field: 'photos_south', slotId: 'photo-slot-south' },
    { field: 'photo_east',   slotId: 'photo-slot-east'  },
    { field: 'photo_west',   slotId: 'photo-slot-west'  },
  ];

  // Reset all slots to placeholder first
  dirMap.forEach(({ slotId }) => {
    const slot = document.getElementById(slotId);
    if (slot) slot.innerHTML = `
      <div class="photo-placeholder flex flex-col items-center gap-1 text-slate-300">
        <span class="material-symbols-outlined text-[28px]">add_a_photo</span>
        <span class="text-[8px] font-bold uppercase tracking-wider">Tiada foto</span>
      </div>`;
  });
  const countEl = document.getElementById('review-photo-count');
  if (countEl) countEl.textContent = '0/4 diambil';

  try {
    const visit = await apiFetch(`/site-visits/${applicationId}`);
    if (!visit) return;

    let captured = 0;

    dirMap.forEach(({ field, slotId }) => {
      const slot = document.getElementById(slotId);
      if (!slot) return;

      // DB stores JSON string e.g. '["photos/filename.jpg"]' or null
      let paths = visit[field];
      if (typeof paths === 'string') {
        try { paths = JSON.parse(paths); } catch { paths = null; }
      }

      if (Array.isArray(paths) && paths.length > 0) {
        captured++;
        const photoUrl = `${LARAVEL_STORAGE}/${paths[0]}`;
        slot.innerHTML = `
          <img
            src="${photoUrl}"
            alt="Foto ${field}"
            class="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
            onerror="this.parentElement.innerHTML='<div class=\'flex flex-col items-center gap-1 text-rose-300 p-2\'>\'
              + '<span class=\'material-symbols-outlined text-[24px]\'>broken_image</span>'
              + '<span class=\'text-[8px] font-bold\'>Gagal dimuatkan</span></div>'"
          />
          <div class="absolute inset-0" onclick="
            document.getElementById('lightbox-img').src='${photoUrl}';
            document.getElementById('photo-lightbox').classList.remove('hidden');
          "></div>`;
      }
    });

    if (countEl) countEl.textContent = `${captured}/4 diambil`;
    // Update badge color
    if (captured === 4) {
      countEl.className = 'text-[9px] font-bold text-emerald-600 bg-emerald-50 rounded-full px-2 py-0.5';
    } else if (captured > 0) {
      countEl.className = 'text-[9px] font-bold text-amber-600 bg-amber-50 rounded-full px-2 py-0.5';
    } else {
      countEl.className = 'text-[9px] font-bold text-slate-400 bg-slate-100 rounded-full px-2 py-0.5';
    }

  } catch (err) {
    console.warn('Could not load review photos:', err.message);
  }
}
