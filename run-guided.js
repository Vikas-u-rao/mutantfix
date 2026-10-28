const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { complete } = require('./llm');

const DEMO_APP = path.resolve('examples/demo-app');
const SOURCE_FILE = path.join(DEMO_APP, 'src', 'math.js');
const EXISTING_TESTS = path.join(DEMO_APP, 'tests', 'math.test.js');
const GENERATED_DIR = path.join(DEMO_APP, 'tests', 'generated-guided');
const REPORT = path.join(DEMO_APP, 'reports', 'mutation', 'mutation.json');
const JEST_BIN = path.join(DEMO_APP, 'node_modules', '.bin', 'jest.cmd');
const STRYKER_BIN = path.join(DEMO_APP, 'node_modules', '.bin', 'stryker.cmd');
const maxRetries = Number.parseInt(process.env.MAX_RETRIES ?? '2', 10);

function quoteArg(arg) {
  return /\s/.test(String(arg)) ? `"${String(arg).replace(/"/g, '\\"')}"` : String(arg);
}

function run(command, args = []) {
  const cmd = [command, ...args].map(quoteArg).join(' ');
  execSync(cmd, { cwd: DEMO_APP, stdio: 'inherit', shell: true });
}

function mutationScore(report) {
  const mutants = Object.values(report.files).flatMap((file) => file.mutants);
  const detected = mutants.filter((mutant) => ['Killed', 'Timeout'].includes(mutant.status)).length;
  return mutants.length === 0 ? 0 : Math.round((detected / mutants.length) * 10000) / 100;
}

function readReport() {
  return JSON.parse(fs.readFileSync(REPORT, 'utf8'));
}

function sourceFragment(source, location) {
  const lines = source.split('\n');
  const startLine = location.start.line - 1;
  const endLine = location.end.line - 1;
  const startColumn = location.start.column - 1;
  const endColumn = location.end.column - 1;
  if (startLine === endLine) {
    return lines[startLine].slice(startColumn, endColumn).trim();
  }
  return [
    lines[startLine].slice(startColumn),
    ...lines.slice(startLine + 1, endLine),
    lines[endLine].slice(0, endColumn),
  ].join('\n').trim();
}

function extractCode(response) {
  const fenced = response.match(/```(?:javascript|js|typescript|ts)?\s*\n([\s\S]*?)\n```/i);
  const code = (fenced ? fenced[1] : response).trim();
  const firstCodeLine = code.split('\n').findIndex((line) =>
    /^(const|let|var|require|describe|test|it|import|\/\*)/.test(line.trim())
  );
  return (firstCodeLine === -1 ? code : code.split('\n').slice(firstCodeLine).join('\n')).trim();
}

