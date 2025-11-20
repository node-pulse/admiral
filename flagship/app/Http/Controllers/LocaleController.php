<?php

namespace App\Http\Controllers;

use App\Http\Middleware\SetLocale;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Session;
use Illuminate\Validation\Rule;

class LocaleController extends Controller
{
    /**
     * Update the user's locale preference.
     */
    public function update(Request $request)
    {
        $validated = $request->validate([
            'locale' => ['required', 'string', Rule::in(SetLocale::getSupportedLocales())],
        ]);

        $locale = $validated['locale'];

        // Update authenticated user's locale if logged in
        if ($request->user()) {
            $request->user()->update(['locale' => $locale]);
        }

        // Update session
        Session::put('locale', $locale);

        return response()->json([
            'success' => true,
            'locale' => $locale,
            'message' => __('settings.profile.saved'),
        ]);
    }

    /**
     * Get available locales.
     */
    public function available()
    {
        return response()->json([
            'locales' => [
                ['code' => 'en', 'name' => 'English', 'native' => 'English'],
                ['code' => 'zh_CN', 'name' => 'Chinese (Simplified)', 'native' => '简体中文'],
            ],
            'current' => app()->getLocale(),
        ]);
    }
}
