const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { complete } = require('./llm');

const DEMO_APP = path.resolve('examples/demo-app');
const SOURCE_FILE = path.join(DEMO_APP, 'src', 'math.js');
const GENERATED_DIR = path.join(DEMO_APP, 'tests', 'generated');
const GENERATED_FILE = path.join(GENERATED_DIR, 'generic.test.js');
const ORIGINAL_TESTS = path.join(DEMO_APP, 'tests', 'math.test.js');
const ORIGINAL_TESTS_BACKUP = ORIGINAL_TESTS + '.bak';
const REPORT = path.join(DEMO_APP, 'reports', 'mutation', 'mutation.json');
const STRYKER_TMP = path.join(DEMO_APP, 'tests', '.stryker-tmp');

function run(command, cwd) {
  execSync(command, { cwd, stdio: 'inherit' });
}

function mutationScore(reportPath) {
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  let detected = 0;
  let total = 0;
  for (const file of Object.values(report.files)) {
    for (const mutant of file.mutants) {
      total++;
      if (mutant.status === 'Killed' || mutant.status === 'Timeout') {
        detected++;
      }
    }
  }
  return total === 0 ? 0 : Math.round((detected / total) * 10000) / 100;
}

function extractCode(text) {
  const fence = text.match(/```(?:javascript|js)?\s*\n([\s\S]*?)\n```/);
  if (fence) {
    return fence[1].trim();
  }
  const lines = text.trim().split('\n');
  const firstCodeLine = lines.findIndex((line) =>
    /^(const|let|var|require|describe|test|it|import)/.test(line)
  );
  return lines.slice(firstCodeLine === -1 ? 0 : firstCodeLine).join('\n').trim();
}

async function generateTests() {
  const source = fs.readFileSync(SOURCE_FILE, 'utf8');
  const prompt = `Write comprehensive Jest unit tests for the following JavaScript module.
Cover normal cases, edge cases, and boundary values.
Use CommonJS (require) and the describe/test style.
If the code uses system time, async timers, or random numbers, you MUST use Jest's deterministic mocks (jest.useFakeTimers(), jest.spyOn(), or fixed seeds).
Output ONLY the test code. No markdown fences, no explanations, no comments.

Source code:
\`\`\`javascript
${source}
\`\`\``;

  const response = await complete(prompt, {
    system: 'You are a senior test engineer writing production-quality Jest tests.',
  });

  const code = extractCode(response);
  if (!/test\s*\(|it\s*\(/.test(code)) {
    throw new Error(`Generated output contains no test calls. Raw response:\n${response}`);
  }

  fs.mkdirSync(GENERATED_DIR, { recursive: true });
  fs.writeFileSync(GENERATED_FILE, code);
  console.log(`Generated ${code.split('\n').length} lines -> ${GENERATED_FILE}`);
}

async function main() {
  if (!process.env.LLM_API_KEY) {
    throw new Error('LLM_API_KEY not set. Create .env from .env.example and run with: node --env-file=.env');
  }

  console.log('Step 1/4 - Baseline mutation score (existing tests)');
  run('npx stryker run', DEMO_APP);
  const before = mutationScore(REPORT);
  console.log(`Baseline mutation score: ${before}%`);

  console.log('\nStep 2/4 - Generating generic tests with the LLM');
  await generateTests();

  console.log('\nStep 3/4 - Fast check: generated tests against original code');
  run('npx jest --silent', DEMO_APP);

  console.log('\nStep 4/4 - Mutation score with ONLY the generated tests');
  fs.renameSync(ORIGINAL_TESTS, ORIGINAL_TESTS_BACKUP);
  try {
    run('npx stryker run', DEMO_APP);
  } finally {
    fs.renameSync(ORIGINAL_TESTS_BACKUP, ORIGINAL_TESTS);
  }
  const after = mutationScore(REPORT);
  if (fs.existsSync(STRYKER_TMP)) {
    fs.rmSync(STRYKER_TMP, { recursive: true, force: true });
  }

  console.log('\n----------------------------------------');
  console.log(`Baseline (existing tests):       ${before}%`);
  console.log(`After generic LLM tests:         ${after}%`);
  console.log(`Improvement:                     ${(after - before).toFixed(2)} percentage points`);
  console.log('----------------------------------------');
}

main().catch((error) => {
  console.error(`\nFAILED: ${error.message}`);
  process.exit(1);
});
