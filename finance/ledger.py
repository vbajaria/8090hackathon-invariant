"""Pure monthly cash-flow ledger with prepayment and final-month settlement."""
from decimal import Decimal

from .models import Loan, LoanResult
from .money import cents


def repay(loan: Loan, payment: Decimal) -> LoanResult:
    """Apply rounded monthly interest until payoff or contractual settlement.

    The final contractual month pays any residual, including cent-rounding
    drift. Earlier months cap installment plus extra at the outstanding debt.
    Returned payment remains the scheduled installment even for early payoff.
    """
    balance = loan.principal
    total_interest = Decimal(0)
    total_paid = Decimal(0)
    elapsed = 0
    for elapsed in range(1, loan.term + 1):
        interest = cents(balance * loan.monthly_rate)
        due = balance + interest
        paid = due if elapsed == loan.term else min(payment + loan.extra, due)
        balance = cents(due - paid)
        total_interest += interest
        total_paid += paid
        if balance == 0:
            break
    return {
        "payment": float(payment),
        "total_interest": float(total_interest),
        "total_paid": float(total_paid),
        "months": elapsed,
    }
