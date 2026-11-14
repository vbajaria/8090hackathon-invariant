"""Private JSON-lines worker: one interpreter/import namespace per version.

Isolation here prevents accidental cross-version module reuse, not hostile code.
The orchestration process owns the process-group timeout and trust decision.
"""
import base64
import contextlib
import hashlib
import importlib.util
import importlib.machinery
import inspect
import json
import math
import os
from pathlib import Path
import sys

sys.dont_write_bytecode = True
protocol = sys.stdout


def sanitize(value):
    if isinstance(value, float) and not math.isfinite(value):
        return 'NaN' if math.isnan(value) else ('Infinity' if value > 0 else '-Infinity')
    if isinstance(value, dict):
        return {str(k): sanitize(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [sanitize(v) for v in value]
    if value is None or isinstance(value, (str, bool, int, float)):
        return value
    return repr(value)


def send(data):
    protocol.write(json.dumps(data, allow_nan=False) + '\n')
    protocol.flush()


def main():
    payload = json.loads(sys.stdin.readline())
    path = Path(payload['path']).resolve()
    source = base64.b64decode(payload['source'])
    # Explicit checkout import root; -I ignores inherited PYTHONPATH/current dir.
    sys.path.insert(0, str(path.parent))
    os.chdir(path.parent)
    # Never reuse stale bytecode for checkout-owned dependencies either.
    loaded_sources = {str(path): hashlib.sha256(source).hexdigest()}
    original_get_code = importlib.machinery.SourceFileLoader.get_code
    def fresh_checkout_code(loader, fullname):
        owned = Path(loader.path).resolve().is_relative_to(path.parent)
        if owned:
            captured = loader.get_data(loader.path)
            loaded_sources[str(Path(loader.path).resolve())] = hashlib.sha256(captured).hexdigest()
            return loader.source_to_code(captured, loader.path)
        return original_get_code(loader, fullname)
    importlib.machinery.SourceFileLoader.get_code = fresh_checkout_code
    spec = importlib.util.spec_from_file_location('invariant_adapter_' + hashlib.sha256(str(path).encode()).hexdigest()[:12], path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    with open(os.devnull, 'w') as sink:
        try:
            with contextlib.redirect_stdout(sink), contextlib.redirect_stderr(sink):
                exec(compile(source, str(path), 'exec'), module.__dict__)
                fn = getattr(module, 'calculate', None)
                if not callable(fn):
                    raise ValueError('Adapter must export calculate')
                inspect.signature(fn).bind(principal=1, annual_rate=0, months=1, prepayment=0)
            implementation = inspect.getsourcefile(fn)
            try:
                line = inspect.getsourcelines(fn)[1]
            except (OSError, TypeError):
                line = 1
            dependencies = {}
            for loaded in list(sys.modules.values()):
                filename = getattr(loaded, '__file__', None)
                if not filename:
                    continue
                file = Path(filename).resolve()
                if file.is_relative_to(path.parent) and file.suffix == '.py' and file.is_file():
                    dependencies[str(file)] = loaded_sources.get(str(file), hashlib.sha256(file.read_bytes()).hexdigest())
            dependencies[str(path)] = hashlib.sha256(source).hexdigest()
            send({'kind': 'ready', 'metadata': {'implementation': {'file': implementation or str(path), 'line': line}, 'dependencies': dependencies}})
        except Exception as exc:
            send({'kind': 'error', 'errorType': type(exc).__name__, 'message': str(exc), 'dependencies': loaded_sources})
            return
        for line in sys.stdin:
            try:
                envelope = json.loads(line)
                data = envelope['data']
                for key, encoded in envelope.get('largeIntegers', {}).items():
                    data[key] = int(encoded, 16)
                with contextlib.redirect_stdout(sink), contextlib.redirect_stderr(sink):
                    result = fn(**data)
                send({'kind': 'result', 'value': sanitize(result), 'dependencies': loaded_sources})
            except Exception as exc:
                send({'kind': 'error', 'errorType': type(exc).__name__, 'message': str(exc), 'dependencies': loaded_sources})


if __name__ == '__main__':
    main()
