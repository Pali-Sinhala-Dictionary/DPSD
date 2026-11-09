package com.pali_sinhala_dictionary.twa;

import android.app.Activity;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.LayerDrawable;
import android.os.Build;
import android.view.Gravity;
import android.view.View;
import android.view.Window;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * ඉහළ (status) තීරුව ශීර්ෂයේ වර්ණයට, පහළ (navigation) තීරුව පහළ මෙනුවේ වර්ණයට.
 * Android 15+ හි තීරු විනිවිද පෙනෙන නිසා, ඒවාට යටින් ඇති පසුබිම (ඉහළ පටිය + පහළ වර්ණය) සකසයි.
 */
@CapacitorPlugin(name = "AppBars")
public class AppBarsPlugin extends Plugin {
    static final int TOP = 0xFF861410, BOTTOM = 0xFFF9EFDB, PAGE = 0xFFF5F1EA;

    private static int statusBarHeight(Activity a, View decor) {
        WindowInsetsCompat in = ViewCompat.getRootWindowInsets(decor);
        if (in != null) {
            int t = in.getInsets(WindowInsetsCompat.Type.statusBars()).top;
            if (t > 0) return t;
        }
        int id = a.getResources().getIdentifier("status_bar_height", "dimen", "android");
        return id > 0 ? a.getResources().getDimensionPixelSize(id) : Math.round(24 * a.getResources().getDisplayMetrics().density);
    }

    private static Drawable bars(int top, int bottom, int topHeight) {
        LayerDrawable ld = new LayerDrawable(new Drawable[] { new ColorDrawable(bottom), new ColorDrawable(top) });
        ld.setLayerGravity(1, Gravity.TOP | Gravity.FILL_HORIZONTAL);
        ld.setLayerHeight(1, topHeight);
        return ld;
    }

    static void apply(final Activity a, final int top, final int bottom, final boolean lightTopIcons,
                      final boolean lightBottomIcons, final int page) {
        if (a == null) return;
        a.runOnUiThread(() -> {
            Window w = a.getWindow();
            View decor = w.getDecorView();
            int h = statusBarHeight(a, decor);
            decor.setBackground(bars(top, bottom, h));
            View content = a.findViewById(android.R.id.content);
            if (content != null) content.setBackground(bars(top, bottom, h));
            if (Build.VERSION.SDK_INT < 35) {
                w.setStatusBarColor(top);
                w.setNavigationBarColor(bottom);
            }
            if (Build.VERSION.SDK_INT >= 29) {
                w.setStatusBarContrastEnforced(false);
                w.setNavigationBarContrastEnforced(false);
            }
            WindowInsetsControllerCompat c = WindowCompat.getInsetsController(w, decor);
            c.setAppearanceLightStatusBars(!lightTopIcons);
            c.setAppearanceLightNavigationBars(!lightBottomIcons);
            if (a instanceof BridgeActivity) {
                Bridge b = ((BridgeActivity) a).getBridge();
                if (b != null && b.getWebView() != null) b.getWebView().setBackgroundColor(page);
            }
        });
    }

    @PluginMethod
    public void setColors(PluginCall call) {
        try {
            int top = Color.parseColor(call.getString("top", "#8B0000"));
            int bottom = Color.parseColor(call.getString("bottom", "#F9EED9"));
            int page = Color.parseColor(call.getString("page", "#F5F1EA"));
            apply(getActivity(), top, bottom, Boolean.TRUE.equals(call.getBoolean("lightTopIcons", true)),
                  Boolean.TRUE.equals(call.getBoolean("lightBottomIcons", false)), page);
            call.resolve();
        } catch (Exception e) {
            call.reject("Invalid color");
        }
    }
}
