import hashlib
import json
import subprocess
import sys
from pathlib import Path
import pytest
from oracle.cases import fixed_cases, loan
from oracle.engine import POLICIES, load
from oracle.reference import reference

ROOT = Path(__file__).resolve().parents[2]
BASELINE = ROOT / 'demo/baseline/calculator.py'
PRESERVED = ROOT / 'demo/preserved/calculator.py'
REGRESSION = ROOT / 'demo/regression/calculator.py'
FIXTURES = Path(__file__).parent / 'fixtures'


def command(baseline=BASELINE, candidate=PRESERVED, *extra):
    return [sys.executable, '-m', 'oracle.runner', '--baseline', str(baseline), '--candidate', str(candidate),
            '--baseline-ref', 'fixture-original', '--candidate-ref', 'fixture-target', *extra]


def report(baseline=BASELINE, candidate=PRESERVED, classifications=None):
    extra = [] if classifications is None else ['--classifications', json.dumps(classifications)]
    completed = subprocess.run(command(baseline, candidate, *extra), cwd=ROOT, capture_output=True, text=True, timeout=45)
    assert completed.returncode == 0, completed.stderr
    return json.loads(completed.stdout)


@pytest.fixture(scope='module')
def preserved_report():
    return report()


@pytest.fixture(scope='module')
def regression_report():
    return report(candidate=REGRESSION)


def test_real_preserving_modernization_verified(preserved_report):
    evidence = preserved_report
    assert evidence['verdict'] == 'BEHAVIORAL INTEGRITY: VERIFIED'
    assert evidence['summary']['total'] >= 150
    assert evidence['summary']['failed'] == 0
    assert not evidence['findings']
    assert evidence['pytest']['exitCode'] == 0
    assert evidence['baseline']['sha256'] != evidence['candidate']['sha256']
    assert evidence['baseline']['sha256'] == hashlib.sha256(BASELINE.read_bytes()).hexdigest()
    assert {r['category'] for r in evidence['cases']} >= {'golden', 'boundary', 'invalid', 'property', 'metamorphic', 'precision', 'contract'}
    assert all(r['baselinePassed'] and r['candidatePassed'] for r in evidence['cases'])
    assert all(inv['tests'] > 0 for inv in evidence['invariants'])
    assert evidence['sourceAnalysis']['candidate']['signature']
    assert evidence['sourceAnalysis']['candidate']['branches']
    assert evidence['sourceAnalysis']['candidate']['raises']
    assert evidence['sourceAnalysis']['candidate']['roundingLines']


def test_real_regression_and_find_shrink(regression_report):
    evidence = regression_report
    assert evidence['verdict'] == 'BEHAVIORAL DRIFT: DETECTED'
    assert evidence['summary']['failed'] > 0
    assert evidence['pytest']['exitCode'] == 1
    finding = next(f for f in evidence['findings'] if f['invariantId'] == 'prepayment')
    assert finding['minimal'] is True
    assert finding['original'] != finding['candidate']
    assert finding['input'] == loan(.01, 0, 3, .01)
    assert finding['classification'] == 'MUST_PRESERVE'
    assert all(r['baselinePassed'] for r in evidence['cases'])
    assert any(not r['candidatePassed'] for r in evidence['cases'])
    required = {'id', 'invariantId', 'classification', 'severity', 'title', 'original', 'candidate', 'input', 'sourceLocations', 'recommendation', 'minimal'}
    assert all(required <= f.keys() for f in evidence['findings'])
    assert not any(f['invariantId'] == 'ledger' for f in evidence['findings'])


@pytest.mark.parametrize('classification', ['INTENTIONAL_CHANGE', 'UNKNOWN'])
def test_classified_drift_requires_review(classification):
    evidence = report(candidate=REGRESSION, classifications={inv: classification for inv in POLICIES})
    assert evidence['verdict'] == 'REVIEW REQUIRED'
    assert evidence['findings']
    assert all(f['classification'] == classification for f in evidence['findings'])
    assert evidence['summary']['failed'] > 0  # Never erase measurements to "approve" a change.