function normalizeGeneratedCode(code) {
  return code.replace(/require\(['"]\.\.\/src\/math['"]\)/g, "require('../../src/math')");
}

function validateTestCode(code) {
  if (!code || !/\b(?:test|it)\s*\(/.test(code)) {
    throw new Error('Generated output contains no Jest test call');
  }
  new vm.Script(code, { filename: 'generated-guided.test.js' });
}

function findMutant(report, filePath, target) {
  const normalizedPath = filePath.replaceAll('\\', '/');
  return report.files[normalizedPath]?.mutants.find(
    (mutant) =>
      mutant.location.start.line === target.location.start.line &&
      mutant.location.start.column === target.location.start.column &&
      mutant.replacement === target.replacement &&
      mutant.mutatorName === target.mutatorName
  );
}

async function generateTest(source, existingTests, filePath, mutant, attempt) {
  const original = sourceFragment(source, mutant.location);
  const prompt = `Write one Jest test that passes against the original code and fails against this specific mutation.
Use CommonJS and the describe/test style. Output only test code, without markdown fences or explanations.

Source module:
\`\`\`javascript
${source}
\`\`\`

Existing tests (follow this style):
\`\`\`javascript
${existingTests}
\`\`\`

Mutation:
- File: ${filePath}
- Line: ${mutant.location.start.line}
- Original code: ${original}
- Mutated code: ${mutant.replacement}
- Mutator: ${mutant.mutatorName}

This is retry ${attempt} of ${maxRetries + 1}. Make the assertion specifically distinguish the original from the mutated code.`;

  const response = await complete(prompt, {
    system: 'You are a senior JavaScript test engineer. Generate deterministic, focused Jest tests.',
  });
  const code = normalizeGeneratedCode(extractCode(response));
  validateTestCode(code);
  return code;
}

async function verifyCandidate(fileName, code, filePath, target) {
  const candidatePath = path.join(GENERATED_DIR, fileName);
  fs.writeFileSync(candidatePath, `${code}\n`);
  try {
    run(JEST_BIN, ['--runInBand', '--silent']);
    run(STRYKER_BIN, ['run']);
    const result = findMutant(readReport(), filePath, target);
    if (!result) {
      throw new Error('Target mutant was not present in the verification report');
    }
    return result.status === 'Killed' || result.status === 'Timeout';
  } catch (error) {
    if (error.status !== undefined) {
      return false;
    }
    throw error;
  } finally {
    if (fs.existsSync(candidatePath)) {
      fs.unlinkSync(candidatePath);
    }
  }
}

async function main() {
  if (!process.env.LLM_API_KEY || !process.env.LLM_BASE_URL || !process.env.LLM_MODEL) {
    throw new Error('LLM_API_KEY, LLM_BASE_URL, and LLM_MODEL must be set');
  }
  if (!Number.isInteger(maxRetries) || maxRetries < 0) {
    throw new Error('MAX_RETRIES must be a non-negative integer');
  }

  fs.rmSync(GENERATED_DIR, { recursive: true, force: true });
  fs.mkdirSync(GENERATED_DIR, { recursive: true });

  console.log('Running baseline mutation test');
  run(STRYKER_BIN, ['run']);
  const baseline = readReport();
  const before = mutationScore(baseline);
  const source = fs.readFileSync(SOURCE_FILE, 'utf8');
  const existingTests = fs.readFileSync(EXISTING_TESTS, 'utf8');
  const surviving = Object.entries(baseline.files).flatMap(([filePath, file]) =>
    file.mutants.filter((mutant) => mutant.status === 'Survived').map((mutant) => ({ filePath, mutant }))
  );

  let accepted = 0;
  for (const [{ filePath, mutant }, index] of surviving.map((entry, index) => [entry, index])) {
    let proven = false;
    for (let attempt = 1; attempt <= maxRetries + 1 && !proven; attempt++) {
      try {
        const code = await generateTest(source, existingTests, filePath, mutant, attempt);
        const fileName = `mutant-${mutant.id}-${index}.test.js`;
        proven = await verifyCandidate(fileName, code, filePath, mutant);
        if (proven) {
          fs.writeFileSync(path.join(GENERATED_DIR, fileName), `${code}\n`);
          accepted++;
          console.log(`Accepted mutant ${mutant.id} (${filePath}:${mutant.location.start.line})`);
        } else {
          console.log(`Rejected mutant ${mutant.id}, attempt ${attempt}`);
        }
      } catch (error) {
        console.error(`Mutant ${mutant.id}, attempt ${attempt} failed: ${error.message}`);
      }
    }
  }

  run(STRYKER_BIN, ['run']);
  const after = mutationScore(readReport());
  console.log('\n----------------------------------------');
  console.log(`Baseline mutation score:       ${before}%`);
  console.log(`Mutation-guided score:         ${after}%`);
  console.log(`Improvement:                   ${(after - before).toFixed(2)} percentage points`);
  console.log(`Accepted tests:                ${accepted}/${surviving.length}`);
  console.log(`Accepted tests are in:         ${GENERATED_DIR}`);
  console.log('----------------------------------------');
}

main().catch((error) => {
  console.error(`\nFAILED: ${error.message}`);
  process.exit(1);
});
