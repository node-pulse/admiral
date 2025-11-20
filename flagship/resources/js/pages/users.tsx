import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import { users as usersRoute } from '@/routes';
import { BreadcrumbItem } from '@/types';
import { Head } from '@inertiajs/react';
import axios from 'axios';
import {
    CheckCircle2,
    MoreHorizontal,
    Plus,
    Search,
    Shield,
    ShieldAlert,
    Trash2,
    User,
    UserX,
    XCircle,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

interface UsersTranslations {
    title: string;
    subtitle: string;
    list: Record<string, string>;
    table: Record<string, string>;
    roles: Record<string, string>;
    status: Record<string, string>;
    actions: Record<string, string>;
    dialog: Record<string, string>;
    messages: Record<string, string>;
}

interface UsersProps {
    translations: UsersTranslations;
}

interface UserData {
    id: number;
    name: string;
    email: string;
    role: 'admin' | 'user';
    status: 'active' | 'disabled';
    email_verified_at: string | null;
    two_factor_enabled: boolean;
    created_at: string;
    updated_at: string;
}

interface PaginationData {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
}

export default function Users({ translations }: UsersProps) {
    const breadcrumbs: BreadcrumbItem[] = [
        {
            title: `${translations.title} - ${translations.subtitle}`,
            href: usersRoute().url,
        },
    ];
    const [users, setUsers] = useState<UserData[]>([]);
    const [pagination, setPagination] = useState<PaginationData>({
        current_page: 1,
        last_page: 1,
        per_page: 20,
        total: 0,
    });
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState<string>('all');
    const [statusFilter, setStatusFilter] = useState<string>('all');

    // Add user dialog
    const [addUserOpen, setAddUserOpen] = useState(false);
    const [newUser, setNewUser] = useState({
        name: '',
        email: '',
        password: '',
        role: 'user' as 'admin' | 'user',
    });
    const [addingUser, setAddingUser] = useState(false);

    // Delete user dialog
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [userToDelete, setUserToDelete] = useState<UserData | null>(null);
    const [deleteLoading, setDeleteLoading] = useState(false);

    // Fetch users
    const fetchUsers = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                page: pagination.current_page.toString(),
                per_page: pagination.per_page.toString(),
            });

            if (search) params.append('search', search);
            if (roleFilter !== 'all') params.append('role', roleFilter);
            if (statusFilter !== 'all') params.append('status', statusFilter);

            const response = await axios.get(`/api/users?${params.toString()}`);
            setUsers(response.data.users);
            setPagination(response.data.pagination);
        } catch (error) {
            toast.error(translations.messages.fetch_failed);
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, [pagination.current_page, search, roleFilter, statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleAddUser = async () => {
        if (!newUser.name || !newUser.email || !newUser.password) {
            toast.error(translations.messages.fill_all_fields);
            return;
        }

        setAddingUser(true);
        try {
            await axios.post('/api/users', newUser);
            toast.success(translations.messages.user_created);
            setAddUserOpen(false);
            setNewUser({ name: '', email: '', password: '', role: 'user' });
            fetchUsers();
        } catch (error: any) {
            toast.error(
                error.response?.data?.message || translations.messages.create_failed,
            );
        } finally {
            setAddingUser(false);
        }
    };

    const handleToggleStatus = async (user: UserData) => {
        const newStatus = user.status === 'active' ? 'disabled' : 'active';
        try {
            await axios.patch(`/api/users/${user.id}/status`, {
                status: newStatus,
            });
            toast.success(
                newStatus === 'active' ? translations.messages.user_enabled : translations.messages.user_disabled,
            );
            fetchUsers();
        } catch (error: any) {
            toast.error(
                error.response?.data?.message || translations.messages.status_update_failed,
            );
        }
    };

    const handleToggleRole = async (user: UserData) => {
        const newRole = user.role === 'admin' ? 'user' : 'admin';
        try {
            await axios.patch(`/api/users/${user.id}/role`, { role: newRole });
            toast.success(translations.messages.role_updated);
            fetchUsers();
        } catch (error: any) {
            toast.error(
                error.response?.data?.message || translations.messages.role_update_failed,
            );
        }
    };

    const handleDeleteUser = async () => {
        if (!userToDelete) return;

        setDeleteLoading(true);
        try {
            await axios.delete(`/api/users/${userToDelete.id}`);
            toast.success(translations.messages.user_deleted);
            setDeleteConfirmOpen(false);
            setUserToDelete(null);
            fetchUsers();
        } catch (error: any) {
            toast.error(
                error.response?.data?.message || translations.messages.delete_failed,
            );
        } finally {
            setDeleteLoading(false);
        }
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        });
    };

    const getRoleBadge = (role: string) => {
        if (role === 'admin') {
            return (
                <Badge variant="default" className="bg-purple-500">
                    <Shield className="mr-1 h-3 w-3" />
                    Admin
                </Badge>
            );
        }
        return (
            <Badge variant="secondary">
                <User className="mr-1 h-3 w-3" />
                User
            </Badge>
        );
    };

    const getStatusBadge = (status: string) => {
        if (status === 'active') {
            return (
                <Badge variant="default" className="bg-green-500">
                    <CheckCircle2 className="mr-1 h-3 w-3" />
                    Active
                </Badge>
            );
        }
        return (
            <Badge variant="destructive">
                <XCircle className="mr-1 h-3 w-3" />
                Disabled
            </Badge>
        );
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={translations.title} />

            <div className="AdmiralUsers flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl p-4">
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle>{translations.list.title}</CardTitle>
                                <CardDescription>
                                    {translations.list.description}
                                </CardDescription>
                            </div>
                            <Button onClick={() => setAddUserOpen(true)}>
                                <Plus className="mr-2 h-4 w-4" />
                                {translations.actions.add_user}
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {/* Filters */}
                        <div className="mb-4 flex gap-4">
                            <div className="relative flex-1">
                                <Search className="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder={translations.list.search_placeholder}
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    className="pl-8"
                                />
                            </div>
                            <Select
                                value={roleFilter}
                                onValueChange={setRoleFilter}
                            >
                                <SelectTrigger className="w-[150px]">
                                    <SelectValue placeholder={translations.list.all_roles} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">
                                        {translations.list.all_roles}
                                    </SelectItem>
                                    <SelectItem value="admin">{translations.roles.admin}</SelectItem>
                                    <SelectItem value="user">{translations.roles.user}</SelectItem>
                                </SelectContent>
                            </Select>
                            <Select
                                value={statusFilter}
                                onValueChange={setStatusFilter}
                            >
                                <SelectTrigger className="w-[150px]">
                                    <SelectValue placeholder={translations.list.all_status} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">
                                        {translations.list.all_status}
                                    </SelectItem>
                                    <SelectItem value="active">
                                        {translations.status.active}
                                    </SelectItem>
                                    <SelectItem value="disabled">
                                        {translations.status.disabled}
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Users Table */}
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>{translations.table.name}</TableHead>
                                    <TableHead>{translations.table.email}</TableHead>
                                    <TableHead>{translations.table.role}</TableHead>
                                    <TableHead>{translations.table.status}</TableHead>
                                    <TableHead>{translations.table.two_factor}</TableHead>
                                    <TableHead>{translations.table.created}</TableHead>
                                    <TableHead className="text-right">
                                        {translations.table.actions}
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell
                                            colSpan={7}
                                            className="text-center"
                                        >
                                            {translations.list.loading}
                                        </TableCell>
                                    </TableRow>
                                ) : users?.length === 0 ? (
                                    <TableRow>
                                        <TableCell
                                            colSpan={7}
                                            className="text-center"
                                        >
                                            {translations.list.no_users}
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    users?.map((user) => (
                                        <TableRow key={user.id}>
                                            <TableCell className="font-medium">
                                                {user.name}
                                            </TableCell>
                                            <TableCell>{user.email}</TableCell>
                                            <TableCell>
                                                {getRoleBadge(user.role)}
                                            </TableCell>
                                            <TableCell>
                                                {getStatusBadge(user.status)}
                                            </TableCell>
                                            <TableCell>
                                                {user.two_factor_enabled ? (
                                                    <Badge
                                                        variant="default"
                                                        className="bg-blue-500"
                                                    >
                                                        <Shield className="mr-1 h-3 w-3" />
                                                        {translations.status.two_factor_enabled}
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="outline">
                                                        {translations.status.two_factor_disabled}
                                                    </Badge>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {formatDate(user.created_at)}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger
                                                        asChild
                                                    >
                                                        <Button
                                                            variant="ghost"
                                                            className="h-8 w-8 p-0"
                                                        >
                                                            <MoreHorizontal className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuLabel>
                                                            {translations.table.actions}
                                                        </DropdownMenuLabel>
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem
                                                            onClick={() =>
                                                                handleToggleRole(
                                                                    user,
                                                                )
                                                            }
                                                        >
                                                            {user.role ===
                                                            'admin' ? (
                                                                <>
                                                                    <User className="mr-2 h-4 w-4" />
                                                                    {translations.actions.make_user}
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <ShieldAlert className="mr-2 h-4 w-4" />
                                                                    {translations.actions.make_admin}
                                                                </>
                                                            )}
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem
                                                            onClick={() =>
                                                                handleToggleStatus(
                                                                    user,
                                                                )
                                                            }
                                                        >
                                                            {user.status ===
                                                            'active' ? (
                                                                <>
                                                                    <UserX className="mr-2 h-4 w-4" />
                                                                    {translations.actions.disable_account}
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <CheckCircle2 className="mr-2 h-4 w-4" />
                                                                    {translations.actions.enable_account}
                                                                </>
                                                            )}
                                                        </DropdownMenuItem>
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem
                                                            onClick={() => {
                                                                setUserToDelete(
                                                                    user,
                                                                );
                                                                setDeleteConfirmOpen(
                                                                    true,
                                                                );
                                                            }}
                                                            className="text-destructive"
                                                        >
                                                            <Trash2 className="mr-2 h-4 w-4" />
                                                            {translations.actions.delete_user}
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>

                        {/* Pagination */}
                        <div className="mt-4 flex items-center justify-between">
                            <p className="text-sm text-muted-foreground">
                                {translations.list.showing} {users.length} {translations.list.of} {pagination.total}{' '}
                                {translations.list.users}
                            </p>
                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                        setPagination((prev) => ({
                                            ...prev,
                                            current_page: Math.max(
                                                1,
                                                prev.current_page - 1,
                                            ),
                                        }))
                                    }
                                    disabled={pagination.current_page === 1}
                                >
                                    {translations.list.previous}
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                        setPagination((prev) => ({
                                            ...prev,
                                            current_page: Math.min(
                                                prev.last_page,
                                                prev.current_page + 1,
                                            ),
                                        }))
                                    }
                                    disabled={
                                        pagination.current_page ===
                                        pagination.last_page
                                    }
                                >
                                    {translations.list.next}
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Add User Dialog */}
            <Dialog open={addUserOpen} onOpenChange={setAddUserOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{translations.dialog.add_title}</DialogTitle>
                        <DialogDescription>
                            {translations.dialog.add_description}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label htmlFor="name">{translations.dialog.name}</Label>
                            <Input
                                id="name"
                                value={newUser.name}
                                onChange={(e) =>
                                    setNewUser({
                                        ...newUser,
                                        name: e.target.value,
                                    })
                                }
                                placeholder={translations.dialog.name_placeholder}
                            />
                        </div>
                        <div>
                            <Label htmlFor="email">{translations.dialog.email}</Label>
                            <Input
                                id="email"
                                type="email"
                                value={newUser.email}
                                onChange={(e) =>
                                    setNewUser({
                                        ...newUser,
                                        email: e.target.value,
                                    })
                                }
                                placeholder={translations.dialog.email_placeholder}
                            />
                        </div>
                        <div>
                            <Label htmlFor="password">{translations.dialog.password}</Label>
                            <Input
                                id="password"
                                type="password"
                                value={newUser.password}
                                onChange={(e) =>
                                    setNewUser({
                                        ...newUser,
                                        password: e.target.value,
                                    })
                                }
                                placeholder={translations.dialog.password_placeholder}
                            />
                        </div>
                        <div>
                            <Label htmlFor="role">{translations.dialog.role}</Label>
                            <Select
                                value={newUser.role}
                                onValueChange={(value: 'admin' | 'user') =>
                                    setNewUser({ ...newUser, role: value })
                                }
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="user">{translations.roles.user}</SelectItem>
                                    <SelectItem value="admin">{translations.roles.admin}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setAddUserOpen(false)}
                        >
                            {translations.dialog.cancel}
                        </Button>
                        <Button onClick={handleAddUser} disabled={addingUser}>
                            {addingUser ? translations.dialog.creating : translations.dialog.create}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <Dialog
                open={deleteConfirmOpen}
                onOpenChange={setDeleteConfirmOpen}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{translations.dialog.delete_title}</DialogTitle>
                        <DialogDescription>
                            {translations.dialog.delete_description}{' '}
                            <strong>{userToDelete?.name}</strong>? {translations.dialog.delete_warning}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setDeleteConfirmOpen(false)}
                        >
                            {translations.dialog.cancel}
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleDeleteUser}
                            disabled={deleteLoading}
                        >
                            {deleteLoading ? translations.dialog.deleting : translations.dialog.delete}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
