// Components
import { login } from '@/routes';
import { email } from '@/routes/password';
import { Form, Head, usePage } from '@inertiajs/react';
import { LoaderCircle } from 'lucide-react';

import { Captcha } from '@/components/captcha';
import InputError from '@/components/input-error';
import TextLink from '@/components/text-link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import AuthLayout from '@/layouts/auth-layout';
import { useState } from 'react';

export default function ForgotPassword({ status }: { status?: string }) {
    const { captcha } = usePage<{
        captcha: { enabled: { forgot_password: boolean } };
    }>().props;
    const [captchaToken, setCaptchaToken] = useState<string>('');

    return (
        <AuthLayout
            title="Forgot password"
            description="Enter your email to receive a password reset link"
        >
            <Head title="Forgot password" />

            {status && (
                <div className="mb-4 text-center text-sm font-medium text-green-600">
                    {status}
                </div>
            )}

            <div className="space-y-6">
                <Form {...email.form()}>
                    {({ processing, errors }) => (
                        <>
                            <input
                                type="hidden"
                                name="captcha_token"
                                value={captchaToken}
                            />
                            <div className="grid gap-2">
                                <Label htmlFor="email">Email address</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    name="email"
                                    autoComplete="off"
                                    autoFocus
                                    placeholder="email@example.com"
                                />

                                <InputError message={errors.email} />
                            </div>

                            {captcha.enabled.forgot_password && (
                                <div className="mt-4">
                                    <Captcha
                                        onVerify={(token) =>
                                            setCaptchaToken(token)
                                        }
                                        onError={() => setCaptchaToken('')}
                                        onExpire={() => setCaptchaToken('')}
                                    />
                                    <InputError
                                        message={errors.captcha_token}
                                        className="mt-2"
                                    />
                                </div>
                            )}

                            <div className="my-6 flex items-center justify-start">
                                <Button
                                    className="w-full"
                                    disabled={
                                        processing ||
                                        (captcha.enabled.forgot_password &&
                                            !captchaToken)
                                    }
                                    data-test="email-password-reset-link-button"
                                >
                                    {processing && (
                                        <LoaderCircle className="h-4 w-4 animate-spin" />
                                    )}
                                    Email password reset link
                                </Button>
                            </div>
                        </>
                    )}
                </Form>

                <div className="space-x-1 text-center text-sm text-muted-foreground">
                    <span>Or, return to</span>
                    <TextLink href={login()}>log in</TextLink>
                </div>
            </div>
        </AuthLayout>
    );
}
