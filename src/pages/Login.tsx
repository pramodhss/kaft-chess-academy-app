import { useAuth } from '../context/AuthContext';
import { GOOGLE_CLIENT_ID } from '../config';

export function Login() {
  const { login } = useAuth();
  const noClientId = (GOOGLE_CLIENT_ID as string) === 'PASTE_YOUR_OAUTH_CLIENT_ID_HERE';

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-navy p-6">
      <div className="mb-8 text-center">
        <img src="logo.jpg" alt="Kaft Chess Academy" className="mx-auto mb-4 h-24 w-24 rounded-xl object-cover shadow-lg"/>
        <h1 className="text-3xl font-bold text-white">Kaft Chess Academy</h1>
        <p className="text-chess-light mt-2 text-sm">Operations Manager</p>
      </div>

      <div className="w-full max-w-sm rounded-xl border border-white/10 bg-white p-6 shadow-xl">
        {noClientId ? (
          <div className="text-sm text-red-600 bg-red-50 rounded-lg p-3 mb-4">
            <strong>Setup needed:</strong> Open <code>src/config.ts</code> and replace{' '}
            <code>PASTE_YOUR_OAUTH_CLIENT_ID_HERE</code> with your Google OAuth Client ID.
          </div>
        ) : null}

        <p className="text-gray-500 text-sm text-center mb-4">
          Sign in with your Google account to access the academy data.
        </p>

        <button
          type="button"
          onClick={login}
          disabled={noClientId}
          className="w-full flex items-center justify-center gap-3 bg-white border-2 border-gray-200
                     hover:border-chess-blue hover:bg-chess-light text-gray-700 font-semibold
                     py-3 px-4 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg width="20" height="20" viewBox="0 0 48 48">
            <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
            <path fill="#FF3D00" d="m6.306 14.691 6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
            <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
            <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
          </svg>
          Sign in with Google
        </button>
      </div>

      <p className="text-chess-light text-xs mt-6 text-center opacity-70">
        Only authorised coaches and coordinators can access this app.
      </p>
    </div>
  );
}
