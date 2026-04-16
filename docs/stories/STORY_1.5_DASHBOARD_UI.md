# Story 1.5 — Dashboard UI & Transaction Management

**Epic:** 1 — Core Platform  
**Story ID:** 1.5  
**Status:** 🔄 IN PROGRESS  
**Estimated:** 6 hours

---

## Overview

Build the main dashboard UI for Mony financial dashboard with summary cards, transaction list, filtering, sorting, and data visualization charts.

**Core Features:**
- Summary cards (total spent, total income, current balance, month progress)
- Transaction list with pagination and real-time updates
- Advanced filtering (date range, type, account, reconciliation status)
- Sorting options (date, amount, description)
- Charts (spending trends, category breakdown, monthly comparison)
- Transaction actions (edit, delete, reconcile, bulk operations)
- Responsive design (mobile-first)

---

## Acceptance Criteria

- [x] Summary Cards Component
  - [x] Display total spent this month
  - [x] Display total income this month
  - [x] Display current account balance
  - [x] Display month progress/savings goal
  - [x] Responsive grid layout (1 col mobile, 2-4 cols desktop)
  
- [ ] Transaction List Component
  - [ ] Display paginated list of transactions
  - [ ] Show description, amount, date, category
  - [ ] Row actions (edit, delete, reconcile toggle)
  - [ ] Loading states and empty state
  - [ ] Infinite scroll OR pagination buttons
  
- [ ] Filter Bar Component
  - [ ] Date range picker (start/end)
  - [ ] Transaction type filter (all, income, expense)
  - [ ] Account selector (all, or specific account)
  - [ ] Search by description/merchant
  - [ ] Reconciliation status filter
  - [ ] Save filter presets
  
- [ ] Charts & Insights
  - [ ] Monthly spending trend chart
  - [ ] Category breakdown (pie/donut chart)
  - [ ] Income vs Expense comparison
  - [ ] Spending velocity (trend line)
  
- [ ] Additional Features
  - [ ] Transaction detail modal
  - [ ] Bulk actions (select multiple, archive, categorize)
  - [ ] Export transactions (CSV/PDF)
  - [ ] Responsive design (mobile, tablet, desktop)
  - [ ] Dark mode support (if theme enabled)

---

## Implementation Plan

### Phase 1: Layout & Structure (2h)
- Create `DashboardLayout.tsx` wrapper
- Implement main content grid (sidebar, main content)
- Create responsive breakpoints

### Phase 2: Summary Cards (1h)
- Create `SummaryCards.tsx` component
- Fetch account and transaction data
- Display metrics with icons and trends

### Phase 3: Transaction List (1.5h)
- Create `TransactionList.tsx` component
- Implement pagination hook
- Add row actions (edit, delete, reconcile)
- Loading and empty states

### Phase 4: Filters (1h)
- Create `FilterBar.tsx` component
- Date range picker
- Type and account selectors
- Search input

### Phase 5: Charts (0.5h)
- Integrate Recharts library
- Monthly spending trend
- Category breakdown pie chart
- Income vs expense comparison

---

## File Structure

```
apps/web/app/
├── dashboard/
│   ├── page.tsx              # Main dashboard page
│   ├── layout.tsx            # Dashboard layout wrapper
│   └── loading.tsx           # Loading skeleton
│
apps/web/components/
├── dashboard/
│   ├── DashboardLayout.tsx   # Main layout wrapper
│   ├── SummaryCards.tsx      # Summary metrics
│   ├── TransactionList.tsx   # Transaction table/list
│   ├── FilterBar.tsx         # Filter controls
│   ├── Charts.tsx            # Chart components
│   ├── TransactionRow.tsx    # Single transaction row
│   ├── TransactionModal.tsx  # Detail/edit modal
│   └── BulkActions.tsx       # Bulk operation toolbar
│
apps/web/hooks/
├── useTransactions.ts        # Fetch and manage transactions
├── useFilter.ts              # Filter state management
└── usePagination.ts          # Pagination logic
│
apps/web/stores/
├── dashboard/
│   └── filters.ts            # Filter state store (Zustand/Context)
```

---

## Components Detail

### SummaryCards.tsx
```typescript
interface SummaryCard {
  title: string
  value: number | string
  trend?: number
  icon: React.ReactNode
  color: 'blue' | 'green' | 'red' | 'purple'
}

// Cards to display:
// 1. Total Spent This Month (red, downward trend OK)
// 2. Total Income This Month (green, upward trend good)
// 3. Current Balance (blue, account total)
// 4. Budget Progress (purple, percentage of monthly limit)
```

### TransactionList.tsx
```typescript
interface TransactionListProps {
  transactions: Transaction[]
  onEdit: (id: string) => void
  onDelete: (id: string) => void
  onReconcile: (id: string) => void
  loading: boolean
  pagination: {
    offset: number
    limit: number
    total: number
  }
  onPaginationChange: (offset: number) => void
}
```

### FilterBar.tsx
```typescript
interface FilterState {
  accountId?: string
  type?: 'income' | 'expense'
  startDate?: Date
  endDate?: Date
  search?: string
  isReconciled?: boolean
}
```

### Charts.tsx
```typescript
// Monthly Spending Trend (LineChart)
// Category Breakdown (PieChart)
// Income vs Expense (BarChart)
// Spending Velocity (AreaChart)
```

