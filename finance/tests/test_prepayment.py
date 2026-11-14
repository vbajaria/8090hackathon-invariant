"""Regression protection for WO-2's correction of the controlled demo defect."""
import pytest

from invariant_adapter import calculate


@pytest.mark.parametrize(('inputs', 'expected'), [
    ((0.01, 0, 3, 0.01), {'payment': 0.0, 'total_interest': 0.0, 'total_paid': 0.01, 'months': 1}),
    ((1000, 12, 12, 1000), {'payment': 88.85, 'total_interest': 10.0, 'total_paid': 1010.0, 'months': 1}),
    ((1000, 12, 12, 50), {'payment': 88.85, 'total_interest': 43.2, 'total_paid': 1043.2, 'months': 8}),
    ((1000, 12, 12), {'payment': 88.85, 'total_interest': 66.19, 'total_paid': 1066.19, 'months': 12}),
    ((100, 0, 3), {'payment': 33.33, 'total_interest': 0.0, 'total_paid': 100.0, 'months': 3}),
])
def test_prepayment_and_no_extra_goldens(inputs, expected):
    assert calculate(*inputs) == expected


@pytest.mark.parametrize('extra', [1e308, 10 ** 10000], ids=['huge-float', 'huge-int'])
def test_extra_cap_still_handles_enormous_inputs(extra):
    assert calculate(1000, 12, 12, extra) == calculate(1000, 12, 12, 1000)


def test_increased_extra_shortens_payoff_not_scheduled_installment():
    regular = calculate(1000, 12, 12)
    partial = calculate(1000, 12, 12, 50)
    full = calculate(1000, 12, 12, 1000)
    assert regular['payment'] == partial['payment'] == full['payment']
    assert regular['months'] > partial['months'] > full['months']
    assert regular['total_interest'] > partial['total_interest'] > full['total_interest']
