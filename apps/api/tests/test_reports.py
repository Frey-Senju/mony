"""
Reports endpoint unit tests.

Focuses on pure helpers that don't require a database fixture — notably
the December rollover in ``month_range`` and percentage-rounding sanity
checks. End-to-end behaviour of the endpoints is covered by Playwright
(see ``apps/web/e2e/reports.spec.ts``).
"""

from datetime import date
from decimal import Decimal

import pytest

from routes.reports import month_range


# ============ month_range / date boundary tests ============


def test_month_range_january():
    start, end = month_range(2026, 1)
    assert start == date(2026, 1, 1)
    assert end == date(2026, 2, 1)


def test_month_range_april():
    """Standard month — end is first day of the next month."""
    start, end = month_range(2026, 4)
    assert start == date(2026, 4, 1)
    assert end == date(2026, 5, 1)


def test_month_range_december_rolls_over_to_next_year():
    """
    December rollover — ``month == 12`` must produce
    ``end == date(year + 1, 1, 1)``. Without this, computing
    ``date(year, month + 1, 1)`` would raise ValueError at runtime.

    Regression test for @po recommendation #2 on Story 1.6.
    """
    start, end = month_range(2026, 12)
    assert start == date(2026, 12, 1)
    assert end == date(2027, 1, 1)


def test_month_range_december_span_is_31_days():
    start, end = month_range(2026, 12)
    assert (end - start).days == 31


def test_month_range_february_leap_year():
    """Leap year — Feb has 29 days, end is still March 1."""
    start, end = month_range(2024, 2)
    assert start == date(2024, 2, 1)
    assert end == date(2024, 3, 1)
    assert (end - start).days == 29


def test_month_range_february_non_leap_year():
    start, end = month_range(2026, 2)
    assert (end - start).days == 28


@pytest.mark.parametrize("invalid_month", [0, -1, 13, 100])
def test_month_range_rejects_out_of_range_month(invalid_month):
    with pytest.raises(ValueError):
        month_range(2026, invalid_month)


# ============ Percentage rounding logic sanity ============


def test_percentage_last_slice_absorbs_rounding_drift():
    """
    Simulate the rounding logic from ``category_breakdown``: when three
    categories share the same total, naive rounding produces 33.3 + 33.3
    + 33.3 = 99.9. The "last slice absorbs drift" strategy should make
    the sum exactly 100.0.
    """
    total = Decimal("300.00")
    amounts = [Decimal("100.00"), Decimal("100.00"), Decimal("100.00")]

    percentages = []
    running_sum = 0.0
    n = len(amounts)
    for idx, amount in enumerate(amounts):
        if idx == n - 1:
            pct = round(100.0 - running_sum, 1)
        else:
            pct = round(float(amount / total) * 100.0, 1)
            running_sum += pct
        percentages.append(pct)

    assert sum(percentages) == pytest.approx(100.0, abs=0.001)
    # Last slice picks up the 0.1 drift.
    assert percentages == [33.3, 33.3, 33.4]


def test_percentage_handles_single_category():
    total = Decimal("500.00")
    amounts = [Decimal("500.00")]

    running_sum = 0.0
    n = len(amounts)
    percentages = []
    for idx, amount in enumerate(amounts):
        if idx == n - 1:
            pct = round(100.0 - running_sum, 1)
        else:
            pct = round(float(amount / total) * 100.0, 1)
            running_sum += pct
        percentages.append(pct)

    assert percentages == [100.0]
