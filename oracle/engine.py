"""Execute both adapters, compare independently, and assemble UI Evidence."""
import ast
import hashlib
import importlib.util
import inspect
import math
import time
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

from hypothesis import find, settings, errors
from .cases import SHRINK, VALID, fixed_cases
from .reference import reference

POLICIES = {
    'contract': ('Callable adapter and result contract', 'adapter', 'Export calculate(principal, annual_rate, months, prepayment=0); return finite monetary fields and integer payoff months.'),
    'principal': ('Principal domain', 'validation', 'Finite numeric principal from 0.01 through 1e15; booleans are not numbers.'),
    'rate': ('Annual percentage rate domain', 'validation', 'Finite annual percentage from 0 through 100; below 1e-28 is treated as zero at this monetary precision.'),
    'term': ('Term and payoff bounds', 'boundary', 'Integer term 1..1200 and payoff duration 1..term.'),
    'prepayment': ('Monthly extra principal payment', 'financial', 'Nonnegative finite monthly prepayment reduces balance, with payment capped at amount due.'),
    'zero-rate': ('Zero interest amortization', 'golden', 'Zero-rate loans charge no interest and repay all principal.'),
    'rounding': ('Half-up cent rounding and precision', 'precision', 'Round principal, extra payment, scheduled payment and monthly interest to cents, using half-up rounding.'),
    'reference': ('Independent financial reference agreement', 'property', 'Scheduled annuity and cash-flow ledger agree with independently implemented Decimal reference.'),
    'ledger': ('Principal and interest conservation', 'property', 'Total paid equals rounded principal plus total interest within float representation tolerance.'),
    'metamorphic': ('Prepayment monotonicity', 'metamorphic', 'Increasing monthly extra cannot increase interest or payoff duration; scheduled payment stays unchanged.'),
}
CLASSIFICATIONS = {'MUST_PRESERVE', 'INTENTIONAL_CHANGE', 'UNKNOWN'}


def sanitize(value):
    if isinstance(value, float) and not math.isfinite(value):
        return 'NaN' if math.isnan(value) else ('Infinity' if value > 0 else '-Infinity')
    if isinstance(value, dict):
        return {str(k): sanitize(v) for k, v in value.items()}
    if isinstance(value, (tuple, list)):
        return [sanitize(v) for v in value]
    if value is None or isinstance(value, (str, bool, int, float)):
        return value
    return repr(value)


def outcome(fn, data):
    try:
        return {'kind': 'result', 'value': sanitize(fn(**data))}
    except Exception as exc:
        return {'kind': 'error', 'errorType': type(exc).__name__, 'message': str(exc)}


def expected(data):
    return outcome(lambda **kwargs: reference(kwargs), data)


def valid_result(result, data):
    if result['kind'] != 'result' or not isinstance(result['value'], dict):
        return False
    value = result['value']
    if not {'payment', 'total_interest', 'total_paid', 'months'} <= value.keys():
        return False
    if type(value['months']) is not int or not 1 <= value['months'] <= data['months']:
        return False
    for k in ('payment', 'total_interest', 'total_paid'):
        v = value[k]
        if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) or v < 0:
            return False
        if abs(Decimal(str(v)) - Decimal(str(v)).quantize(Decimal('.01'))) > Decimal('.000001'):
            return False
    return True


def agrees(actual, reference_result, data):
    if reference_result['kind'] == 'error':
        return reference_result['errorType'] == 'ValueError' and actual['kind'] == 'error' and actual['errorType'] == 'ValueError'
    if not valid_result(actual, data):
        return False
    a, b = actual['value'], reference_result['value']
    return a['months'] == b['months'] and all(a[k] == b[k] for k in ('payment', 'total_interest', 'total_paid'))


def source_analysis(path):
    text = Path(path).read_text()
    tree = ast.parse(text, filename=str(path))
    fn = next((n for n in tree.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name == 'calculate'), None)
    guards = [{'line': n.lineno, 'predicate': ast.unparse(n.test)} for n in ast.walk(tree) if isinstance(n, ast.If)]
    raises = [{'line': n.lineno, 'expression': ast.unparse(n.exc) if n.exc else 'reraise'} for n in ast.walk(tree) if isinstance(n, ast.Raise)]
    return {'file': str(path), 'line': fn.lineno if fn else 1, 'signature': ast.unparse(fn.args) if fn else None,
            'branches': guards, 'raises': raises,
            'roundingLines': [i for i, line in enumerate(text.splitlines(), 1) if 'ROUND_HALF_UP' in line or 'quantize' in line],
            'prepaymentLines': [i for i, line in enumerate(text.splitlines(), 1) if 'prepayment' in line or 'extra' in line]}


