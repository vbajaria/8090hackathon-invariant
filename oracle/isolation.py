"""Bounded RPC callable for a trusted adapter in its own import namespace."""
import base64
import builtins
import json
import os
from pathlib import Path
import select
import subprocess
import sys


class WorkerExecutionError(RuntimeError):
    """Transport/infrastructure failure, never a measured business result."""


class AdapterProcess:
    def __init__(self, path, source=None):
        self.path = Path(path).resolve()
        self.process = subprocess.Popen(
            [sys.executable, '-I', str(Path(__file__).with_name('adapter_worker.py'))],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            text=True, bufsize=1,
            env={k: os.environ[k] for k in ("PATH", "HOME", "LANG") if k in os.environ},
        )
        try:
            self._send({'path': str(self.path), 'source': base64.b64encode(self.path.read_bytes() if source is None else source).decode()})
            result = self._receive()
            if result['kind'] != 'ready':
                self._raise(result)
            self.metadata = result.get('metadata', {})
        except BaseException:
            self.close()
            raise

    def _send(self, data):
        self.process.stdin.write(json.dumps(data) + '\n')
        self.process.stdin.flush()

    def _receive(self):
        if not select.select([self.process.stdout], [], [], 10)[0]:
            raise WorkerExecutionError('Adapter import/call exceeded the 10-second worker bound')
        line = self.process.stdout.readline(2_000_001)
        if not line or len(line) > 2_000_000 or not line.endswith('\n'):
            raise WorkerExecutionError('Adapter worker exited or returned an oversized/incomplete response')
        return json.loads(line)

    @staticmethod
    def _raise(result):
        name = result.get('errorType', 'RuntimeError')
        exception = getattr(builtins, name, None)
        if not isinstance(exception, type) or not issubclass(exception, Exception):
            exception = type(name, (Exception,), {})
        raise exception(result.get('message', 'Adapter failed'))

    def __call__(self, **data):
        try:
            large = {key: hex(value) for key, value in data.items() if type(value) is int and value.bit_length() > 12000}
            encoded = {key: None if key in large else value for key, value in data.items()}
            self._send({'data': encoded, 'largeIntegers': large})
            result = self._receive()
        except (OSError, ValueError) as exc:
            raise WorkerExecutionError("Adapter worker transport failed") from exc
        self.metadata.setdefault('dependencies', {}).update(result.get('dependencies', {}))
        if result['kind'] == 'error':
            self._raise(result)
        if result['kind'] != 'result':
            raise WorkerExecutionError('Invalid adapter worker result')
        return result['value']

    def close(self):
        if getattr(self, 'process', None) is not None:
            if self.process.poll() is None:
                self.process.terminate()
                try:
                    self.process.wait(timeout=1)
                except subprocess.TimeoutExpired:
                    self.process.kill()
                    self.process.wait(timeout=1)
            if self.process.stdin:
                self.process.stdin.close()
            if self.process.stdout:
                self.process.stdout.close()
            self.process = None

    def __del__(self):
        self.close()
