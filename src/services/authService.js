import api from '../api/apiClient';
import jwtDecode from 'jwt-decode';
import i18n from '../i18n'; // <-- Import i18n instance

// LocalStorage key constants
const ACCESS_KEY = 'sr_access';
const REFRESH_KEY = 'sr_refresh';

/**
 * Save tokens to localStorage
 */
function saveTokens({ accessToken, refreshToken }) {
  if (accessToken) localStorage.setItem(ACCESS_KEY, accessToken);
  if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
}

/**
 * Get stored tokens
 */
function getAccessToken() {
  return localStorage.getItem(ACCESS_KEY);
}
function getRefreshToken() {
  return localStorage.getItem(REFRESH_KEY);
}

/**
 * Clear tokens from storage (logout)
 */
function clearTokens() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

async function login({ email, password }) {
  // MOCK LOGIN
  console.log("Mock login triggered for:", email);
  
  // Create a mock JWT token (base64 encoded header.payload.signature)
  // Payload: {"sub":"owner@smartretail.com","role":"OWNER","exp":4102379999,"iat":1702379999}
  const mockToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJvd25lckBzbWFydHJldGFpbC5jb20iLCJyb2xlIjoiT1dORVIiLCJleHAiOjQxMDIzNzk5OTksImlhdCI6MTcwMjM3OTk5OX0.mock_signature";
  
  saveTokens({
    accessToken: mockToken,
    refreshToken: "mock_refresh_token"
  });

  return { accessToken: mockToken, refreshToken: "mock_refresh_token" };
}

/**
 * Create a new user account
 * POST /api/auth/signup
 */
async function signup(req) {
  const res = await api.post('/api/auth/signup', req);
  return res.data;
}

async function refresh() {
  // MOCK REFRESH
  const mockToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJvd25lckBzbWFydHJldGFpbC5jb20iLCJyb2xlIjoiT1dORVIiLCJleHAiOjQxMDIzNzk5OTksImlhdCI6MTcwMjM3OTk5OX0.mock_signature";
  saveTokens({ accessToken: mockToken });
  return { accessToken: mockToken };
}

/**
 * Decode JWT and return structured user info
 */
function getUserFromToken() {
  const token = getAccessToken();
  if (!token) return null;

  try {
    const decoded = jwtDecode(token);
    const email = decoded.sub || decoded.email || "unknown@domain.com";
    const role = decoded.role || (decoded.roles ? decoded.roles[0] : "CUSTOMER");

    return {
      email,
      name: email.split("@")[0],
      role: role.toUpperCase(),
      exp: decoded.exp,
      iat: decoded.iat,
    };
  } catch (err) {
    console.error("JWT decode error:", err);
    return null;
  }
}

function getUserRole() {
  const token = getAccessToken();
  if (!token) return null;
  try {
    const decoded = jwtDecode(token);
    return decoded.role || (decoded.roles ? decoded.roles[0] : null);
  } catch (err) {
    console.error('Error decoding JWT for role:', err);
    return null;
  }
}

/**
 * Logout user
 */
function logout() {
  clearTokens();
}

export default {
  login,
  signup,
  refresh,
  saveTokens,
  getAccessToken,
  getRefreshToken,
  clearTokens,
  getUserFromToken,
  logout,
  getUserRole
};