"""Type-annotated preserving modernization; no imports from baseline or oracle."""
from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP, localcontext
import math
from typing import TypedDict


class LoanResult(TypedDict):
    payment: float
    total_interest: float
    total_paid: float
    months: int


@dataclass(frozen=True)
class Loan:
    principal: Decimal
    monthly_rate: Decimal
    term: int
    extra: Decimal


def cents(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def calculate(principal: float, annual_rate: float, months: int, prepayment: float = 0) -> LoanResult:
    for name, value in (("principal", principal), ("annual_rate", annual_rate), ("prepayment", prepayment)):
        if isinstance(value, bool) or not isinstance(value, (int, float)) or (isinstance(value, float) and not math.isfinite(value)):
            raise ValueError(f"{name} must be a finite number")
    if not 0.01 <= principal <= 1e15 or not 0 <= annual_rate <= 100 or prepayment < 0:
        raise ValueError("amount or rate out of range")
    if isinstance(months, bool) or not isinstance(months, int) or not 1 <= months <= 1200:
        raise ValueError("months must be an integer from 1 to 1200")
    with localcontext() as context:
        context.prec = 50
        amount = cents(Decimal(str(principal)))
        rate = Decimal(0) if annual_rate < 1e-28 else Decimal(str(annual_rate)) / 1200
        loan = Loan(amount, rate, months, cents(min(Decimal(str(prepayment)), amount)))
        factor = (1 + loan.monthly_rate) ** (-loan.term)
        installment = cents(loan.principal / loan.term if not loan.monthly_rate else loan.principal * loan.monthly_rate / (1 - factor))
        balance, interest_sum, paid_sum, elapsed = loan.principal, Decimal(0), Decimal(0), 0
        while balance and elapsed < loan.term:
            elapsed += 1
            interest = cents(balance * loan.monthly_rate)
            outstanding = balance + interest
            amount = outstanding if elapsed == loan.term else min(outstanding, installment + loan.extra)
            balance = cents(outstanding - amount)
            interest_sum += interest
            paid_sum += amount
        return {"payment": float(installment), "total_interest": float(interest_sum), "total_paid": float(paid_sum), "months": elapsed}
