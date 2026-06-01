// Main App Coordinator

import { getCurrentUser, getActiveState, saveActiveState, register, login, logout, syncUserStateWithFirestore, addFriend, removeFriend, getFriendsList, getFriendData, acceptFriendRequest, declineFriendRequest, getFriendRequestsList, subscribeToUserData, updateOnlineStatus, subscribeToFriendsData, setPremiumStatus } from './auth.js';
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
    const user = getCurrentUser();
    if (user) {
      syncUserStateWithFirestore(user.username).then((syncState) => {
        if (syncState) {
          gameState = getActiveState();
          refreshHUD();
        }
        loadProfileDashboard();
      }).catch(err => {
        console.warn("Failed syncing on profile navigate:", err);
        loadProfileDashboard();
      });
    } else {
      loadProfileDashboard();
    }
  } else if (screenId === 'game') {
    setupGameRound();
  }
}

// --- HUD & State Synchronization ---
function refreshHUD() {
  const result = updateLivesTimer(gameState);
  saveActiveState(gameState);

  // Update Username badge in HUD
  const user = getCurrentUser();
  const elUserBadge = document.getElementById('hud-user-badge');
  const elUsernameText = document.getElementById('hud-username-text');
  if (elUserBadge && elUsernameText) {
    if (user) {
      if (gameState.isPremium) {
        elUsernameText.innerHTML = `${user.username} <i class="fa-solid fa-crown" style="color:#fbbf24; font-size:0.75rem;"></i>`;
      } else {
        elUsernameText.textContent = user.username;
      }
      elUserBadge.classList.remove('hidden');
    } else {
      elUserBadge.classList.add('hidden');
    }
  }

  // Render Hearts
  elHearts.innerHTML = '';
  const isPremium = gameState.isPremium;
  for (let i = 1; i <= 5; i++) {
    const heart = document.createElement('i');
    if (isPremium) {
      heart.className = 'fa-solid fa-heart';
      heart.style.color = '#fbbf24';
      heart.style.filter = 'drop-shadow(0 0 3px #fbbf24)';
    } else if (i <= result.lives) {
      heart.className = 'fa-solid fa-heart heart-filled';
    } else {
      heart.className = 'fa-regular fa-heart heart-empty';
    }
    elHearts.appendChild(heart);
  }

  elLivesCount.textContent = isPremium ? '∞/5' : `${result.lives}/5`;

  // Render Time Timer
  if (!isPremium && result.timeLeftMs > 0) {
    elLivesTimerContainer.classList.remove('hidden');
    elLivesTimerText.textContent = formatTime(result.timeLeftMs);
  } else {
    elLivesTimerContainer.classList.add('hidden');
  }

  // Disable guess buttons if no lives
  if (!isPremium && result.lives <= 0 && activeScreen === 'game') {
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
  if (!gameState.isPremium && gameState.lives <= 0) {
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
  if (!gameState.isPremium && gameState.lives <= 0) {
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
    if (!gameState.isPremium) {
      gameState.lives--;
    }
    gameState.streak = 0;
    gameState.stats.totalGuessed++;

    if (!gameState.isPremium && !gameState.lastLifeLostTimestamp) {
      gameState.lastLifeLostTimestamp = Date.now();
    }

    // Shake animation
    elPokemonCard.classList.add('shake-animation');
    setTimeout(() => elPokemonCard.classList.remove('shake-animation'), 400);

    const errorMsg = gameState.isPremium 
      ? `¡Incorrecto! Era ${currentPokemon.name}. (Ventaja Premium: Vidas Infinitas)`
      : '¡Nombre incorrecto! Pierdes 1 vida.';
    showToast(errorMsg, 'error');

    saveActiveState(gameState);
    refreshHUD();

    if (!gameState.isPremium && gameState.lives <= 0) {
      setTimeout(() => {
        showToast('¡Te has quedado sin vidas! Mira un anuncio para continuar jugando.', 'error');
        navigateTo('menu');
      }, 1000);
    } else if (gameState.isPremium) {
      // Para Premium, cargamos la siguiente ronda automáticamente tras un breve retardo
      setTimeout(() => {
        setupGameRound();
      }, 2200);
    }
  }
}

// Skip Pokémon (costs 1 life)
function handleSkip() {
  if (!gameState.isPremium && gameState.lives <= 1) {
    showToast('No puedes saltar si te queda 1 o menos vidas.', 'error');
    return;
  }

  if (!gameState.isPremium) {
    gameState.lives--;
    if (!gameState.lastLifeLostTimestamp) {
      gameState.lastLifeLostTimestamp = Date.now();
    }
    showToast('Saltaste el Pokémon. Pierdes 1 vida.', 'info');
  } else {
    showToast('Saltaste el Pokémon. (Ventaja Premium: Vidas Infinitas)', 'info');
  }

  gameState.streak = 0;
  
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
  // Banner ad removed as requested
}

function renderSimulatedBanner() {
  // Banner ad removed as requested
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
  
  let rewardEarned = false;

  // Register reward listener
  const rewardListener = await AdMob.addListener('onRewardedVideoAdReward', (reward) => {
    console.log('AdMob Reward earned:', reward);
    rewardEarned = true;
  });

  // Register dismiss listener
  const dismissListener = await AdMob.addListener('onRewardedVideoAdDismissed', () => {
    rewardListener.remove();
    dismissListener.remove();
    if (rewardEarned) {
      handleAdReward();
    }
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
    
    // Personalización Premium del Avatar e Insignia
    const elAvatar = elProfileDashboard.querySelector('.profile-avatar');
    if (gameState.isPremium) {
      elAvatar.innerHTML = '<i class="fa-solid fa-crown text-yellow" style="color: #fbbf24; filter: drop-shadow(0 0 6px #fbbf24);"></i>';
      elAvatar.style.border = '3px solid #fbbf24';
      elAvatar.style.boxShadow = '0 0 20px rgba(251, 191, 36, 0.6)';
      elProfileName.innerHTML = `${user.username.toUpperCase()} <i class="fa-solid fa-crown text-yellow" title="Premium" style="font-size:1.1rem; margin-left:4px; color: #fbbf24;"></i>`;
    } else {
      elAvatar.innerHTML = '<i class="fa-solid fa-user-astronaut"></i>';
      elAvatar.style.border = '2px solid var(--surface-border)';
      elAvatar.style.boxShadow = '0 0 16px rgba(59, 76, 202, 0.4)';
      elProfileName.textContent = user.username.toUpperCase();
    }
    
    // Stats calculation
    const total = gameState.stats?.totalGuessed || 0;
    const correct = gameState.stats?.correctGuessed || 0;
    const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
    
    elStatsTotal.textContent = total;
    elStatsCorrect.textContent = correct;
    elStatsUnlocked.textContent = gameState.pokedex.length;
    elStatsAccuracy.textContent = `${accuracy}%`;

    // Render Premium Action Card
    const elPremiumSection = document.getElementById('premium-membership-section');
    if (elPremiumSection) {
      if (gameState.isPremium) {
        const details = gameState.premiumDetails || { cardMask: '•••• 4000', nextBillingDate: 'Próximo mes' };
        elPremiumSection.innerHTML = `
          <div style="background: rgba(251, 191, 36, 0.05); border: 1px solid rgba(251, 191, 36, 0.2); border-radius: 16px; padding: 16px; text-align: center; margin-bottom: 16px;">
            <p style="font-size: 0.9rem; font-weight: 800; color: #fbbf24; margin-bottom: 4px; display: flex; align-items: center; justify-content: center; gap: 6px;"><i class="fa-solid fa-crown"></i> Entrenador Premium</p>
            <p style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 6px;">Pago automático activo (${details.cardMask})</p>
            <p style="font-size: 0.7rem; color: #10b981; margin-bottom: 12px; font-weight: 600;"><i class="fa-solid fa-calendar-check"></i> Próximo cobro automático: ${details.nextBillingDate}</p>
            <button id="btn-cancel-premium" style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid rgba(239, 68, 68, 0.3); background: rgba(239, 68, 68, 0.1); color: #ef4444; font-weight: 800; cursor: pointer; font-size: 0.8rem;">Cancelar Pago Automático</button>
          </div>
        `;
        document.getElementById('btn-cancel-premium').addEventListener('click', handleCancelPremium);
      } else {
        elPremiumSection.innerHTML = `
          <div style="background: linear-gradient(135deg, rgba(30, 41, 59, 0.8), rgba(15, 23, 42, 0.9)); border: 1px solid var(--surface-border); border-radius: 16px; padding: 16px; text-align: center; margin-bottom: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
            <p style="font-size: 0.9rem; font-weight: 800; color: #fff; margin-bottom: 4px;"><i class="fa-solid fa-gem text-yellow" style="color:#fbbf24;"></i> ¿Quieres vidas infinitas?</p>
            <p style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 12px;">Hazte Premium y juega sin esperar ni ver anuncios.</p>
            <button id="btn-trigger-premium" style="width: 100%; padding: 12px; border-radius: 8px; border: none; background: linear-gradient(135deg, #fbbf24, #d97706); color: #fff; font-weight: 800; cursor: pointer; font-size: 0.85rem; box-shadow: 0 4px 10px rgba(217, 119, 6, 0.25);">Hazte Premium ($2.000 CLP/mes)</button>
          </div>
        `;
        document.getElementById('btn-trigger-premium').addEventListener('click', openPaymentModal);
      }
    }

    // Load friends list
    loadFriendsList();
  } else {
    // Anonymous Guest mode
    elProfileAnonymous.classList.remove('hidden');
    elProfileDashboard.classList.add('hidden');
  }
}

let unsubscribeFriends = null;

function loadFriendsList() {
  const elFriendsList = document.getElementById('friends-list');
  if (!elFriendsList) return;

  const friends = getFriendsList();
  if (friends.length === 0) {
    elFriendsList.innerHTML = '<p class="friends-empty-message">Aún no tienes amigos agregados.</p>';
    if (unsubscribeFriends) {
      unsubscribeFriends();
      unsubscribeFriends = null;
    }
    return;
  }

  elFriendsList.innerHTML = '<div style="text-align:center; padding: 12px;"><i class="fa-solid fa-spinner fa-spin"></i> Cargando amigos...</div>';

  if (unsubscribeFriends) {
    unsubscribeFriends();
  }

  // Suscribirse a los datos y estados online de cada amigo en tiempo real
  unsubscribeFriends = subscribeToFriendsData(friends, (friendsData) => {
    // Si no hay amigos válidos devueltos
    if (!friendsData || friendsData.length === 0) {
      elFriendsList.innerHTML = '<p class="friends-empty-message">Aún no tienes amigos agregados.</p>';
      return;
    }

    elFriendsList.innerHTML = '';
    friendsData.forEach(friend => {
      const accuracy = friend.stats.totalGuessed > 0 
        ? Math.round((friend.stats.correctGuessed / friend.stats.totalGuessed) * 100) 
        : 0;

      const card = document.createElement('div');
      card.className = 'friend-item-card';
      card.innerHTML = `
        <div class="friend-info-block">
          <div class="friend-avatar-mini" style="${friend.isPremium ? 'border: 2px solid #fbbf24; background: linear-gradient(135deg, #fbbf24, #d97706);' : ''}">
            ${friend.username.substring(0, 2).toUpperCase()}
            <span class="status-dot ${friend.isOnline ? 'online' : 'offline'}" title="${friend.isOnline ? 'Conectado' : 'Desconectado'}"></span>
          </div>
          <div class="friend-meta">
            <span class="friend-username-text">${friend.username} ${friend.isPremium ? '<i class="fa-solid fa-crown text-yellow" title="Premium" style="font-size:0.75rem; margin-left:2px; color:#fbbf24;"></i>' : ''}</span>
            <div class="friend-stats-summary">
              <span title="Pokémon atrapados"><i class="fa-solid fa-book-open text-blue"></i> ${friend.pokedexCount}</span>
              <span title="Racha máxima"><i class="fa-solid fa-trophy text-yellow"></i> ${friend.maxStreak}</span>
              <span title="Precisión"><i class="fa-solid fa-percent text-orange"></i> ${accuracy}%</span>
            </div>
          </div>
        </div>
        <button class="btn-remove-friend" data-username="${friend.username}" title="Eliminar Amigo">
          <i class="fa-solid fa-user-xmark"></i>
        </button>
      `;
      elFriendsList.appendChild(card);
    });

    // Add click listeners to delete buttons
    elFriendsList.querySelectorAll('.btn-remove-friend').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const username = e.currentTarget.getAttribute('data-username');
        if (confirm(`¿Estás seguro de que deseas eliminar a ${username} de tus amigos?`)) {
          try {
            await removeFriend(username);
            gameState = getActiveState(); // Update global game state
            showToast(`Amigo ${username} eliminado`, 'info');
            loadFriendsList();
          } catch (err) {
            showToast(err.message, 'error');
          }
        }
      });
    });
  });
}

