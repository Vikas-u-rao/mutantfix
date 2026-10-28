# MutantFix

AI-powered mutation test improvement: finds the weak spots in a unit-test suite, generates targeted tests with an LLM, and keeps only the tests that provably kill the mutants they target.

## The Problem

Code coverage measures which lines *executed* during tests, not whether anything was actually *checked*. A test can execute a line with zero assertions and still count as "covered" while catching zero bugs.

Mutation testing fixes the blind spot by injecting small bugs ("mutants") into the code and asking: *would the existing tests notice?* A test suite with a high mutation score is a test suite that catches real breakage.

The catch: once mutation testing finds the gaps, fixing each one by hand is slow, manual work that most teams never do. MutantFix automates the fix.

## How It Works

```
Existing Test Suite
        ↓
     Stryker            ← runs mutation testing, finds surviving mutants
        ↓
Surviving Mutants
        ↓
   LLM Generator         ← writes a targeted test for each surviving mutant
        ↓
Generated Test
        ↓
   Verification          ← reruns mutation testing on that mutant
        ↓
Does it kill the mutant?
      ↙        ↘
    YES          NO
     ↓            ↓
   Keep      Retry (max 2), then flag for review
```

The core principle: **the tool never blindly trusts the LLM.** A generated test is accepted only after it is experimentally verified — by rerunning mutation testing — to actually kill its target mutant. Nothing is auto-merged; output is a reviewable diff.

## Baseline Comparison

The tool also runs a generic-LLM baseline — the same project tested with a plain "generate unit tests for this function" prompt and no mutation context — so the mutation-guided approach is compared against the obvious alternative, not just claimed:

| Method | Mutation Score |
|---|---:|
| Existing tests | 73% |
| Generic LLM ("write tests for this function") | (measurement pending) |
| MutantFix (mutation-guided) | (in progress) |

## Status

The parser, generic-LLM baseline, and mutation-guided generation/verification loop are implemented for the demo fixture. Guided tests are accepted only after they pass Jest against the original code and kill their target mutant in a Stryker run.

## Repository Layout

```
mutantfix/
├── parse-mutants.js        # parses Stryker's mutation-report.json into a
│                           # plain-language list of surviving mutants
├── llm.js                  # provider-agnostic LLM client (OpenAI-compatible
│                           # wire protocol: Groq, OpenRouter, Ollama, ...)
├── run-baseline.js         # generic-LLM baseline pipeline: generate tests,
│                           # verify, measure before/after mutation score
├── run-guided.js           # mutation-guided generation with bounded retries
│                           # and experimental verification before keeping tests
├── examples/
│   └── demo-app/           # demo fixture: small JS project with intentionally
│                           # seeded test gaps for Stryker to find
├── .env.example            # LLM config template (API key, model, base URL)
└── README.md
```

## Getting Started

Requirements: Node.js 20+.

Try the report parser:

```bash
npm install --prefix examples/demo-app
npx --prefix examples/demo-app stryker run
node parse-mutants.js
```

Run the generic-LLM baseline pipeline (requires an LLM API key — Groq, OpenRouter, or any OpenAI-compatible endpoint):

```bash
cp .env.example .env       # set LLM_API_KEY, LLM_MODEL, LLM_BASE_URL
node --env-file=.env run-baseline.js
```

Run mutation-guided generation against the demo fixture:

```bash
node --env-file=.env run-guided.js
```

Set `MAX_RETRIES` to change the number of retries per surviving mutant (the
default is `2`). Accepted tests are written to
`examples/demo-app/tests/generated-guided/`.

The LLM layer is provider-agnostic: changing `LLM_BASE_URL` and `LLM_MODEL` in `.env` switches providers with no code changes.

## Roadmap

- Mutation-guided test generation: prompt the LLM with the surviving mutant's code, original and mutated, and request a test that passes on the original and fails on the mutated version
- Automated verification loop that keeps only proven-killing tests
- Function-level batching (one prompt per function, not per mutant)
- Equivalent-mutant detection with bounded retries
- Sandboxed verification runs in isolated temp workspaces
- Polished CLI (`npx mutantfix run`) with cost/token tracking
- Markdown/HTML report and Git diff / PR output
- GitHub Action integration

## License

MIT
