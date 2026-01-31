import { useMemo } from 'react';

/**
 * Client-side auth callback handler for testing OAuth/redirect-based auth.
 * Reads code, state, error from URL query and displays them (no real auth verification).
 */
const AuthCallback = () => {
  const result = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code') ?? undefined;
    const state = params.get('state') ?? undefined;
    const error = params.get('error') ?? undefined;

    const receivedParams = {};
    if (code !== undefined) receivedParams.code = code;
    if (state !== undefined) receivedParams.state = state;
    if (error !== undefined) receivedParams.error = error;

    return {
      success: true,
      message: 'Auth callback received',
      receivedParams,
    };
  }, []);

  const hasParams = Object.keys(result.receivedParams).length > 0;

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-xl shadow-md border border-slate-200 p-8 max-w-md w-full">
        <h1 className="text-xl font-semibold text-slate-800 mb-2">Auth callback</h1>
        <p className="text-slate-600 text-sm mb-6">
          Temporary handler for testing OAuth redirects. No verification is performed.
        </p>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex h-3 w-3 rounded-full ${result.success ? 'bg-green-500' : 'bg-red-500'}`}
              aria-hidden
            />
            <span className="text-sm font-medium text-slate-700">{result.message}</span>
          </div>

          {hasParams ? (
            <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
                Received params
              </p>
              <pre className="text-sm text-slate-800 font-mono overflow-x-auto">
                {JSON.stringify(result.receivedParams, null, 2)}
              </pre>
            </div>
          ) : (
            <p className="text-sm text-slate-500">No query params (code, state, error) in URL.</p>
          )}
        </div>

        <p className="mt-6 text-xs text-slate-400">
          Use this page as the redirect URI in your OAuth provider to test the flow.
        </p>
      </div>
    </div>
  );
};

export default AuthCallback;
