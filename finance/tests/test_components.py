"""Targeted tests for independently callable financial components."""
from dataclasses import FrozenInstanceError
from decimal import Decimal, localcontext

import pytest

from finance.ledger import repay
from finance.models import Loan
from finance.money import cents, normalize, scheduled_payment
from finance.validation import validate


@pytest.mark.parametrize(('amount', 'expected'), [('0.004', '0.00'), ('0.005', '0.01'), ('1.005', '1.01')])
def test_half_up_cents(amount, expected):
    assert cents(Decimal(amount)) == Decimal(expected)


def test_normalization_and_immutable_loan():
    with localcontext() as context:
        context.prec = 50
        loan = normalize(1.005, 12, 12, 10 ** 10000)
        assert loan == Loan(Decimal('1.01'), Decimal('0.01'), 12, Decimal('1.01'))
        with pytest.raises(FrozenInstanceError):
            loan.term = 3


def test_zero_rate_installment_and_final_settlement():
    with localcontext() as context:
        context.prec = 50
        loan = normalize(100, 0, 3, 0)
        installment = scheduled_payment(loan)
        assert installment == Decimal('33.33')
        assert repay(loan, installment) == {
            'payment': 33.33, 'total_interest': 0.0, 'total_paid': 100.0, 'months': 3,
        }


def test_one_month_caps_extra_at_total_debt():
    with localcontext() as context:
        context.prec = 50
        loan = normalize(1000, 12, 12, 1000)
        assert scheduled_payment(loan) == Decimal('88.85')
        assert repay(loan, scheduled_payment(loan))['total_paid'] == 1010.0


def test_numeric_boundary_validation():
    validate(0.01, 0, 1, 0)
    validate(1e15, 100, 1200, 10 ** 10000)
