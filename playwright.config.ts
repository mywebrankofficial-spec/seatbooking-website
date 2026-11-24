import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PORT ?? 3100);

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
  },
  projects: [
    {
      name: 'mobile-chrome',
      use: {
        ...devices['Pixel 7'],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        // Use the real GPU in headless mode. SwiftShader (software WebGL) runs this scene at
        // ~0.5 fps, which stretches GSAP's lag-smoothed 1.6 s flight into ~20 s.
        // On CI without a GPU set PW_SOFTWARE_GL=1 and expect much slower runs.
        launchOptions: {
          args: process.env.PW_SOFTWARE_GL
            ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
            : ['--ignore-gpu-blocklist', process.platform === 'win32' ? '--use-angle=d3d11' : '--use-angle=default'],
        },
      },
    },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    env: { NEXT_DIST_DIR: process.env.NEXT_DIST_DIR ?? '.next' },
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
