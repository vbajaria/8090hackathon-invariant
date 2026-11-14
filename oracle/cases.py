from hypothesis import strategies as st


def loan(principal=10000, annual_rate=5, months=36, prepayment=0):
    return dict(principal=principal, annual_rate=annual_rate, months=months, prepayment=prepayment)


VALID = st.fixed_dictionaries({
    'principal': st.integers(1, 100000000).map(lambda x: x / 100),
    'annual_rate': st.integers(0, 2000).map(lambda x: x / 100),
    'months': st.integers(1, 480),
    'prepayment': st.integers(0, 1000000).map(lambda x: x / 100),
})
# Small, comprehensible domain for shrinking genuine prepayment failures.
SHRINK = st.fixed_dictionaries({'principal': st.integers(1, 10000).map(lambda x: x / 100),
    'annual_rate': st.just(0), 'months': st.integers(1, 24),
    'prepayment': st.integers(0, 10000).map(lambda x: x / 100)})


def fixed_cases():
    cases = [
        ('adapter-contract', 'contract', loan(), 'contract'),
        ('golden-zero', 'zero-rate', loan(1200, 0, 12), 'golden'),
        ('golden-interest', 'reference', loan(1000, 12, 12), 'golden'),
        ('one-month', 'term', loan(100, 5, 1), 'boundary'),
        ('minimum-principal', 'rounding', loan(.01, 0, 1200), 'boundary'),
        ('maximum-term', 'term', loan(10000, 5, 1200), 'boundary'),
        ('partial-prepayment', 'prepayment', loan(10000, 5, 36, 100), 'boundary'),
        ('full-prepayment', 'prepayment', loan(1000, 12, 12, 1000), 'boundary'),
        ('over-prepayment', 'prepayment', loan(1000, 5, 12, 100000), 'boundary'),
        ('half-cent', 'rounding', loan(100.005, 6, 12, .005), 'precision'),
        ('large-principal', 'rounding', loan(1e15, 5, 360), 'precision'),
        ('upper-rate', 'rate', loan(1000, 100, 24), 'boundary'),
    ]
    invalid = [('negative-principal', 'principal', loan(-1)), ('zero-principal', 'principal', loan(0)),
        ('huge-principal', 'principal', loan(1e16)), ('negative-rate', 'rate', loan(annual_rate=-1)),
        ('excess-rate', 'rate', loan(annual_rate=101)), ('negative-extra', 'prepayment', loan(prepayment=-1)),
        ('zero-months', 'term', loan(months=0)), ('excess-months', 'term', loan(months=1201)),
        ('fractional-months', 'term', loan(months=1.5)), ('bool-months', 'term', loan(months=True)),
        ('bool-principal', 'principal', loan(principal=True)), ('string-rate', 'rate', loan(annual_rate='5')),
        ('nan-principal', 'principal', loan(principal=float('nan'))), ('infinite-rate', 'rate', loan(annual_rate=float('inf'))),
        ('none-extra', 'prepayment', loan(prepayment=None)), ('nan-extra', 'prepayment', loan(prepayment=float('nan'))),
        ('bool-rate', 'rate', loan(annual_rate=True)), ('bool-extra', 'prepayment', loan(prepayment=False)),
        ('string-principal', 'principal', loan(principal='100')), ('none-months', 'term', loan(months=None))]
    cases.extend((name, inv, data, 'invalid') for name, inv, data in invalid)
    return [dict(id=name, invariantId=inv, input=data, category=cat) for name, inv, data, cat in cases]
