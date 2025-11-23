import '../css/app.css';

import { createInertiaApp, router } from '@inertiajs/react';
import { resolvePageComponent } from 'laravel-vite-plugin/inertia-helpers';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'sonner';
import { initializeTheme } from './hooks/use-appearance';
import { initializeLocale } from './lib/i18n';

const appName = import.meta.env.VITE_APP_NAME || 'Laravel';

// Sync CSRF token from Inertia props to meta tag
const syncCsrfToken = (event: any) => {
    const csrfTokenFromProps = event?.detail?.page?.props?.csrf_token;
    const metaTag = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]');

    if (csrfTokenFromProps && metaTag) {
        metaTag.content = csrfTokenFromProps;
    }
};

// Sync on every successful page load (including after login)
router.on('success', syncCsrfToken);

// Configure Inertia to use X-CSRF-TOKEN header from meta tag instead of XSRF-TOKEN cookie
router.on('before', (event) => {
    const metaTag = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]');
    if (metaTag?.content && event.detail.visit.method !== 'get') {
        event.detail.visit.headers = event.detail.visit.headers || {};
        event.detail.visit.headers['X-CSRF-TOKEN'] = metaTag.content;
    }
});

createInertiaApp({
    title: (title) => (title ? `${title} - ${appName}` : appName),
    resolve: (name) =>
        resolvePageComponent(
            `./pages/${name}.tsx`,
            import.meta.glob('./pages/**/*.tsx'),
        ),
    setup({ el, App, props }) {
        const root = createRoot(el);

        // Initialize locale for client-side formatting
        const locale = (props.initialPage.props as any).locale || 'en';
        initializeLocale(locale);

        root.render(
            <StrictMode>
                <App {...props} />
                <Toaster richColors position="top-center" />
            </StrictMode>,
        );

        // Initial sync
        const initialCsrfToken = (props.initialPage.props as any)?.csrf_token;
        const metaTag = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]');
        if (initialCsrfToken && metaTag) {
            metaTag.content = initialCsrfToken;
        }
    },
    progress: {
        color: '#4B5563',
    },
});

// This will set light / dark mode on load...
initializeTheme();
