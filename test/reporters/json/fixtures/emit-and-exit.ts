import { emitJson } from '../../../../src/reporters/json/emit';

// what every JSON command does: write the result, then exit at once
await emitJson({ items: Array.from({ length: 20_000 }, (_, index) => ({ index, text: 'x'.repeat(40) })) });
process.exit(0);
