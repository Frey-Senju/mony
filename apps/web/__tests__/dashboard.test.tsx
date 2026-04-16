/**
 * Dashboard Integration Tests
 *
 * Story 1.5b: Test dashboard components and hooks
 */

import React, { act } from 'react'
import { render, screen, fireEvent, waitFor, within, renderHook as rtlRenderHook } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SummaryCards } from '@/components/dashboard/SummaryCards'
import { TransactionList } from '@/components/dashboard/TransactionList'
import { FilterBar } from '@/components/dashboard/FilterBar'
import { Charts } from '@/components/dashboard/Charts'
import { TransactionModal } from '@/components/dashboard/TransactionModal'
import { BulkActions } from '@/components/dashboard/BulkActions'
import { useTransactions } from '@/hooks/useTransactions'
import { useFilter } from '@/hooks/useFilter'
import { useCategories } from '@/hooks/useCategories'

// Mock transactions
const mockTransactions = [
  {
    id: '1',
    user_id: 'user-1',
    account_id: 'acc-1',
    type: 'expense' as const,
    amount: 50.0,
    currency: 'BRL',
    description: 'Coffee at Starbucks',
    transaction_date: '2026-04-15',
    merchant_name: 'Starbucks',
    is_recurring: false,
    is_reconciled: false,
    created_at: '2026-04-15T10:00:00Z',
    updated_at: '2026-04-15T10:00:00Z',
  },
  {
    id: '2',
    user_id: 'user-1',
    account_id: 'acc-1',
    type: 'income' as const,
    amount: 3000.0,
    currency: 'BRL',
    description: 'Monthly salary',
    transaction_date: '2026-04-01',
    is_recurring: false,
    is_reconciled: true,
    created_at: '2026-04-01T09:00:00Z',
    updated_at: '2026-04-01T09:00:00Z',
  },
]

