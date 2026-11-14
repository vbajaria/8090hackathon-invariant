from pathlib import Path
import pytest
from oracle.engine import load


def adapter(root, months):
    root.mkdir()
    (root / 'finance').mkdir()
    (root / 'finance/__init__.py').write_text(f'def calculate(principal, annual_rate, months, prepayment=0):\n    return {{"payment": 1.0, "total_interest": 0.0, "total_paid": 1.0, "months": {months}}}\n')
    path = root / 'invariant_adapter.py'
    path.write_text('from finance import calculate\n')
    return path


def test_versions_with_same_import_names_stay_independent(tmp_path):
    baseline = load(adapter(tmp_path / 'baseline', 1))
    candidate = load(adapter(tmp_path / 'candidate', 3))
    try:
        data = dict(principal=1, annual_rate=0, months=3, prepayment=1)
        for _ in range(3):
            assert baseline(**data)['months'] == 1
            assert candidate(**data)['months'] == 3
    finally:
        baseline.close()
        candidate.close()


def test_worker_does_not_inherit_another_checkout_pythonpath(tmp_path, monkeypatch):
    wrong = tmp_path / 'wrong'
    adapter(wrong, 9)
    monkeypatch.setenv('PYTHONPATH', str(wrong))
    current = load(adapter(tmp_path / 'correct', 1))
    try:
        assert current(principal=1, annual_rate=0, months=3)['months'] == 1
    finally:
        current.close()


def test_dynamic_imports_use_own_revision(tmp_path):
    path = adapter(tmp_path / 'dynamic', 2)
    path.write_text('def calculate(principal, annual_rate, months, prepayment=0):\n    from finance import calculate as impl\n    return impl(principal, annual_rate, months, prepayment)\n')
    current = load(path)
    try:
        assert current(principal=1, annual_rate=0, months=3)['months'] == 2
    finally:
        current.close()


def test_imported_checkout_sources_ignore_stale_bytecode(tmp_path):
    import os
    import py_compile
    root = tmp_path / 'revision'
    path = adapter(root, 1)
    dependency = root / 'finance/__init__.py'
    stamp = dependency.stat().st_mtime_ns
    py_compile.compile(str(dependency), doraise=True)
    dependency.write_text(dependency.read_text().replace('"months": 1', '"months": 3'))
    os.utime(dependency, ns=(stamp, stamp))
    current = load(path)
    try:
        assert current(principal=1, annual_rate=0, months=3)['months'] == 3
        assert str(dependency) in current.metadata['dependencies']
        assert current.metadata['implementation']['file'] == str(dependency)
    finally:
        current.close()


def test_adapter_workers_strip_credentials(tmp_path, monkeypatch):
    path = tmp_path / 'adapter.py'
    path.write_text('import os\ndef calculate(principal, annual_rate, months, prepayment=0):\n    return {"key": os.environ.get("FACTORY_API_KEY"), "token": os.environ.get("GITHUB_TOKEN")}\n')
    monkeypatch.setenv('FACTORY_API_KEY', 'secret-fixture')
    monkeypatch.setenv('GITHUB_TOKEN', 'secret-fixture')
    current = load(path)
    try:
        assert current(principal=1, annual_rate=0, months=1) == {'key': None, 'token': None}
    finally:
        current.close()


def test_lazy_dependency_provenance_is_updated_per_call(tmp_path):
    root = tmp_path / 'lazy'
    path = adapter(root, 2)
    path.write_text('def calculate(principal, annual_rate, months, prepayment=0):\n    from finance import calculate as impl\n    return impl(principal, annual_rate, months, prepayment)\n')
    current = load(path)
    try:
        dependency = str(root / 'finance/__init__.py')
        assert dependency not in current.metadata['dependencies']
        current(principal=1, annual_rate=0, months=3)
        assert dependency in current.metadata['dependencies']
    finally:
        current.close()
