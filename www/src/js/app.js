// Main App Coordinator

import { getCurrentUser, getActiveState, saveActiveState, register, login, logout } from './auth.js';
import { renderPokedexGrid, fetchPokemonDetail, ensurePokemonListCached, registerToastCallback } from './pokedex.js';
import { getNextPokemon, checkAnswer, updateLivesTimer, formatTime } from './game.js';

// --- Global State ---
let gameState = null;
let currentPokemon = null;
let activeScreen = 'splash';
let adInterval = null;
let livesTimerInterval = null;

// --- DOM Elements ---
const elSplash = document.getElementById('screen-splash');
const elMenu = document.getElementById('screen-menu');
const elGame = document.getElementById('screen-game');
const elPokedex = document.getElementById('screen-pokedex');
const elProfile = document.getElementById('screen-profile');
const elHUD = document.getElementById('global-hud');

// HUD elements
const elBackBtn = document.getElementById('btn-back');
const elHearts = document.getElementById('lives-hearts');
const elLivesCount = document.getElementById('lives-count');
const elLivesTimerContainer = document.getElementById('lives-timer-container');
const elLivesTimerText = document.getElementById('lives-timer-text');
const elBtnRestoreLives = document.getElementById('btn-restore-lives');

// Game elements
const elGameInput = document.getElementById('game-input');
const elGameForm = document.getElementById('game-form');
const elPokemonImg = document.getElementById('game-pokemon-img');
const elPokemonCard = document.getElementById('pokemon-card');
const elGameStreak = document.getElementById('game-streak');
const elGameMaxStreak = document.getElementById('game-max-streak');
const elBtnClearInput = document.getElementById('btn-clear-input');
const elBtnSkip = document.getElementById('btn-skip');

// Pokedex elements
const elPokedexGrid = document.getElementById('pokedex-grid');
const elPokedexSearch = document.getElementById('pokedex-search');
const elPokedexFilterStatus = document.getElementById('pokedex-filter-status');
const elPokedexProgressText = document.getElementById('pokedex-progress-text');
const elPokedexProgressFill = document.getElementById('pokedex-progress-fill');
const elMenuPokedexCount = document.getElementById('menu-pokedex-count');

// Auth elements
const elProfileAnonymous = document.getElementById('profile-anonymous');
const elProfileDashboard = document.getElementById('profile-dashboard');
const elFormLogin = document.getElementById('form-login');
const elFormRegister = document.getElementById('form-register');
const elProfileName = document.getElementById('profile-name');
const elStatsTotal = document.getElementById('stats-total-guessed');
const elStatsCorrect = document.getElementById('stats-correct-guessed');
const elStatsUnlocked = document.getElementById('stats-unlocked-count');
const elStatsAccuracy = document.getElementById('stats-accuracy');
const elBtnLogout = document.getElementById('btn-logout');

// Modal: Ad Player
const elModalAd = document.getElementById('modal-ad-player');
const elAdCountdown = document.getElementById('ad-timer-countdown');
const elAdProgressBar = document.getElementById('ad-progress-bar-fill');
const elBtnCloseAd = document.getElementById('btn-close-ad');

// Modal: Pokemon Details
const elModalDetail = document.getElementById('modal-pokemon-detail');
const elDetailHeaderBg = document.getElementById('detail-header-bg');
const elDetailId = document.getElementById('detail-pokemon-id');
const elDetailImg = document.getElementById('detail-pokemon-img');
const elDetailName = document.getElementById('detail-pokemon-name');
const elDetailTypes = document.getElementById('detail-pokemon-types');
const elDetailStats = document.getElementById('detail-pokemon-stats');
const elBtnCloseDetail = document.getElementById('btn-close-detail');

// Toast Container
const elToastContainer = document.getElementById('toast-container');


// --- SPA Routing Manager ---
function navigateTo(screenId) {
  // Hide all screens
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  
  // Show target screen
  const target = document.getElementById(`screen-${screenId}`);
  if (target) {
    target.classList.add('active');
    activeScreen = screenId;
  }

  // Handle Header HUD visibility
  if (screenId === 'splash' || screenId === 'menu') {
    if (screenId === 'menu') {
      elHUD.classList.remove('hidden');
      elBackBtn.style.visibility = 'hidden'; // Hide back button on Home Screen
      updateMenuStats();
    } else {
      elHUD.classList.add('hidden');
    }
  } else {
    elHUD.classList.remove('hidden');
    elBackBtn.style.visibility = 'visible'; // Show back button on inner screens
  }

  // Hook specific screen loads
  if (screenId === 'pokedex') {
    loadPokedex();
  } else if (screenId === 'profile') {
    loadProfileDashboard();
  } else if (screenId === 'game') {
    setupGameRound();
  }
}

