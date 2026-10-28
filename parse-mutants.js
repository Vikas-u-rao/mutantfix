const fs = require('fs');
const path = require('path');

const REPORT_PATH = process.argv[2] ?? 'examples/demo-app/reports/mutation/mutation.json';

const report = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8'));

const projectRoot = path.resolve(path.dirname(REPORT_PATH), '..', '..');

function originalFragment(filePath, location) {
  const source = fs.readFileSync(path.join(projectRoot, filePath), 'utf8');
  const lines = source.split('\n');
  const start = { line: location.start.line, column: location.start.column - 1 };
  const end = { line: location.end.line, column: location.end.column - 1 };
  if (start.line === end.line) {
    return lines[start.line - 1].slice(start.column, end.column).trim();
  }
  const middle = lines.slice(start.line, end.line - 1).join('\n');
  return (
    lines[start.line - 1].slice(start.column) +
    '\n' +
    middle +
    '\n' +
    lines[end.line - 1].slice(0, end.column)
  ).trim();
}

let survivedCount = 0;
let killedCount = 0;

for (const [filePath, file] of Object.entries(report.files)) {
  for (const mutant of file.mutants) {
    if (mutant.status === 'Survived') {
      survivedCount++;
      const original = originalFragment(filePath, mutant.location);
      const lineNo = mutant.location.start.line;
      console.log(
        `${filePath}:${lineNo} - changed \`${original}\` to \`${mutant.replacement}\` [${mutant.mutatorName}] - SURVIVED`
      );
    } else if (mutant.status === 'Killed') {
      killedCount++;
    }
  }
}

console.log(`\n${survivedCount} survived, ${killedCount} killed, ${survivedCount + killedCount} total`);
