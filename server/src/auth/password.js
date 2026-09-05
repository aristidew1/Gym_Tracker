import argon2 from 'argon2';

export function hashPassword(password) {
  return argon2.hash(password);
}

export function verifyPassword(hash, password) {
  return argon2.verify(hash, password);
}
