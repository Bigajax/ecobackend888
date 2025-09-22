export async function hedge<T>(
  primary: Promise<T>,
  fallback: Promise<T>,
  cutOverMs = 2500
): Promise<T> {
  let timer: any;
  try {
    const raced = Promise.race<T>([
      primary,
      new Promise<T>((resolve) => {
        timer = setTimeout(async () => resolve(await fallback), cutOverMs);
      }),
    ]);
    return await raced;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