// --- HUD & State Synchronization ---
function refreshHUD() {
  const result = updateLivesTimer(gameState);
  saveActiveState(gameState);

  // Render Hearts
  elHearts.innerHTML = '';
  for (let i = 1; i <= 5; i++) {
    const heart = document.createElement('i');
    if (i <= result.lives) {
      heart.className = 'fa-solid fa-heart heart-filled';
    } else {
      heart.className = 'fa-regular fa-heart heart-empty';
    }
    elHearts.appendChild(heart);
  }

  elLivesCount.textContent = `${result.lives}/5`;

  // Render Time Timer
  if (result.timeLeftMs > 0) {
    elLivesTimerContainer.classList.remove('hidden');
    elLivesTimerText.textContent = formatTime(result.timeLeftMs);
  } else {
    elLivesTimerContainer.classList.add('hidden');
  }

  // Disable guess buttons if no lives
  if (result.lives <= 0 && activeScreen === 'game') {
    elGameInput.disabled = true;
    elGameInput.placeholder = '¡Sin vidas! Restablece para jugar...';
  } else {
    elGameInput.disabled = false;
    if (activeScreen === 'game' && !elGameInput.placeholder.includes('Escribe')) {
      elGameInput.placeholder = 'Escribe el nombre del Pokémon...';
    }
  }
}

function updateMenuStats() {
  document.getElementById('quick-streak').textContent = gameState.streak;
  document.getElementById('quick-max-streak').textContent = gameState.maxStreak;
  elMenuPokedexCount.textContent = `${gameState.pokedex.length}/151`;
}