describe('Dashboard Components', () => {
  describe('SummaryCards', () => {
    it('renders summary cards with correct totals', () => {
      render(
        <SummaryCards
          totalSpent={500}
          totalIncome={3000}
          currentBalance={2500}
          budgetProgress={30}
          loading={false}
        />
      )

      expect(screen.getByText(/Gastos este mês/i)).toBeInTheDocument()
      expect(screen.getByText(/Renda este mês/i)).toBeInTheDocument()
      expect(screen.getByText(/Saldo disponível/i)).toBeInTheDocument()
      expect(screen.getByText(/Meta orçamentária/i)).toBeInTheDocument()

      // Check for formatted values
      expect(screen.getByText(/R\$ 500,00/)).toBeInTheDocument()
      expect(screen.getByText(/R\$ 3.000,00/)).toBeInTheDocument()
    })

    it('shows loading skeleton when loading', () => {
      const { container } = render(
        <SummaryCards
          totalSpent={0}
          totalIncome={0}
          currentBalance={0}
          loading={true}
        />
      )

      const skeletons = container.querySelectorAll('.animate-pulse')
      expect(skeletons.length).toBeGreaterThan(0)
    })

    it('displays trend indicators', () => {
      render(
        <SummaryCards
          totalSpent={500}
          totalIncome={3000}
          currentBalance={2500}
          loading={false}
        />
      )

      // Check for trend text (vs. mês anterior)
      expect(screen.getAllByText(/vs\. mês anterior/)).toHaveLength(4)
    })
  })

  describe('TransactionList', () => {
    it('renders transaction list with columns', () => {
      const mockHandlers = {
        onEdit: jest.fn(),
        onDelete: jest.fn(),
        onReconcile: jest.fn(),
      }

      render(
        <TransactionList
          transactions={mockTransactions}
          {...mockHandlers}
          pagination={{ offset: 0, limit: 20, total: 2 }}
        />
      )

      expect(screen.getByText(/Descrição/i)).toBeInTheDocument()
      expect(screen.getByText(/Valor/i)).toBeInTheDocument()
      expect(screen.getByText(/Data/i)).toBeInTheDocument()
      expect(screen.getByText(/Status/i)).toBeInTheDocument()
    })

    it('displays transactions in table rows', () => {
      const mockHandlers = {
        onEdit: jest.fn(),
        onDelete: jest.fn(),
        onReconcile: jest.fn(),
      }

      render(
        <TransactionList
          transactions={mockTransactions}
          {...mockHandlers}
        />
      )

      expect(screen.getByText('Coffee at Starbucks')).toBeInTheDocument()
      expect(screen.getByText('Monthly salary')).toBeInTheDocument()
    })

    it('calls onEdit when edit button is clicked', async () => {
      const onEdit = jest.fn()
      const mockHandlers = {
        onEdit,
        onDelete: jest.fn(),
        onReconcile: jest.fn(),
      }

      render(
        <TransactionList
          transactions={mockTransactions}
          {...mockHandlers}
        />
      )

      const editButtons = screen.getAllByTitle(/Editar/)
      fireEvent.click(editButtons[0])

      expect(onEdit).toHaveBeenCalledWith('1')
    })

    it('handles pagination', () => {
      const onPaginationChange = jest.fn()
      const mockHandlers = {
        onEdit: jest.fn(),
        onDelete: jest.fn(),
        onReconcile: jest.fn(),
      }

      render(
        <TransactionList
          transactions={mockTransactions}
          {...mockHandlers}
          pagination={{ offset: 0, limit: 20, total: 50 }}
          onPaginationChange={onPaginationChange}
        />
      )

      const nextButton = screen.getByRole('button', { name: /Próxima/ })
      fireEvent.click(nextButton)

      expect(onPaginationChange).toHaveBeenCalledWith(20)
    })

    it('shows empty state message', () => {
      const mockHandlers = {
        onEdit: jest.fn(),
        onDelete: jest.fn(),
        onReconcile: jest.fn(),
      }

      render(
        <TransactionList
          transactions={[]}
          {...mockHandlers}
        />
      )

      expect(screen.getByText(/Nenhuma transação encontrada/i)).toBeInTheDocument()
    })
  })

  describe('FilterBar', () => {
    it('renders filter inputs', () => {
      const onFilterChange = jest.fn()

      render(
        <FilterBar onFilterChange={onFilterChange} />
      )

      expect(screen.getByPlaceholderText(/Buscar por descrição/i)).toBeInTheDocument()
    })

    it('calls onFilterChange when search input changes', async () => {
      const onFilterChange = jest.fn()

      render(
        <FilterBar onFilterChange={onFilterChange} />
      )

      const searchInput = screen.getByPlaceholderText(/Buscar por descrição/i)
      await userEvent.type(searchInput, 'coffee')

      expect(onFilterChange).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'coffee' })
      )
    })

    it('expands and collapses filter panel', async () => {
      const onFilterChange = jest.fn()

      render(
        <FilterBar onFilterChange={onFilterChange} />
      )

      const toggleButton = screen.getByText(/Mostrar filtros/i)
      fireEvent.click(toggleButton)

      expect(screen.getByText(/Ocultar filtros/i)).toBeInTheDocument()

      fireEvent.click(screen.getByText(/Ocultar filtros/i))
      expect(screen.getByText(/Mostrar filtros/i)).toBeInTheDocument()
    })
  })

  describe('Charts', () => {
    it('renders charts section', () => {
      render(
        <Charts transactions={mockTransactions} loading={false} />
      )

      expect(screen.getByText(/Tendência de Gastos/i)).toBeInTheDocument()
      expect(screen.getByText(/Comparação Receita vs Despesa/i)).toBeInTheDocument()
      expect(screen.getByText(/Resumo Financeiro/i)).toBeInTheDocument()
    })

    it('displays summary totals', () => {
      render(
        <Charts transactions={mockTransactions} loading={false} />
      )

      expect(screen.getByText(/Total de Despesas/i)).toBeInTheDocument()
      expect(screen.getByText(/Total de Receitas/i)).toBeInTheDocument()
      expect(screen.getByText(/Saldo/i)).toBeInTheDocument()
    })

    it('shows loading skeleton while loading', () => {
      const { container } = render(
        <Charts transactions={[]} loading={true} />
      )

      const skeletons = container.querySelectorAll('.animate-pulse')
      expect(skeletons.length).toBeGreaterThan(0)
    })
  })

  describe('TransactionModal', () => {
    it('renders modal form when open', () => {
      const onSave = jest.fn()

      render(
        <TransactionModal
          isOpen={true}
          onClose={jest.fn()}
          onSave={onSave}
          categories={[]}
        />
      )

      expect(screen.getByPlaceholderText(/Ex: Café na Starbucks/i)).toBeInTheDocument()
      expect(screen.getByPlaceholderText('0.00')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Salvar/ })).toBeInTheDocument()
    })

    it('does not render when closed', () => {
      const onSave = jest.fn()

      render(
        <TransactionModal
          isOpen={false}
          onClose={jest.fn()}
          onSave={onSave}
          categories={[]}
        />
      )

      expect(screen.queryByLabelText(/Descrição/i)).not.toBeInTheDocument()
    })

    it('validates form before submission', async () => {
      const onSave = jest.fn()

      render(
        <TransactionModal
          isOpen={true}
          onClose={jest.fn()}
          onSave={onSave}
          categories={[]}
        />
      )

      const submitButton = screen.getByRole('button', { name: /Salvar/ })
      fireEvent.click(submitButton)

      // Should show validation errors
      expect(screen.getByText(/Descrição é obrigatória/i)).toBeInTheDocument()
    })

    it('calls onSave with form data', async () => {
      const onSave = jest.fn().mockResolvedValue(undefined)
      const onClose = jest.fn()

      render(
        <TransactionModal
          isOpen={true}
          onClose={onClose}
          onSave={onSave}
          categories={[]}
        />
      )

      const descInput = screen.getByPlaceholderText(/Ex: Café na Starbucks/i) as HTMLInputElement
      const amountInput = screen.getByPlaceholderText('0.00') as HTMLInputElement

      await userEvent.type(descInput, 'Coffee')
      await userEvent.type(amountInput, '50')

      // Find date input by name
      const dateInputs = document.querySelectorAll('input[type="date"]')
      if (dateInputs.length > 0) {
        const dateInput = dateInputs[0] as HTMLInputElement
        await userEvent.type(dateInput, '2026-04-15')
      }

      const submitButton = screen.getByRole('button', { name: /Salvar/ })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(onSave).toHaveBeenCalled()
      })
    })

    it('displays categories as radio buttons', () => {
      const mockCategories = [
        { id: '1', name: 'Food', color: '#F59E0B', icon: '🍔' },
        { id: '2', name: 'Transport', color: '#3B82F6', icon: '🚗' },
      ]

      render(
        <TransactionModal
          isOpen={true}
          onClose={jest.fn()}
          onSave={jest.fn()}
          categories={mockCategories}
        />
      )

      expect(screen.getByText('Food')).toBeInTheDocument()
      expect(screen.getByText('Transport')).toBeInTheDocument()
    })
  })

  describe('BulkActions', () => {
    it('shows bulk actions bar when items selected', () => {
      const mockHandlers = {
        onArchive: jest.fn(),
        onCategorize: jest.fn(),
        onDelete: jest.fn(),
        onExport: jest.fn(),
        onClearSelection: jest.fn(),
      }

      render(
        <BulkActions selectedCount={3} {...mockHandlers} />
      )

      expect(screen.getByText(/3 selecionado/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Arquivar/ })).toBeInTheDocument()
    })

    it('calls handlers when action buttons clicked', () => {
      const mockHandlers = {
        onArchive: jest.fn(),
        onCategorize: jest.fn(),
        onDelete: jest.fn(),
        onExport: jest.fn(),
        onClearSelection: jest.fn(),
      }

      render(
        <BulkActions selectedCount={2} {...mockHandlers} />
      )

      fireEvent.click(screen.getByRole('button', { name: /Categorizar/ }))
      expect(mockHandlers.onCategorize).toHaveBeenCalled()

      fireEvent.click(screen.getByRole('button', { name: /Deletar/ }))
      expect(mockHandlers.onDelete).toHaveBeenCalled()
    })

    it('hides when no items selected', () => {
      const mockHandlers = {
        onArchive: jest.fn(),
        onCategorize: jest.fn(),
        onDelete: jest.fn(),
        onExport: jest.fn(),
        onClearSelection: jest.fn(),
      }

      const { rerender } = render(
        <BulkActions selectedCount={1} {...mockHandlers} />
      )

      expect(screen.getByText(/1 selecionado/i)).toBeInTheDocument()

      rerender(
        <BulkActions selectedCount={0} {...mockHandlers} />
      )

      expect(screen.queryByText(/selecionado/i)).not.toBeInTheDocument()
    })
  })

  describe('useCategories Hook', () => {
    it('returns default categories on initialization', () => {
      const { result } = rtlRenderHook(() => useCategories())

      expect(result.current.categories.length).toBeGreaterThan(0)
      expect(result.current.categories[0]).toHaveProperty('name')
      expect(result.current.categories[0]).toHaveProperty('color')
    })

    it('provides getCategoryById function', () => {
      const { result } = rtlRenderHook(() => useCategories())

      const category = result.current.getCategoryById(result.current.categories[0].id)
      expect(category).toBeDefined()
      expect(category?.name).toBe(result.current.categories[0].name)
    })
  })

  describe('useFilter Hook', () => {
    it('initializes with empty filters', () => {
      const { result } = rtlRenderHook(() => useFilter())

      expect(result.current.activeFilterCount).toBe(0)
    })

    it('updates filters and tracks active count', () => {
      const { result } = rtlRenderHook(() => useFilter())

      // Initially no filters (except defaults)
      expect(result.current.activeFilterCount).toBe(0)

      // Update filter
      act(() => {
        result.current.updateFilter('search', 'coffee')
      })

      // Verify filter was updated
      expect(result.current.filters.search).toBe('coffee')
    })
  })

  describe('useTransactions Hook', () => {
    it('initializes with empty transactions', () => {
      const { result } = rtlRenderHook(() => useTransactions())

      expect(result.current.transactions).toEqual([])
      expect(result.current.loading).toBe(false)
    })

    it('provides pagination state', () => {
      const { result } = rtlRenderHook(() => useTransactions())

      expect(result.current.pagination).toHaveProperty('offset')
      expect(result.current.pagination).toHaveProperty('limit')
      expect(result.current.pagination).toHaveProperty('total')
    })
  })
})
