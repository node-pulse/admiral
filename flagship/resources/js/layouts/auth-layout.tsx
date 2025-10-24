import { RecaptchaV3Provider } from '@/components/recaptcha-v3-provider';
import AuthLayoutTemplate from '@/layouts/auth/auth-simple-layout';

export default function AuthLayout({
    children,
    title,
    description,
    ...props
}: {
    children: React.ReactNode;
    title: string;
    description: string;
}) {
    return (
        <RecaptchaV3Provider>
            <AuthLayoutTemplate
                title={title}
                description={description}
                {...props}
            >
                {children}
            </AuthLayoutTemplate>
        </RecaptchaV3Provider>
    );
}
