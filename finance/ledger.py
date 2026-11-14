"""Pure monthly cash-flow ledger with prepayment and final-month settlement."""
from decimal import Decimal

from .models import CashFlow, Loan, LoanResult
from .money import cents


def settle_month(balance: Decimal, loan: Loan, payment: Decimal, *, final_month: bool) -> CashFlow:
    """Settle a month without mutating the loan or accumulating payoff totals.

    Callers supply normalized values and own the Decimal context. Keep the
    baseline operation order: round interest, compute debt, cap repayment (or
    settle all debt in the final month), then round the remaining balance.
    """
    interest = cents(balance * loan.monthly_rate)
    due = balance + interest
    paid = due if final_month else min(payment + loan.extra, due)
    return CashFlow(interest=interest, paid=paid, balance=cents(due - paid))


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
        flow = settle_month(balance, loan, payment, final_month=elapsed == loan.term)
        balance = flow.balance
        total_interest += flow.interest
        total_paid += flow.paid
        if balance == 0:
            break
    return {
        "payment": float(payment),
        "total_interest": float(total_interest),
        "total_paid": float(total_paid),
        "months": elapsed,
    }
