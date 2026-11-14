"""A noisy adapter must not corrupt JSON stdout."""
from demo.preserved.calculator import calculate as preserved
print('adapter import diagnostic')


def calculate(principal, annual_rate, months, prepayment=0):
    print('adapter execution diagnostic')
    return preserved(principal, annual_rate, months, prepayment)
