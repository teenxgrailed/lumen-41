import {
  prepareE2eEnvironment,
  resetLocalE2eEnvironment,
} from "../tests/e2e/environment";

void (async () => {
  await resetLocalE2eEnvironment();
  await prepareE2eEnvironment();
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
