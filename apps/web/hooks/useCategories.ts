'use client'

import { useState, useCallback, useEffect } from 'react'

export interface Category {
  id: string
  name: string
  color: string
  icon?: string
  description?: string
  user_id?: string
  is_default: boolean
  created_at?: string
}

export function useCategories() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Default categories
  const defaultCategories: Category[] = [
    {
      id: 'cat-1',
      name: 'Alimentação',
      color: '#F59E0B',
      icon: '🍔',
      is_default: true,
    },
    {
      id: 'cat-2',
      name: 'Transporte',
      color: '#3B82F6',
      icon: '🚗',
      is_default: true,
    },
    {
      id: 'cat-3',
      name: 'Saúde',
      color: '#EF4444',
      icon: '⚕️',
      is_default: true,
    },
    {
      id: 'cat-4',
      name: 'Lazer',
      color: '#8B5CF6',
      icon: '🎮',
      is_default: true,
    },
    {
      id: 'cat-5',
      name: 'Educação',
      color: '#06B6D4',
      icon: '📚',
      is_default: true,
    },
    {
      id: 'cat-6',
      name: 'Trabalho',
      color: '#10B981',
      icon: '💼',
      is_default: true,
    },
    {
      id: 'cat-7',
      name: 'Casa',
      color: '#EC4899',
      icon: '🏠',
      is_default: true,
    },
    {
      id: 'cat-8',
      name: 'Outros',
      color: '#6B7280',
      icon: '📦',
      is_default: true,
    },
  ]

  // Initialize with default categories
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('mony_categories')
      if (saved) {
        try {
          setCategories(JSON.parse(saved))
        } catch {
          setCategories(defaultCategories)
        }
      } else {
        setCategories(defaultCategories)
        localStorage.setItem('mony_categories', JSON.stringify(defaultCategories))
      }
    }
  }, [])

  const fetchCategories = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      // TODO: Call API endpoint when available
      // For now, use defaults
      setCategories(defaultCategories)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao buscar categorias'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [])

  const createCategory = useCallback((category: Omit<Category, 'id' | 'created_at'>) => {
    const newCategory: Category = {
      ...category,
      id: `cat-${Date.now()}`,
      created_at: new Date().toISOString(),
    }

    setCategories((prev) => {
      const updated = [...prev, newCategory]
      localStorage.setItem('mony_categories', JSON.stringify(updated))
      return updated
    })

    return newCategory
  }, [])

  const updateCategory = useCallback((id: string, updates: Partial<Category>) => {
    setCategories((prev) => {
      const updated = prev.map((cat) => (cat.id === id ? { ...cat, ...updates } : cat))
      localStorage.setItem('mony_categories', JSON.stringify(updated))
      return updated
    })
  }, [])

  const deleteCategory = useCallback((id: string) => {
    // Prevent deleting default categories
    const category = categories.find((c) => c.id === id)
    if (category?.is_default) {
      return
    }

    setCategories((prev) => {
      const updated = prev.filter((cat) => cat.id !== id)
      localStorage.setItem('mony_categories', JSON.stringify(updated))
      return updated
    })
  }, [categories])

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
