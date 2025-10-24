import { usePage } from '@inertiajs/react';
import { ReactNode } from 'react';
import { GoogleReCaptchaProvider } from 'react-google-recaptcha-v3';

interface CaptchaConfig {
    provider: 'turnstile' | 'recaptcha_v2' | 'recaptcha_v3' | 'none';
    siteKey: string | null;
}

interface RecaptchaV3ProviderProps {
    children: ReactNode;
}

export function RecaptchaV3Provider({ children }: RecaptchaV3ProviderProps) {
    const { captcha } = usePage<{ captcha: CaptchaConfig }>().props;

    // Only wrap with provider if reCAPTCHA v3 is enabled
    if (captcha.provider === 'recaptcha_v3' && captcha.siteKey) {
        return (
            <GoogleReCaptchaProvider
                reCaptchaKey={captcha.siteKey}
                scriptProps={{
                    async: true,
                    defer: true,
                    appendTo: 'head',
                }}
            >
                {children}
            </GoogleReCaptchaProvider>
        );
    }

    return <>{children}</>;
}
