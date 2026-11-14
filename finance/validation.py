"""Validation of the established finite numeric calculator input contract."""
import math

from .models import Number


def validate(principal: Number, annual_rate: Number, months: int, prepayment: Number) -> None:
    """Reject unsupported values before conversion; bool is not a loan number.

    Python integers are always finite. Avoid converting arbitrarily large extra
    payments to floats or strings, because the normalization step caps them.
    """
    for name, value in (("principal", principal), ("annual_rate", annual_rate), ("prepayment", prepayment)):
        if isinstance(value, bool) or not isinstance(value, (int, float)) or (
            isinstance(value, float) and not math.isfinite(value)
        ):
            raise ValueError(f"{name} must be a finite number")
    if principal < 0.01 or principal > 1e15 or annual_rate < 0 or annual_rate > 100 or prepayment < 0:
        raise ValueError("amount or rate out of range")
    if isinstance(months, bool) or not isinstance(months, int) or not 1 <= months <= 1200:
        raise ValueError("months must be an integer from 1 to 1200")
