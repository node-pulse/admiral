import { Turnstile } from '@marsidev/react-turnstile';
import { usePage } from '@inertiajs/react';
import { useEffect, useRef } from 'react';
import ReCAPTCHA from 'react-google-recaptcha';
import { useGoogleReCaptcha } from 'react-google-recaptcha-v3';

interface CaptchaConfig {
    provider: 'turnstile' | 'recaptcha_v2' | 'recaptcha_v3' | 'none';
    siteKey: string | null;
    enabled: {
        login: boolean;
        register: boolean;
        forgot_password: boolean;
        reset_password: boolean;
    };
}

interface CaptchaProps {
    onVerify: (token: string) => void;
    onError?: () => void;
    onExpire?: () => void;
}

export function Captcha({ onVerify, onError, onExpire }: CaptchaProps) {
    const { captcha } = usePage<{ captcha: CaptchaConfig }>().props;

    if (captcha.provider === 'none' || !captcha.siteKey) {
        return null;
    }

    switch (captcha.provider) {
        case 'turnstile':
            return (
                <TurnstileCaptcha
                    siteKey={captcha.siteKey}
                    onVerify={onVerify}
                    onError={onError}
                    onExpire={onExpire}
                />
            );
        case 'recaptcha_v2':
            return (
                <RecaptchaV2Captcha
                    siteKey={captcha.siteKey}
                    onVerify={onVerify}
                    onError={onError}
                    onExpire={onExpire}
                />
            );
        case 'recaptcha_v3':
            return (
                <RecaptchaV3Captcha
                    siteKey={captcha.siteKey}
                    onVerify={onVerify}
                    onError={onError}
                />
            );
        default:
            return null;
    }
}

function TurnstileCaptcha({
    siteKey,
    onVerify,
    onError,
    onExpire,
}: {
    siteKey: string;
    onVerify: (token: string) => void;
    onError?: () => void;
    onExpire?: () => void;
}) {
    return (
        <div className="flex justify-center">
            <Turnstile
                siteKey={siteKey}
                onSuccess={onVerify}
                onError={() => {
                    console.error('Turnstile verification failed');
                    onError?.();
                }}
                onExpire={() => {
                    console.warn('Turnstile token expired');
                    onExpire?.();
                }}
                options={{
                    theme: 'light',
                    size: 'normal',
                }}
            />
        </div>
    );
}

function RecaptchaV2Captcha({
    siteKey,
    onVerify,
    onError,
    onExpire,
}: {
    siteKey: string;
    onVerify: (token: string) => void;
    onError?: () => void;
    onExpire?: () => void;
}) {
    const recaptchaRef = useRef<ReCAPTCHA>(null);

    return (
        <div className="flex justify-center">
            <ReCAPTCHA
                ref={recaptchaRef}
                sitekey={siteKey}
                onChange={(token) => {
                    if (token) {
                        onVerify(token);
                    }
                }}
                onErrored={() => {
                    console.error('reCAPTCHA v2 verification failed');
                    onError?.();
                }}
                onExpired={() => {
                    console.warn('reCAPTCHA v2 token expired');
                    onExpire?.();
                }}
                theme="light"
            />
        </div>
    );
}

function RecaptchaV3Captcha({
    siteKey,
    onVerify,
    onError,
}: {
    siteKey: string;
    onVerify: (token: string) => void;
    onError?: () => void;
}) {
    const { executeRecaptcha } = useGoogleReCaptcha();
    const hasExecuted = useRef(false);

    useEffect(() => {
        const handleReCaptchaVerify = async () => {
            if (!executeRecaptcha || hasExecuted.current) {
                return;
            }

            try {
                hasExecuted.current = true;
                const token = await executeRecaptcha('submit');
                onVerify(token);
            } catch (error) {
                console.error('reCAPTCHA v3 execution failed:', error);
                onError?.();
            }
        };

        handleReCaptchaVerify();
    }, [executeRecaptcha, onVerify, onError]);

    return (
        <div className="text-center text-xs text-muted-foreground">
            This site is protected by reCAPTCHA and the Google{' '}
            <a
                href="https://policies.google.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
            >
                Privacy Policy
            </a>{' '}
            and{' '}
            <a
                href="https://policies.google.com/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
            >
                Terms of Service
            </a>{' '}
            apply.
        </div>
    );
}