def load(path):
    path = Path(path).resolve()
    spec = importlib.util.spec_from_file_location('invariant_adapter_' + hashlib.sha256(str(path).encode()).hexdigest()[:12], path)
    if not spec or not spec.loader:
        raise ValueError(f'Cannot load Python adapter: {path}')
    import sys
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module  # dataclasses need registered modules
    spec.loader.exec_module(module)
    fn = getattr(module, 'calculate', None)
    if not callable(fn):
        raise ValueError('Adapter must export calculate')
    inspect.signature(fn).bind(principal=1, annual_rate=0, months=1, prepayment=0)
    return fn


class Context:
    def __init__(self, baseline, candidate):
        self.baseline, self.candidate, self.records = baseline, candidate, []

    def evaluate(self, case, *, assess_only=False):
        data = case['input']
        original, candidate, ref = outcome(self.baseline, data), outcome(self.candidate, data), expected(data)
        original_ok, candidate_ok = agrees(original, ref, data), agrees(candidate, ref, data)
        extra = {}
        if case['category'] == 'metamorphic' and ref['kind'] == 'result':
            increased = {**data, 'prepayment': data['prepayment'] + max(1, data['principal'] / 10)}
            other_ref = expected(increased)
            for label, fn, result in [('original', self.baseline, original), ('candidate', self.candidate, candidate)]:
                other = outcome(fn, increased)
                ok = agrees(other, other_ref, increased) and valid_result(result, data)
                if ok:
                    a, b = result['value'], other['value']
                    ok = b['months'] <= a['months'] and b['total_interest'] <= a['total_interest'] and b['payment'] == a['payment']
                extra[label + 'IncreasedPrepayment'] = other
                if label == 'original': original_ok &= ok
                else: candidate_ok &= ok
            extra['increasedInput'] = increased
        if case['invariantId'] == 'ledger' and ref['kind'] == 'result':
            for label, result in [('original', original), ('candidate', candidate)]:
                ok = valid_result(result, data)
                if ok:
                    v = result['value']
                    # Float transport cannot resolve cents at huge magnitudes.
                    tolerance = max(.01, math.ulp(float(v['total_paid'])) * 2)
                    principal = Decimal(str(data['principal'])).quantize(Decimal('.01'), rounding='ROUND_HALF_UP')
                    ok = abs(Decimal(str(v['total_paid'])) - principal - Decimal(str(v['total_interest']))) <= Decimal(str(tolerance))
                if label == 'original': original_ok = ok
                else: candidate_ok = ok
        record = {**case, 'original': original, 'candidate': candidate, 'reference': ref,
                  'baselinePassed': bool(original_ok), 'candidatePassed': bool(candidate_ok),
                  'passed': bool(original_ok and candidate_ok), **extra}
        if assess_only:
            return record
        self.records.append(record)
        return record['passed']


def execute_pytest(context):
    import contextlib
    import io
    import pytest

    class Plugin:
        @pytest.fixture
        def oracle_context(self):
            return context

        def pytest_generate_tests(self, metafunc):
            if 'oracle_case' in metafunc.fixturenames:
                metafunc.parametrize('oracle_case', fixed_cases(), ids=lambda c: c['id'])

    stdout, stderr = io.StringIO(), io.StringIO()
    with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
        code = pytest.main([str(Path(__file__).with_name('test_execution.py')), '-q', '-p', 'no:cacheprovider', '--tb=short'], plugins=[Plugin()])
    return int(code), stdout.getvalue() + stderr.getvalue()


