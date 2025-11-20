/**
 * Internationalization utilities for date, number, and time formatting
 */

import { usePage } from '@inertiajs/react';

/**
 * Get the current locale from Inertia page props
 */
export function useLocale(): string {
    const props = usePage<{ locale: string }>().props;
    return props.locale || 'en';
}

/**
 * Format a date according to the current locale
 */
export function formatDate(
    date: Date | string | number,
    options?: Intl.DateTimeFormatOptions,
): string {
    const locale = getLocaleCode();
    const dateObj =
        typeof date === 'string' || typeof date === 'number'
            ? new Date(date)
            : date;

    const defaultOptions: Intl.DateTimeFormatOptions = {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        ...options,
    };

    return new Intl.DateTimeFormat(locale, defaultOptions).format(dateObj);
}

/**
 * Format a date and time according to the current locale
 */
export function formatDateTime(
    date: Date | string | number,
    options?: Intl.DateTimeFormatOptions,
): string {
    const locale = getLocaleCode();
    const dateObj =
        typeof date === 'string' || typeof date === 'number'
            ? new Date(date)
            : date;

    const defaultOptions: Intl.DateTimeFormatOptions = {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        ...options,
    };

    return new Intl.DateTimeFormat(locale, defaultOptions).format(dateObj);
}

/**
 * Format a time according to the current locale
 */
export function formatTime(
    date: Date | string | number,
    options?: Intl.DateTimeFormatOptions,
): string {
    const locale = getLocaleCode();
    const dateObj =
        typeof date === 'string' || typeof date === 'number'
            ? new Date(date)
            : date;

    const defaultOptions: Intl.DateTimeFormatOptions = {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        ...options,
    };

    return new Intl.DateTimeFormat(locale, defaultOptions).format(dateObj);
}

/**
 * Format a relative time (e.g., "2 hours ago", "in 3 days")
 */
export function formatRelativeTime(date: Date | string | number): string {
    const locale = getLocaleCode();
    const now = new Date();
    const dateObj =
        typeof date === 'string' || typeof date === 'number'
            ? new Date(date)
            : date;

    const diffMs = dateObj.getTime() - now.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
    const diffMonths = Math.floor(diffDays / 30);
    const diffYears = Math.floor(diffDays / 365);

    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

    if (Math.abs(diffYears) >= 1) {
        return rtf.format(diffYears, 'year');
    }
    if (Math.abs(diffMonths) >= 1) {
        return rtf.format(diffMonths, 'month');
    }
    if (Math.abs(diffDays) >= 1) {
        return rtf.format(diffDays, 'day');
    }
    if (Math.abs(diffHours) >= 1) {
        return rtf.format(diffHours, 'hour');
    }
    if (Math.abs(diffMinutes) >= 1) {
        return rtf.format(diffMinutes, 'minute');
    }
    return rtf.format(diffSeconds, 'second');
}

/**
 * Format a number according to the current locale
 */
export function formatNumber(
    value: number,
    options?: Intl.NumberFormatOptions,
): string {
    const locale = getLocaleCode();
    return new Intl.NumberFormat(locale, options).format(value);
}

/**
 * Format a number as a percentage
 */
export function formatPercent(value: number, decimals: number = 1): string {
    const locale = getLocaleCode();
    return new Intl.NumberFormat(locale, {
        style: 'percent',
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    }).format(value / 100);
}

/**
 * Format bytes to human-readable format
 */
export function formatBytes(bytes: number, decimals: number = 2): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

/**
 * Format a currency value
 */
export function formatCurrency(
    value: number,
    currency: string = 'USD',
    options?: Intl.NumberFormatOptions,
): string {
    const locale = getLocaleCode();
    return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
        ...options,
    }).format(value);
}

/**
 * Format duration in seconds to human-readable format
 */
export function formatDuration(seconds: number): string {
    const locale = getLocaleCode();
    const isZhCN = locale === 'zh-CN' || locale === 'zh_CN';

    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    const parts: string[] = [];

    if (days > 0) {
        parts.push(isZhCN ? `${days}天` : `${days}d`);
    }
    if (hours > 0) {
        parts.push(isZhCN ? `${hours}小时` : `${hours}h`);
    }
    if (minutes > 0) {
        parts.push(isZhCN ? `${minutes}分钟` : `${minutes}m`);
    }
    if (secs > 0 || parts.length === 0) {
        parts.push(isZhCN ? `${secs}秒` : `${secs}s`);
    }

    return parts.join(' ');
}

/**
 * Format uptime in seconds to human-readable format
 */
export function formatUptime(seconds: number): string {
    const locale = getLocaleCode();
    const isZhCN = locale === 'zh-CN' || locale === 'zh_CN';

    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) {
        return isZhCN ? `${days}天 ${hours}小时` : `${days}d ${hours}h`;
    }
    if (hours > 0) {
        return isZhCN ? `${hours}小时 ${minutes}分钟` : `${hours}h ${minutes}m`;
    }
    return isZhCN ? `${minutes}分钟` : `${minutes}m`;
}

/**
 * Get the current locale code in the format expected by Intl APIs
 */
function getLocaleCode(): string {
    // Get locale from window or fallback to 'en'
    const locale = (window as any).__LOCALE__ || 'en';

    // Convert Laravel locale format (zh_CN) to BCP 47 format (zh-CN)
    return locale.replace('_', '-');
}

/**
 * Initialize locale for client-side formatting
 * This should be called in the app root component
 */
export function initializeLocale(locale: string): void {
    (window as any).__LOCALE__ = locale;
}
