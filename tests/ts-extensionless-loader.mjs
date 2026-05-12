function shouldTryTs(specifier) {
  if (!specifier.startsWith('.') && !specifier.startsWith('/')) return false;
  return !/\.[cm]?[jt]sx?$/.test(specifier);
}

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (!shouldTryTs(specifier)) throw error;
    return nextResolve(`${specifier}.ts`, context);
  }
}
