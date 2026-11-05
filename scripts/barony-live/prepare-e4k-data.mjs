import { createRequire } from 'node:module';
import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const OPTIONAL_PRECLIENT_REQUIRE = "module.exports.networkPreClient = require('./network/77.json');";
const OPTIONAL_PRECLIENT_FALLBACK = 'module.exports.networkPreClient = {};';

/**
 * e4k-data releases may reference network/77.json from index.js even when that
 * optional file is absent from the installed package. ggejs 2.2.0 does not
 * consume networkPreClient; it uses the regular network and data exports.
 * Patch only this exact optional require, and fail closed if the package shape
 * changes so we never hide a different dependency error.
 */
export async function prepareE4kData() {
  const entry = require.resolve('e4k-data');
  const root = path.dirname(entry);
  const optionalFile = path.join(root, 'network', '77.json');
  try {
    await access(optionalFile);
    return { patched: false, reason: 'optional pre-client data file is present' };
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  const source = await readFile(entry, 'utf8');
  if (!source.includes(OPTIONAL_PRECLIENT_REQUIRE)) {
    throw new Error('e4k-data is missing network/77.json and its entrypoint no longer matches the known optional export.');
  }
  await writeFile(entry, source.replace(OPTIONAL_PRECLIENT_REQUIRE, OPTIONAL_PRECLIENT_FALLBACK), 'utf8');
  return { patched: true, reason: 'missing optional networkPreClient export bypassed; core network/data exports unchanged' };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  prepareE4kData().then(result => {
    process.stdout.write(JSON.stringify(result) + '\n');
  }).catch(error => {
    process.stderr.write(`e4k-data compatibility check failed safely: ${error?.message || error}\n`);
    process.exitCode = 1;
  });
}
