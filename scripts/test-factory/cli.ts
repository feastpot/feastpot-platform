import { FACTORY_STATES, factoryManifest, TestDataFactory, type FactoryState } from './index';

function requestedStates(argv: string[]): FactoryState[] {
  const stateIndex = argv.indexOf('--state');
  const values =
    stateIndex >= 0
      ? argv[stateIndex + 1]?.split(',')
      : (process.env.TEST_FACTORY_STATES?.split(',') ?? [...FACTORY_STATES]);
  if (!values?.length) throw new Error('Provide --state C1,V4 or TEST_FACTORY_STATES.');
  return values.map((value) => {
    const state = value.trim().toUpperCase() as FactoryState;
    if (!FACTORY_STATES.includes(state)) throw new Error(`Unknown factory state: ${value}`);
    return state;
  });
}

async function main(): Promise<void> {
  const factory = TestDataFactory.fromEnvironment();
  try {
    const states = requestedStates(process.argv.slice(2));
    const teardown = process.argv.includes('--teardown');
    const results = [];
    for (const state of states) {
      if (teardown) {
        await factory.teardownState(state);
        results.push({ state, cleanedUp: true });
        continue;
      }
      results.push(factoryManifest(await factory.create(state), false));
    }
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(results, null, 2));
  } finally {
    await factory.dispose();
  }
}

void main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});
