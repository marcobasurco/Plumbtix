# (drag the file into the e2e folder, or:)
# right-click e2e folder → Upload → pick the file

# point Playwright at production and run just this spec:
BASE_URL=https://workorders.proroto.com E2E_PUBLIC_TOKEN=cc889c27-4f32-4bf7-980b-42111e84ee6e npx playwright test public-sharing --reporter=list