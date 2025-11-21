<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;
use Inertia\Inertia;

class UsersController extends Controller
{
    /**
     * Display users index page (admin only)
     */
    public function index()
    {
        return Inertia::render('users', [
            'translations' => [
                'common' => __('common'),
                'nav' => __('nav'),
                'users' => __('users'),
            ],
        ]);
    }

    /**
     * Get paginated list of users
     */
    public function list(Request $request)
    {
        $query = User::query()->orderBy('created_at', 'desc');

        // Search filter
        if ($request->has('search')) {
            $search = $request->input('search');
            $query->where(function ($q) use ($search) {
                $q->where('name', 'ilike', "%{$search}%")
                    ->orWhere('email', 'ilike', "%{$search}%");
            });
        }

        // Role filter
        if ($request->has('role')) {
            $query->where('role', $request->input('role'));
        }

        // Status filter
        if ($request->has('status')) {
            $query->where('status', $request->input('status'));
        }

        $perPage = $request->input('per_page', 20);
        $paginator = $query->paginate($perPage);

        $users = $paginator->getCollection()->map(function ($user) {
            return [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'role' => $user->role,
                'status' => $user->status,
                'email_verified_at' => $user->email_verified_at?->toIso8601String(),
                'two_factor_enabled' => !is_null($user->two_factor_secret),
                'created_at' => $user->created_at->toIso8601String(),
                'updated_at' => $user->updated_at->toIso8601String(),
            ];
        })->values()->all();

        return response()->json([
            'users' => $users,
            'pagination' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
            ],
        ]);
    }

    /**
     * Create a new user (admin only)
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'email', 'max:255', 'unique:users'],
            'password' => ['required', 'string', 'min:8'],
            'role' => ['required', Rule::in(['admin', 'user'])],
            'status' => ['sometimes', Rule::in(['active', 'disabled'])],
        ]);

        $user = User::create([
            'name' => $validated['name'],
            'email' => $validated['email'],
            'password' => Hash::make($validated['password']),
            'role' => $validated['role'],
            'status' => $validated['status'] ?? 'active',
        ]);

        return response()->json([
            'message' => 'User created successfully',
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'role' => $user->role,
                'status' => $user->status,
            ],
        ], 201);
    }

    /**
     * Update user status (admin only)
     */
    public function updateStatus(Request $request, User $user)
    {
        // Prevent disabling your own account
        if ($user->id === $request->user()->id) {
            return response()->json([
                'message' => 'You cannot disable your own account',
            ], 422);
        }

        $validated = $request->validate([
            'status' => ['required', Rule::in(['active', 'disabled'])],
        ]);

        $user->update(['status' => $validated['status']]);

        return response()->json([
            'message' => 'User status updated successfully',
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'status' => $user->status,
            ],
        ]);
    }

    /**
     * Update user role (admin only)
     */
    public function updateRole(Request $request, User $user)
    {
        // Prevent changing your own role
        if ($user->id === $request->user()->id) {
            return response()->json([
                'message' => 'You cannot change your own role',
            ], 422);
        }

        $validated = $request->validate([
            'role' => ['required', Rule::in(['admin', 'user'])],
        ]);

        $user->update(['role' => $validated['role']]);

        return response()->json([
            'message' => 'User role updated successfully',
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'role' => $user->role,
            ],
        ]);
    }

    /**
     * Delete a user (admin only)
     */
    public function destroy(Request $request, User $user)
    {
        // Prevent deleting your own account
        if ($user->id === $request->user()->id) {
            return response()->json([
                'message' => 'You cannot delete your own account',
            ], 422);
        }

        $user->delete();

        return response()->json([
            'message' => 'User deleted successfully',
        ]);
    }
}
