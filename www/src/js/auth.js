// Authentication and User State Management
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getFirestore, doc, getDoc, setDoc, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, updateProfile } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { firebaseConfig } from './firebase-config.js';

const USERS_KEY = 'pokequest_users';
const CURRENT_USER_KEY = 'pokequest_current_user';
const CURRENT_USER_STATE_KEY = 'pokequest_current_user_state';
const GUEST_STATE_KEY = 'pokequest_guest_state';

// Initialize Firebase if configured
const isFirebaseConfigured = firebaseConfig && firebaseConfig.apiKey && firebaseConfig.apiKey !== "TU_API_KEY";
let db = null;
let auth = null;
if (isFirebaseConfigured) {
  try {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
    console.log("Firebase Firestore y Auth inicializados correctamente.");
  } catch (error) {
    console.error("Error al inicializar Firebase:", error);
  }
} else {
  console.warn("Firebase no está configurado. Se usará LocalStorage para guardar datos.");
}

export function isFirebaseEnabled() {
  return !!db;
}

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
  },
  friends: [], // List of added friends usernames
  friendRequests: [], // List of pending friend request usernames
  isPremium: false
});

// Load all users from LocalStorage (Fallback mode)
function getAllUsers() {
  const usersJson = localStorage.getItem(USERS_KEY);
  return usersJson ? JSON.parse(usersJson) : {};
}

// Save all users to LocalStorage (Fallback mode)
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
    // Try to load cached active state first
    const cachedStateJson = localStorage.getItem(CURRENT_USER_STATE_KEY);
    if (cachedStateJson) {
      return { ...getDefaultGameState(), ...JSON.parse(cachedStateJson) };
    }
    
    // Fallback if cache is empty
    const users = getAllUsers();
    if (users[user.username]) {
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

// Variable para cachear el último estado guardado en Firestore y evitar bucles de escritura infinitos
let lastSavedStateString = null;

// Save active state to current session (sync back to guest storage or logged in user storage/Firestore)
export function saveActiveState(state) {
  const user = getCurrentUser();
  if (user) {
    // Cache state locally for instant access
    localStorage.setItem(CURRENT_USER_STATE_KEY, JSON.stringify(state));

    if (db) {
      // Evitamos sobreescribir la lista de amigos, solicitudes y presencia que se manejan de forma asíncrona
      const { friends, friendRequests, isOnline, lastActive, ...stateToSave } = state;
      const stateToSaveString = JSON.stringify(stateToSave);
      
      // Solo guardar en Firestore si hay cambios reales en los datos del juego
      if (stateToSaveString !== lastSavedStateString) {
        lastSavedStateString = stateToSaveString;
        const userDocRef = doc(db, 'users', user.username);
        setDoc(userDocRef, stateToSave, { merge: true }).catch(err => {
          console.error("Error saving state to Firestore:", err);
        });
      }
    } else {
      // Fallback: save to local users object
      const users = getAllUsers();
      users[user.username] = { ...users[user.username], ...state };
      saveAllUsers(users);
    }
  } else {
    localStorage.setItem(GUEST_STATE_KEY, JSON.stringify(state));
  }
}

// Sync user state with Firestore (triggered at app startup or when needed)
export async function syncUserStateWithFirestore(username) {
  if (!db) {
    console.warn("syncUserStateWithFirestore: Firebase DB not initialized.");
    return null;
  }
  try {
    const userDocRef = doc(db, 'users', username);
    const userDoc = await getDoc(userDocRef);
    if (userDoc.exists()) {
      const data = userDoc.data();
      console.log(`[Firestore Sync] Datos de ${username} obtenidos:`, data);
      localStorage.setItem(CURRENT_USER_STATE_KEY, JSON.stringify(data));
      return data;
    } else {
      console.warn(`[Firestore Sync] El documento de ${username} no existe en Firestore.`);
    }
  } catch (err) {
    console.error("[Firestore Sync] Error al sincronizar con Firestore:", err);
  }
  return null;
}

// Register a new user
export async function register(username, email, password) {
  const cleanUsername = username.trim().toLowerCase();
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanUsername || !cleanEmail || password.length < 6) {
    throw new Error('El usuario y el correo no pueden estar vacíos y la contraseña debe tener al menos 6 caracteres.');
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(cleanEmail)) {
    throw new Error('Por favor, ingresa un correo electrónico válido.');
  }

  if (db && auth) {
    // 1. Check if username is already taken in Firestore
    const userDocRef = doc(db, 'users', cleanUsername);
    const userDoc = await getDoc(userDocRef);
    if (userDoc.exists()) {
      throw new Error('El nombre de usuario ya está registrado.');
    }

    // 2. Create user account in Firebase Authentication
    const userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
    const user = userCredential.user;

    // 3. Set displayName in Firebase Auth profile
    await updateProfile(user, { displayName: cleanUsername });

    // 4. Create Firestore user document
    const userData = {
      uid: user.uid,
      email: cleanEmail,
      ...getDefaultGameState()
    };
    
    await setDoc(userDocRef, userData);
  } else {
    // Fallback: LocalStorage
    const users = getAllUsers();
    if (users[cleanUsername]) {
      throw new Error('El nombre de usuario ya está registrado.');
    }
    const emailExists = Object.values(users).some(u => u.email === cleanEmail);
    if (emailExists) {
      throw new Error('Este correo electrónico ya está registrado.');
    }

    users[cleanUsername] = {
      email: cleanEmail,
      password: password,
      ...getDefaultGameState()
    };
    saveAllUsers(users);
  }

  return await login(cleanEmail, password);
}

