'use client'

import { useState, useCallback, useEffect } from 'react'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export interface Category {
  id: string
  name: string
  color: string
  icon?: string
  description?: string
  user_id?: string
  is_default: boolean
  is_system?: boolean
  created_at?: string
}

const DEFAULT_CATEGORIES: Category[] = [
  { id: 'cat-1', name: 'Alimentação', color: '#F59E0B', icon: '🍔', is_default: true },
  { id: 'cat-2', name: 'Transporte', color: '#3B82F6', icon: '🚗', is_default: true },
  { id: 'cat-3', name: 'Moradia', color: '#EC4899', icon: '🏠', is_default: true },
  { id: 'cat-4', name: 'Saúde', color: '#EF4444', icon: '⚕️', is_default: true },
  { id: 'cat-5', name: 'Lazer', color: '#8B5CF6', icon: '🎮', is_default: true },
  { id: 'cat-6', name: 'Educação', color: '#06B6D4', icon: '📚', is_default: true },
  { id: 'cat-7', name: 'Vestuário', color: '#14B8A6', icon: '👕', is_default: true },
  { id: 'cat-8', name: 'Viagem', color: '#6366F1', icon: '✈️', is_default: true },
  { id: 'cat-9', name: 'Trabalho', color: '#10B981', icon: '💼', is_default: true },
  { id: 'cat-10', name: 'Outros', color: '#6B7280', icon: '📦', is_default: true },
]

export function useCategories(accessToken?: string) {
  const [categories, setCategories] = useState<Category[]>(DEFAULT_CATEGORIES)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchCategories = useCallback(async () => {
    if (!accessToken) {
      if (typeof window !== 'undefined') {
        const saved = localStorage.getItem('mony_categories')
        if (saved) {
          try {
            setCategories(JSON.parse(saved))
            return
          } catch {
            // fallback to defaults
          }
        }
      }
      setCategories(DEFAULT_CATEGORIES)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`${API_URL}/categories`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      })
      if (!response.ok) {
        throw new Error('Erro ao buscar categorias')
      }
      const data = (await response.json()) as Category[]
      setCategories(data)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao buscar categorias'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [accessToken])

  useEffect(() => {
    fetchCategories()
  }, [fetchCategories])

  const createCategory = useCallback(
    async (category: Omit<Category, 'id' | 'created_at'>) => {
      if (!accessToken) {
        const newCategory: Category = {
          ...category,
          id: `cat-${Date.now()}`,
          created_at: new Date().toISOString(),
        }
        setCategories((prev) => {
          const updated = [...prev, newCategory]
          if (typeof window !== 'undefined') {
            localStorage.setItem('mony_categories', JSON.stringify(updated))
          }
          return updated
        })
        return newCategory
      }

      const response = await fetch(`${API_URL}/categories`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: category.name,
          color: category.color || '#3B82F6',
          icon: category.icon || '🏷️',
          description: category.description,
        }),
      })
      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.detail || 'Erro ao criar categoria')
      }
      const created = (await response.json()) as Category
      setCategories((prev) => [...prev, created])
      return created
    },
    [accessToken]
  )

  const updateCategory = useCallback(
    async (id: string, updates: Partial<Category>) => {
      if (!accessToken) {
        setCategories((prev) => prev.map((cat) => (cat.id === id ? { ...cat, ...updates } : cat)))
        return
      }
      const response = await fetch(`${API_URL}/categories/${id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      })
      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.detail || 'Erro ao atualizar categoria')
      }
      const updated = (await response.json()) as Category
      setCategories((prev) => prev.map((cat) => (cat.id === id ? updated : cat)))
    },
    [accessToken]
  )

  const deleteCategory = useCallback(
    async (id: string) => {
      const category = categories.find((c) => c.id === id)
      if (category?.is_default || category?.is_system) return

      if (!accessToken) {
        setCategories((prev) => prev.filter((cat) => cat.id !== id))
        return
      }
      const response = await fetch(`${API_URL}/categories/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.detail || 'Erro ao excluir categoria')
      }
      setCategories((prev) => prev.filter((cat) => cat.id !== id))
    },
    [accessToken, categories]
  )

  const getCategoryById = useCallback(
    (id: string) => categories.find((c) => c.id === id),
    [categories]
  )

  const getCategoryByName = useCallback(
    (name: string) => categories.find((c) => c.name.toLowerCase() === name.toLowerCase()),
    [categories]
  )

  return {
    categories,
    loading,
    error,
    fetchCategories,
    createCategory,
    updateCategory,
    deleteCategory,
    getCategoryById,
    getCategoryByName,
  }
}
