// Pokedex Management Module

const POKEMON_LIST_CACHE_KEY = 'pokequest_pokedex_cache';

// Lightweight mapping of Spanish names if possible, but PokeAPI names are English.
// Let's create a local mapping of the first 151 names to Spanish or keep the official English API names.
// Keeping standard API names makes guessing straightforward and matching reliable.

// Cache list of all 151 Pokémon
export async function ensurePokemonListCached() {
  const cached = localStorage.getItem(POKEMON_LIST_CACHE_KEY);
  if (cached) {
    return JSON.parse(cached);
  }

  try {
    const res = await fetch('https://pokeapi.co/api/v2/pokemon?limit=151');
    const data = await res.json();
    
    // Process list to extract ID and standard names
    const pokemonList = data.results.map((p, idx) => {
      const id = idx + 1;
      return {
        id: id,
        name: p.name,
        // Standard sprite URL
        sprite: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`
      };
    });

    localStorage.setItem(POKEMON_LIST_CACHE_KEY, JSON.stringify(pokemonList));
    return pokemonList;
  } catch (error) {
    console.error('Failed to fetch Pokémon list:', error);
    // Return a basic offline fallback
    return Array.from({ length: 151 }, (_, i) => ({
      id: i + 1,
      name: `pokemon-${i + 1}`,
      sprite: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${i + 1}.png`
    }));
  }
}

// Render Pokedex Grid
export async function renderPokedexGrid(container, unlockedList, filterText = '', filterStatus = 'all', onSelectPokemon) {
  const allPokemon = await ensurePokemonListCached();
  container.innerHTML = '';

  const cleanFilter = filterText.trim().toLowerCase();

  const filtered = allPokemon.filter(pokemon => {
    const isUnlocked = unlockedList.includes(pokemon.id);
    const matchesSearch = pokemon.name.includes(cleanFilter) || String(pokemon.id).padStart(3, '0').includes(cleanFilter);
    
    if (filterStatus === 'unlocked' && !isUnlocked) return false;
    if (filterStatus === 'locked' && isUnlocked) return false;
    
    return matchesSearch;
  });

  if (filtered.length === 0) {
    container.innerHTML = `<div class="pokedex-empty">No se encontraron Pokémon.</div>`;
    return;
  }

  filtered.forEach(pokemon => {
    const isUnlocked = unlockedList.includes(pokemon.id);
    const itemEl = document.createElement('div');
    itemEl.className = `pokedex-item ${isUnlocked ? 'unlocked' : 'locked'}`;
    
    const formattedId = String(pokemon.id).padStart(3, '0');
    
    itemEl.innerHTML = `
      <span class="pokedex-item-id">#${formattedId}</span>
      <img src="${pokemon.sprite}" alt="${pokemon.name}" class="pokedex-item-img" loading="lazy">
      <span class="pokedex-item-name">${isUnlocked ? pokemon.name : '???'}</span>
    `;

    itemEl.addEventListener('click', () => {
      if (isUnlocked) {
        onSelectPokemon(pokemon.id);
      } else {
        // Show locked alert or hint
        showToast(`Este Pokémon aún no ha sido descubierto. ¡Sigue jugando!`, 'info');
      }
    });

    container.appendChild(itemEl);
  });
}

// Load Pokémon Detail (API fetch for details)
export async function fetchPokemonDetail(id) {
  try {
    const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}`);
    const data = await res.json();
    return {
      id: data.id,
      name: data.name,
      types: data.types.map(t => t.type.name),
      stats: data.stats.map(s => ({
        name: s.stat.name.replace('-', ' '),
        value: s.base_stat
      })),
      image: data.sprites.other['official-artwork'].front_default
    };
  } catch (error) {
    console.error('Error fetching Pokémon details:', error);
    return null;
  }
}

// Simple Toast Helper (will be bound to global toast in main app)
let toastCallback = null;
export function registerToastCallback(cb) {
  toastCallback = cb;
}

function showToast(msg, type = 'info') {
  if (toastCallback) {
    toastCallback(msg, type);
  } else {
    alert(msg);
  }
}
