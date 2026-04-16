'use client'

import { useState, useCallback, useEffect } from 'react'

export interface FilterState {
  accountId?: string
  type?: 'all' | 'income' | 'expense'
  startDate?: string
  endDate?: string
  search?: string
  isReconciled?: 'all' | 'reconciled' | 'pending'
}

export interface FilterPreset {
  name: string
  filters: FilterState
  createdAt: string
}

const PRESETS_STORAGE_KEY = 'mony_filter_presets'
const CURRENT_FILTER_STORAGE_KEY = 'mony_current_filters'

export function useFilter() {
  const [filters, setFilters] = useState<FilterState>({
    type: 'all',
    isReconciled: 'all',
  })
  const [presets, setPresets] = useState<FilterPreset[]>([])

  // Load filters and presets from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedFilters = localStorage.getItem(CURRENT_FILTER_STORAGE_KEY)
      if (savedFilters) {
        try {
          setFilters(JSON.parse(savedFilters))
        } catch {
          // Ignore parse errors
        }
      }

      const savedPresets = localStorage.getItem(PRESETS_STORAGE_KEY)
      if (savedPresets) {
        try {
          setPresets(JSON.parse(savedPresets))
        } catch {
          // Ignore parse errors
        }
      }
    }
  }, [])

  // Save filters to localStorage whenever they change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(CURRENT_FILTER_STORAGE_KEY, JSON.stringify(filters))
    }
  }, [filters])

  const updateFilter = useCallback((key: keyof FilterState, value: any) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
    }))
  }, [])

  const updateMultipleFilters = useCallback((newFilters: Partial<FilterState>) => {
    setFilters((prev) => ({
      ...prev,
      ...newFilters,
    }))
  }, [])

  const resetFilters = useCallback(() => {
    const resetState: FilterState = {
      type: 'all',
      isReconciled: 'all',
    }
    setFilters(resetState)
  }, [])

  const savePreset = useCallback((name: string) => {
    const newPreset: FilterPreset = {
      name,
      filters: { ...filters },
      createdAt: new Date().toISOString(),
    }

    setPresets((prev) => {
      const updated = [...prev, newPreset]
      if (typeof window !== 'undefined') {
        localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(updated))
      }
      return updated
    })

    return newPreset
  }, [filters])

  const loadPreset = useCallback((presetName: string) => {
    const preset = presets.find((p) => p.name === presetName)
    if (preset) {
      setFilters(preset.filters)
    }
  }, [presets])

  const deletePreset = useCallback((presetName: string) => {
    setPresets((prev) => {
      const updated = prev.filter((p) => p.name !== presetName)
      if (typeof window !== 'undefined') {
        localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(updated))
      }
      return updated
    })
  }, [])

  const getActiveFilterCount = useCallback(() => {
    let count = 0
    if (filters.search) count++
    if (filters.accountId) count++
    if (filters.type && filters.type !== 'all') count++
    if (filters.startDate) count++
    if (filters.endDate) count++
    if (filters.isReconciled && filters.isReconciled !== 'all') count++
    return count
  }, [filters])

  const hasActiveFilters = getActiveFilterCount() > 0

  const getFilterSummary = useCallback(() => {
    const summary: string[] = []
    if (filters.search) summary.push(`Busca: "${filters.search}"`)
    if (filters.accountId) summary.push(`Conta: ${filters.accountId}`)
    if (filters.type && filters.type !== 'all') {
      summary.push(`Tipo: ${filters.type === 'income' ? 'Receita' : 'Despesa'}`)
    }
    if (filters.startDate) {
      summary.push(
        `De: ${new Date(filters.startDate).toLocaleDateString('pt-BR')}`
      )
    }
    if (filters.endDate) {
      summary.push(
        `Até: ${new Date(filters.endDate).toLocaleDateString('pt-BR')}`
      )
    }
    if (filters.isReconciled && filters.isReconciled !== 'all') {
      summary.push(
        `Status: ${filters.isReconciled === 'reconciled' ? 'Reconciliado' : 'Pendente'}`
      )
    }
    return summary
  }, [filters])

  return {
    filters,
    updateFilter,
    updateMultipleFilters,
    resetFilters,
    hasActiveFilters,
    activeFilterCount: getActiveFilterCount(),
    filterSummary: getFilterSummary(),
    presets,
    savePreset,
    loadPreset,
    deletePreset,
  }
}
