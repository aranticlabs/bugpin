import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { Toaster } from 'sonner';
import { App } from './App';
import { UnsavedChangesProvider } from './components/UnsavedChangesGuard';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { BrandingProvider } from './contexts/BrandingContext';
import './styles/globals.css';

// Create React Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
});

function AppShell() {
  return (
    <ThemeProvider>
      <BrandingProvider>
        <AuthProvider>
          <UnsavedChangesProvider>
            <App />
          </UnsavedChangesProvider>
          <Toaster position="bottom-right" richColors />
        </AuthProvider>
      </BrandingProvider>
    </ThemeProvider>
  );
}

// A data router enables navigation blocking. App keeps declaring its routes with <Routes>, so a
// single catch-all route hands every path to it.
const router = createBrowserRouter([{ path: '*', element: <AppShell /> }], {
  basename: '/admin',
});

// Render app
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>
);
