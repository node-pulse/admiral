<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\App;
use Illuminate\Support\Facades\Session;

class SetLocale
{
    /**
     * Supported locales for the application.
     */
    private const SUPPORTED_LOCALES = ['en', 'zh_CN'];

    /**
     * Default locale if none is detected.
     */
    private const DEFAULT_LOCALE = 'en';

    /**
     * Handle an incoming request.
     *
     * @param  \Closure(\Illuminate\Http\Request): (\Symfony\Component\HttpFoundation\Response)  $next
     */
    public function handle(Request $request, Closure $next)
    {
        $locale = $this->detectLocale($request);

        // Set application locale
        App::setLocale($locale);

        // Store in session for persistence
        Session::put('locale', $locale);

        return $next($request);
    }

    /**
     * Detect the appropriate locale for the user.
     * Priority: URL parameter > User preference > Session > Browser header > Default
     */
    private function detectLocale(Request $request): string
    {
        // 1. Check URL parameter (for testing/switching)
        if ($request->has('locale') && $this->isValidLocale($request->input('locale'))) {
            return $request->input('locale');
        }

        // 2. Check authenticated user preference
        if ($request->user() && $this->isValidLocale($request->user()->locale)) {
            return $request->user()->locale;
        }

        // 3. Check session
        if (Session::has('locale') && $this->isValidLocale(Session::get('locale'))) {
            return Session::get('locale');
        }

        // 4. Check browser Accept-Language header
        $browserLocale = $this->detectBrowserLocale($request);
        if ($browserLocale) {
            return $browserLocale;
        }

        // 5. Default fallback
        return self::DEFAULT_LOCALE;
    }

    /**
     * Detect locale from browser Accept-Language header.
     */
    private function detectBrowserLocale(Request $request): ?string
    {
        $acceptLanguage = $request->header('Accept-Language');

        if (! $acceptLanguage) {
            return null;
        }

        // Parse Accept-Language header (e.g., "zh-CN,zh;q=0.9,en;q=0.8")
        $languages = [];
        foreach (explode(',', $acceptLanguage) as $lang) {
            $parts = explode(';', $lang);
            $code = trim($parts[0]);
            $quality = 1.0;

            if (isset($parts[1]) && str_starts_with(trim($parts[1]), 'q=')) {
                $quality = (float) substr(trim($parts[1]), 2);
            }

            $languages[$code] = $quality;
        }

        // Sort by quality (highest first)
        arsort($languages);

        // Find first supported locale
        foreach (array_keys($languages) as $langCode) {
            // Check exact match (e.g., "zh-CN" or "zh_CN")
            $normalized = str_replace('-', '_', $langCode);
            if ($this->isValidLocale($normalized)) {
                return $normalized;
            }

            // Check base language (e.g., "zh" matches "zh_CN")
            $baseLang = explode('_', $normalized)[0];
            foreach (self::SUPPORTED_LOCALES as $supported) {
                if (str_starts_with($supported, $baseLang)) {
                    return $supported;
                }
            }
        }

        return null;
    }

    /**
     * Check if the given locale is supported.
     */
    private function isValidLocale(?string $locale): bool
    {
        return $locale && in_array($locale, self::SUPPORTED_LOCALES, true);
    }

    /**
     * Get list of supported locales.
     */
    public static function getSupportedLocales(): array
    {
        return self::SUPPORTED_LOCALES;
    }
}
