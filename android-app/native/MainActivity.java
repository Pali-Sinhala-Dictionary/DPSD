package com.pali_sinhala_dictionary.twa;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AppBarsPlugin.class);          // ඉහළ / පහළ තීරු වර්ණ (script.js → syncAppBars)
        super.onCreate(savedInstanceState);
        // ආරම්භයේ: ආලෝක තේමාව — ඉහළ තද රතු (සුදු අයිකන), පහළ ක්‍රීම් (අඳුරු අයිකන)
        AppBarsPlugin.apply(this, AppBarsPlugin.TOP, AppBarsPlugin.BOTTOM, true, false, AppBarsPlugin.PAGE);
    }
}
