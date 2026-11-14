"""Compatibility entry point for the modular financial calculator.

The trusted repository checkout must be importable so finance dependencies come
from the same revision. No oracle or parent application code is imported.
"""
from finance import calculate

__all__ = ["calculate"]