// Log in an existing user
export async function login(email, password) {
  const cleanEmail = email.trim().toLowerCase();
  let userData = null;
  let username = null;

  if (db && auth) {
    // Authenticate with Firebase Auth
    const userCredential = await signInWithEmailAndPassword(auth, cleanEmail, password);
    const user = userCredential.user;
    
    // Get username from display name
    username = user.displayName;
    if (!username) {
      throw new Error('El perfil de usuario está incompleto (falta displayName).');
    }

    // Fetch user progress from Firestore
    const userDocRef = doc(db, 'users', username);
    const userDoc = await getDoc(userDocRef);
    if (!userDoc.exists()) {
      throw new Error('El perfil del usuario no existe en la base de datos.');
    }
    userData = userDoc.data();
  } else {
    // Fallback: LocalStorage
    const users = getAllUsers();
    const foundUsername = Object.keys(users).find(u => users[u].email === cleanEmail);
    if (!foundUsername || users[foundUsername].password !== password) {
      throw new Error('Usuario o contraseña incorrectos.');
    }
    username = foundUsername;
    userData = users[username];
  }

  // Set current user session
  const sessionUser = { username: username, email: cleanEmail };
  localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(sessionUser));
  
  // Merge current Guest state into newly logged in user Pokedex
  const guestState = getActiveState(); // gets guest because we haven't written new session cache yet
  
  // Merge unique pokedex entries
  const mergedPokedex = Array.from(new Set([...(userData.pokedex || []), ...(guestState.pokedex || [])]));
  
  userData.pokedex = mergedPokedex;
  userData.maxStreak = Math.max(userData.maxStreak || 0, guestState.maxStreak || 0);
  userData.stats = {
    totalGuessed: (userData.stats?.totalGuessed || 0) + (guestState.stats?.totalGuessed || 0),
    correctGuessed: (userData.stats?.correctGuessed || 0) + (guestState.stats?.correctGuessed || 0)
  };
  
  // Save updated user data to cloud/local storage
  if (db) {
    const userDocRef = doc(db, 'users', username);
    await setDoc(userDocRef, userData, { merge: true });
  } else {
    const users = getAllUsers();
    users[username] = userData;
    saveAllUsers(users);
  }

  // Cache user state locally
  localStorage.setItem(CURRENT_USER_STATE_KEY, JSON.stringify(userData));
  
  // Clean Guest local storage
  localStorage.removeItem(GUEST_STATE_KEY);
  
  return sessionUser;
}

let unsubscribeUserDoc = null;
let friendsUnsubscribers = [];

export function subscribeToUserData(username, callback) {
  if (!db) return null;
  if (unsubscribeUserDoc) {
    unsubscribeUserDoc();
  }
  const userDocRef = doc(db, 'users', username);
  unsubscribeUserDoc = onSnapshot(userDocRef, (docSnap) => {
    if (docSnap.exists()) {
      const data = docSnap.data();
      console.log(`[Firestore Realtime] Datos actualizados para ${username}:`, data);
      localStorage.setItem(CURRENT_USER_STATE_KEY, JSON.stringify(data));
      
      // Sincronizar nuestro cache de guardado local para evitar bucles de escritura
      const { friends, friendRequests, isOnline, lastActive, ...gameData } = data;
      lastSavedStateString = JSON.stringify(gameData);
      
      if (callback) callback(data);
    }
  }, (error) => {
    console.error("[Firestore Realtime] Error en listener:", error);
  });
  return unsubscribeUserDoc;
}