async function handleAddFriendSubmit(e) {
  e.preventDefault();
  const inputEl = document.getElementById('friend-username-input');
  if (!inputEl) return;

  const btnAddFriend = document.getElementById('btn-add-friend');
  const originalHtml = btnAddFriend.innerHTML;
  
  btnAddFriend.disabled = true;
  btnAddFriend.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

  try {
    const friendName = inputEl.value.trim();
    await addFriend(friendName);
    gameState = getActiveState(); // Update global game state
    const friends = getFriendsList();
    if (friends.includes(friendName.toLowerCase())) {
      showToast(`¡Ahora eres amigo de ${friendName}!`, 'success');
    } else {
      showToast(`¡Solicitud de amistad enviada a ${friendName}!`, 'success');
    }
    inputEl.value = '';
    loadFriendsList();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btnAddFriend.disabled = false;
    btnAddFriend.innerHTML = originalHtml;
  }
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  const emailEl = document.getElementById('login-email');
  const passEl = document.getElementById('login-password');

  try {
    const session = await login(emailEl.value, passEl.value);
    showToast(`¡Sesión iniciada como ${session.username}!`, 'success');
    
    // Suscribirse a actualizaciones en tiempo real
    subscribeToUserData(session.username, (updatedState) => {
      gameState = getActiveState();
      refreshHUD();
      if (activeScreen === 'profile') {
        loadProfileDashboard();
      }
    });

    updateOnlineStatus(true);

    // Reload active state to newly logged in user
    gameState = getActiveState();
    refreshHUD();
    loadProfileDashboard();

    emailEl.value = '';
    passEl.value = '';
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleRegisterSubmit(e) {
  e.preventDefault();
  const userEl = document.getElementById('register-username');
  const emailEl = document.getElementById('register-email');
  const passEl = document.getElementById('register-password');

  try {
    const session = await register(userEl.value, emailEl.value, passEl.value);
    showToast('¡Registro completado y sesión iniciada!', 'success');
    
    // Suscribirse a actualizaciones en tiempo real
    subscribeToUserData(session.username, (updatedState) => {
      gameState = getActiveState();
      refreshHUD();
      if (activeScreen === 'profile') {
        loadProfileDashboard();
      }
    });

    updateOnlineStatus(true);

    // Reload active state
    gameState = getActiveState();
    refreshHUD();
    loadProfileDashboard();

    userEl.value = '';
    emailEl.value = '';
    passEl.value = '';
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleLogout() {
  await updateOnlineStatus(false);
  await logout();
  showToast('Sesión cerrada.', 'info');
  gameState = getActiveState(); // reverts back to fresh guest
  refreshHUD();
  loadProfileDashboard();
}

function openPaymentModal() {
  const modal = document.getElementById('modal-payment');
  if (modal) {
    document.getElementById('payment-form-container').classList.remove('hidden');
    document.getElementById('payment-processing').classList.add('hidden');
    document.getElementById('payment-success').classList.add('hidden');
    
    // Limpiar campos
    document.getElementById('card-name').value = '';
    document.getElementById('card-number').value = '';
    document.getElementById('card-rut').value = '';
    document.getElementById('card-expiry').value = '';
    document.getElementById('card-cvv').value = '';
    
    modal.classList.remove('hidden');
  }
}

async function handleCancelPremium() {
  if (confirm("¿Estás seguro de que deseas cancelar tu suscripción Premium? Perderás las vidas infinitas.")) {
    try {
      await setPremiumStatus(false);
      gameState = getActiveState();
      refreshHUD();
      loadProfileDashboard();
      showToast("Tu suscripción Premium ha sido cancelada.", "info");
    } catch (err) {
      showToast(err.message, "error");
    }
  }
}

// Mercado Pago Configuration
// Reemplaza 'TU_PUBLIC_KEY_AQUI' con tu clave pública de Mercado Pago real (ej. APP_USR-... o TEST-...) para habilitar pagos reales.
const MERCADOPAGO_PUBLIC_KEY = 'APP_USR-78fe6e2f-78d1-4f40-b49d-7904ade1860d';

// Initialize Mercado Pago client-side SDK if key is configured
let mpInstance = null;
if (MERCADOPAGO_PUBLIC_KEY && MERCADOPAGO_PUBLIC_KEY !== 'TU_PUBLIC_KEY_AQUI') {
  try {
    mpInstance = new MercadoPago(MERCADOPAGO_PUBLIC_KEY, {
      locale: 'es-CL'
    });
  } catch (error) {
    console.warn("Mercado Pago SDK no se pudo inicializar con la clave provista:", error);
  }
}

function initPaymentFormListeners() {
  const cardInput = document.getElementById('card-number');
  const expiryInput = document.getElementById('card-expiry');
  const cvvInput = document.getElementById('card-cvv');
  const form = document.getElementById('form-payment');
  const btnClose = document.getElementById('btn-close-payment');
  const btnDone = document.getElementById('btn-payment-done');
  
  if (cardInput) {
    cardInput.addEventListener('input', (e) => {
      let value = e.target.value.replace(/\D/g, '');
      let formatted = '';
      for (let i = 0; i < value.length; i++) {
        if (i > 0 && i % 4 === 0) {
          formatted += ' ';
        }
        formatted += value[i];
      }
      e.target.value = formatted;
    });
  }
  
  if (expiryInput) {
    expiryInput.addEventListener('input', (e) => {
      let value = e.target.value.replace(/\D/g, '');
      if (value.length > 2) {
        e.target.value = value.substring(0, 2) + '/' + value.substring(2, 4);
      } else {
        e.target.value = value;
      }
    });
  }

  if (cvvInput) {
    cvvInput.addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/\D/g, '');
    });
  }
  
  if (btnClose) {
    btnClose.addEventListener('click', () => {
      document.getElementById('modal-payment').classList.add('hidden');
    });
  }
  
  if (btnDone) {
    btnDone.addEventListener('click', () => {
      document.getElementById('modal-payment').classList.add('hidden');
    });
  }
  
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const cardName = document.getElementById('card-name').value.trim();
      const cardNumber = document.getElementById('card-number').value.replace(/\s/g, '');
      const cardRut = document.getElementById('card-rut').value.trim();
      const cardExpiry = document.getElementById('card-expiry').value;
      const cardCvv = document.getElementById('card-cvv').value;

      const expiryParts = cardExpiry.split('/');
      if (expiryParts.length !== 2) {
        showToast("Fecha de vencimiento inválida. Formato MM/YY requerido.", "error");
        return;
      }
      
      const expiryMonth = expiryParts[0];
      const expiryYear = "20" + expiryParts[1];

      document.getElementById('payment-form-container').classList.add('hidden');
      document.getElementById('payment-processing').classList.remove('hidden');
      
      try {
        let cardToken = null;
        const isMpConfigured = MERCADOPAGO_PUBLIC_KEY && MERCADOPAGO_PUBLIC_KEY !== 'TU_PUBLIC_KEY_AQUI';

        if (isMpConfigured) {
          try {
            if (!mpInstance) {
              mpInstance = new MercadoPago(MERCADOPAGO_PUBLIC_KEY, {
                locale: 'es-CL'
              });
            }

            console.log("Tokenizando tarjeta con Mercado Pago...");
            const tokenResponse = await mpInstance.createCardToken({
              cardNumber: cardNumber,
              cardholderName: cardName,
              cardExpirationMonth: expiryMonth,
              cardExpirationYear: expiryYear,
              securityCode: cardCvv,
              identificationType: "RUT",
              identificationNumber: cardRut
            });

            if (tokenResponse && tokenResponse.id) {
              cardToken = tokenResponse.id;
              console.log("¡Token de Mercado Pago generado con éxito! Token ID:", cardToken);
            } else {
              console.warn("Mercado Pago no devolvió un Token ID válido. Detalle:", tokenResponse);
              throw new Error("Datos de prueba o credenciales inválidas.");
            }
          } catch (sdkError) {
            console.warn("Error del SDK de Mercado Pago. Usando simulación local.", sdkError);
            const errMsg = sdkError.message || (sdkError.cause && sdkError.cause[0] && sdkError.cause[0].description) || JSON.stringify(sdkError);
            showToast(`Error de Mercado Pago SDK: ${errMsg}. Simulando...`, "error");
            cardToken = "MOCK-MP-TOKEN-" + Math.random().toString(36).substring(2, 10).toUpperCase();
          }
        } else {
          // Local checkout mode: no credentials configured
          console.log("Mercado Pago no configurado. Utilizando simulación local segura.");
          cardToken = "MOCK-MP-TOKEN-" + Math.random().toString(36).substring(2, 10).toUpperCase();
        }

        let paymentSuccess = false;
        let finalPaymentId = 'MOCK-PAYMENT-ID';

        if (isMpConfigured) {
          console.log("Enviando token de pago al servidor backend...");
          try {
            const user = getCurrentUser();
            const email = (user && user.email) ? user.email : `${user.username || 'entrenador'}@pokequest.cl`;
            const cardPrefix = cardNumber.substring(0, 6);

            const response = await fetch('http://localhost:3000/api/pay', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                token: cardToken,
                email: email,
                rut: cardRut,
                cardPrefix: cardPrefix,
                name: cardName
              })
            });

            const result = await response.json();

            if (response.ok && (result.status === 'approved' || result.status === 'authorized' || result.status === 'in_process')) {
              paymentSuccess = true;
              finalPaymentId = result.id;
              console.log("¡Pago procesado exitosamente por el backend! ID de Transacción:", result.id);
            } else {
              throw new Error(result.error || "El pago fue rechazado por tu banco o Mercado Pago.");
            }
          } catch (backendErr) {
            console.error("Error en el cobro a través del servidor backend:", backendErr);
            throw new Error(backendErr.message || "Error al conectar con el servidor de cobro.");
          }
        } else {
          // Modo simulación local
          await new Promise(resolve => setTimeout(resolve, 1200));
          paymentSuccess = true;
        }

        if (paymentSuccess) {
          // Guardar detalles del premium (mascarando la tarjeta y guardando el tokenID y PaymentID)
          const maskedCard = `•••• ${cardNumber.slice(-4)}`;
          await setPremiumStatus(true, { 
            name: cardName, 
            number: maskedCard,
            token: cardToken,
            paymentId: finalPaymentId,
            rut: cardRut
          });
          
          gameState = getActiveState();
          refreshHUD();
          loadProfileDashboard();
          
          document.getElementById('payment-processing').classList.add('hidden');
          document.getElementById('payment-success').classList.remove('hidden');
          showToast("¡Suscripción Premium activa! Pago procesado con éxito.", "success");
        }

      } catch (err) {
        showToast(err.message || "Error al procesar el pago con Mercado Pago.", "error");
        document.getElementById('payment-processing').classList.add('hidden');
        document.getElementById('payment-form-container').classList.remove('hidden');
      }
    });
  }
}


