import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface DashboardStatsCardProps {
    title: string;
    value: number | string;
    icon: LucideIcon;
    description?: string;
    trend?: {
        value: number;
        isPositive: boolean;
    };
    className?: string;
}

export function DashboardStatsCard({
    title,
    value,
    icon: Icon,
    description,
    trend,
    className,
}: DashboardStatsCardProps) {
    return (
        <Card className={cn('relative overflow-hidden', className)}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{title}</CardTitle>
                <Icon className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{value}</div>
                {description && (
                    <p className="text-xs text-muted-foreground">{description}</p>
                )}
                {trend && (
                    <div
                        className={cn(
                            'mt-2 flex items-center text-xs',
                            trend.isPositive ? 'text-green-600' : 'text-red-600'
                        )}
                    >
                        <span
                            className={cn(
                                'mr-1',
                                trend.isPositive ? '↑' : '↓'
                            )}
                        >
                            {trend.isPositive ? '↑' : '↓'}
                        </span>
                        <span>{Math.abs(trend.value)}%</span>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
