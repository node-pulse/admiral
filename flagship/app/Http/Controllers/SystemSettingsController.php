<?php

namespace App\Http\Controllers;

use App\Models\Setting;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Inertia\Inertia;
use Inertia\Response;

class SystemSettingsController extends Controller
{
    /**
     * Display the settings page.
     */
    public function index(): Response
    {
        $settings = Setting::all()->map(function ($setting) {
            // Parse JSONB value for frontend
            $value = $setting->value;

            // Handle boolean values
            if ($value === 'true') {
                $parsedValue = true;
            } elseif ($value === 'false') {
                $parsedValue = false;
            } elseif ($value === 'null') {
                $parsedValue = null;
            } else {
                // Try to decode JSON
                $decoded = json_decode($value, true);
                $parsedValue = json_last_error() === JSON_ERROR_NONE ? $decoded : $value;
            }

            return [
                'key' => $setting->key,
                'value' => $parsedValue,
                'description' => $setting->description,
                'tier' => $setting->tier,
            ];
        });

        // Check mTLS status from submarines health endpoint
        $mtlsStatus = $this->getMtlsStatus();

        return Inertia::render('system-settings', [
            'settings' => $settings,
            'mtls' => $mtlsStatus,
        ]);
    }

    /**
     * Check if submarines is running production build (with mTLS).
     */
    private function getMtlsStatus(): array
    {
        try {
            $response = Http::timeout(3)->get(config('services.submarines.url') . '/health');

            if (!$response->successful()) {
                return ['status' => 'Unknown (Service Unreachable)', 'reachable' => false];
            }

            $data = $response->json();

            // Health endpoint returns: {"mtls": "enabled"} for prod, {"mtls": "disabled"} for dev
            $isProduction = ($data['mtls'] ?? 'disabled') === 'enabled';

            return [
                'enabled' => $isProduction,
                'status' => $isProduction ? 'Production Build' : 'Development Build',
                'reachable' => true,
            ];

        } catch (\Exception $e) {
            return ['status' => 'Unknown (Service Unreachable)', 'reachable' => false];
        }
    }

    /**
     * Update a setting.
     */
    public function update(Request $request, string $key)
    {
        $request->validate([
            'value' => 'required',
        ]);

        $setting = Setting::findOrFail($key);

        // Convert value to appropriate JSON string format
        $value = $request->input('value');

        if (is_bool($value)) {
            $jsonValue = $value ? 'true' : 'false';
        } elseif (is_null($value)) {
            $jsonValue = 'null';
        } elseif (is_array($value) || is_object($value)) {
            $jsonValue = json_encode($value);
        } else {
            $jsonValue = $value;
        }

        $setting->value = $jsonValue;
        $setting->save();

        return back()->with('success', 'Setting updated successfully');
    }

    /**
     * Toggle a boolean setting.
     */
    public function toggle(Request $request, string $key)
    {
        $setting = Setting::findOrFail($key);

        // Get current value
        $currentValue = $setting->value;

        // Toggle boolean value
        $newValue = ($currentValue === 'true') ? 'false' : 'true';

        $setting->value = $newValue;
        $setting->save();

        return back()->with('success', 'Setting toggled successfully');
    }
}
