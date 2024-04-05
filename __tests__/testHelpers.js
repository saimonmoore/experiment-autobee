export const waitUntil = async (condition, timeout = 3000, interval = 100) => new Promise((resolve, reject) => {
  let timeoutId; // Store the timeout ID

  const check = async () => {
    try {
      const result = await condition();
      clearTimeout(timeoutId); // Clear timeout on success
      resolve(result);
    } catch (error) {
      clearTimeout(timeoutId); // Clear timeout on error
      reject(error);
    }
  };

  timeoutId = setTimeout(() => {
    clearTimeout(timeoutId); // Redundant, but safe
    reject("Timeout exceeded");
  }, timeout);

  check();
});