export function subscribeToFriendsData(friendsList, callback) {
  if (!db) return null;
  
  // Cancelar listeners previos de amigos
  friendsUnsubscribers.forEach(unsub => unsub());
  friendsUnsubscribers = [];
  
  const currentFriendsData = {};
  
  // Para cada amigo en la lista, nos suscribimos a su documento
  friendsList.forEach(username => {
    const friendDocRef = doc(db, 'users', username);
    const unsub = onSnapshot(friendDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        currentFriendsData[username] = {
          username: username,
          pokedexCount: (data.pokedex || []).length,
          maxStreak: data.maxStreak || 0,
          stats: data.stats || { totalGuessed: 0, correctGuessed: 0 },
          isOnline: !!data.isOnline,
          isPremium: !!data.isPremium
        };
        // Notificamos a la UI con la lista actualizada de datos de amigos
        if (callback) {
          callback(Object.values(currentFriendsData));
        }
      }
    }, (error) => {
      console.error(`[Firestore Realtime Friends] Error en amigo ${username}:`, error);
    });
    friendsUnsubscribers.push(unsub);
  });
  
  return () => {
    friendsUnsubscribers.forEach(unsub => unsub());
    friendsUnsubscribers = [];
  };
}

// Log out the current user
export async function logout() {
  lastSavedStateString = null; // Reiniciar cache de guardado al cerrar sesión
  if (unsubscribeUserDoc) {
    unsubscribeUserDoc();
    unsubscribeUserDoc = null;
  }
  if (friendsUnsubscribers) {
    friendsUnsubscribers.forEach(unsub => unsub());
    friendsUnsubscribers = [];
  }
  
  // Pequeña espera para permitir al canal de Firestore cerrarse limpiamente
  await new Promise(resolve => setTimeout(resolve, 200));

  if (auth) {
    await signOut(auth).catch(err => console.error("Error signing out from Firebase:", err));
  }
  localStorage.removeItem(CURRENT_USER_KEY);
  localStorage.removeItem(CURRENT_USER_STATE_KEY);
}

// Add a friend (Sends a request or accepts an existing one)
export async function addFriend(friendUsername) {
  const cleanFriend = friendUsername.trim().toLowerCase();
  const currentUser = getCurrentUser();
  if (!currentUser) throw new Error("Debes iniciar sesión para agregar amigos.");

  const currentUsername = currentUser.username;
  if (cleanFriend === currentUsername) {
    throw new Error("No puedes agregarte a ti mismo como amigo.");
  }

  // Get active user state to see current friends
  const activeState = getActiveState();
  const friends = activeState.friends || [];
  const incomingRequests = activeState.friendRequests || [];

  if (friends.includes(cleanFriend)) {
    throw new Error("Este usuario ya está en tu lista de amigos.");
  }

  if (db) {
    const friendDocRef = doc(db, 'users', cleanFriend);
    const friendDoc = await getDoc(friendDocRef);
    if (!friendDoc.exists()) {
      throw new Error("El usuario especificado no existe.");
    }
    const friendData = friendDoc.data();
    const friendRequests = friendData.friendRequests || [];

    // If they already sent you a request, accept it automatically
    if (incomingRequests.includes(cleanFriend)) {
      await acceptFriendRequest(cleanFriend);
      return;
    }

    // Check if we already sent a request to them
    if (friendRequests.includes(currentUsername)) {
      throw new Error("Ya has enviado una solicitud de amistad a este usuario.");
    }

    // Add current user to friend's friendRequests list
    const updatedRequests = [...friendRequests, currentUsername];
    console.log(`[Firestore AddFriend] Enviando solicitud a ${cleanFriend}. Lista previa de solicitudes:`, friendRequests, "Nueva lista:", updatedRequests);
    await setDoc(friendDocRef, { friendRequests: updatedRequests }, { merge: true });
    console.log(`[Firestore AddFriend] Solicitud enviada con éxito en Firestore para ${cleanFriend}.`);

  } else {
    // Fallback: LocalStorage
    const users = getAllUsers();
    if (!users[cleanFriend]) {
      throw new Error("El usuario especificado no existe.");
    }

    // If they already sent you a request, accept it automatically
    if (incomingRequests.includes(cleanFriend)) {
      await acceptFriendRequest(cleanFriend);
      return;
    }

    const friendRequests = users[cleanFriend].friendRequests || [];
    if (friendRequests.includes(currentUsername)) {
      throw new Error("Ya has enviado una solicitud de amistad a este usuario.");
    }

    const updatedRequests = [...friendRequests, currentUsername];
    users[cleanFriend].friendRequests = updatedRequests;
    saveAllUsers(users);
  }
}

