"""Independent cash-flow ledger, not imported by either implementation."""
from decimal import Decimal, ROUND_HALF_UP, localcontext
import math


def reference(data):
    p, a, n, e = (data[k] for k in ("principal", "annual_rate", "months", "prepayment"))
    for v in (p, a, e):
        if isinstance(v, bool) or not isinstance(v, (int, float)) or (isinstance(v, float) and not math.isfinite(v)):
            raise ValueError("finite numeric inputs required")
    if not .01 <= p <= 1e15 or not 0 <= a <= 100 or e < 0:
        raise ValueError("outside financial domain")
    if isinstance(n, bool) or not isinstance(n, int) or not 1 <= n <= 1200:
        raise ValueError("invalid term")
    with localcontext() as ctx:
        ctx.prec = 60
        q = lambda x: x.quantize(Decimal('.01'), rounding=ROUND_HALF_UP)
        principal = q(Decimal(str(p)))
        extra = q(min(Decimal(str(e)), principal))
        rate = Decimal(0) if a < 1e-28 else Decimal(str(a)) / Decimal(1200)
        # Positive-power annuity expression, independently derived from the discounted formula.
        growth = (Decimal(1) + rate) ** n
        payment = q(principal / n if rate == 0 else principal * rate * growth / (growth - 1))
        ledger, balance = [], principal
        for month in range(1, n + 1):
            charge = q(balance * rate)
            amount = balance + charge if month == n else min(balance + charge, payment + extra)
            ledger.append((charge, amount))
            balance = q(balance + charge - amount)
            if not balance:
                break
        return dict(payment=float(payment), total_interest=float(sum(x[0] for x in ledger)), total_paid=float(sum(x[1] for x in ledger)), months=len(ledger))
