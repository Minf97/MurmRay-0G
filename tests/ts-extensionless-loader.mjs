function shouldTryTs(specifier) {
  if (!specifier.startsWith('.') && !specifier.startsWith('/')) return false;
  return !/\.[cm]?tsx?$/.test(specifier);
}

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (!shouldTryTs(specifier)) throw error;
    if (specifier.endsWith('.js')) {
      return nextResolve(specifier.replace(/\.js$/, '.ts'), context);
    }
    return nextResolve(`${specifier}.ts`, context);
  }
}