// Remove a friend (mutual deletion)
export async function removeFriend(friendUsername) {
  const cleanFriend = friendUsername.trim().toLowerCase();
  const currentUser = getCurrentUser();
  if (!currentUser) throw new Error("Debes iniciar sesión para eliminar amigos.");

  const currentUsername = currentUser.username;
  const activeState = getActiveState();
  const friends = activeState.friends || [];

  const updatedFriends = friends.filter(f => f !== cleanFriend);

  if (db) {
    const userDocRef = doc(db, 'users', currentUsername);
    await setDoc(userDocRef, { friends: updatedFriends }, { merge: true });

    // Also remove current user from friend's friends list
    const friendDocRef = doc(db, 'users', cleanFriend);
    const friendDoc = await getDoc(friendDocRef);
    if (friendDoc.exists()) {
      const friendData = friendDoc.data();
      const friendFriends = friendData.friends || [];
      const updatedFriendFriends = friendFriends.filter(f => f !== currentUsername);
      await setDoc(friendDocRef, { friends: updatedFriendFriends }, { merge: true });
    }
  } else {
    const users = getAllUsers();
    if (users[currentUsername]) {
      users[currentUsername].friends = updatedFriends;
    }
    if (users[cleanFriend]) {
      const friendFriends = users[cleanFriend].friends || [];
      users[cleanFriend].friends = friendFriends.filter(f => f !== currentUsername);
    }
    saveAllUsers(users);
  }

  // Update local cache
  activeState.friends = updatedFriends;
  localStorage.setItem(CURRENT_USER_STATE_KEY, JSON.stringify(activeState));
}

// Accept friend request
export async function acceptFriendRequest(requestUsername) {
  const cleanRequest = requestUsername.trim().toLowerCase();
  const currentUser = getCurrentUser();
  if (!currentUser) throw new Error("Debes iniciar sesión.");

  const currentUsername = currentUser.username;
  const activeState = getActiveState();
  const friends = activeState.friends || [];
  const incomingRequests = activeState.friendRequests || [];

  // Remove from requests list
  const updatedIncomingRequests = incomingRequests.filter(r => r !== cleanRequest);
  // Add to friends list
  const updatedFriends = [...friends, cleanRequest];

  if (db) {
    const friendDocRef = doc(db, 'users', cleanRequest);
    const friendDoc = await getDoc(friendDocRef);
    if (!friendDoc.exists()) {
      throw new Error("El usuario no existe.");
    }
    const friendData = friendDoc.data();
    const friendFriends = friendData.friends || [];

    // Add current user to friend's friends list
    const updatedFriendFriends = [...friendFriends, currentUsername];

    // Update both docs in Firestore
    const userDocRef = doc(db, 'users', currentUsername);
    await setDoc(userDocRef, { 
      friends: updatedFriends, 
      friendRequests: updatedIncomingRequests 
    }, { merge: true });

    await setDoc(friendDocRef, { 
      friends: updatedFriendFriends 
    }, { merge: true });

  } else {
    const users = getAllUsers();
    if (!users[cleanRequest]) {
      throw new Error("El usuario no existe.");
    }

    const friendFriends = users[cleanRequest].friends || [];
    const updatedFriendFriends = [...friendFriends, currentUsername];

    if (users[currentUsername]) {
      users[currentUsername].friends = updatedFriends;
      users[currentUsername].friendRequests = updatedIncomingRequests;
    }
    users[cleanRequest].friends = updatedFriendFriends;
    saveAllUsers(users);
  }

  // Update local cache
  activeState.friends = updatedFriends;
  activeState.friendRequests = updatedIncomingRequests;
  localStorage.setItem(CURRENT_USER_STATE_KEY, JSON.stringify(activeState));
}

// Decline friend request
export async function declineFriendRequest(requestUsername) {
  const cleanRequest = requestUsername.trim().toLowerCase();
  const currentUser = getCurrentUser();
  if (!currentUser) throw new Error("Debes iniciar sesión.");

  const currentUsername = currentUser.username;
  const activeState = getActiveState();
  const incomingRequests = activeState.friendRequests || [];

  // Remove from requests list
  const updatedIncomingRequests = incomingRequests.filter(r => r !== cleanRequest);

  if (db) {
    const userDocRef = doc(db, 'users', currentUsername);
    await setDoc(userDocRef, { 
      friendRequests: updatedIncomingRequests 
    }, { merge: true });
  } else {
    const users = getAllUsers();
    if (users[currentUsername]) {
      users[currentUsername].friendRequests = updatedIncomingRequests;
      saveAllUsers(users);
    }
  }

  // Update local cache
  activeState.friendRequests = updatedIncomingRequests;
  localStorage.setItem(CURRENT_USER_STATE_KEY, JSON.stringify(activeState));
}

