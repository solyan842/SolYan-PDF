# Benchmark tooling

## PDF -> Office controlled corpus

`pdf_to_office_synthetic_v1` is a versioned, synthetic benchmark corpus for the experimental PDF -> DOCX/XLSX/PPTX adapter.

It contains 18 deterministic cases:

- 6 DOCX-oriented document layouts
- 6 XLSX-oriented table/spreadsheet layouts
- 6 PPTX-oriented slide layouts

The corpus exists to make development comparisons repeatable. It is **not** a substitute for representative real-world release corpora and must not be used to make broad fidelity claims.

### Generate the corpus

```bash
python benchmarks/generate_pdf_to_office_corpus.py \
  --manifest benchmarks/corpora/pdf_to_office_synthetic_v1.json \
  --output-dir ./tmp/pdf-to-office-corpus
```

### Run against a deployed SolYan PDF API

The API must have the experimental Bloom adapter configured and the Office service available.

```bash
PYTHONPATH=benchmarks python benchmarks/run_pdf_to_office_corpus.py \
  --manifest benchmarks/corpora/pdf_to_office_synthetic_v1.json \
  --corpus-dir ./tmp/pdf-to-office-corpus \
  --api http://localhost:8000 \
  --output ./tmp/pdf-to-office-report.json
```

The runner records per-case round-trip similarity, page counts and timings, plus aggregate mean/minimum scores per target.

### Optional acceptance thresholds

Thresholds are deliberately **not** embedded in the synthetic corpus. When a release policy is agreed, pass a separate JSON file:

```json
{
  "docx": 90,
  "xlsx": 85,
  "pptx": 88
}
```

Then run with `--thresholds path/to/thresholds.json`. A target whose aggregate average similarity falls below its configured threshold causes exit code 2.

Any threshold values above are examples only, not current SolYan PDF release criteria.

## Real-world corpus rule

Real-world PDF -> Office release benchmarking remains a separate roadmap item. Any such corpus must be versioned, redistributable or fetchable with clear provenance/license, and diverse enough to represent the intended production workload.
