// This runner is auto-generated by Brittle

runTests()

async function runTests () {
  const test = (await import('brittle')).default

  test.pause()

  // e2e
  await import('./e2e/singleDevice.brittle.test.js')
  await import('./e2e/twoDevices.brittle.test.js')

  test.resume()
}
