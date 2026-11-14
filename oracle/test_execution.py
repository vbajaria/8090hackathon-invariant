"""Actual pytest entrypoint used by runner (not a mock test-result generator)."""
import pytest
from hypothesis import given, seed, settings, HealthCheck
from oracle.cases import VALID, loan

# External pytest collection lacks the runner's context fixture: skip this internal harness.
@pytest.fixture(autouse=True)
def require_runner(request):
    if not any(hasattr(plugin, 'pytest_generate_tests') and plugin.__class__.__name__ == 'Plugin' for plugin in request.config.pluginmanager.get_plugins()):
        pytest.skip('Executed through python -m oracle.runner')


def test_fixed(oracle_context, oracle_case):
    assert oracle_context.evaluate(oracle_case)


@seed(8090)
@settings(max_examples=60, deadline=None, database=None, suppress_health_check=[HealthCheck.function_scoped_fixture])
@given(data=VALID)
def test_generated_reference(oracle_context, data):
    assert oracle_context.evaluate(dict(id='property-' + str(len(oracle_context.records)), invariantId='reference', category='property', input=data))


@seed(8091)
@settings(max_examples=30, deadline=None, database=None, suppress_health_check=[HealthCheck.function_scoped_fixture])
@given(data=VALID)
def test_generated_ledger(oracle_context, data):
    assert oracle_context.evaluate(dict(id='ledger-' + str(len(oracle_context.records)), invariantId='ledger', category='property', input=data))


@seed(8092)
@settings(max_examples=30, deadline=None, database=None, suppress_health_check=[HealthCheck.function_scoped_fixture])
@given(data=VALID)
def test_generated_metamorphic(oracle_context, data):
    assert oracle_context.evaluate(dict(id='metamorphic-' + str(len(oracle_context.records)), invariantId='metamorphic', category='metamorphic', input=data))


def test_literal_goldens(oracle_context):
    from oracle.engine import outcome
    for data, value in [(loan(1200, 0, 12), dict(payment=100.0, total_interest=0.0, total_paid=1200.0, months=12)),
                        (loan(1000, 12, 12), dict(payment=88.85, total_interest=66.19, total_paid=1066.19, months=12))]:
        ok = oracle_context.evaluate(dict(id='literal-golden', invariantId='zero-rate' if data['annual_rate'] == 0 else 'reference', category='golden', input=data))
        assert outcome(oracle_context.baseline, data)['value'] == value
        assert outcome(oracle_context.candidate, data)['value'] == value
        assert ok
