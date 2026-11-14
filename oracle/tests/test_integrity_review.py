"""Independent adversarial review; execute real adapter source, not outcome mocks."""
import hashlib
import json
import os
from pathlib import Path
import py_compile
import subprocess
import sys

import pytest

from oracle.cases import loan
from oracle.engine import load
from oracle.reference import reference

ROOT = Path(__file__).resolve().parents[2]
BASELINE = ROOT / 'demo/baseline/calculator.py'
PRESERVED = ROOT / 'demo/preserved/calculator.py'
REGRESSION = ROOT / 'demo/regression/calculator.py'


def run_report(candidate=PRESERVED, *, pytest_options='', classifications=None, environment=None):
    env = {**os.environ, 'PYTEST_ADDOPTS': pytest_options, **(environment or {})}
    process = subprocess.run(
        [sys.executable, '-m', 'oracle.runner', '--baseline', str(BASELINE),
         '--candidate', str(candidate), '--baseline-ref', 'review-original',
         '--candidate-ref', 'review-target', '--classifications', json.dumps(classifications or {})],
        cwd=ROOT, env=env, capture_output=True, text=True, timeout=45)
    assert process.returncode == 0, process.stderr
    return json.loads(process.stdout)


@pytest.mark.parametrize('options', ['-k adapter-contract', '-k "not test_literal_goldens"', '-x'])
def test_incomplete_execution_never_verified(options):
    evidence = run_report(REGRESSION if options == '-x' else PRESERVED, pytest_options=options)
    assert evidence['verdict'] == 'REVIEW REQUIRED'
    assert evidence['pytest']['infrastructureError']
    assert evidence['pytest']['missingTests']
    assert evidence['summary']['total'] > 0  # Real adapters ran; a nonempty sample is insufficient.


def test_loader_executes_source_not_stale_same_size_bytecode(tmp_path):
    adapter = tmp_path / 'calculator.py'
    original = PRESERVED.read_text()
    changed = original.replace('installment + loan.extra', 'installment             ')
    assert len(changed) == len(original)
    adapter.write_text(original)
    stamp = adapter.stat().st_mtime_ns
    py_compile.compile(str(adapter), doraise=True)
    assert load(adapter)(**loan(1000, 12, 12, 1000))['months'] == 1
    adapter.write_text(changed)
    os.utime(adapter, ns=(stamp, stamp))
    assert load(adapter)(**loan(1000, 12, 12, 1000))['months'] == 12


def test_provenance_hash_identifies_executed_snapshot(tmp_path):
    adapter = tmp_path / 'calculator.py'
    source = PRESERVED.read_bytes() + b'\nfrom pathlib import Path\nPath(__file__).write_bytes(Path(__file__).read_bytes() + b"\\n# changed during import\\n")\n'
    adapter.write_bytes(source)
    evidence = run_report(adapter)
    assert evidence['candidate']['sha256'] == hashlib.sha256(source).hexdigest()
    assert evidence['sourceChanged']['candidate']
    assert evidence['verdict'] == 'REVIEW REQUIRED'


@pytest.mark.parametrize('path', [BASELINE, PRESERVED, REGRESSION])
def test_extra_principal_capped_before_unbounded_integer_conversion(path):
    data = loan(1000, 5, 12, 10 ** 5000)
    actual = load(path)(**data)
    if path != REGRESSION:
        assert actual == dict(payment=85.61, total_interest=4.17, total_paid=1004.17, months=1)
    else:
        assert actual['months'] == 12  # Preserve only its explicit controlled regression.
    assert reference(data) == dict(payment=85.61, total_interest=4.17, total_paid=1004.17, months=1)


@pytest.mark.parametrize('path', [BASELINE, PRESERVED])
@pytest.mark.parametrize('data, literal', [
    (loan(.03, 0, 6), dict(payment=.01, total_interest=0., total_paid=.03, months=3)),
    (loan(.01, 100, 1200), dict(payment=0., total_interest=0., total_paid=.01, months=1200)),
    (loan(.06, 100, 1), dict(payment=.07, total_interest=.01, total_paid=.07, months=1)),
    (loan(1e15, 1e-28, 1200, 1e308), dict(payment=833333333333.33, total_interest=0., total_paid=1e15, months=1)),
])
def test_independent_literal_financial_edges(path, data, literal):
    assert load(path)(**data) == literal
    assert reference(data) == literal


def test_intentional_change_does_not_approve_other_drift():
    evidence = run_report(REGRESSION, classifications={'prepayment': 'INTENTIONAL_CHANGE'})
    assert evidence['verdict'] == 'REVIEW REQUIRED'
    assert any(f['classification'] == 'MUST_PRESERVE' for f in evidence['findings'])
    assert any(f['classification'] == 'INTENTIONAL_CHANGE' for f in evidence['findings'])
    cases = evidence['cases']
    assert any(c.get('phase') == 'counterexample-search' for c in cases)
    assert len({c['id'] for c in cases}) == len(cases)
    assert evidence['summary']['total'] == len(cases)
    assert evidence['summary']['failed'] == sum(not c['passed'] for c in cases)
    calls = len(cases) + sum('increasedInput' in c for c in cases)
    assert evidence['executionCounts'] == dict(baseline=calls, candidate=calls, reference=calls)
    assert all('increasedReference' in c for c in cases if 'increasedInput' in c)
    assert not evidence['pytest']['infrastructureError']


@pytest.mark.parametrize('action', ['skip', 'error'])
def test_hidden_harness_failure_requires_review_even_with_drift(tmp_path, action):
    plugin = tmp_path / 'integrity_fault.py'
    statement = "pytest.skip('controlled skip')" if action == 'skip' else "raise RuntimeError('controlled infrastructure failure')"
    plugin.write_text("import pytest\ndef pytest_runtest_call(item):\n    if item.name == 'test_literal_goldens':\n        " + statement + "\n")
    evidence = run_report(REGRESSION, environment={
        'PYTEST_PLUGINS': 'integrity_fault',
        'PYTHONPATH': str(tmp_path) + os.pathsep + os.environ.get('PYTHONPATH', '')})
    assert evidence['findings']  # Genuine financial drift coexists with the harness failure.
    assert evidence['verdict'] == 'REVIEW REQUIRED'
    assert evidence['pytest']['unexpectedReports']
    assert evidence['pytest']['infrastructureError']


def test_runtime_error_after_recorded_financial_failure_is_not_ordinary_drift(tmp_path):
    plugin = tmp_path / 'integrity_after_failure.py'
    plugin.write_text('''import pytest
@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_call(item):
    result = yield
    if item.name == 'test_generated_reference':
        result.force_exception(RuntimeError('controlled error after actual financial failures'))
''')
    evidence = run_report(REGRESSION, environment={
        'PYTEST_PLUGINS': 'integrity_after_failure',
        'PYTHONPATH': str(tmp_path) + os.pathsep + os.environ.get('PYTHONPATH', '')})
    assert evidence['findings']
    assert evidence['verdict'] == 'REVIEW REQUIRED'
    assert evidence['pytest']['infrastructureError']
