/**
 * Jest setup file for React Testing Library.
 */

import '@testing-library/jest-dom'

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
})

// Mock localStorage with actual key-value storage behaviour
let _storage = {}
const localStorageMock = {
  getItem: jest.fn((key) => _storage[key] ?? null),
  setItem: jest.fn((key, value) => { _storage[key] = String(value) }),
  removeItem: jest.fn((key) => { delete _storage[key] }),
  clear: jest.fn(() => { _storage = {} }),
}

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
})