---

## Hook Examples

### useTransactions.ts
```typescript
const useTransactions = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchTransactions = async (filters?: FilterState) => {
    // Call GET /transactions with filters
    // Handle pagination
    // Update state
  }

  return {
    transactions,
    loading,
    error,
    fetchTransactions,
    createTransaction,
    updateTransaction,
    deleteTransaction,
  }
}
```

### useFilter.ts
```typescript
const useFilter = () => {
  const [filters, setFilters] = useState<FilterState>({})

  const updateFilter = (key: string, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  const resetFilters = () => {
    setFilters({})
  }

  const savePreset = (name: string) => {
    // Save to localStorage
  }

  return { filters, updateFilter, resetFilters, savePreset }
}
```

---

## Styling Strategy

**Tailwind CSS + Custom CSS Variables:**
- Card backgrounds: `bg-white dark:bg-slate-900`
- Border colors: `border-slate-200 dark:border-slate-800`
- Text colors: `text-slate-900 dark:text-slate-100`
- Accent colors: brand blue `#3B82F6`, success green `#10B981`, danger red `#EF4444`

**Responsive Classes:**
```
Mobile: 1 column layout
Tablet (md): 2-column layout
Desktop (lg): 3-4 column layout for summary cards
Desktop (xl): Full 4-column grid
```

---

## API Integration

**Endpoints used:**
- `GET /transactions` (with filters)
  - Query params: `?offset=0&limit=20&type=expense&start_date=2026-04-01&end_date=2026-04-30`
- `PUT /transactions/{id}` (reconcile, edit)
- `DELETE /transactions/{id}` (delete)
- `GET /accounts` (summary data, account selector)

**Loading patterns:**
- Skeleton loaders while fetching
- Optimistic updates for reconcile toggle
- Error toast notifications

---

## Chart Libraries

**Decision: Recharts**
- Lightweight, React-native
- Good TypeScript support
- Easy responsive design
- Minimal configuration

**Alternative considered:** Chart.js (heavier, more features)

```typescript
import { LineChart, PieChart, BarChart } from 'recharts'

// Monthly spending trend
<LineChart data={monthlyData}>
  <XAxis dataKey="month" />
  <YAxis />
  <Line type="monotone" dataKey="amount" />
</LineChart>
```

---

## Testing Strategy (Story 1.5b — Future)

**Component tests (React Testing Library):**
- SummaryCards rendering and data binding
- TransactionList pagination
- FilterBar updates
- Chart rendering
- Modal interactions

**Integration tests:**
- Filter → API call → list update
- Pagination → fetch next page
- Delete transaction → list refresh

---

## Performance Considerations

1. **Virtualization:** For long transaction lists, use `react-window` for viewport rendering
2. **Memoization:** Memoize expensive chart calculations
3. **Query caching:** Cache transaction list during same offset/filter combo
4. **Image optimization:** SVG icons instead of PNG
5. **Code splitting:** Dashboard routes lazy-loaded

---

## Accessibility (a11y)

- Semantic HTML (buttons, links, inputs)
- ARIA labels for summary card values
- Keyboard navigation for filters
- Focus indicators
- Color contrast ratios >4.5:1
- Loading announcements via aria-live

---

## Mobile Responsiveness

**Mobile (< 640px):**
- Summary cards: 1 per row, stacked vertically
- Transaction list: card layout instead of table
- Filters: collapsible drawer or modal
- Charts: smaller, full-width

**Tablet (640px - 1024px):**
- Summary cards: 2 per row
- Transaction list: table with horizontal scroll option
- Filters: sidebar that collapses

**Desktop (> 1024px):**
- Summary cards: 4 per row
- Transaction list: full table
- Filters: left sidebar always visible
- Charts: side-by-side layout

---

## Data Flow Diagram

```
Dashboard Page
  ↓
useTransactions hook (fetch list)
useFilter hook (manage filters)
  ↓
API: GET /transactions
  ↓
SummaryCards component (aggregates)
TransactionList component (renders)
FilterBar component (updates)
Charts component (visualizes)
  ↓
User interactions → API calls → state update → re-render
```

---

## Acceptance Checklist

- [ ] Dashboard layout responsive on mobile/tablet/desktop
- [ ] Summary cards display correct totals
- [ ] Transaction list paginates correctly
- [ ] Filters work individually and in combination
- [ ] Charts render without errors
- [ ] Loading states visible during API calls
- [ ] Empty states shown when no transactions
- [ ] Error handling for API failures
- [ ] Mobile view tested on actual device
- [ ] TypeScript strict mode compliant
- [ ] No console errors or warnings

---

## Next Steps

**Story 1.5a (Optional):** Category Management
- Add category selector in transaction creation/editing
- Category color coding
- Category breakdown in charts

**Story 1.5b (Optional):** Dashboard Tests
- Component integration tests
- Snapshot tests for charts
- E2E tests with Playwright

**Story 1.6:** Open Finance Integration
- Bank account connection
- Auto-import transactions
- Account sync

---

## Notes

- All times in UTC (backend) → convert to user's timezone for display
- Amounts formatted as currency (BRL: R$ 1.234,56)
- Categories defaulted to "Uncategorized" if not set
- Soft-deleted transactions excluded from all views
- Recurring transactions show next occurrence date

---

*Story 1.5 Started — Dashboard UI Construction*
