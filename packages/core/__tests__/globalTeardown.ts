// Global teardown to ensure all database connections are closed
module.exports = async function() {
  // Force exit - any remaining handles will be cleaned up
  if (global.gc) {
    global.gc();
  }
};
