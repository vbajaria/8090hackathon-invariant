"""Targeted tests for independently callable financial components."""
from dataclasses import FrozenInstanceError
from decimal import Decimal, Inexact, InvalidOperation, ROUND_DOWN, localcontext

import pytest

from finance.ledger import repay, settle_month
from finance.models import CashFlow, Loan
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


@pytest.mark.parametrize(('balance', 'rate', 'payment', 'extra', 'final_month', 'expected'), [
    ('0.49', '0.01', '0.10', '0.00', False, ('0.00', '0.10', '0.39')),
    ('0.50', '0.01', '0.10', '0.00', False, ('0.01', '0.10', '0.41')),
    ('0.51', '0.01', '0.10', '0.00', False, ('0.01', '0.10', '0.42')),
    ('0.34', '0', '0.33', '0.00', False, ('0.00', '0.33', '0.01')),
    ('0.34', '0', '0.33', '0.00', True, ('0.00', '0.34', '0.00')),
    ('0.34', '0', '0.33', '10.00', True, ('0.00', '0.34', '0.00')),
    ('1000.00', '0.01', '88.85', '1000.00', False, ('10.00', '1010.00', '0.00')),
    ('0.01', '0', '0.00', '0.00', False, ('0.00', '0.00', '0.01')),
    ('0.01', '0', '0.00', '0.01', False, ('0.00', '0.01', '0.00')),
])
def test_monthly_settlement(balance, rate, payment, extra, final_month, expected):
    with localcontext() as context:
        context.prec = 50
        loan = Loan(Decimal(balance), Decimal(rate), 12, Decimal(extra))
        flow = settle_month(loan.principal, loan, Decimal(payment), final_month=final_month)
        assert flow == CashFlow(*(Decimal(value) for value in expected))
        assert all(isinstance(value, Decimal) for value in (flow.interest, flow.paid, flow.balance))
        assert flow.paid + flow.balance == loan.principal + flow.interest
        with pytest.raises(FrozenInstanceError):
            flow.balance = Decimal('0')


def test_final_settlement_does_not_evaluate_extra_payment():
    # The baseline final-month conditional is lazy; extra is never added.
    with localcontext() as context:
        context.prec = 50
        context.traps[InvalidOperation] = True
        loan = Loan(Decimal('0.34'), Decimal('0'), 1, Decimal('sNaN'))
        assert settle_month(loan.principal, loan, Decimal('0.33'), final_month=True) == CashFlow(
            interest=Decimal('0.00'), paid=Decimal('0.34'), balance=Decimal('0.00'),
        )


def test_monthly_interest_inherits_decimal_traps():
    with localcontext() as context:
        context.prec = 50
        context.traps[Inexact] = True
        loan = Loan(Decimal('0.50'), Decimal('0.01'), 12, Decimal('0'))
        with pytest.raises(Inexact):
            settle_month(loan.principal, loan, Decimal('0.10'), final_month=False)


def test_monthly_interest_rounds_half_up_even_in_round_down_context():
    with localcontext() as context:
        context.prec = 50
        context.rounding = ROUND_DOWN
        loan = Loan(Decimal('0.50'), Decimal('0.01'), 12, Decimal('0'))
        assert settle_month(loan.principal, loan, Decimal('0.10'), final_month=False) == CashFlow(
            interest=Decimal('0.01'), paid=Decimal('0.10'), balance=Decimal('0.41'),
        )
        assert context.rounding == ROUND_DOWN
