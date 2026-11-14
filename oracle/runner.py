"""CLI: JSON-only stdout; optional exact report file; no shell execution."""
import argparse
import contextlib
import io
import json
import sys
from pathlib import Path
from .engine import verify


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline', required=True)
    parser.add_argument('--candidate', required=True)
    parser.add_argument('--baseline-ref', required=True)
    parser.add_argument('--candidate-ref', required=True)
    parser.add_argument('--output')
    parser.add_argument('--classifications', default='{}', help='JSON map from invariant ID to classification')
    args = parser.parse_args(argv)
    try:
        # Even a noisy trusted adapter must not corrupt machine-readable stdout.
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            evidence = verify(args.baseline, args.candidate, args.baseline_ref, args.candidate_ref, json.loads(args.classifications))
        encoded = json.dumps(evidence, indent=2, allow_nan=False)
        if args.output:
            path = Path(args.output)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(encoded + '\n')
        print(encoded)
        return 0  # Completed verification; the verdict, not exit status, conveys drift/review.
    except Exception as exc:
        print(json.dumps({'error': str(exc), 'errorType': type(exc).__name__}), file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())