// --- Event Listeners Initialization ---
function initEvents() {
  // Inicializar listeners del formulario de pago
  initPaymentFormListeners();

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

  const formAddFriend = document.getElementById('form-add-friend');
  if (formAddFriend) {
    formAddFriend.addEventListener('submit', handleAddFriendSubmit);
  }
}


// --- App Entrypoint ---
window.addEventListener('DOMContentLoaded', async () => {
  initEvents();
  await initAdMob();

  // Load PokeAPI listing first, cached in background
  try {
    await ensurePokemonListCached();
  } catch (err) {
    console.error('Failed to pre-fetch PokeAPI cache:', err);
  }

  // Load game state
  gameState = getActiveState();
  refreshHUD();

  // Sincronización en segundo plano y suscripción en tiempo real si tiene sesión iniciada
  const user = getCurrentUser();
  if (user) {
    // Marcar como conectado
    updateOnlineStatus(true);

    // Suscribirse a actualizaciones en tiempo real
    subscribeToUserData(user.username, (updatedState) => {
      gameState = getActiveState();
      refreshHUD();
      if (activeScreen === 'profile') {
        loadProfileDashboard();
      }
    });

    syncUserStateWithFirestore(user.username).then((syncState) => {
      if (syncState) {
        gameState = getActiveState();
        refreshHUD();
        if (activeScreen === 'profile') {
          loadProfileDashboard();
        }
      }
    }).catch(err => console.warn("Failed background sync:", err));
  }

  // Eventos de presencia del usuario (Web)
  window.addEventListener('beforeunload', () => {
    updateOnlineStatus(false);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      updateOnlineStatus(true);
    } else {
      updateOnlineStatus(false);
    }
  });

  // Eventos de presencia del usuario (Capacitor nativo para móviles)
  if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
    window.Capacitor.Plugins.App.addListener('appStateChange', ({ isActive }) => {
      updateOnlineStatus(isActive);
    });
  }

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
