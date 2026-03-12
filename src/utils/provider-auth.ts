export const OPENAI_CREDENTIAL_ENV_VARS = [
  'OPENAI_API_KEY',
  'OPENAI_BEARER_TOKEN',
  'OPENAI_ACCESS_TOKEN',
] as const;

export function normalizeCredentialValue(value: string | undefined | null): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith('your-')) {
    return null;
  }

  return trimmed;
}

export function getFirstConfiguredCredential(
  envVarNames: readonly string[],
): { envVarName: string; value: string } | null {
  for (const envVarName of envVarNames) {
    const value = normalizeCredentialValue(process.env[envVarName]);
    if (value) {
      return { envVarName, value };
    }
  }

  return null;
}

export function getOpenAICredential(): { envVarName: string; value: string } | null {
  return getFirstConfiguredCredential(OPENAI_CREDENTIAL_ENV_VARS);
}
