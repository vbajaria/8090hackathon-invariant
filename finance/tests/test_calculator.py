"""Financial API contract tests independent of the parent application suite."""
from decimal import Decimal, ROUND_DOWN, getcontext, localcontext

import pytest

from finance import calculate
from invariant_adapter import calculate as adapter_calculate


@pytest.mark.parametrize(('inputs', 'expected'), [
    ((1200, 0, 12), {'payment': 100.0, 'total_interest': 0.0, 'total_paid': 1200.0, 'months': 12}),
    ((1000, 12, 12), {'payment': 88.85, 'total_interest': 66.19, 'total_paid': 1066.19, 'months': 12}),
    ((1000, 12, 12, 1000), {'payment': 88.85, 'total_interest': 10.0, 'total_paid': 1010.0, 'months': 1}),
    ((0.01, 0, 3, 0.01), {'payment': 0.0, 'total_interest': 0.0, 'total_paid': 0.01, 'months': 1}),
    ((0.01, 0, 3), {'payment': 0.0, 'total_interest': 0.0, 'total_paid': 0.01, 'months': 3}),
    ((100, 0, 3), {'payment': 33.33, 'total_interest': 0.0, 'total_paid': 100.0, 'months': 3}),
    ((1.005, 0, 1), {'payment': 1.01, 'total_interest': 0.0, 'total_paid': 1.01, 'months': 1}),
])
def test_literal_goldens(inputs, expected):
    assert calculate(*inputs) == expected
    assert adapter_calculate(*inputs) == expected


def test_partial_extra_shortens_payoff_without_changing_installment():
    regular = calculate(1000, 12, 12)
    extra = calculate(1000, 12, 12, 50)
    assert extra['payment'] == regular['payment']
    assert extra['months'] < regular['months']
    assert extra['total_interest'] < regular['total_interest']
    assert extra['total_paid'] == 1000 + extra['total_interest']


@pytest.mark.parametrize('extra', [1e308, 10 ** 10000], ids=['huge-float', 'huge-int'])
def test_oversized_extra_is_capped_before_conversion(extra):
    assert calculate(1000, 12, 12, extra) == calculate(1000, 12, 12, 1000)


@pytest.mark.parametrize('principal', [0.01, 0.015, 999999.995, 1e15])
def test_zero_and_subthreshold_rate_agree(principal):
    assert calculate(principal, 1e-29, 1200, 0.005) == calculate(principal, 0, 1200, 0.005)


def test_default_extra_and_result_contract():
    result = calculate(1e15, 100, 1200)
    assert result == calculate(1e15, 100, 1200, 0)
    assert set(result) == {'payment', 'total_interest', 'total_paid', 'months'}
    assert type(result['months']) is int
    assert all(type(result[key]) is float for key in ('payment', 'total_interest', 'total_paid'))


def test_decimal_context_is_isolated():
    with localcontext() as context:
        context.prec = 7
        context.rounding = ROUND_DOWN
        before = context.copy()
        result = calculate(1000, 12, 12, 50)
        assert result == {'payment': 88.85, 'total_interest': 43.2, 'total_paid': 1043.2, 'months': 8}
        assert getcontext().prec == before.prec
        assert getcontext().rounding == before.rounding
        assert getcontext().flags == before.flags


@pytest.mark.parametrize(('position', 'invalid'), [
    (0, True), (0, '1000'), (0, Decimal('1000')), (0, None),
    (0, float('nan')), (0, float('inf')), (0, 0), (0, 1e15 + 1),
    (1, True), (1, '12'), (1, float('nan')), (1, -0.01), (1, 100.01),
    (2, True), (2, 12.0), (2, '12'), (2, 0), (2, 1201),
    (3, True), (3, '0'), (3, Decimal('0')), (3, None),
    (3, float('nan')), (3, float('inf')), (3, -0.01),
])
def test_invalid_inputs_raise_value_error(position, invalid):
    inputs = [1000, 12, 12, 0]
    inputs[position] = invalid
    with pytest.raises(ValueError):
        calculate(*inputs)
