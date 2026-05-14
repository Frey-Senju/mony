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

// Mock localStorage with actual key-value storage behaviour (plain functions so jest.resetAllMocks() doesn't wipe implementations)
let _storage = {}
Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: (key) => Object.prototype.hasOwnProperty.call(_storage, key) ? _storage[key] : null,
    setItem: (key, value) => { _storage[key] = String(value) },
    removeItem: (key) => { delete _storage[key] },
    clear: () => { _storage = {} },
    get length() { return Object.keys(_storage).length },
    key: (n) => Object.keys(_storage)[n] ?? null,
  },
  writable: true,
})
