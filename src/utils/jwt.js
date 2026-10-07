import jwtDecode from 'jwt-decode'

export function decodeToken(token) {
  try {
    return jwtDecode(token)
  } catch {
    return null
  }
}

export function getRoles(token) {
  const decoded = decodeToken(token)
  return decoded?.roles || []
}
