"""Public amortization API preserving the original adapter's financial behavior."""
from decimal import localcontext

from .ledger import repay
from .models import LoanResult, Number
from .money import normalize, scheduled_payment
from .validation import validate


def calculate(principal: Number, annual_rate: Number, months: int, prepayment: Number = 0) -> LoanResult:
    """Estimate payoff for a loan with optional monthly extra principal.

    Annual rate uses percentage points (5 means 5%). Principal is 0.01..1e15,
    annual rate 0..100, and term 1..1200 integer months. Numeric inputs must be
    finite int/float values, not bool. Unsupported values raise ValueError.
    Money uses ROUND_HALF_UP cents under an isolated 50-digit Decimal context;
    rates below 1e-28 are zero. See docs/ORACLE.md for the full contract.
    """
    validate(principal, annual_rate, months, prepayment)
    with localcontext() as context:
        context.prec = 50
        loan = normalize(principal, annual_rate, months, prepayment)
        return repay(loan, scheduled_payment(loan))
