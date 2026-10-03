'use strict';

// Required Jest environments may not turn a pending test into a green run.
class NoSkippedTests {
  onRunComplete(_contexts, result) {
    if (result.numPendingTests || result.numPendingTestSuites) {
      this.error = new Error(
        `SKIPPED_TESTS_FORBIDDEN: ${result.numPendingTests} tests and ` +
          `${result.numPendingTestSuites} suites did not run. Supply the required ` +
          'credentials or select an explicitly documented test environment.',
      );
    }
  }
  getLastError() {
    return this.error;
  }
}
module.exports = NoSkippedTests;