// --- Toast System ---
export function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let icon = 'fa-info-circle';
  if (type === 'success') icon = 'fa-circle-check';
  if (type === 'error') icon = 'fa-circle-xmark';

  toast.innerHTML = `
    <i class="fa-solid ${icon}"></i>
    <span>${message}</span>
  `;
  elToastContainer.appendChild(toast);

  // Auto remove toast
  setTimeout(() => {
    toast.style.animation = 'slideUp 0.3s ease reverse forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
registerToastCallback(showToast);


// --- Game Round Setup ---
async function setupGameRound() {
  if (gameState.lives <= 0) {
    showToast('¡No te quedan vidas! Mira un anuncio para recuperar una.', 'error');
    navigateTo('menu');
    return;
  }

  // Show loading indicator in showcase
  elPokemonImg.src = '';
  elPokemonImg.className = 'pokemon-img shadow-active';
  elPokemonImg.style.opacity = '0.3';
  elGameInput.value = '';
  elGameInput.disabled = true;
  
  elGameStreak.textContent = gameState.streak;
  elGameMaxStreak.textContent = gameState.maxStreak;

  currentPokemon = await getNextPokemon(gameState.pokedex);
  
  elPokemonImg.src = currentPokemon.image;
  elPokemonImg.style.opacity = '1';
  elGameInput.disabled = false;
  elGameInput.focus();
}

// Check guess input
function handleGuessSubmit() {
  if (gameState.lives <= 0) {
    showToast('No tienes vidas. Restablece vidas para continuar.', 'error');
    return;
  }

  const guess = elGameInput.value;
  if (!guess.trim()) return;

  const isCorrect = checkAnswer(guess, currentPokemon.name);

  if (isCorrect) {
    // Add to Pokedex if unique
    if (!gameState.pokedex.includes(currentPokemon.id)) {
      gameState.pokedex.push(currentPokemon.id);
    }
    
    // Increment Streak
    gameState.streak++;
    if (gameState.streak > gameState.maxStreak) {
      gameState.maxStreak = gameState.streak;
    }

    gameState.stats.correctGuessed++;
    gameState.stats.totalGuessed++;

    // Animations
    elPokemonImg.className = 'pokemon-img reveal-active';
    showToast(`¡Correcto! Es ${currentPokemon.name}. Se guardó en tu Pokédex.`, 'success');
    
    // Save State
    saveActiveState(gameState);
    refreshHUD();

    // Next round after delay
    setTimeout(() => {
      setupGameRound();
    }, 2200);

  } else {
    // Wrong answer
    gameState.lives--;
    gameState.streak = 0;
    gameState.stats.totalGuessed++;

    if (!gameState.lastLifeLostTimestamp) {
      gameState.lastLifeLostTimestamp = Date.now();
    }

    // Shake animation
    elPokemonCard.classList.add('shake-animation');
    setTimeout(() => elPokemonCard.classList.remove('shake-animation'), 400);

    showToast('¡Nombre incorrecto! Pierdes 1 vida.', 'error');

    saveActiveState(gameState);
    refreshHUD();

    if (gameState.lives <= 0) {
      setTimeout(() => {
        showToast('¡Te has quedado sin vidas! Mira un anuncio para continuar jugando.', 'error');
        navigateTo('menu');
      }, 1000);
    }
  }
}

// Skip Pokémon (costs 1 life)
function handleSkip() {
  if (gameState.lives <= 1) {
    showToast('No puedes saltar si te queda 1 o menos vidas.', 'error');
    return;
  }

  gameState.lives--;
  gameState.streak = 0;
  
  if (!gameState.lastLifeLostTimestamp) {
    gameState.lastLifeLostTimestamp = Date.now();
  }

  showToast('Saltaste el Pokémon. Pierdes 1 vida.', 'info');
  
  saveActiveState(gameState);
  refreshHUD();
  setupGameRound();
}


// --- Pokedex List ---
function loadPokedex() {
  const filterVal = elPokedexFilterStatus.value;
  const searchVal = elPokedexSearch.value;

  renderPokedexGrid(elPokedexGrid, gameState.pokedex, searchVal, filterVal, openPokemonDetails);

  // Update progress bar
  const total = 151;
  const caught = gameState.pokedex.length;
  const pct = Math.round((caught / total) * 100);
  
  elPokedexProgressText.textContent = `${caught}/${total} (${pct}%)`;
  elPokedexProgressFill.style.width = `${pct}%`;
}


// --- Pokémon Detail Modal ---
async function openPokemonDetails(id) {
  elModalDetail.classList.remove('hidden');
  
  // Set placeholder loading states
  elDetailId.textContent = `#${String(id).padStart(3, '0')}`;
  elDetailName.textContent = 'Cargando...';
  elDetailImg.src = '';
  elDetailTypes.innerHTML = '';
  elDetailStats.innerHTML = '';
  elDetailHeaderBg.className = 'detail-header bg-normal';

  const details = await fetchPokemonDetail(id);
  if (!details) {
    elDetailName.textContent = 'Error de conexión';
    return;
  }

  // Populate data
  elDetailName.textContent = details.name;
  elDetailImg.src = details.image;

  // Header background theme according to primary type
  const mainType = details.types[0];
  elDetailHeaderBg.className = `detail-header bg-${mainType}`;

  // Badges types
  details.types.forEach(t => {
    const badge = document.createElement('span');
    badge.className = `type-badge type-${t}`;
    badge.textContent = t;
    elDetailTypes.appendChild(badge);
  });

  // Base Stats list
  details.stats.forEach(s => {
    const pct = Math.min(100, Math.round((s.value / 150) * 100)); // Cap stat display bar relative to 150
    const row = document.createElement('div');
    row.className = 'stat-row';
    row.innerHTML = `
      <span class="stat-name">${s.name}</span>
      <span class="stat-val">${s.value}</span>
      <div class="stat-bar-container">
        <div class="stat-bar-fill" style="width: ${pct}%; background-color: var(--primary-color)"></div>
      </div>
    `;
    elDetailStats.appendChild(row);
  });
}


// --- Google AdMob Integration & Fallback ---
let isAdMobReady = false;

async function initAdMob() {
  if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AdMob) {
    const { AdMob } = window.Capacitor.Plugins;
    try {
      await AdMob.initialize({
        requestTrackingAuthorization: true,
        testingDevices: [],
        initializeForTesting: true,
      });
      isAdMobReady = true;
      preloadRewardedAd();
    } catch (e) {
      console.warn('AdMob initialization failed, falling back to simulation:', e);
    }
  }
}

async function showBannerAd() {
  if (!isAdMobReady) {
    renderSimulatedBanner();
    return;
  }
  const screens = document.getElementById('screens-container');
  if (screens) {
    screens.style.marginBottom = '60px';
  }
  const { AdMob } = window.Capacitor.Plugins;
  try {
    await AdMob.showBanner({
      adId: 'ca-app-pub-4096741408455583/5122862564',
      adSize: 'ADAPTIVE_BANNER',
      position: 'BOTTOM_CENTER',
      margin: 0,
      isTesting: false
    });
  } catch (e) {
    console.warn('Failed to show AdMob banner:', e);
  }
}

function renderSimulatedBanner() {
  if (document.getElementById('simulated-banner-ad')) return;

  const banner = document.createElement('div');
  banner.id = 'simulated-banner-ad';
  banner.style.position = 'absolute';
  banner.style.bottom = '0';
  banner.style.left = '0';
  banner.style.width = '100%';
  banner.style.height = '50px';
  banner.style.backgroundColor = 'rgba(13, 17, 29, 0.95)';
  banner.style.borderTop = '2px solid var(--secondary-color)';
  banner.style.color = '#fff';
  banner.style.display = 'flex';
  banner.style.alignItems = 'center';
  banner.style.justifyContent = 'center';
  banner.style.fontSize = '0.75rem';
  banner.style.zIndex = '999';
  banner.innerHTML = `
    <div style="display: flex; align-items: center; gap: 8px;">
      <span style="background-color: var(--secondary-color); color: #000; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 0.65rem;">AD</span>
      <span>¡Atrápalos a todos en Poke-Quest!</span>
    </div>
  `;
  document.getElementById('app-container').appendChild(banner);
  
  // Adjust margin bottom of screens container so they don't overlap with the banner
  const screens = document.getElementById('screens-container');
  if (screens) {
    screens.style.marginBottom = '50px';
  }
}

async function preloadRewardedAd() {
  if (!isAdMobReady) return;
  const { AdMob } = window.Capacitor.Plugins;
  try {
    await AdMob.prepareRewardVideoAd({
      adId: 'ca-app-pub-4096741408455583/7932024580',
    });
  } catch (e) {
    console.warn('Failed to preload AdMob rewarded ad:', e);
  }
}

async function showAdMobRewarded() {
  if (!isAdMobReady) {
    playSimulatedAd();
    return;
  }
  const { AdMob } = window.Capacitor.Plugins;
  
  // Register reward listener
  const rewardListener = await AdMob.addListener('rewardVideoAdRewarded', (reward) => {
    console.log('AdMob Reward earned:', reward);
    handleAdReward();
    rewardListener.remove();
    preloadRewardedAd();
  });

  // Register dismiss listener
  const dismissListener = await AdMob.addListener('rewardVideoAdDismissed', () => {
    rewardListener.remove();
    dismissListener.remove();
    preloadRewardedAd();
  });

  try {
    await AdMob.showRewardVideoAd();
  } catch (e) {
    console.warn('Failed to show AdMob rewarded, using simulated ad:', e);
    rewardListener.remove();
    dismissListener.remove();
    playSimulatedAd();
  }
}

function triggerAdFlow() {
  if (gameState.lives >= 5) {
    showToast('Tus vidas ya están llenas.', 'info');
    return;
  }

  if (isAdMobReady) {
    showAdMobRewarded();
  } else {
    playSimulatedAd();
  }
}

// --- Simulated Ad Modal Flow ---
function playSimulatedAd() {
  if (gameState.lives >= 5) {
    showToast('Tus vidas ya están llenas.', 'info');
    return;
  }

  elModalAd.classList.remove('hidden');
  elBtnCloseAd.disabled = true;
  elAdCountdown.textContent = '5s';
  elAdProgressBar.style.width = '0%';

  let secondsLeft = 5;
  const totalTicks = 50; // ticks every 100ms for smooth bar
  let currentTick = 0;

  adInterval = setInterval(() => {
    currentTick++;
    const pct = (currentTick / totalTicks) * 100;
    elAdProgressBar.style.width = `${pct}%`;

    if (currentTick % 10 === 0) {
      secondsLeft--;
      elAdCountdown.textContent = `${secondsLeft}s`;
    }

    if (currentTick >= totalTicks) {
      clearInterval(adInterval);
      elAdCountdown.textContent = '¡Completado!';
      elBtnCloseAd.disabled = false;
    }
  }, 100);
}

function handleAdReward() {
  gameState.lives = Math.min(5, gameState.lives + 1);
  if (gameState.lives >= 5) {
    gameState.lastLifeLostTimestamp = null;
  }
  saveActiveState(gameState);
  refreshHUD();

  elModalAd.classList.add('hidden');
  showToast('¡Anuncio completado! Has recuperado 1 vida.', 'success');
}


// --- Profile & Account Actions ---
function loadProfileDashboard() {
  const user = getCurrentUser();

  if (user) {
    // Logged in mode
    elProfileAnonymous.classList.add('hidden');
    elProfileDashboard.classList.remove('hidden');
    
    elProfileName.textContent = user.username.toUpperCase();
    
    // Stats calculation
    const total = gameState.stats?.totalGuessed || 0;
    const correct = gameState.stats?.correctGuessed || 0;
    const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
    
    elStatsTotal.textContent = total;
    elStatsCorrect.textContent = correct;
    elStatsUnlocked.textContent = gameState.pokedex.length;
    elStatsAccuracy.textContent = `${accuracy}%`;
  } else {
    // Anonymous Guest mode
    elProfileAnonymous.classList.remove('hidden');
    elProfileDashboard.classList.add('hidden');
  }
}

function handleLoginSubmit(e) {
  e.preventDefault();
  const userEl = document.getElementById('login-username');
  const passEl = document.getElementById('login-password');

  try {
    const session = login(userEl.value, passEl.value);
    showToast(`¡Sesión iniciada como ${session.username}!`, 'success');
    
    // Reload active state to newly logged in user
    gameState = getActiveState();
    refreshHUD();
    loadProfileDashboard();

    userEl.value = '';
    passEl.value = '';
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function handleRegisterSubmit(e) {
  e.preventDefault();
  const userEl = document.getElementById('register-username');
  const passEl = document.getElementById('register-password');

  try {
    const session = register(userEl.value, passEl.value);
    showToast('¡Registro completado y sesión iniciada!', 'success');
    
    // Reload active state
    gameState = getActiveState();
    refreshHUD();
    loadProfileDashboard();

    userEl.value = '';
    passEl.value = '';
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function handleLogout() {
  logout();
  showToast('Sesión cerrada.', 'info');
  gameState = getActiveState(); // reverts back to fresh guest
  refreshHUD();
  loadProfileDashboard();
}


// --- Event Listeners Initialization ---
function initEvents() {
  // Navigation Menu Clicks
  document.getElementById('btn-menu-play').addEventListener('click', () => navigateTo('game'));
  document.getElementById('btn-menu-pokedex').addEventListener('click', () => navigateTo('pokedex'));
  document.getElementById('btn-menu-profile').addEventListener('click', () => navigateTo('profile'));
  
  // HUD back button
  elBackBtn.addEventListener('click', () => {
    if (activeScreen === 'game') {
      navigateTo('menu');
    } else {
      navigateTo('menu');
    }
  });

  // HUD restore lives (Ad Trigger)
  elBtnRestoreLives.addEventListener('click', triggerAdFlow);
  elBtnCloseAd.addEventListener('click', handleAdReward);

  // Close Detail Modal
  elBtnCloseDetail.addEventListener('click', () => elModalDetail.classList.add('hidden'));

  // Game input controls
  elBtnClearInput.addEventListener('click', () => {
    elGameInput.value = '';
    elGameInput.focus();
  });
  elBtnSkip.addEventListener('click', handleSkip);
  elGameForm.addEventListener('submit', handleGuessSubmit);

  // Pokedex filters
  elPokedexSearch.addEventListener('input', loadPokedex);
  elPokedexFilterStatus.addEventListener('change', loadPokedex);

  // Profile auth forms tab toggle
  document.querySelectorAll('.auth-tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.auth-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
      
      e.target.classList.add('active');
      const tab = e.target.getAttribute('data-tab');
      document.getElementById(`form-${tab}`).classList.add('active');
    });
  });

  elFormLogin.addEventListener('submit', handleLoginSubmit);
  elFormRegister.addEventListener('submit', handleRegisterSubmit);
  elBtnLogout.addEventListener('click', handleLogout);
}


// --- App Entrypoint ---
window.addEventListener('DOMContentLoaded', async () => {
  initEvents();
  await initAdMob();
  showBannerAd();

  // Load PokeAPI listing first, cached in background
  try {
    await ensurePokemonListCached();
  } catch (err) {
    console.error('Failed to pre-fetch PokeAPI cache:', err);
  }

  // Load game state
  gameState = getActiveState();
  refreshHUD();

  // Set periodic check timer for lives recovery
  livesTimerInterval = setInterval(() => {
    refreshHUD();
  }, 1000);

  // Native back button navigation support
  if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
    window.Capacitor.Plugins.App.addListener('backButton', () => {
      if (activeScreen !== 'menu') {
        navigateTo('menu');
      } else {
        window.Capacitor.Plugins.App.exitApp();
      }
    });
  }

  // Simulate Splash screen loading
  setTimeout(() => {
    navigateTo('menu');
  }, 1800);
});
