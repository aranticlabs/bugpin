import React, { createContext, useContext, useState } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import {
  createMemoryRouter,
  MemoryRouter,
  RouterProvider,
  type MemoryRouterProps,
} from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../contexts/AuthContext';
import { BrandingProvider } from '../contexts/BrandingContext';
import { ThemeProvider } from '../contexts/ThemeContext';
import { UnsavedChangesProvider } from '../components/UnsavedChangesGuard';

// Create a new QueryClient for each test
export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

interface WrapperProps {
  children: React.ReactNode;
}

// The routed element reads the rendered UI from context, so rerender() still swaps it.
const TestRouteContent = createContext<React.ReactNode>(null);

function TestRouteSlot() {
  return <UnsavedChangesProvider>{useContext(TestRouteContent)}</UnsavedChangesProvider>;
}

// A data router like the app's, which features such as navigation blocking require.
function TestRouter({
  initialEntries,
  children,
}: {
  initialEntries: MemoryRouterProps['initialEntries'];
  children: React.ReactNode;
}) {
  const [router] = useState(() =>
    createMemoryRouter([{ path: '*', element: <TestRouteSlot /> }], { initialEntries })
  );
  return (
    <TestRouteContent.Provider value={children}>
      <RouterProvider router={router} />
    </TestRouteContent.Provider>
  );
}

interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  initialEntries?: MemoryRouterProps['initialEntries'];
  queryClient?: QueryClient;
}

export function renderWithProviders(
  ui: React.ReactElement,
  {
    initialEntries = ['/'],
    queryClient = createTestQueryClient(),
    ...options
  }: CustomRenderOptions = {}
) {
  function Wrapper({ children }: WrapperProps) {
    return (
      <QueryClientProvider client={queryClient}>
        <TestRouter initialEntries={initialEntries}>
          <ThemeProvider>
            <BrandingProvider>
              <AuthProvider>{children}</AuthProvider>
            </BrandingProvider>
          </ThemeProvider>
        </TestRouter>
      </QueryClientProvider>
    );
  }

  return {
    ...render(ui, { wrapper: Wrapper, ...options }),
    queryClient,
  };
}

/**
 * Render with QueryClient and the theme (no router/auth)
 */
export function renderWithQuery(
  ui: React.ReactElement,
  { queryClient = createTestQueryClient(), ...options }: CustomRenderOptions = {}
) {
  function Wrapper({ children }: WrapperProps) {
    return (
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>{children}</ThemeProvider>
      </QueryClientProvider>
    );
  }

  return {
    ...render(ui, { wrapper: Wrapper, ...options }),
    queryClient,
  };
}

/**
 * Render with QueryClient, the theme and a data router (no auth)
 */
export function renderWithQueryAndRouter(
  ui: React.ReactElement,
  {
    initialEntries = ['/'],
    queryClient = createTestQueryClient(),
    ...options
  }: CustomRenderOptions = {}
) {
  function Wrapper({ children }: WrapperProps) {
    return (
      <QueryClientProvider client={queryClient}>
        <TestRouter initialEntries={initialEntries}>
          <ThemeProvider>{children}</ThemeProvider>
        </TestRouter>
      </QueryClientProvider>
    );
  }

  return {
    ...render(ui, { wrapper: Wrapper, ...options }),
    queryClient,
  };
}

/**
 * Render with router only (no auth/query)
 */
export function renderWithRouter(
  ui: React.ReactElement,
  { initialEntries = ['/'], ...options }: CustomRenderOptions = {}
) {
  function Wrapper({ children }: WrapperProps) {
    return <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>;
  }

  return render(ui, { wrapper: Wrapper, ...options });
}

// Re-export everything from testing-library
export * from '@testing-library/react';
export { default as userEvent } from '@testing-library/user-event';
