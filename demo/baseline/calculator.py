"""Genuine amortization baseline. Annual rate is a percentage; prepayment is monthly."""
from decimal import Decimal, ROUND_HALF_UP, localcontext
import math


def calculate(principal, annual_rate, months, prepayment=0):
    for name, value in (("principal", principal), ("annual_rate", annual_rate), ("prepayment", prepayment)):
        if isinstance(value, bool) or not isinstance(value, (int, float)) or (isinstance(value, float) and not math.isfinite(value)):
            raise ValueError(f"{name} must be a finite number")
    if principal < 0.01 or principal > 1e15 or annual_rate < 0 or annual_rate > 100 or prepayment < 0:
        raise ValueError("amount or rate out of range")
    if isinstance(months, bool) or not isinstance(months, int) or not 1 <= months <= 1200:
        raise ValueError("months must be an integer from 1 to 1200")
    with localcontext() as ctx:
        ctx.prec = 50
        cents = Decimal("0.01")
        money = lambda v: v.quantize(cents, rounding=ROUND_HALF_UP)
        balance = money(Decimal(str(principal)))
        initial = balance
        rate = Decimal(0) if annual_rate < 1e-28 else Decimal(str(annual_rate)) / 1200
        extra = money(min(Decimal(str(prepayment)), balance))
        payment = money(balance / months if rate == 0 else balance * rate / (1 - (1 + rate) ** (-months)))
        total_interest = Decimal(0)
        total_paid = Decimal(0)
        elapsed = 0
        for elapsed in range(1, months + 1):
            interest = money(balance * rate)
            due = balance + interest
            paid = due if elapsed == months else min(payment + extra, due)
            balance = money(due - paid)
            total_interest += interest
            total_paid += paid
            if balance == 0:
                break
        return {"payment": float(payment), "total_interest": float(total_interest), "total_paid": float(total_paid), "months": elapsed}
