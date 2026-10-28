package cl.flotaagil.conductor;

import android.content.pm.ApplicationInfo;
import android.os.Bundle;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.Looper;
import android.util.Log;
import android.view.View;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

/** H-3: ajustes para que el JavaScript no se suspenda con la pantalla apagada (diagnósticos D1 a D3). */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WebView webView = getBridge().getWebView();
        webView.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);
        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) iniciarLatido();
    }

    @Override
    public void onStop() {
        super.onStop();
        // Segundo intento: el WebView sigue tratando su ventana como visible y no suspende la página.
        getBridge().getWebView().dispatchWindowVisibilityChanged(View.VISIBLE);
    }

    /** Diagnóstico (solo builds de depuración): si el proceso nativo sigue vivo, esto se registra cada 5 s. */
    private void iniciarLatido() {
        HandlerThread hilo = new HandlerThread("h3-latido");
        hilo.start();
        Handler fondo = new Handler(hilo.getLooper());
        Handler principal = new Handler(Looper.getMainLooper());
        fondo.post(new Runnable() {
            @Override
            public void run() {
                Log.i("H3", "latido hilo=fondo");
                principal.post(() -> Log.i("H3", "latido hilo=principal"));
                fondo.postDelayed(this, 5000);
            }
        });
    }
}
