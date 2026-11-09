import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { takeLoginToken } from './auth/login-token';
import { AuthProvider } from './auth/AuthProvider';
import { I18nProvider } from './i18n/I18nProvider';
import { BrandingProvider } from './branding/BrandingProvider';
import { App } from './App';
import './styles.css';

const initialToken = takeLoginToken();
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <AuthProvider>
      <I18nProvider>
        <BrandingProvider>
          <BrowserRouter basename="/reporter-portal">
            <App initialToken={initialToken} />
          </BrowserRouter>
        </BrandingProvider>
      </I18nProvider>
    </AuthProvider>
  </QueryClientProvider>
);
