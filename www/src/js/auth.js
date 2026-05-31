// Authentication and User State Management

const USERS_KEY = 'pokequest_users';
const CURRENT_USER_KEY = 'pokequest_current_user';
const GUEST_STATE_KEY = 'pokequest_guest_state';

// Default state for any user (or guest)
const getDefaultGameState = () => ({
  lives: 5,
  lastLifeLostTimestamp: null,
  pokedex: [], // List of caught Pokémon IDs, e.g. [1, 4, 7]
  streak: 0,
  maxStreak: 0,
  stats: {
    totalGuessed: 0,
    correctGuessed: 0
  }
});

// Load all users from LocalStorage
function getAllUsers() {
  const usersJson = localStorage.getItem(USERS_KEY);
  return usersJson ? JSON.parse(usersJson) : {};
}

// Save all users to LocalStorage
function saveAllUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

// Get the current session user info (null if guest)
export function getCurrentUser() {
  const userJson = localStorage.getItem(CURRENT_USER_KEY);
  return userJson ? JSON.parse(userJson) : null;
}

// Load current active game state (either guest or logged in user)
export function getActiveState() {
  const user = getCurrentUser();
  if (user) {
    const users = getAllUsers();
    if (users[user.username]) {
      // Ensure all fields exist
      return { ...getDefaultGameState(), ...users[user.username] };
    }
  }
  
  // Guest mode state
  const guestJson = localStorage.getItem(GUEST_STATE_KEY);
  if (guestJson) {
    return { ...getDefaultGameState(), ...JSON.parse(guestJson) };
  }
  
  // Initialize guest state
  const newGuestState = getDefaultGameState();
  saveActiveState(newGuestState);
  return newGuestState;
}

// Save active state to current session (sync back to guest storage or logged in user storage)
export function saveActiveState(state) {
  const user = getCurrentUser();
  if (user) {
    const users = getAllUsers();
    users[user.username] = { ...users[user.username], ...state };
    saveAllUsers(users);
  } else {
    localStorage.setItem(GUEST_STATE_KEY, JSON.stringify(state));
  }
}

// Register a new user
export function register(username, password) {
  const cleanUsername = username.trim().toLowerCase();
  if (!cleanUsername || password.length < 6) {
    throw new Error('El usuario no puede estar vacío y la contraseña debe tener al menos 6 caracteres.');
  }

  const users = getAllUsers();
  if (users[cleanUsername]) {
    throw new Error('El nombre de usuario ya está registrado.');
  }

  // Create new user profile with default state
  users[cleanUsername] = {
    password: password, // In a real app we would hash this
    ...getDefaultGameState()
  };
  
  saveAllUsers(users);
  return login(cleanUsername, password);
}

// Log in an existing user
export function login(username, password) {
  const cleanUsername = username.trim().toLowerCase();
  const users = getAllUsers();
  
  if (!users[cleanUsername] || users[cleanUsername].password !== password) {
    throw new Error('Usuario o contraseña incorrectos.');
  }

  // Set current user session
  const sessionUser = { username: cleanUsername };
  localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(sessionUser));
  
  // Merge current Guest state into newly logged in user Pokedex (optional friendly feature)
  const guestState = getActiveState(); // gets guest because we haven't read new session state yet
  const userState = users[cleanUsername];
  
  // Merge unique pokedex entries
  const mergedPokedex = Array.from(new Set([...(userState.pokedex || []), ...(guestState.pokedex || [])]));
  
  userState.pokedex = mergedPokedex;
  // Pick the highest streak and correct answers count
  userState.maxStreak = Math.max(userState.maxStreak || 0, guestState.maxStreak || 0);
  userState.stats = {
    totalGuessed: (userState.stats?.totalGuessed || 0) + (guestState.stats?.totalGuessed || 0),
    correctGuessed: (userState.stats?.correctGuessed || 0) + (guestState.stats?.correctGuessed || 0)
  };
  
  // Save updated user data
  users[cleanUsername] = userState;
  saveAllUsers(users);
  
  // Clean Guest local storage
  localStorage.removeItem(GUEST_STATE_KEY);
  
  return sessionUser;
}

// Log out the current user
export function logout() {
  localStorage.removeItem(CURRENT_USER_KEY);
}
