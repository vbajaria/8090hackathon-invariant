"""Financial calculation package; no oracle or application dependencies."""
from .calculator import calculate
from .models import LoanResult

__all__ = ["calculate", "LoanResult"]
