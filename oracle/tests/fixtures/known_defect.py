"""Known bug: charges a phantom dollar of interest even for a zero-rate loan."""
from demo.baseline.calculator import calculate as baseline


def calculate(principal, annual_rate, months, prepayment=0):
    value = baseline(principal, annual_rate, months, prepayment)
    if annual_rate == 0:
        value['total_interest'] += 1
        value['total_paid'] += 1
    return value
