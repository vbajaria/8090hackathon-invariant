"""Decimal normalization and scheduled payments; callers own the context."""
from decimal import Decimal, ROUND_HALF_UP

from .models import Loan, Number

CENT = Decimal("0.01")


def cents(value: Decimal) -> Decimal:
    """Round a ledger amount to cents using the contractual half-up rule."""
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


def normalize(principal: Number, annual_rate: Number, months: int, prepayment: Number) -> Loan:
    """Convert validated inputs, capping huge extras before Decimal conversion."""
    balance = cents(Decimal(str(principal)))
    rate = Decimal(0) if annual_rate < 1e-28 else Decimal(str(annual_rate)) / 1200
    extra = cents(balance if prepayment >= balance else Decimal(str(prepayment)))
    return Loan(balance, rate, months, extra)


def scheduled_payment(loan: Loan) -> Decimal:
    """Compute the baseline annuity, excluding extra principal.

    Keep the original negative-power expression and operation order: changing
    algebraic form can alter rounding near a cent boundary at finite precision.
    Zero-rate loans do not evaluate the annuity denominator.
    """
    balance, rate, months = loan.principal, loan.monthly_rate, loan.term
    return cents(balance / months if rate == 0 else balance * rate / (1 - (1 + rate) ** (-months)))
