package fr.aris.gymtrack;

import android.os.Bundle;
import android.view.View;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PersistentNotificationPlugin.class);
        super.onCreate(savedInstanceState);

        RestTimerNotificationService.createNotificationChannels(this);
        configureSystemBars();
    }

    private void configureSystemBars() {
        WindowCompat.enableEdgeToEdge(getWindow());

        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(
            getWindow(),
            getWindow().getDecorView()
        );
        controller.setAppearanceLightStatusBars(false);
        controller.setAppearanceLightNavigationBars(false);

        View content = findViewById(android.R.id.content);
        ViewCompat.setOnApplyWindowInsetsListener(content, (view, windowInsets) -> {
            Insets safeInsets = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars()
                    | WindowInsetsCompat.Type.displayCutout()
            );

            view.setPadding(
                safeInsets.left,
                safeInsets.top,
                safeInsets.right,
                safeInsets.bottom
            );

            // The WebView still receives any remaining insets (notably the IME),
            // without applying the system-bar/cutout space a second time.
            return windowInsets.inset(
                safeInsets.left,
                safeInsets.top,
                safeInsets.right,
                safeInsets.bottom
            );
        });
        ViewCompat.requestApplyInsets(content);
    }
}
