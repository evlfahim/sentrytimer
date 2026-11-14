// Global teardown: nothing to release globally; each test closes its own database.
export default async function globalTeardown(): Promise<void> {}
