import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TutorialProvider } from './context/TutorialContext'
import { GoogleOAuthProvider } from '@react-oauth/google'
import App from './App'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}>
    <QueryClientProvider client={queryClient}>
      <TutorialProvider>
        <App />
      </TutorialProvider>
    </QueryClientProvider>
    </GoogleOAuthProvider>
  </React.StrictMode>,
)