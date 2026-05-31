// Game Core Logic Module

import { ensurePokemonListCached } from './pokedex.js';

// Normalize string for friendly matching
export function cleanName(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^a-z0-9]/g, "");     // remove spaces, hyphens, symbols, etc.
}

// Check if user answer matches pokemon name
export function checkAnswer(userInput, pokemonName) {
  const user = cleanName(userInput);
  const correct = cleanName(pokemonName);
  
  if (user === correct) return true;

  // Let's provide some friendly helper matching for complex names (e.g. Farfetch'd, Nidoran ♂, Mr. Mime)
  if (correct.includes('nidoran') && user.includes('nidoran')) return true;
  if (correct.includes('mime') && user.includes('mime')) return true;
  if (correct.includes('farfetch') && user.includes('farfetch')) return true;
  
  return false;
}

// Pick a random Pokémon that the user hasn't caught yet, or a random Gen 1
export async function getNextPokemon(unlockedList) {
  const allPokemon = await ensurePokemonListCached();
  
  // Try to find a locked one first to help fill pokedex
  const lockedPokemon = allPokemon.filter(p => !unlockedList.includes(p.id));
  
  let targetList = lockedPokemon.length > 0 ? lockedPokemon : allPokemon;
  const randomIndex = Math.floor(Math.random() * targetList.length);
  const chosen = targetList[randomIndex];

  // Fetch full details of chosen Pokémon to get high quality official artwork
  try {
    const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${chosen.id}`);
    const data = await res.json();
    return {
      id: chosen.id,
      name: chosen.name,
      image: data.sprites.other['official-artwork'].front_default || chosen.sprite
    };
  } catch (error) {
    console.error('Error fetching game Pokémon details, using cached:', error);
    return chosen;
  }
}

// Life Recovery Calculation Logic
// Returns { currentLives, nextLifeTimeLeftMs }
export function updateLivesTimer(state) {
  const MAX_LIVES = 5;
  const RECOVERY_TIME_MS = 4 * 60 * 60 * 1000; // 4 hours in milliseconds
  // FOR TESTING: You can set a faster recovery here if needed, but 24 hours is the requirement.
  
  if (state.lives >= MAX_LIVES) {
    state.lastLifeLostTimestamp = null;
    return {
      lives: MAX_LIVES,
      timeLeftMs: 0
    };
  }

  if (!state.lastLifeLostTimestamp) {
    // If lives are less than max, but no timestamp exists, set it to now
    state.lastLifeLostTimestamp = Date.now();
    return {
      lives: state.lives,
      timeLeftMs: RECOVERY_TIME_MS
    };
  }

  const now = Date.now();
  const timeElapsed = now - state.lastLifeLostTimestamp;

  if (timeElapsed >= RECOVERY_TIME_MS) {
    // Calculate how many lives we recovered
    const livesRecovered = Math.floor(timeElapsed / RECOVERY_TIME_MS);
    const newLives = Math.min(MAX_LIVES, state.lives + livesRecovered);
    
    state.lives = newLives;
    
    if (newLives >= MAX_LIVES) {
      state.lastLifeLostTimestamp = null;
    } else {
      // Set timestamp to the leftover time offset
      state.lastLifeLostTimestamp = state.lastLifeLostTimestamp + (livesRecovered * RECOVERY_TIME_MS);
    }
  }

  // Calculate time remaining for the next life
  let timeLeftMs = 0;
  if (state.lives < MAX_LIVES && state.lastLifeLostTimestamp) {
    const nextLifeTimestamp = state.lastLifeLostTimestamp + RECOVERY_TIME_MS;
    timeLeftMs = Math.max(0, nextLifeTimestamp - now);
  }

  return {
    lives: state.lives,
    timeLeftMs: timeLeftMs
  };
}

// Format milliseconds into HH:MM:SS
export function formatTime(ms) {
  if (ms <= 0) return '00:00:00';
  
  const totalSecs = Math.floor(ms / 1000);
  const hours = Math.floor(totalSecs / 3600);
  const minutes = Math.floor((totalSecs % 3600) / 60);
  const seconds = totalSecs % 60;

  const pad = (num) => String(num).padStart(2, '0');
  
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}
