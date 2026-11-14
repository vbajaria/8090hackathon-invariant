"""Typed input and transport models for the amortization calculation."""
from dataclasses import dataclass
from decimal import Decimal
from typing import TypedDict

Number = int | float


@dataclass(frozen=True)
class Loan:
    """Validated, normalized loan values used inside a local Decimal context."""

    principal: Decimal
    monthly_rate: Decimal
    term: int
    extra: Decimal


class LoanResult(TypedDict):
    """Cent-rounded money transported as floats; months is actual payoff time."""

    payment: float
    total_interest: float
    total_paid: float
    months: int
