package org.duckdns.orfxueyu.orf;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Locale;

@CapacitorPlugin(name = "OrfClientUpdate")
public class ClientUpdatePlugin extends Plugin {
    @PluginMethod
    public void getInfo(PluginCall call) {
        JSObject result = new JSObject();
        result.put("platform", "android");
        result.put("deviceManufacturer", Build.MANUFACTURER);
        result.put("deviceModel", Build.MODEL);
        result.put("osVersion", Build.VERSION.RELEASE);
        result.put("sdkInt", Build.VERSION.SDK_INT);
        result.put("googlePlayServicesAvailable", isGooglePlayServicesAvailable());
        result.put("notificationPermission", notificationPermissionState());
        try {
            PackageInfo packageInfo = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            result.put("version", packageInfo.versionName);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                result.put("versionCode", packageInfo.getLongVersionCode());
            } else {
                result.put("versionCode", packageInfo.versionCode);
            }
        } catch (PackageManager.NameNotFoundException error) {
            result.put("version", null);
            result.put("versionCode", null);
        }
        call.resolve(result);
    }

    private boolean isGooglePlayServicesAvailable() {
        try {
            Class<?> availabilityClass = Class.forName("com.google.android.gms.common.GoogleApiAvailability");
            Object availability = availabilityClass.getMethod("getInstance").invoke(null);
            Object result = availabilityClass
                .getMethod("isGooglePlayServicesAvailable", android.content.Context.class)
                .invoke(availability, getContext());
            Class<?> connectionResultClass = Class.forName("com.google.android.gms.common.ConnectionResult");
            int success = connectionResultClass.getField("SUCCESS").getInt(null);
            return result instanceof Integer && (Integer) result == success;
        } catch (Exception ignored) {
            return false;
        }
    }

    private String notificationPermissionState() {
        if (!NotificationManagerCompat.from(getContext()).areNotificationsEnabled()) {
            return "denied";
        }
        return "granted";
    }

    @PluginMethod
    public void install(PluginCall call) {
        String url = call.getString("url", "").trim();
        String name = sanitizeApkName(call.getString("name", "ORF-android-update.apk"));
        if (!isTrustedClientUpdateUrl(url)) {
            resolve(call, "not_sent", "untrusted_url", null);
            return;
        }
        if (!canInstallPackages()) {
            openInstallPermissionSettings();
            resolve(call, "not_sent", "install_permission_required", null);
            return;
        }

        new Thread(() -> {
            try {
                File apk = downloadApk(url, name);
                getActivity().runOnUiThread(() -> {
                    try {
                        openPackageInstaller(apk);
                        resolve(call, "success", null, apk.getAbsolutePath());
                    } catch (Exception error) {
                        resolve(call, "error", "apk_install_failed", String.valueOf(error));
                    }
                });
            } catch (Exception error) {
                resolve(call, "error", "apk_install_failed", String.valueOf(error));
            }
        }).start();
    }

    private boolean canInstallPackages() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.O || getContext().getPackageManager().canRequestPackageInstalls();
    }

    private void openInstallPermissionSettings() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }
        Intent intent = new Intent(
            Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
            Uri.parse("package:" + getContext().getPackageName())
        );
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
    }

    private File downloadApk(String url, String name) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setConnectTimeout(30000);
        connection.setInstanceFollowRedirects(true);
        connection.setReadTimeout(120000);
        connection.setRequestProperty("User-Agent", "ORF-Android-Client");

        int status = connection.getResponseCode();
        if (status < 200 || status >= 300) {
            throw new IllegalStateException("Download failed: HTTP " + status);
        }

        File updateDir = new File(getContext().getCacheDir(), "client-updates");
        if (!updateDir.exists() && !updateDir.mkdirs()) {
            throw new IllegalStateException("Cannot create update cache directory");
        }
        File apk = new File(updateDir, name);
        File tempApk = new File(updateDir, name + ".download");
        if (tempApk.exists() && !tempApk.delete()) {
            throw new IllegalStateException("Cannot reset update temp file");
        }

        try (InputStream input = connection.getInputStream(); FileOutputStream output = new FileOutputStream(tempApk)) {
            byte[] buffer = new byte[64 * 1024];
            int read;
            while ((read = input.read(buffer)) != -1) {
                output.write(buffer, 0, read);
            }
        } finally {
            connection.disconnect();
        }

        if (apk.exists() && !apk.delete()) {
            throw new IllegalStateException("Cannot replace previous update APK");
        }
        if (!tempApk.renameTo(apk)) {
            throw new IllegalStateException("Cannot finalize update APK");
        }
        return apk;
    }

    private void openPackageInstaller(File apk) {
        Uri apkUri = FileProvider.getUriForFile(
            getContext(),
            getContext().getPackageName() + ".fileprovider",
            apk
        );
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
    }

    private boolean isTrustedClientUpdateUrl(String rawUrl) {
        try {
            Uri uri = Uri.parse(rawUrl);
            return "https".equals(uri.getScheme())
                && "github.com".equals(uri.getHost())
                && uri.getPath() != null
                && uri.getPath().startsWith("/xueyu888/ORF/releases/");
        } catch (Exception ignored) {
            return false;
        }
    }

    private String sanitizeApkName(String value) {
        String name = value == null ? "" : value.trim();
        int slashIndex = Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\'));
        if (slashIndex >= 0) {
            name = name.substring(slashIndex + 1);
        }
        name = name.replaceAll("[^A-Za-z0-9._-]", "-").replaceAll("-+", "-");
        if (name.isEmpty()) {
            name = "ORF-android-update.apk";
        }
        if (!name.toLowerCase(Locale.ROOT).endsWith(".apk")) {
            name = name + ".apk";
        }
        return name;
    }

    private void resolve(PluginCall call, String status, String reason, String data) {
        JSObject result = new JSObject();
        result.put("status", status);
        if (reason != null) {
            result.put("reason", reason);
        }
        if (data != null) {
            result.put("data", data);
        }
        call.resolve(result);
    }
}
