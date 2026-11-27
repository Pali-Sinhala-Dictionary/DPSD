package com.yogasrama.psu;

import android.os.Bundle;
import android.util.Log;
import com.getcapacitor.BridgeActivity;
import com.google.android.play.core.appupdate.AppUpdateInfo;
import com.google.android.play.core.appupdate.AppUpdateManager;
import com.google.android.play.core.appupdate.AppUpdateManagerFactory;
import com.google.android.play.core.appupdate.AppUpdateOptions;
import com.google.android.play.core.install.model.AppUpdateType;
import com.google.android.play.core.install.model.UpdateAvailability;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "PsuUpdate";
    private AppUpdateManager updateManager;
    private boolean askedThisLaunch = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AppBarsPlugin.class);          // ඉහළ / පහළ තීරු වර්ණ (script.js → syncAppBars) + installer()
        super.onCreate(savedInstanceState);
        // ආරම්භයේ: ආලෝක තේමාව — ඉහළ තද රතු (සුදු අයිකන), පහළ ක්‍රීම් (අඳුරු අයිකන)
        AppBarsPlugin.apply(this, AppBarsPlugin.TOP, AppBarsPlugin.BOTTOM, true, false, AppBarsPlugin.PAGE);
        // Play Store එකෙන් ස්ථාපනය කළ ඇප් එකට පමණක් Play යාවත්කාලීන පරීක්ෂාව
        if ("com.android.vending".equals(AppBarsPlugin.installerOf(this))) {
            try { updateManager = AppUpdateManagerFactory.create(this); } catch (Exception e) { updateManager = null; }
        }
    }

    /**
     * Google Play යාවත්කාලීන දැනුම්දීම (Play In-App Updates — "Update available" තිරය).
     * Play Store එකේ (ඔබේ track එකේ — closed testing / production) නව version එකක් ඇත්නම් ඇප් එක විවෘත කරන විට පෙන්වයි.
     * පරිශීලකයාට X / Back මගින් එය වසා ඇප් එක දිගටම භාවිතා කළ හැකිය; එවිට එම විවෘත කිරීමේදී නැවත නොඅසයි.
     * GitHub APK ඇප් එකට මෙය නැත — එයට script.js හි GitHub යාවත්කාලීන දැනුම්දීම (app-version.json → "android_apk").
     */
    @Override
    public void onResume() {
        super.onResume();
        if (updateManager == null) return;
        updateManager.getAppUpdateInfo().addOnSuccessListener(info -> {
            int a = info.updateAvailability();
            boolean resume = a == UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS;   // අඩක් වූ යාවත්කාලීනය
            boolean fresh = a == UpdateAvailability.UPDATE_AVAILABLE && !askedThisLaunch
                    && info.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE);
            if (resume || fresh) {
                askedThisLaunch = true;
                start(info);
            }
        }).addOnFailureListener(e -> Log.i(TAG, "update check skipped: " + e.getMessage()));
    }

    private void start(AppUpdateInfo info) {
        try {
            updateManager.startUpdateFlow(info, this, AppUpdateOptions.newBuilder(AppUpdateType.IMMEDIATE).build());
        } catch (Exception e) {
            Log.i(TAG, "update flow failed: " + e.getMessage());
        }
    }
}
