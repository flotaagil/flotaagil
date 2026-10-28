package cl.flotaagil.conductor;

import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

/**
 * H-3: con la pantalla apagada el WebView dejaba de ejecutar JavaScript a los ~60 s
 * (diagnóstico del 2026-10-28). Se mantiene la prioridad del proceso de render del WebView
 * ligada a la de la app, que tiene un servicio en primer plano, aunque la vista no esté visible.
 */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WebView webView = getBridge().getWebView();
        webView.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);
    }
}
