function required(env, key) {
  const value = env[key];
  if (!value) {
    throw new Error(`Missing required env: ${key}`);
  }
  return value;
}

export function getEnv(env) {
  return {
    appBaseUrl: required(env, 'APP_BASE_URL'),
    supabaseUrl: required(env, 'SUPABASE_URL').replace(/\/+$/, ''),
    supabaseAnonKey: required(env, 'SUPABASE_ANON_KEY'),
  };
}