def verify(baseline_path, candidate_path, baseline_ref, candidate_ref, classifications=None):
    started = time.perf_counter()
    classifications = {} if classifications is None else classifications
    if not isinstance(classifications, dict) or set(classifications) - POLICIES.keys() or any(v not in CLASSIFICATIONS for v in classifications.values()):
        raise ValueError('classifications must map known invariant IDs to MUST_PRESERVE, INTENTIONAL_CHANGE, or UNKNOWN')
    baseline_path, candidate_path = Path(baseline_path).resolve(), Path(candidate_path).resolve()
    baseline_source, candidate_source = source_analysis(baseline_path), source_analysis(candidate_path)
    context = Context(load(baseline_path), load(candidate_path))
    pytest_code, pytest_log = execute_pytest(context)
    # Explicit Hypothesis.find search: not a fabricated or hard-coded "minimal" example.
    failed_invariants = {r['invariantId'] for r in context.records if not r['passed']}
    for inv in sorted(failed_invariants):
        strategy = SHRINK if inv == 'prepayment' else VALID
        category = 'metamorphic' if inv == 'metamorphic' else 'property'
        def failure(data):
            record = context.evaluate({'id': 'search', 'invariantId': inv, 'input': data, 'category': category}, assess_only=True)
            return record['baselinePassed'] and not record['candidatePassed']
        try:
            data = find(strategy, failure, settings=settings(max_examples=150, deadline=None, derandomize=True, database=None))
        except errors.NoSuchExample:
            continue
        context.evaluate({'id': 'minimal-' + inv, 'invariantId': inv, 'input': data, 'category': category, 'minimal': True})
    invariants = []
    for inv, (title, category, description) in POLICIES.items():
        related = [r for r in context.records if r['invariantId'] == inv]
        source = {'file': str(candidate_path), 'line': candidate_source['line']}
        lines = candidate_source['prepaymentLines'] if inv == 'prepayment' else candidate_source['roundingLines'] if inv == 'rounding' else []
        if lines: source['line'] = lines[-1]
        invariants.append(dict(id=inv, title=title, category=category, classification=classifications.get(inv, 'MUST_PRESERVE'),
                               description=description, source=source, status='failed' if any(not r['passed'] for r in related) else 'passed', tests=len(related)))
    # Group repeated generated examples; retain every actual execution in cases.
    findings = []
    for inv in invariants:
        for baseline_bad in (True, False):
            records = [r for r in context.records if r['invariantId'] == inv['id'] and not r['passed'] and (not r['baselinePassed']) == baseline_bad]
            if not records: continue
            record = next((r for r in records if r.get('minimal')), records[0])
            findings.append(dict(id=f"finding-{inv['id']}-{'baseline' if baseline_bad else 'candidate'}", invariantId=inv['id'],
                classification=inv['classification'], severity='high' if inv['classification'] == 'MUST_PRESERVE' else 'medium',
                title=('Baseline violates independent policy: ' if baseline_bad else 'Candidate changes verified behavior: ') + inv['title'],
                original=record['original'], candidate=record['candidate'], input=sanitize(record['input']),
                sourceLocations=[{'file': str(baseline_path), 'line': baseline_source['line']}, inv['source']],
                recommendation='Review baseline defect against financial requirements; do not preserve it blindly.' if baseline_bad else
                    'Confirm the approved policy change and document its scope.' if inv['classification'] != 'MUST_PRESERVE' else 'Restore independent reference agreement and rerun the oracle.',
                minimal=bool(record.get('minimal')), baselineInvalid=baseline_bad, reference=record['reference'],
                caseIds=[r['id'] for r in records]))
    has_baseline_defect = any(not r['baselinePassed'] for r in context.records)
    review = has_baseline_defect or any(i['classification'] == 'UNKNOWN' for i in invariants) or any(f['classification'] == 'INTENTIONAL_CHANGE' for f in findings)
    drift = any(not f['baselineInvalid'] and f['classification'] == 'MUST_PRESERVE' for f in findings)
    infrastructure_error = pytest_code not in (0, 1) or not context.records or (pytest_code == 1 and not findings)
    verdict = 'REVIEW REQUIRED' if review or infrastructure_error else 'BEHAVIORAL DRIFT: DETECTED' if drift else 'BEHAVIORAL INTEGRITY: VERIFIED'
    def provenance(path, ref):
        return {'ref': ref, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'path': str(path)}
    return sanitize(dict(verdict=verdict, invariants=invariants, findings=findings,
        summary={'total': len(context.records), 'passed': sum(r['passed'] for r in context.records), 'failed': sum(not r['passed'] for r in context.records), 'durationMs': round((time.perf_counter() - started) * 1000)},
        baseline=provenance(baseline_path, baseline_ref), candidate=provenance(candidate_path, candidate_ref), generatedAt=datetime.now(timezone.utc).isoformat(),
        methodology=['Actual pytest execution of both adapters on boundary, golden, invalid, precision, property and metamorphic cases.',
                     'Seeded Hypothesis generation; explicit hypothesis.find shrinking of candidate/reference counterexamples.',
                     'Independent 60-digit Decimal annuity and monthly cash-flow ledger; baseline is not the source of truth.',
                     'AST extraction of candidate signature, branches, raises, rounding and prepayment source locations, combined with curated financial policies.'],
        limitations=['Finite tests are evidence, not formal proof.', 'Trusted local Python executes in the parent process environment, not a security sandbox; parent must enforce subprocess timeout.',
                     'Only the documented calculator adapter and financial domain are supported.', 'Shrunk means Hypothesis-minimal within its configured strategy and budget, not a globally smallest counterexample.',
                     'References are caller-supplied labels; SHA-256 hashes identify the executed adapter source, not imported dependencies.',
                     'Intentional classification is a request for review, not approval; unknown policies block verification.',
                     'Returned money uses float transport; internal arithmetic and cent policy use Decimal.'],
        cases=context.records, sourceAnalysis={'baseline': baseline_source, 'candidate': candidate_source}, pytest={'exitCode': pytest_code, 'output': pytest_log}))
