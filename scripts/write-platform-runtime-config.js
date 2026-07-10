const fs = require('node:fs');
const path = require('node:path');

const defaultOutputPath = path.join(
  __dirname,
  '..',
  'src',
  'config',
  'platformBuildConfig.ts',
);

function createPlatformBuildConfigSource({ apiBaseUrl }) {
  const normalizedApiBaseUrl = apiBaseUrl?.trim();
  const apiBaseUrlSource = normalizedApiBaseUrl
    ? `'${escapeSingleQuotedString(normalizedApiBaseUrl)}'`
    : 'undefined';

  return `import type { PlatformRuntimeConfig } from '../services/platformRuntimeConfig';

export const platformBuildConfig: PlatformRuntimeConfig = {
  apiBaseUrl: ${apiBaseUrlSource},
};
`;
}

function escapeSingleQuotedString(value) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function writePlatformBuildConfig({
  apiBaseUrl = process.env.TRUCK_PLATFORM_API_BASE_URL,
  outputPath = defaultOutputPath,
} = {}) {
  const source = createPlatformBuildConfigSource({ apiBaseUrl });

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, source, 'utf8');

  return outputPath;
}

if (require.main === module) {
  const outputPath = writePlatformBuildConfig();

  console.log(`Wrote platform runtime config to ${outputPath}`);
}

module.exports = {
  createPlatformBuildConfigSource,
  writePlatformBuildConfig,
};
