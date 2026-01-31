import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bot } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { GoogleLogin } from '@react-oauth/google';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) throw authError;

      if (data.session) {
        // Store session info so your Backend can verify it
        localStorage.setItem('token', data.session.access_token);
        localStorage.setItem('refreshToken', data.session.refresh_token || '');
        localStorage.setItem('tokenExpiresAt', (Date.now() + (data.session.expires_in || 3600) * 1000).toString());
        localStorage.setItem('user', JSON.stringify(data.user));
        
        // Use window.location to force a hard refresh into the dashboard
        window.location.href = '/dashboard';
      }
    } catch (err: any) {
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

    const handleGoogleSuccess = async (credentialResponse: any) => {
  try {
    setError('');
    setLoading(true);

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: credentialResponse.credential,
    });

    if (error) throw error;

    if (data.session) {
      localStorage.setItem('token', data.session.access_token);
      localStorage.setItem('user', JSON.stringify(data.user));
      window.location.href = '/dashboard';
    }
  } catch (err: any) {
    setError(err.message || 'Google login failed');
  } finally {
    setLoading(false);
  }
};


  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-full mb-4">
            <Bot className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Welcome Back</h1>
          <p className="text-gray-600 mt-2">Sign in to your account</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition disabled:bg-blue-300"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        <div className="mt-6 flex justify-center">
          <div className="w-full max-w-md">
            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={() => setError('Google login failed')}
              width="1000"
            />
          </div>
        </div>


        <p className="text-center text-gray-600 mt-6">
          Don't have an account? <Link to="/register" className="text-blue-600 hover:underline">Sign up</Link>
        </p>
      </div>
    </div>
  );
}