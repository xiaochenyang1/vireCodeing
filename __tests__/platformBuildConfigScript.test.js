const {
  createPlatformBuildConfigSource,
} = require('../scripts/write-platform-runtime-config');
const fs = require('node:fs');
const path = require('node:path');

test('creates a typed platform build config source from environment input', () => {
  expect(
    createPlatformBuildConfigSource({
      apiBaseUrl: ' http://localhost:3000/api ',
    }),
  ).toContain("apiBaseUrl: 'http://localhost:3000/api'");
});

test('creates an empty platform build config source when api base url is missing', () => {
  expect(createPlatformBuildConfigSource({ apiBaseUrl: '' })).toContain(
    'apiBaseUrl: undefined',
  );
});

test('android build writes platform runtime config before preBuild', () => {
  const buildGradle = fs.readFileSync(
    path.join(__dirname, '..', 'android', 'app', 'build.gradle'),
    'utf8',
  );

  expect(buildGradle).toContain('tasks.register("writePlatformRuntimeConfig", Exec)');
  expect(buildGradle).toContain('providers.gradleProperty("truckPlatformApiBaseUrl")');
  expect(buildGradle).toContain('providers.environmentVariable("TRUCK_PLATFORM_API_BASE_URL")');
  expect(buildGradle).toContain('scripts/write-platform-runtime-config.js');
  expect(buildGradle).toContain(
    'environment "TRUCK_PLATFORM_API_BASE_URL", platformApiBaseUrlProvider.get()',
  );
  expect(buildGradle).toContain('preBuild.dependsOn("writePlatformRuntimeConfig")');
});

test('ios shared scheme writes platform runtime config before build', () => {
  const scheme = fs.readFileSync(
    path.join(
      __dirname,
      '..',
      'ios',
      'vireCodeing.xcodeproj',
      'xcshareddata',
      'xcschemes',
      'vireCodeing.xcscheme',
    ),
    'utf8',
  );

  expect(scheme).toContain('<PreActions>');
  expect(scheme).toContain('Write platform runtime config');
  expect(scheme).toContain('cd &quot;${PROJECT_DIR}/..&quot;');
  expect(scheme).toContain('node scripts/write-platform-runtime-config.js');
  expect(scheme).toContain('container:vireCodeing.xcodeproj');
});

test('ci workflow injects platform api base url before verification', () => {
  const workflow = fs.readFileSync(
    path.join(__dirname, '..', '.github', 'workflows', 'verify.yml'),
    'utf8',
  );

  expect(workflow).toContain('TRUCK_PLATFORM_API_BASE_URL: http://localhost:3000/api');
  expect(workflow).toContain('npm run platform:config:write');
  expect(workflow).toContain('npx jest --runInBand');
  expect(workflow).toContain('npx tsc --noEmit');
  expect(workflow).toContain('npm run lint');
  expect(workflow).toContain('npm --prefix apps/api test');
  expect(workflow).toContain('npm --prefix apps/api run typecheck');
  expect(workflow).toContain('npm --prefix apps/api run prisma:validate');
});

test('api compiler disables stale incremental emit diagnostics for all gates', () => {
  const packageJson = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, '..', 'apps', 'api', 'package.json'),
      'utf8',
    ),
  );
  const tsconfig = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, '..', 'apps', 'api', 'tsconfig.json'),
      'utf8',
    ),
  );

  expect(packageJson.scripts.typecheck).toBe('tsc --noEmit');
  expect(tsconfig.compilerOptions.incremental).toBe(false);
});