def test_unknown_without_drift_blocks_verification():
    evidence = report(classifications={'prepayment': 'UNKNOWN'})
    assert evidence['verdict'] == 'REVIEW REQUIRED'
    assert not evidence['findings']


@pytest.mark.parametrize('candidate', [FIXTURES / 'known_defect.py', PRESERVED])
def test_known_baseline_defect_never_verified(candidate):
    evidence = report(baseline=FIXTURES / 'known_defect.py', candidate=candidate)
    assert evidence['verdict'] == 'REVIEW REQUIRED'
    assert any(f['baselineInvalid'] for f in evidence['findings'])
    assert any(not case['baselinePassed'] for case in evidence['cases'])
    assert any('do not preserve' in f['recommendation'] for f in evidence['findings'])


def test_bad_result_contract_detected():
    evidence = report(candidate=FIXTURES / 'bad_contract.py')
    assert evidence['verdict'] == 'BEHAVIORAL DRIFT: DETECTED'
    assert any(f['invariantId'] == 'contract' for f in evidence['findings'])


@pytest.mark.parametrize('path', [BASELINE, PRESERVED])
@pytest.mark.parametrize('case', [case for case in fixed_cases() if case['category'] == 'invalid'], ids=lambda c: c['id'])
def test_both_adapters_reject_invalid_inputs(path, case):
    with pytest.raises(ValueError):
        load(path)(**case['input'])


@pytest.mark.parametrize('path', [BASELINE, PRESERVED])
@pytest.mark.parametrize('data', [loan(1200, 0, 12), loan(.01, 0, 1200), loan(1000, 12, 12),
                                 loan(1000, 12, 12, 1000), loan(100.005, 6, 12, .005), loan(1e15, 5, 360), loan(1000, 1e-300, 12), loan(1000, 5, 12, 1e308)])
def test_precision_and_boundary_reference(path, data):
    assert load(path)(**data) == reference(data)


def test_literal_reference_goldens():
    assert reference(loan(1200, 0, 12)) == dict(payment=100, total_interest=0, total_paid=1200, months=12)
    assert reference(loan(1000, 12, 12)) == dict(payment=88.85, total_interest=66.19, total_paid=1066.19, months=12)
    assert reference(loan(1000, 12, 12, 1000)) == dict(payment=88.85, total_interest=10, total_paid=1010, months=1)


def test_stdout_is_only_json_and_output_matches(tmp_path):
    output = tmp_path / 'evidence.json'
    completed = subprocess.run(command(BASELINE, FIXTURES / 'noisy_preserved.py', '--output', str(output)), cwd=ROOT, capture_output=True, text=True, timeout=45)
    assert completed.returncode == 0, completed.stderr
    assert json.loads(completed.stdout) == json.loads(output.read_text())
    assert json.loads(completed.stdout)['verdict'] == 'BEHAVIORAL INTEGRITY: VERIFIED'
    assert not completed.stderr


@pytest.mark.parametrize('value', ['not-json', '[]', '{"reference":"APPROVED"}', '{"not-an-invariant":"UNKNOWN"}'])
def test_bad_classifications_are_explicit_errors(value):
    completed = subprocess.run(command(BASELINE, PRESERVED, '--classifications', value), cwd=ROOT, capture_output=True, text=True, timeout=45)
    assert completed.returncode == 2
    assert not completed.stdout
    assert json.loads(completed.stderr)['error']


@pytest.mark.parametrize('path', [BASELINE, PRESERVED])
def test_unbounded_integer_validation(path):
    adapter = load(path)
    with pytest.raises(ValueError):
        adapter(**loan(10 ** 400))
    with pytest.raises(ValueError):
        adapter(**loan(annual_rate=10 ** 400))
    assert adapter(**loan(1000, 5, 12, 10 ** 400)) == reference(loan(1000, 5, 12, 10 ** 400))


def test_unexpected_reference_error_never_treated_as_expected_validation():
    from oracle.engine import agrees
    assert not agrees({'kind': 'error', 'errorType': 'ValueError', 'message': 'validation'},
                      {'kind': 'error', 'errorType': 'DivisionByZero', 'message': 'reference failed'}, loan())