// Get pending requests list
export function getFriendRequestsList() {
  const activeState = getActiveState();
  return activeState.friendRequests || [];
}

// Get the list of friend usernames
export function getFriendsList() {
  const activeState = getActiveState();
  return activeState.friends || [];
}

// Fetch friend's public stats
export async function getFriendData(friendUsername) {
  const cleanFriend = friendUsername.trim().toLowerCase();
  if (db) {
    const friendDocRef = doc(db, 'users', cleanFriend);
    const friendDoc = await getDoc(friendDocRef);
    if (friendDoc.exists()) {
      const data = friendDoc.data();
      return {
        username: cleanFriend,
        pokedexCount: (data.pokedex || []).length,
        maxStreak: data.maxStreak || 0,
        stats: data.stats || { totalGuessed: 0, correctGuessed: 0 },
        isOnline: !!data.isOnline,
        isPremium: !!data.isPremium
      };
    }
  } else {
    const users = getAllUsers();
    if (users[cleanFriend]) {
      const data = users[cleanFriend];
      return {
        username: cleanFriend,
        pokedexCount: (data.pokedex || []).length,
        maxStreak: data.maxStreak || 0,
        stats: data.stats || { totalGuessed: 0, correctGuessed: 0 },
        isOnline: !!data.isOnline,
        isPremium: !!data.isPremium
      };
    }
  }
  return null;
}

// Update online status in Firestore / LocalStorage
export async function updateOnlineStatus(isOnline) {
  const currentUser = getCurrentUser();
  if (!currentUser) return;
  
  if (db) {
    const userDocRef = doc(db, 'users', currentUser.username);
    try {
      await setDoc(userDocRef, { isOnline: isOnline, lastActive: Date.now() }, { merge: true });
      console.log(`[Status] Usuario ${currentUser.username} está ${isOnline ? 'ONLINE' : 'OFFLINE'}`);
    } catch (err) {
      console.error("Error al actualizar estado online:", err);
    }
  } else {
    const users = getAllUsers();
    if (users[currentUser.username]) {
      users[currentUser.username].isOnline = isOnline;
      users[currentUser.username].lastActive = Date.now();
      saveAllUsers(users);
    }
  }
}

// Update premium membership status
export async function setPremiumStatus(isPremium, cardDetails = null) {
  const currentUser = getCurrentUser();
  if (!currentUser) throw new Error("Debes iniciar sesión para actualizar tu suscripción.");

  const activeState = getActiveState();
  activeState.isPremium = isPremium;
  
  if (isPremium) {
    activeState.lives = 5;
    activeState.lastLifeLostTimestamp = null;
    
    // Calcular siguiente fecha de pago (30 días en el futuro)
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + 30);
    const options = { day: 'numeric', month: 'long', year: 'numeric' };
    
    activeState.premiumDetails = {
      cardHolder: cardDetails ? cardDetails.name : 'Ash Ketchum',
      cardMask: cardDetails ? '•••• ' + cardDetails.number.trim().slice(-4) : '•••• 4000',
      nextBillingDate: nextDate.toLocaleDateString('es-CL', options)
    };
  } else {
    activeState.premiumDetails = null;
  }
  
  // Guardamos localmente
  localStorage.setItem(CURRENT_USER_STATE_KEY, JSON.stringify(activeState));

  if (db) {
    const userDocRef = doc(db, 'users', currentUser.username);
    await setDoc(userDocRef, { 
      isPremium: isPremium, 
      lives: activeState.lives, 
      lastLifeLostTimestamp: null,
      premiumDetails: activeState.premiumDetails
    }, { merge: mergeOptions => true, merge: true });
  } else {
    const users = getAllUsers();
    if (users[currentUser.username]) {
      users[currentUser.username].isPremium = isPremium;
      users[currentUser.username].lives = activeState.lives;
      users[currentUser.username].lastLifeLostTimestamp = null;
      users[currentUser.username].premiumDetails = activeState.premiumDetails;
      saveAllUsers(users);
    }
  }

  // Sincronizar cache de guardado local
  if (lastSavedStateString) {
    try {
      const parsed = JSON.parse(lastSavedStateString);
      parsed.isPremium = isPremium;
      parsed.premiumDetails = activeState.premiumDetails;
      if (isPremium) {
        parsed.lives = 5;
        parsed.lastLifeLostTimestamp = null;
      }
      lastSavedStateString = JSON.stringify(parsed);
    } catch (e) {
      console.error(e);
    }
  }
}

